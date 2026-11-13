/**
 * 대화 라벨링 — 답변이 나간 뒤(persistExchange 부수효과) 싼 모델(기본 Haiku)로 한 번 분류해
 * chatbot_session_labels 에 저장한다.
 *
 * - CHATBOT_LABELING_ENABLED(기본: provider=claude 일 때만)와 Anthropic 키가 있어야 돈다.
 * - 예산 가드(budget.ts)를 답변과 같이 쓴다. 상한을 넘으면 라벨링을 건너뛴다.
 * - 테이블은 20261112_chatbot_claude_labels.sql(미적용)이 만든다. 테이블이 없으면 조용히 건너뛰고
 *   10분 동안 다시 시도하지 않는다 — 답변·저장 흐름을 절대 막지 않는다.
 * - 입력은 PII 가 지워진 질문(question.redacted)과 공개 답변뿐이다. 키·본문은 로그에 남기지 않는다.
 */
import "server-only"

import Anthropic from "@anthropic-ai/sdk"

import { getClaudeUsageStore } from "@/lib/chatbot/answer-provider"
import { checkClaudeBudget, recordClaudeUsage } from "./budget"
import { readChatbotClaudeConfig, lowLatencyParams, type ChatbotClaudeConfig } from "./config"
import { LABELER_SYSTEM_PROMPT, maxTemperature, parseChatbotSessionLabel, type ChatbotSessionLabel, type LabelTemperature } from "./labels"
import { isMissingTableError } from "./table-missing"

const LABEL_TIMEOUT_MS = 6_000
const LABEL_TABLE = "chatbot_session_labels"
const TABLE_RETRY_MS = 10 * 60_000
let tableMissingUntil = 0

export interface LabelExchangeInput {
  sessionId: string
  answerEventId?: string | null
  question: string
  answer: string
  category: string
  intent: string
  handoffIntent?: string
  /** 직전 이력(PII 제거본). 최근 4턴만 쓴다. */
  history?: { role: "user" | "model"; parts: { text: string }[] }[]
}

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, v: string) => {
        order: (col: string, o: { ascending: boolean }) => {
          limit: (n: number) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>
        }
      }
    }
    insert: (row: unknown) => PromiseLike<{ error: { code?: string; message?: string } | null }>
  }
}

export function buildLabelerUserText(input: LabelExchangeInput): string {
  const recent = (input.history ?? [])
    .slice(-4)
    .map((turn) => `${turn.role === "model" ? "봇" : "사용자"}: ${turn.parts.map((p) => p.text).join("").slice(0, 400)}`)
  return [
    `규칙 분류: category=${input.category}, intent=${input.intent}${input.handoffIntent ? `, handoffIntent=${input.handoffIntent}` : ""}`,
    recent.length ? `이전 대화:\n${recent.join("\n")}` : "이전 대화: 없음",
    `사용자: ${input.question.slice(0, 600)}`,
    `봇: ${input.answer.slice(0, 600)}`,
  ].join("\n\n")
}

export async function requestClaudeLabel(
  input: LabelExchangeInput,
  config: ChatbotClaudeConfig
): Promise<ChatbotSessionLabel | null> {
  for (const apiKey of config.apiKeys) {
    try {
      const client = new Anthropic({ apiKey, maxRetries: 0, timeout: LABEL_TIMEOUT_MS })
      const message = await client.messages.create({
        model: config.labelModel,
        max_tokens: 300,
        // 확장 사고를 끈다 — 켜 두면 사고 토큰이 max_tokens 를 먹어 JSON 이 잘린다(실측).
        ...lowLatencyParams(config.labelModel),
        system: LABELER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildLabelerUserText(input) }],
      })
      recordClaudeUsage(
        {
          model: config.labelModel,
          inputTokens: message.usage?.input_tokens ?? 0,
          outputTokens: message.usage?.output_tokens ?? 0,
        },
        { kind: "label", sessionId: input.sessionId, store: getClaudeUsageStore() }
      )
      const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("")
      return parseChatbotSessionLabel(text)
    } catch (error) {
      const status = (error as { status?: number } | null)?.status
      if (status === 401 || status === 403 || status === 429) continue
      console.warn("[chatbot-claude] label request failed", { status })
      return null
    }
  }
  return null
}

/** persistExchange 부수효과. 절대 throw 하지 않는다. */
export async function maybeLabelChatbotExchange(supabase: SupabaseLike, input: LabelExchangeInput): Promise<void> {
  try {
    const config = readChatbotClaudeConfig()
    if (!config.labelingEnabled || config.apiKeys.length === 0) return
    if (Date.now() < tableMissingUntil) return
    if (!input.question.trim() || !input.answer.trim()) return

    // 테이블이 있는지 먼저 본다(이전 라벨 = 세션 최고 온도 유지용). 없으면 모델 호출 전에 끝낸다.
    const { data: previous, error: readError } = await supabase
      .from(LABEL_TABLE)
      .select("temperature")
      .eq("session_id", input.sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
    if (readError) {
      if (isMissingTableError(readError)) {
        tableMissingUntil = Date.now() + TABLE_RETRY_MS
        return
      }
      console.warn("[chatbot-claude] label read failed:", readError.code ?? "unknown")
      return
    }

    const budget = await checkClaudeBudget(config, { store: getClaudeUsageStore() })
    if (!budget.allowed) return

    const label = await requestClaudeLabel(input, config)
    if (!label) return

    const prevTemp = (Array.isArray(previous) ? (previous[0] as { temperature?: LabelTemperature } | undefined) : undefined)?.temperature
    const { error } = await supabase.from(LABEL_TABLE).insert({
      session_id: input.sessionId,
      answer_event_id: input.answerEventId ?? null,
      intent: label.intent,
      segment: label.segment,
      stage: label.stage,
      temperature: label.temperature,
      session_temperature: maxTemperature(prevTemp ?? null, label.temperature),
      handoff: label.handoff,
      confidence: label.confidence,
      rationale: label.rationale || null,
      model_name: config.labelModel,
      rule_category: input.category,
      rule_intent: input.intent,
    })
    if (error) {
      if (isMissingTableError(error)) tableMissingUntil = Date.now() + TABLE_RETRY_MS
      else console.warn("[chatbot-claude] label insert failed:", error.code ?? "unknown")
    }
  } catch (error) {
    console.warn("[chatbot-claude] labeling skipped:", error instanceof Error ? error.name : "unknown")
  }
}

export function resetLabelingStateForTests() {
  tableMissingUntil = 0
}

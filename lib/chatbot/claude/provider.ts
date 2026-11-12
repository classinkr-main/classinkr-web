/**
 * 사이트 챗봇 Claude 제공자 — Gemini 제공자(lib/chatbot/llm.ts)와 같은 입력·출력 계약.
 *
 * - 같은 사용자 턴 본문(buildFinalAnswerPrompt)에 영업·데모 스티어링 한 줄을 붙이고, 시스템 프롬프트는
 *   초안 페이지의 다듬은 프롬프트(prompt.ts)를 쓴다. 시스템 프롬프트는 프롬프트 캐시(ephemeral)로 둔다.
 * - 실패(키 없음·네트워크·타임아웃·빈 응답)는 모두 null / 빈 스트림 — 호출부가 Gemini 로 폴백한다.
 * - 키는 ANTHROPIC_API_KEY → _1 → _2 → _3 순서. 인증·권한·한도(401/403/429) 오류에서만 다음 키로 간다.
 * - 키 값과 요청 본문은 로그에 남기지 않는다.
 */
import "server-only"

import Anthropic from "@anthropic-ai/sdk"

import {
  buildFinalAnswerPrompt,
  clampAnswerToLength,
  sanitizePublicAnswerText,
  type FinalGenerateArgs,
} from "@/lib/chatbot/llm"
import { thinkingOffParam, type ChatbotClaudeConfig } from "./config"
import type { ClaudeUsage } from "./pricing"
import { buildSalesSteeringHint, getClaudeChatbotSystemPrompt } from "./prompt"

const CLAUDE_TIMEOUT_MS = 8_000

export interface ClaudeAnswerExtras {
  handoffIntent?: "demo" | "support"
  onUsage?: (usage: ClaudeUsage) => void
}

type HistoryTurn = { role: "user" | "model"; parts: { text: string }[] }

/** Gemini 형식 이력 → Anthropic messages. user 로 시작하고 같은 역할이 이어지면 합친다. */
export function toClaudeMessages(history: HistoryTurn[] | undefined, userText: string): Anthropic.MessageParam[] {
  const merged: Anthropic.MessageParam[] = []
  for (const turn of history ?? []) {
    const text = turn.parts.map((part) => part.text ?? "").join("").trim()
    if (!text) continue
    const role = turn.role === "model" ? "assistant" : "user"
    if (merged.length === 0 && role === "assistant") continue
    const last = merged[merged.length - 1]
    if (last && last.role === role) {
      last.content = `${last.content as string}\n\n${text}`
    } else {
      merged.push({ role, content: text })
    }
  }
  const last = merged[merged.length - 1]
  if (last && last.role === "user") {
    last.content = `${last.content as string}\n\n${userText}`
  } else {
    merged.push({ role: "user", content: userText })
  }
  return merged
}

export function buildClaudeUserText(args: FinalGenerateArgs & ClaudeAnswerExtras): string {
  return [
    buildFinalAnswerPrompt(args),
    buildSalesSteeringHint({
      category: args.category,
      intent: args.intent,
      handoffIntent: args.handoffIntent,
      question: args.question,
    }),
  ].join("\n\n")
}

function isKeyFallbackError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status
  return status === 401 || status === 403 || status === 429
}

function warn(reason: string, error?: unknown) {
  const status = (error as { status?: number } | null)?.status
  const name = error instanceof Error ? error.name : undefined
  console.warn(`[chatbot-claude] ${reason}`, { status, error: name })
}

function usageFrom(model: string, usage: Anthropic.Usage | undefined | null): ClaudeUsage {
  return {
    model,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
  }
}

function buildRequest(args: FinalGenerateArgs & ClaudeAnswerExtras, config: ChatbotClaudeConfig) {
  return {
    model: config.answerModel,
    max_tokens: config.maxOutputTokens,
    system: [
      { type: "text" as const, text: getClaudeChatbotSystemPrompt(), cache_control: { type: "ephemeral" as const } },
    ],
    messages: toClaudeMessages(args.history, buildClaudeUserText(args)),
    // 챗봇은 지연이 중요하다 — 끌 수 있는 모델은 확장 사고를 끄고 effort low.
    ...(thinkingOffParam(config.answerModel) ? { thinking: thinkingOffParam(config.answerModel) } : {}),
    output_config: { effort: "low" as const },
  }
}

function makeClient(apiKey: string) {
  return new Anthropic({ apiKey, maxRetries: 0, timeout: CLAUDE_TIMEOUT_MS })
}

export async function generateClaudeFinalAnswer(
  args: FinalGenerateArgs & ClaudeAnswerExtras,
  config: ChatbotClaudeConfig
): Promise<string | null> {
  if (!args.question.trim() || config.apiKeys.length === 0) return null
  const request = buildRequest(args, config)

  for (const apiKey of config.apiKeys) {
    try {
      const message = await makeClient(apiKey).messages.create(request)
      args.onUsage?.(usageFrom(config.answerModel, message.usage))
      const text = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim()
      const sanitized = text ? sanitizePublicAnswerText(text) : ""
      if (!sanitized) {
        warn("empty_response")
        return null
      }
      return clampAnswerToLength(sanitized)
    } catch (error) {
      if (isKeyFallbackError(error)) {
        warn("key_fallback", error)
        continue
      }
      warn("request_error", error)
      return null
    }
  }
  return null
}

export async function* streamClaudeFinalAnswer(
  args: FinalGenerateArgs & ClaudeAnswerExtras,
  config: ChatbotClaudeConfig
): AsyncGenerator<string> {
  if (!args.question.trim() || config.apiKeys.length === 0) return
  const request = buildRequest(args, config)

  for (const apiKey of config.apiKeys) {
    let emittedAny = false
    let inputUsage: Anthropic.Usage | null = null
    let outputTokens = 0
    try {
      const stream = await makeClient(apiKey).messages.create({ ...request, stream: true })
      for await (const event of stream) {
        if (event.type === "message_start") {
          inputUsage = event.message.usage
        } else if (event.type === "message_delta") {
          outputTokens = event.usage?.output_tokens ?? outputTokens
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
          emittedAny = true
          yield event.delta.text
        }
      }
      args.onUsage?.(usageFrom(config.answerModel, inputUsage ? { ...inputUsage, output_tokens: outputTokens } : null))
      return
    } catch (error) {
      if (inputUsage) {
        args.onUsage?.(usageFrom(config.answerModel, { ...inputUsage, output_tokens: outputTokens }))
      }
      if (emittedAny) return
      if (isKeyFallbackError(error)) {
        warn("stream_key_fallback", error)
        continue
      }
      warn("stream_request_error", error)
      return
    }
  }
}

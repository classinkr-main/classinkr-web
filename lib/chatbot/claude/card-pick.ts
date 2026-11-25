/**
 * 답 색인 모델 선택 층(lib/chatbot/answer-index/assist.ts)의 업체 고르기·Claude 고르기·업체 간 대체.
 *
 * assist.ts 는 모델을 직접 부르지 않고 호출 함수(AnswerCardPickRequest)를 받는다. 여기서 그 호출 함수 둘을 만든다.
 * - pick(②): CHATBOT_ASSIST_PICK_PROVIDER 업체로 한 번 고른다. gemini(기본)는 llm.ts requestGeminiAnswerCardPick(지금과 같은 요청),
 *   claude 는 아래 requestClaudeAnswerCardPick(기본 claude-haiku-5-5). claude 인데 키가 없거나 하루 상한이면 Gemini 로 고른다.
 *   CHATBOT_ASSIST_CROSS_FALLBACK=on 이고 1순위가 Gemini 인데 402·429·5xx·차단기 열림이면 남은 시간 예산 안에서 Claude Haiku 로 한 번
 *   다시 고른다(⑤). 키가 없거나 하루 상한이면 건너뛰고 Gemini 실패를 그대로 돌려준다.
 * - escalate(③): CHATBOT_ASSIST_ESCALATE=on 일 때만. 같은 지시문·입력으로 Claude Sonnet 5.5 에 한 번 더 고르게 한다. 하루 상한이면
 *   부르지 않고 reason "budget"(assist.ts 가 올림을 건너뛴다), 키가 없으면 "no_connection".
 *
 * Claude 요청: 지시문은 system 블록 하나에 cache_control(ephemeral), 그 뒤 user 메시지에 후보·질문. 고정 지시문(ANSWER_CARD_PICK_INSTRUCTION)
 * 은 수백 토큰이라 모델 최소 캐시 길이(Haiku·Sonnet 계열 1,024~4,096 토큰)보다 짧아 지금은 캐시가 걸리지 않는다(cache_creation·cache_read 가
 * 0 으로 나온다). 고정 예시를 지시문에 붙여 최소 길이를 넘기면 그때부터 걸린다. 후보 줄은 질문마다 달라 캐시 앞부분에 넣지 않는다.
 * 출력은 구조화 출력(output_config.format, {pick: integer} JSON schema — 복합 질문 고르기는 {picks: integer[]})으로 받는다. 강제 tool_choice 는 쓰지 않는다(Sonnet 5.5·Opus 5.5 는
 * any·tool 을 400 으로 막는다). 사고는 config.ts lowLatencyParams(Sonnet 5.5 between_tools, Haiku 5.5 disabled) + effort low.
 * 응답 usage(input·output·cache_read·cache_creation)를 추정 비용과 함께 하루 상한(budget.ts, 종류 assist)과 흔적에 남긴다.
 * 실패(시간 초과·429·5xx·인증·거절·파싱 실패)는 던지지 않고 이유를 돌려준다 — assist.ts 가 결정형 판정을 그대로 낸다.
 * 키 값과 요청 본문은 로그에 남기지 않는다.
 */
import "server-only"

import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk"

import type {
  AnswerCardPickCallUsage,
  AnswerCardPickFailure,
  AnswerCardPickOutcome,
  AnswerCardPickRequest,
} from "@/lib/chatbot/answer-index/assist"
import { readAnswerCardPickResult, requestGeminiAnswerCardPick, type GeminiAnswerCardPickResult } from "@/lib/chatbot/llm"

import { checkClaudeAssistBudget, recordClaudeUsage } from "./budget"
import { lowLatencyParams, readAssistPickConfig, type AssistPickConfig } from "./config"
import { estimateClaudeCostUsd } from "./pricing"

/** 짧은 JSON({"pick": n}) 하나에 넉넉한 출력 상한. 사고를 끈 모델이라 사고 토큰이 상한을 먹지 않는다. */
export const CLAUDE_CARD_PICK_MAX_TOKENS = 512
/** 남은 시간이 이보다 짧으면 업체 간 대체를 부르지 않는다. */
const CROSS_FALLBACK_MIN_MS = 300

/** 구조화 출력 스키마: {pick: 정수}. 범위(-1..후보 수)는 assist.ts 가 본다. */
export const CARD_PICK_JSON_SCHEMA = {
  type: "object",
  properties: { pick: { type: "integer" } },
  required: ["pick"],
  additionalProperties: false,
} as const

/** 복합 질문 고르기 스키마(R2 B3): {picks: 정수 배열}(조각 순서). 길이·범위는 assist.ts 가 본다. */
export const CARD_MULTI_PICK_JSON_SCHEMA = {
  type: "object",
  properties: { picks: { type: "array", items: { type: "integer" } } },
  required: ["picks"],
  additionalProperties: false,
} as const

export interface ClaudeCardPickArgs {
  instruction: string
  input: string
  timeoutMs: number
  model: string
  apiKey: string
  stage: AnswerCardPickCallUsage["stage"]
  /** "picks" 면 복합 질문 고르기(스키마 {picks: 정수 배열}). 없으면 단일 고르기(B3 전과 같은 요청). */
  expect?: "picks"
}

export interface ClaudeCardPickResult {
  outcome: AnswerCardPickOutcome
  usage: AnswerCardPickCallUsage | null
}

/** Claude 고르기 요청 본문(시험이 캐시 블록 위치를 본다). 단일 질문(expect 없음) 본문은 B3 전과 바이트까지 같다. */
export function buildClaudeCardPickRequest(args: Pick<ClaudeCardPickArgs, "instruction" | "input" | "model" | "expect">) {
  const latency = lowLatencyParams(args.model)
  const schema = args.expect === "picks" ? CARD_MULTI_PICK_JSON_SCHEMA : CARD_PICK_JSON_SCHEMA
  return {
    model: args.model,
    max_tokens: CLAUDE_CARD_PICK_MAX_TOKENS,
    // [고정 지시문]에만 cache_control. 지시문이 모델 최소 캐시 길이보다 짧으면 캐시는 걸리지 않는다(머리말).
    system: [{ type: "text" as const, text: args.instruction, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: args.input }],
    ...(latency.thinking ? { thinking: latency.thinking } : {}),
    output_config: {
      ...(latency.output_config ?? {}),
      format: { type: "json_schema" as const, schema: { ...schema } },
    },
  }
}

function warn(reason: string, details: Record<string, unknown> = {}) {
  console.warn(`[chatbot-claude] card_pick ${reason}`, details)
}

/** SDK 오류 → 실패 이유·HTTP 상태(타입별). */
export function classifyClaudeError(error: unknown): { reason: AnswerCardPickFailure; status: number | null } {
  // 시간 초과·중단을 먼저 본다(APIConnectionTimeoutError 는 APIConnectionError 의 하위 형이다).
  if (error instanceof APIConnectionTimeoutError || error instanceof APIUserAbortError) return { reason: "timeout", status: null }
  if (error instanceof APIConnectionError) return { reason: "error", status: null }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) return { reason: "access_denied", status: error.status ?? null }
  if (error instanceof RateLimitError) return { reason: "http_error", status: 429 }
  if (error instanceof InternalServerError) return { reason: "http_error", status: error.status ?? 500 }
  if (error instanceof BadRequestError) return { reason: "http_error", status: 400 }
  if (error instanceof APIError) {
    const status = typeof error.status === "number" ? error.status : null
    return { reason: status === 402 ? "access_denied" : "http_error", status }
  }
  return { reason: "error", status: null }
}

function callUsage(stage: AnswerCardPickCallUsage["stage"], model: string, usage: Anthropic.Usage | null | undefined): AnswerCardPickCallUsage {
  const tokens = {
    model,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
  }
  return { stage, ...tokens, usd: Number(estimateClaudeCostUsd(tokens).toFixed(8)) }
}

/** Claude 에 카드 번호 하나를 고르게 한다(키 하나, HTTP 요청 한 번, 재시도 없음). 던지지 않는다. */
export async function requestClaudeAnswerCardPick(args: ClaudeCardPickArgs): Promise<ClaudeCardPickResult> {
  const model = args.model
  if (!args.instruction.trim() || !args.input.trim()) return { outcome: { ok: false, reason: "error", model, provider: "claude" }, usage: null }
  const timeoutMs = Math.max(1, Math.round(args.timeoutMs))
  try {
    const client = new Anthropic({ apiKey: args.apiKey, maxRetries: 0, timeout: timeoutMs })
    const message = await client.messages.create(buildClaudeCardPickRequest(args), { timeout: timeoutMs, maxRetries: 0 })
    const usage = callUsage(args.stage, model, message.usage)
    recordClaudeUsage(
      { model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheCreationInputTokens: usage.cacheCreationInputTokens, cacheReadInputTokens: usage.cacheReadInputTokens },
      { kind: "assist" }
    )
    const base = { model, provider: "claude" as const, usage: [usage] }
    if (message.stop_reason === "refusal") {
      warn("refusal", { model, stage: args.stage })
      return { outcome: { ok: false, reason: "refusal", ...base }, usage }
    }
    const text = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim()
    const read = message.stop_reason === "max_tokens" ? null : readAnswerCardPickResult(text, args.expect)
    if (read === null) {
      warn("parse_error", { model, stage: args.stage, stopReason: message.stop_reason ?? null })
      return { outcome: { ok: false, reason: "parse_error", ...base }, usage }
    }
    return { outcome: { ok: true, pick: read.pick, ...(read.picks ? { picks: read.picks } : {}), ...base }, usage }
  } catch (error) {
    const { reason, status } = classifyClaudeError(error)
    warn("request_error", { model, stage: args.stage, status, error: error instanceof Error ? error.name : undefined })
    return { outcome: { ok: false, reason, model, provider: "claude" }, usage: null }
  }
}

/** Gemini 실패 중 업체 간 대체로 넘기는 것: 402·429·5xx·차단기 열림. */
export function isCrossFallbackFailure(result: GeminiAnswerCardPickResult): boolean {
  const { outcome, status } = result
  if (outcome.ok) return false
  if (outcome.reason === "circuit_open") return true
  if (status === null) return false
  return status === 402 || status === 429 || status >= 500
}

export interface AssistPickRequests {
  pick: AnswerCardPickRequest
  /** 올림이 꺼져 있으면 없다. */
  escalate?: AnswerCardPickRequest
  config: AssistPickConfig
}

export interface AssistPickDeps {
  gemini?: typeof requestGeminiAnswerCardPick
  claude?: typeof requestClaudeAnswerCardPick
  now?: () => number
  budgetAllows?: (limitUsd: number) => boolean
}

const defaultBudgetAllows = (limitUsd: number) => checkClaudeAssistBudget(limitUsd).allowed

/** env 설정으로 고르기(②, 대체 ⑤ 포함)·올림(③) 호출 함수를 만든다. */
export function createAssistPickRequests(config: AssistPickConfig = readAssistPickConfig(), deps: AssistPickDeps = {}): AssistPickRequests {
  const gemini = deps.gemini ?? requestGeminiAnswerCardPick
  const claude = deps.claude ?? requestClaudeAnswerCardPick
  const now = deps.now ?? Date.now
  const budgetAllows = deps.budgetAllows ?? defaultBudgetAllows
  const apiKey = config.apiKeys[0] ?? null

  const askGemini = async (args: Parameters<AnswerCardPickRequest>[0], budgetBlocked: boolean): Promise<AnswerCardPickOutcome> => {
    const started = now()
    const first = await gemini({ ...args, model: config.pickProvider === "gemini" ? config.pickModel : null })
    const outcome: AnswerCardPickOutcome = { ...first.outcome, provider: "gemini", ...(budgetBlocked ? { budgetBlocked } : {}) }
    if (!config.crossFallback || !isCrossFallbackFailure(first) || first.outcome.ok) return outcome
    // ⑤ 업체 간 대체: 키가 없거나 하루 상한이면 건너뛴다. 같은 시간 예산 안에서만.
    if (!apiKey) return outcome
    if (!budgetAllows(config.dailyBudgetUsd)) return { ...outcome, budgetBlocked: true }
    const remaining = args.timeoutMs - (now() - started)
    if (remaining < CROSS_FALLBACK_MIN_MS) return outcome
    const fallback = await claude({ ...args, timeoutMs: remaining, model: config.crossFallbackModel, apiKey, stage: "cross" })
    return {
      ...fallback.outcome,
      crossFallback: { from: first.outcome.model, reason: first.outcome.reason, status: first.status },
      ...(budgetBlocked ? { budgetBlocked } : {}),
    }
  }

  const pick: AnswerCardPickRequest = async (args) => {
    if (config.pickProvider === "claude" && config.pickModel) {
      // 키가 없거나 하루 상한이면 Gemini 로 고른다(②까지만).
      const allowed = apiKey ? budgetAllows(config.dailyBudgetUsd) : false
      if (apiKey && allowed) return (await claude({ ...args, model: config.pickModel, apiKey, stage: "pick" })).outcome
      return askGemini(args, Boolean(apiKey) && !allowed)
    }
    return askGemini(args, false)
  }

  if (!config.escalate) return { pick, config }
  const escalate: AnswerCardPickRequest = async (args) => {
    if (!apiKey) return { ok: false, reason: "no_connection", model: config.escalateModel, provider: "claude" }
    if (!budgetAllows(config.dailyBudgetUsd)) return { ok: false, reason: "budget", model: config.escalateModel, provider: "claude", budgetBlocked: true }
    return (await claude({ ...args, model: config.escalateModel, apiKey, stage: "escalate" })).outcome
  }
  return { pick, escalate, config }
}

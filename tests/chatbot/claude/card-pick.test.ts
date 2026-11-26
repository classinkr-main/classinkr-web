import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 답 색인 모델 선택 층의 업체 고르기·Claude 고르기·올림·업체 간 대체·하루 상한(lib/chatbot/claude/card-pick.ts, assist.ts 올림).
 * Gemini 는 가짜 fetch, Anthropic SDK 는 가짜 모듈이다(실제 Gemini·Vertex·Anthropic 호출 없음).
 */

const sdk = vi.hoisted(() => {
  class APIError extends Error {
    status: number | undefined
    constructor(status?: number, message = "api error") {
      super(message)
      this.status = status
    }
  }
  class APIConnectionError extends APIError {
    constructor(message = "connection error") {
      super(undefined, message)
    }
  }
  class APIConnectionTimeoutError extends APIConnectionError {}
  class APIUserAbortError extends APIError {}
  class BadRequestError extends APIError {}
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class RateLimitError extends APIError {}
  class InternalServerError extends APIError {}
  const create = vi.fn()
  const constructed: { apiKey: string; timeout?: number; maxRetries?: number }[] = []
  return {
    create,
    constructed,
    errors: {
      APIError,
      APIConnectionError,
      APIConnectionTimeoutError,
      APIUserAbortError,
      BadRequestError,
      AuthenticationError,
      PermissionDeniedError,
      RateLimitError,
      InternalServerError,
    },
  }
})

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: sdk.create }
    constructor(opts: { apiKey: string; timeout?: number; maxRetries?: number }) {
      sdk.constructed.push(opts)
    }
  },
  ...sdk.errors,
}))

import { __setRouterAnswerIndexForTests, resetRouterAnswerIndex } from "@/lib/chatbot/answer-index"
import {
  ANSWER_CARD_PICK_INSTRUCTION,
  assistCandidates,
  escalationTrigger,
  maybeAssistWithModel,
  type AnswerCardPickOutcome,
  type AnswerCardPickRequest,
} from "@/lib/chatbot/answer-index/assist"
import { decideWithAnalysis, hasNoDocSignal, type QuestionAnalysis } from "@/lib/chatbot/answer-index/decide"
import type { AnswerIndexAssistTrace } from "@/lib/chatbot/answer-index/types"
import { checkClaudeAssistBudget, claudeDayUsdByKind, recordClaudeUsage, resetClaudeBudgetStateForTests } from "@/lib/chatbot/claude/budget"
import {
  buildClaudeCardPickRequest,
  CLAUDE_CARD_PICK_MAX_TOKENS,
  classifyClaudeError,
  createAssistPickRequests,
  requestClaudeAnswerCardPick,
} from "@/lib/chatbot/claude/card-pick"
import { assistPickCacheSuffix, readAssistPickConfig, type AssistPickConfig } from "@/lib/chatbot/claude/config"
import { estimateClaudeCostUsd } from "@/lib/chatbot/claude/pricing"
import type { GeminiAnswerCardPickResult } from "@/lib/chatbot/llm"
import { __resetModelCircuitForTests } from "@/lib/chatbot/llm"
import { __clearAnswerCacheForTests, evaluateChatbotQuery, streamChatbotQuery, type ChatbotStreamEvent } from "@/lib/chatbot/service"

import { CARDS, compileFixture } from "../answer-index/index-fixture"

// ─── 가짜 Gemini(fetch) ──────────────────────────────────────────────────

interface RecordedCall {
  url: string
  body: { contents?: { parts?: { text?: string }[] }[] }
}
const calls: RecordedCall[] = []
let behavior: (call: RecordedCall) => Response = () => {
  throw new Error("no fake Gemini behavior")
}
const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const call: RecordedCall = { url, body: JSON.parse(String(init?.body ?? "{}")) as RecordedCall["body"] }
  calls.push(call)
  return behavior(call)
})

function geminiText(text: string) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}
function geminiError(status: number) {
  return new Response(JSON.stringify({ error: { code: status, status: "SIMULATED" } }), { status, headers: { "content-type": "application/json" } })
}
const inputOf = (text: string | undefined) => text ?? ""
function numberOfTopic(input: string, topic: string) {
  for (const line of input.split("\n")) {
    const match = line.match(/^\[(\d+)\] \([a-z]+\) (.+?) \| /)
    if (match && match[2] === topic) return Number(match[1])
  }
  throw new Error(`후보에 없는 주제: ${topic}`)
}
const geminiPickTopic = (topic: string) => (call: RecordedCall) =>
  geminiText(JSON.stringify({ pick: numberOfTopic(inputOf(call.body.contents?.[0]?.parts?.[0]?.text), topic) }))

// ─── 가짜 Claude(SDK) ────────────────────────────────────────────────────

interface ClaudeParams {
  model: string
  max_tokens: number
  system: { type: string; text: string; cache_control?: unknown }[]
  messages: { role: string; content: unknown }[]
  thinking?: unknown
  output_config?: { effort?: string; format?: unknown }
  tool_choice?: unknown
}

function claudeMessage(text: string, stopReason = "end_turn", usage: Record<string, number> = {}) {
  return {
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    usage: { input_tokens: 3600, output_tokens: 9, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usage },
  }
}
const claudeParams = () => sdk.create.mock.calls.map((call) => call[0] as ClaudeParams)
const claudePickTopic = (topic: string) => async (params: ClaudeParams) =>
  claudeMessage(JSON.stringify({ pick: numberOfTopic(String(params.messages[0].content), topic) }))

function stubModelEnv(extra: Record<string, string | undefined> = {}) {
  vi.stubEnv("GEMINI_API_KEY", "test-model-key")
  vi.stubEnv("CHATBOT_GEMINI_PROVIDER", "developer")
  vi.stubEnv("GEMINI_FAST_MODEL", "")
  vi.stubEnv("GEMINI_REASONING_MODEL", "")
  vi.stubEnv("GEMINI_MODEL", "")
  vi.stubEnv("ANSWER_INDEX_DATA_DIR", undefined)
  vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
  vi.stubEnv("CHATBOT_ANSWER_ASSIST", "always")
  vi.stubEnv("CHATBOT_ASSIST_TIMEOUT_MS", undefined)
  for (const name of [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_API_KEY_1",
    "ANTHROPIC_API_KEY_2",
    "ANTHROPIC_API_KEY_3",
    "CHATBOT_ASSIST_PICK_PROVIDER",
    "CHATBOT_ASSIST_PICK_MODEL",
    "CHATBOT_ASSIST_ESCALATE",
    "CHATBOT_ASSIST_ESCALATE_MODEL",
    "CHATBOT_ASSIST_ESCALATE_TIMEOUT_MS",
    "CHATBOT_ASSIST_CROSS_FALLBACK",
    "CHATBOT_CLAUDE_DAILY_BUDGET_USD",
  ]) {
    vi.stubEnv(name, undefined)
  }
  for (const [name, value] of Object.entries(extra)) vi.stubEnv(name, value)
}

const assistOf = (result: { answerIndex?: { assist?: AnswerIndexAssistTrace } }) => result.answerIndex?.assist

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

beforeEach(() => {
  __clearAnswerCacheForTests()
  __resetModelCircuitForTests()
  resetClaudeBudgetStateForTests()
  calls.length = 0
  fetchMock.mockClear()
  sdk.create.mockReset()
  sdk.constructed.length = 0
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  __setRouterAnswerIndexForTests(null)
  __resetModelCircuitForTests()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  resetRouterAnswerIndex()
  vi.restoreAllMocks()
})

// ─── 설정 ────────────────────────────────────────────────────────────────

describe("readAssistPickConfig", () => {
  it("keeps today's behavior by default and reads every switch", () => {
    const config = readAssistPickConfig({})
    expect(config).toMatchObject({
      pickProvider: "gemini",
      pickModel: null,
      escalate: false,
      escalateModel: "claude-sonnet-5-5",
      escalateTimeoutMs: 3000,
      crossFallback: false,
      crossFallbackModel: "claude-haiku-5-5",
      dailyBudgetUsd: 1,
      apiKeys: [],
    })
    // R2 B3: 켰을 때 열쇠 꼬리 맨 앞에 고르기 규약 판(picks1)이 붙는다(끄면 열쇠에 꼬리가 없다 — service.ts answerCacheRouterKey).
    expect(assistPickCacheSuffix(config)).toBe("+picks1")
    expect(config).toMatchObject({ pickPrompt: "v1", candidates: 10, band: [null, null] })
    expect(
      assistPickCacheSuffix(readAssistPickConfig({ CHATBOT_ASSIST_PICK_PROMPT: "v2", CHATBOT_ASSIST_CANDIDATES: "15", CHATBOT_ASSIST_BAND_LO: "0.1" }))
    ).toBe("+picks1+prompt-v2+cand-15+band-0.1-")
    expect(readAssistPickConfig({ CHATBOT_ASSIST_PICK_PROVIDER: "claude" }).pickModel).toBe("claude-haiku-5-5")
    expect(readAssistPickConfig({ CHATBOT_ASSIST_PICK_MODEL: "gemini-3.5-flash-lite" }).pickModel).toBe("gemini-3.5-flash-lite")
    const on = readAssistPickConfig({
      CHATBOT_ASSIST_ESCALATE: "on",
      CHATBOT_ASSIST_CROSS_FALLBACK: "on",
      CHATBOT_ASSIST_ESCALATE_TIMEOUT_MS: "1500",
      CHATBOT_CLAUDE_DAILY_BUDGET_USD: "0.25",
      ANTHROPIC_API_KEY: "k",
    })
    expect(on).toMatchObject({ escalate: true, crossFallback: true, escalateTimeoutMs: 1500, dailyBudgetUsd: 0.25, apiKeys: ["k"] })
    expect(assistPickCacheSuffix(on)).toBe("+picks1+esc-claude-sonnet-5-5+xfb-claude-haiku-5-5")
    expect(readAssistPickConfig({ CHATBOT_ASSIST_ESCALATE: "off" }).escalate).toBe(false)
  })
})

// ─── Claude 요청 ─────────────────────────────────────────────────────────

describe("Claude card pick request", () => {
  it("puts cache_control only on the fixed instruction, asks for {pick: integer} structured output, never forces a tool", () => {
    for (const model of ["claude-haiku-5-5", "claude-sonnet-5-5"]) {
      const body = buildClaudeCardPickRequest({ instruction: ANSWER_CARD_PICK_INSTRUCTION, input: "방문자 질문: x\n\n답 카드 후보:\n[1] …", model })
      expect(body.system).toEqual([{ type: "text", text: ANSWER_CARD_PICK_INSTRUCTION, cache_control: { type: "ephemeral" } }])
      expect(body.messages).toEqual([{ role: "user", content: "방문자 질문: x\n\n답 카드 후보:\n[1] …" }])
      expect(JSON.stringify(body.messages)).not.toContain("cache_control")
      expect(body.output_config).toEqual({
        effort: "low",
        format: {
          type: "json_schema",
          schema: { type: "object", properties: { pick: { type: "integer" } }, required: ["pick"], additionalProperties: false },
        },
      })
      expect(body).not.toHaveProperty("tool_choice")
      expect(body).not.toHaveProperty("tools")
      expect(body.max_tokens).toBe(CLAUDE_CARD_PICK_MAX_TOKENS)
      expect(body.max_tokens).toBeGreaterThanOrEqual(256)
      expect(body.max_tokens).toBeLessThanOrEqual(1024)
    }
    expect(buildClaudeCardPickRequest({ instruction: "i", input: "x", model: "claude-sonnet-5-5" }).thinking).toEqual({ type: "between_tools" })
    expect(buildClaudeCardPickRequest({ instruction: "i", input: "x", model: "claude-haiku-5-5" }).thinking).toEqual({ type: "disabled" })
  })

  it("parses the pick, records usage in the trace outcome and the daily assist budget", async () => {
    sdk.create.mockResolvedValue(claudeMessage('{"pick": 3}', "end_turn", { cache_read_input_tokens: 0 }))
    const result = await requestClaudeAnswerCardPick({ instruction: "지시", input: "입력", timeoutMs: 2000, model: "claude-haiku-5-5", apiKey: "k1", stage: "pick" })
    const usd = estimateClaudeCostUsd({ model: "claude-haiku-5-5", inputTokens: 3600, outputTokens: 9 })
    expect(result.outcome).toMatchObject({ ok: true, pick: 3, model: "claude-haiku-5-5", provider: "claude" })
    expect(result.usage).toMatchObject({ stage: "pick", model: "claude-haiku-5-5", inputTokens: 3600, outputTokens: 9, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 })
    expect(result.usage?.usd).toBeCloseTo(usd, 10)
    expect(claudeDayUsdByKind("assist")).toBeCloseTo(usd, 10)
    expect(sdk.constructed[0]).toMatchObject({ apiKey: "k1", maxRetries: 0, timeout: 2000 })
    expect(sdk.create.mock.calls[0][1]).toMatchObject({ timeout: 2000, maxRetries: 0 })
  })

  it("returns refusal, parse_error and max_tokens as failures (still billing the usage)", async () => {
    const args = { instruction: "지시", input: "입력", timeoutMs: 2000, model: "claude-sonnet-5-5", apiKey: "k1", stage: "escalate" as const }
    sdk.create.mockResolvedValueOnce(claudeMessage("", "refusal"))
    expect((await requestClaudeAnswerCardPick(args)).outcome).toMatchObject({ ok: false, reason: "refusal" })
    sdk.create.mockResolvedValueOnce(claudeMessage("2번이요"))
    expect((await requestClaudeAnswerCardPick(args)).outcome).toMatchObject({ ok: false, reason: "parse_error" })
    sdk.create.mockResolvedValueOnce(claudeMessage('{"pick": 2}', "max_tokens"))
    expect((await requestClaudeAnswerCardPick(args)).outcome).toMatchObject({ ok: false, reason: "parse_error" })
    expect(claudeDayUsdByKind("assist")).toBeGreaterThan(0)
  })

  it("classifies SDK errors by type", async () => {
    const { errors } = sdk
    expect(classifyClaudeError(new errors.RateLimitError(429))).toEqual({ reason: "http_error", status: 429 })
    expect(classifyClaudeError(new errors.InternalServerError(529))).toEqual({ reason: "http_error", status: 529 })
    expect(classifyClaudeError(new errors.AuthenticationError(401))).toEqual({ reason: "access_denied", status: 401 })
    expect(classifyClaudeError(new errors.PermissionDeniedError(403))).toEqual({ reason: "access_denied", status: 403 })
    expect(classifyClaudeError(new errors.BadRequestError(400))).toEqual({ reason: "http_error", status: 400 })
    expect(classifyClaudeError(new errors.APIError(402))).toEqual({ reason: "access_denied", status: 402 })
    expect(classifyClaudeError(new errors.APIConnectionTimeoutError())).toEqual({ reason: "timeout", status: null })
    expect(classifyClaudeError(new errors.APIUserAbortError())).toEqual({ reason: "timeout", status: null })
    expect(classifyClaudeError(new errors.APIConnectionError())).toEqual({ reason: "error", status: null })
    expect(classifyClaudeError(new TypeError("x"))).toEqual({ reason: "error", status: null })
    sdk.create.mockRejectedValueOnce(new errors.RateLimitError(429))
    const result = await requestClaudeAnswerCardPick({ instruction: "지시", input: "입력", timeoutMs: 2000, model: "claude-haiku-5-5", apiKey: "k", stage: "pick" })
    expect(result).toEqual({ outcome: { ok: false, reason: "http_error", model: "claude-haiku-5-5", provider: "claude" }, usage: null })
  })
})

// ─── 업체 고르기·대체·상한(호출 함수) ───────────────────────────────────

describe("createAssistPickRequests", () => {
  const args = { instruction: ANSWER_CARD_PICK_INSTRUCTION, input: "방문자 질문: x\n\n답 카드 후보:\n[1] …", timeoutMs: 2500 }
  const base = (overrides: Partial<AssistPickConfig> = {}): AssistPickConfig => ({ ...readAssistPickConfig({}), ...overrides })
  const geminiOk = (pick = 1): GeminiAnswerCardPickResult => ({ outcome: { ok: true, pick, model: "gemini-4-hydrogen" }, status: 200 })
  const geminiFail = (reason: "http_error" | "access_denied" | "circuit_open" | "timeout", status: number | null): GeminiAnswerCardPickResult => ({
    outcome: { ok: false, reason, model: "gemini-4-hydrogen" },
    status,
  })
  const claudeOk = (pick = 2) =>
    vi.fn(async (a: { model: string; stage: "pick" | "cross" | "escalate" }) => ({
      outcome: { ok: true as const, pick, model: a.model, provider: "claude" as const, usage: [{ stage: a.stage, model: a.model, inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, usd: 0.001 }] },
      usage: null,
    }))

  it("default: one Gemini call with the basic first model, no escalation function", async () => {
    const gemini = vi.fn(async () => geminiOk(4))
    const claude = claudeOk()
    const requests = createAssistPickRequests(base(), { gemini, claude })
    expect(requests.escalate).toBeUndefined()
    expect(await requests.pick(args)).toEqual({ ok: true, pick: 4, model: "gemini-4-hydrogen", provider: "gemini" })
    expect(gemini).toHaveBeenCalledWith({ ...args, model: null })
    expect(claude).not.toHaveBeenCalled()
  })

  it("passes CHATBOT_ASSIST_PICK_MODEL to Gemini and switches the provider to Claude Haiku", async () => {
    const gemini = vi.fn(async () => geminiOk(1))
    const claude = claudeOk(3)
    await createAssistPickRequests(base({ pickModel: "gemini-3.5-flash-lite" }), { gemini, claude }).pick(args)
    expect(gemini).toHaveBeenLastCalledWith({ ...args, model: "gemini-3.5-flash-lite" })
    const claudeConfig = base({ pickProvider: "claude", pickModel: "claude-haiku-5-5", apiKeys: ["k"] })
    expect(await createAssistPickRequests(claudeConfig, { gemini, claude }).pick(args)).toMatchObject({ ok: true, pick: 3, provider: "claude", model: "claude-haiku-5-5" })
    expect(claude).toHaveBeenCalledWith({ ...args, model: "claude-haiku-5-5", apiKey: "k", stage: "pick" })
    expect(gemini).toHaveBeenCalledTimes(1)
    // 키가 없거나 하루 상한이면 Gemini 로 고른다.
    expect(await createAssistPickRequests({ ...claudeConfig, apiKeys: [] }, { gemini, claude }).pick(args)).toMatchObject({ provider: "gemini" })
    expect(await createAssistPickRequests(claudeConfig, { gemini, claude, budgetAllows: () => false }).pick(args)).toMatchObject({
      provider: "gemini",
      budgetBlocked: true,
    })
    expect(claude).toHaveBeenCalledTimes(1)
  })

  it("falls back to Claude Haiku once on Gemini 402·429·5xx·circuit open, within the same time budget", async () => {
    for (const [reason, status] of [
      ["access_denied", 402],
      ["http_error", 429],
      ["http_error", 500],
      ["http_error", 503],
      ["circuit_open", null],
    ] as const) {
      const gemini = vi.fn<(args: { model?: string | null }) => Promise<GeminiAnswerCardPickResult>>(async () => geminiFail(reason, status))
      const claude = claudeOk(2)
      let clock = 0
      const now = () => clock
      const requests = createAssistPickRequests(base({ crossFallback: true, apiKeys: ["k"] }), {
        gemini: async (a) => {
          clock += 400
          return gemini(a)
        },
        claude,
        now,
      })
      const outcome = await requests.pick(args)
      expect(outcome, `${reason}/${status}`).toMatchObject({
        ok: true,
        pick: 2,
        provider: "claude",
        model: "claude-haiku-5-5",
        crossFallback: { from: "gemini-4-hydrogen", reason, status },
      })
      expect(claude).toHaveBeenCalledTimes(1)
      expect(claude).toHaveBeenCalledWith({ ...args, timeoutMs: 2100, model: "claude-haiku-5-5", apiKey: "k", stage: "cross" })
    }
  })

  it("does not fall back on 404·403·timeout, when off, without a key, over budget or with too little time", async () => {
    const claude = claudeOk()
    const run = async (result: GeminiAnswerCardPickResult, overrides: Partial<AssistPickConfig>, deps: { budgetAllows?: () => boolean; now?: () => number } = {}) =>
      createAssistPickRequests(base({ crossFallback: true, apiKeys: ["k"], ...overrides }), { gemini: async () => result, claude, ...deps }).pick(args)
    const notFound = await run(geminiFail("http_error", 404), {})
    expect(notFound).toMatchObject({ ok: false, reason: "http_error", provider: "gemini" })
    expect(notFound).not.toHaveProperty("crossFallback")
    expect(await run(geminiFail("http_error", 403), {})).toMatchObject({ ok: false, provider: "gemini" })
    expect(await run(geminiFail("timeout", null), {})).toMatchObject({ ok: false, reason: "timeout" })
    expect(await run(geminiFail("http_error", 429), { crossFallback: false })).toMatchObject({ ok: false, reason: "http_error" })
    expect(await run(geminiFail("http_error", 429), { apiKeys: [] })).toMatchObject({ ok: false, reason: "http_error" })
    expect(await run(geminiFail("http_error", 429), {}, { budgetAllows: () => false })).toMatchObject({ ok: false, budgetBlocked: true })
    let clock = 0
    const late = () => {
      clock += 2300
      return clock
    }
    expect(await run(geminiFail("http_error", 429), {}, { now: late })).toMatchObject({ ok: false, reason: "http_error" })
    expect(claude).not.toHaveBeenCalled()
  })

  it("escalates with Claude Sonnet 5.5, and turns it off without a key or over the daily budget", async () => {
    const claude = claudeOk(5)
    const on = base({ escalate: true, apiKeys: ["k"] })
    const requests = createAssistPickRequests(on, { gemini: async () => geminiOk(), claude })
    expect(await requests.escalate!(args)).toMatchObject({ ok: true, pick: 5, model: "claude-sonnet-5-5", provider: "claude" })
    expect(claude).toHaveBeenCalledWith({ ...args, model: "claude-sonnet-5-5", apiKey: "k", stage: "escalate" })
    expect(await createAssistPickRequests({ ...on, apiKeys: [] }, { claude }).escalate!(args)).toMatchObject({ ok: false, reason: "no_connection" })
    expect(await createAssistPickRequests(on, { claude, budgetAllows: () => false }).escalate!(args)).toMatchObject({ ok: false, reason: "budget", budgetBlocked: true })
    expect(claude).toHaveBeenCalledTimes(1)
  })

  it("stops Claude once the assist spend of the KST day reaches the cap", () => {
    expect(checkClaudeAssistBudget(0.01).allowed).toBe(true)
    // 답변(answer) 몫은 assist 상한에 들어가지 않는다.
    recordClaudeUsage({ model: "claude-sonnet-5-5", inputTokens: 10_000, outputTokens: 0 }, { kind: "answer" })
    expect(checkClaudeAssistBudget(0.01).allowed).toBe(true)
    recordClaudeUsage({ model: "claude-sonnet-5-5", inputTokens: 5_000, outputTokens: 0 }, { kind: "assist" })
    expect(checkClaudeAssistBudget(0.01)).toEqual({ allowed: false, dayUsd: 0.01 })
    expect(checkClaudeAssistBudget(0.02).allowed).toBe(true)
  })
})

// ─── 올림(assist.ts) ─────────────────────────────────────────────────────

describe("escalation in maybeAssistWithModel", () => {
  const index = compileFixture()
  const question = "녹화 영상 다시보기 어디서 봐요"
  const { decision, analysis } = decideWithAnalysis(index, question, { env: {} })
  const candidates = assistCandidates(index, analysis, {})
  const n = (card: string) => candidates.find((candidate) => candidate.id === card)!.n
  const ok = (pick: number, model: string, provider: "gemini" | "claude" = "gemini"): AnswerCardPickOutcome => ({ ok: true, pick, model, provider })
  const request = (outcome: AnswerCardPickOutcome) => vi.fn<AnswerCardPickRequest>(async () => outcome)
  const run = (pick: AnswerCardPickRequest, escalate: AnswerCardPickRequest | undefined, extra: Partial<Parameters<typeof maybeAssistWithModel>[0]> = {}) =>
    maybeAssistWithModel({ index, analysis, decision, question, mode: "always", request: pick, escalate, env: {}, ...extra })

  it("starts from a deterministic answer on the replay card with the download card below", () => {
    expect(decision).toMatchObject({ kind: "answer", card: CARDS.replay })
    expect(hasNoDocSignal(analysis.whole)).toBe(false)
    expect(analysis.parts).toBeNull()
  })

  it("(a) escalates when the picked answer card differs from the deterministic one, and the escalation pick is final", async () => {
    const pick = request(ok(n(CARDS.download), "gemini-4-hydrogen"))
    const escalate = request(ok(n(CARDS.replay), "claude-sonnet-5-5", "claude"))
    const result = await run(pick, escalate)
    expect(escalate).toHaveBeenCalledTimes(1)
    expect(escalate.mock.calls[0][0]).toMatchObject({ instruction: ANSWER_CARD_PICK_INSTRUCTION, input: pick.mock.calls[0][0].input, timeoutMs: 3000 })
    expect(result.decision).toMatchObject({ kind: "answer", card: CARDS.replay })
    expect(result.trace).toMatchObject({
      used: true,
      pick: n(CARDS.replay),
      pickCard: CARDS.replay,
      model: "claude-sonnet-5-5",
      provider: "claude",
      accepted: true,
      escalated: true,
      escalation: { trigger: "disagree", model: "claude-sonnet-5-5", pick: n(CARDS.replay), failure: null, first: { provider: "gemini", pick: n(CARDS.download), pickCard: CARDS.download } },
    })
    // 올림이 다른 카드를 고르면 그 카드(받아들이는 규칙 그대로).
    const moved = await run(pick, request(ok(n(CARDS.download), "claude-sonnet-5-5", "claude")))
    expect(moved.decision).toMatchObject({ kind: "answer", card: CARDS.download })
  })

  it("(b) escalates a 0 pick on a deterministic abstain without a NODOC signal, not with one", async () => {
    const abstain = { ...decision, kind: "abstain" as const, card: null }
    expect(escalationTrigger(index, analysis, abstain, candidates, 0)).toBe("none_vs_abstain")
    const nodoc: QuestionAnalysis = { ...analysis, whole: { ...analysis.whole, knn: { ...analysis.whole.knn, none: 1 } } }
    expect(hasNoDocSignal(nodoc.whole)).toBe(true)
    expect(escalationTrigger(index, nodoc, abstain, candidates, 0)).toBeNull()
    const escalate = request(ok(n(CARDS.replay), "claude-sonnet-5-5", "claude"))
    const result = await run(request(ok(0, "gemini-4-hydrogen")), escalate, { decision: abstain })
    expect(escalate).toHaveBeenCalledTimes(1)
    expect(result.trace).toMatchObject({ escalated: true, escalation: { trigger: "none_vs_abstain" } })
    expect(result.decision).toMatchObject({ kind: "answer", card: CARDS.replay })
    const kept = await run(request(ok(0, "gemini-4-hydrogen")), request(ok(1, "claude-sonnet-5-5", "claude")), { decision: abstain, analysis: nodoc })
    expect(kept.trace).toMatchObject({ escalated: false })
    expect(kept.trace?.escalation).toBeUndefined()
  })

  it("(c) escalates for an expanded question, two segments, or an angry/repeated tone", async () => {
    const same = n(CARDS.replay)
    expect(escalationTrigger(index, analysis, decision, candidates, same)).toBeNull()
    expect(escalationTrigger(index, analysis, decision, candidates, same, { expanded: true })).toBe("context")
    expect(escalationTrigger(index, analysis, decision, candidates, same, { angry: true })).toBe("context")
    expect(escalationTrigger(index, analysis, decision, candidates, same, { repeated: true })).toBe("context")
    const parts: QuestionAnalysis = { ...analysis, parts: [analysis.whole, analysis.whole] }
    expect(escalationTrigger(index, parts, decision, candidates, same)).toBe("context")
    expect(escalationTrigger(index, analysis, decision, candidates, 99, { angry: true })).toBeNull()
    const escalate = request(ok(same, "claude-sonnet-5-5", "claude"))
    const result = await run(request(ok(same, "gemini-4-hydrogen")), escalate, { escalateSignals: { angry: true } })
    expect(result.trace).toMatchObject({ escalated: true, escalation: { trigger: "context" }, accepted: true })
  })

  it("does not escalate when the picks agree, on a gap pick, or when escalation is off", async () => {
    const same = n(CARDS.replay)
    const escalate = request(ok(1, "claude-sonnet-5-5", "claude"))
    const agree = await run(request(ok(same, "gemini-4-hydrogen")), escalate)
    expect(agree.trace).toMatchObject({ escalated: false, provider: "gemini", crossFallback: false })
    expect(agree.trace?.escalation).toBeUndefined()
    const gap = candidates.find((candidate) => index.cards[candidate.card].kind === "gap")
    if (gap) expect(escalationTrigger(index, analysis, decision, candidates, gap.n)).toBeNull()
    expect(escalate).not.toHaveBeenCalled()
    // 올림 함수가 없으면(기본) 흔적에 escalated 칸도 없다.
    const off = await run(request(ok(n(CARDS.download), "gemini-4-hydrogen")), undefined)
    expect(off.trace).not.toHaveProperty("escalated")
    expect(off.decision).toMatchObject({ card: CARDS.download })
  })

  it("keeps the deterministic decision when the escalation fails (timeout·refusal·parse·HTTP), never MODEL_UNAVAILABLE", async () => {
    for (const reason of ["timeout", "refusal", "parse_error", "http_error", "access_denied", "error"] as const) {
      const result = await run(request(ok(n(CARDS.download), "gemini-4-hydrogen")), request({ ok: false, reason, model: "claude-sonnet-5-5", provider: "claude" }))
      expect(result.decision, reason).toBe(decision)
      expect(result.modelFailure, reason).toBe(reason)
      expect(result.trace, reason).toMatchObject({ accepted: false, rejectReason: `escalation_${reason}`, escalated: true, escalation: { failure: reason } })
    }
    // 올림 함수가 예산을 넘기면 여기서 끊는다.
    const slow: AnswerCardPickRequest = () => new Promise(() => {})
    const timed = await run(request(ok(n(CARDS.download), "gemini-4-hydrogen")), slow, { escalateTimeoutMs: 400 })
    expect(timed.decision).toBe(decision)
    expect(timed.trace).toMatchObject({ rejectReason: "escalation_timeout" })
  })

  it("keeps the pick result without escalating over budget, without a key, or past the route deadline", async () => {
    const pick = request(ok(n(CARDS.download), "gemini-4-hydrogen"))
    for (const reason of ["budget", "no_connection"] as const) {
      const result = await run(pick, request({ ok: false, reason, model: "claude-sonnet-5-5", provider: "claude", ...(reason === "budget" ? { budgetBlocked: true } : {}) }))
      expect(result.decision, reason).toMatchObject({ kind: "answer", card: CARDS.download })
      expect(result.modelFailure, reason).toBeNull()
      expect(result.trace, reason).toMatchObject({ accepted: true, escalated: false, escalation: { skipped: reason } })
    }
    const escalate = request(ok(1, "claude-sonnet-5-5", "claude"))
    const late = await run(pick, escalate, { deadlineAt: Date.now() + 100 })
    expect(escalate).not.toHaveBeenCalled()
    expect(late.trace).toMatchObject({ escalation: { skipped: "deadline" } })
  })

  it("sums Claude usage of the pick, cross fallback and escalation into the trace", async () => {
    const usage = (stage: "cross" | "escalate", model: string, usd: number) => ({ stage, model, inputTokens: 3000, outputTokens: 8, cacheReadInputTokens: 100, cacheCreationInputTokens: 0, usd })
    const pick = request({ ...ok(n(CARDS.download), "claude-haiku-5-5", "claude"), usage: [usage("cross", "claude-haiku-5-5", 0.0003)], crossFallback: { from: "gemini-4-hydrogen", reason: "http_error", status: 429 } })
    const escalate = request({ ...ok(n(CARDS.replay), "claude-sonnet-5-5", "claude"), usage: [usage("escalate", "claude-sonnet-5-5", 0.006)] })
    const result = await run(pick, escalate)
    expect(result.trace).toMatchObject({
      crossFallback: true,
      escalated: true,
      usage: { inputTokens: 6000, outputTokens: 16, cacheReadInputTokens: 200, cacheCreationInputTokens: 0, usd: 0.0063 },
    })
    expect(result.trace?.usage?.calls.map((call) => call.stage)).toEqual(["cross", "escalate"])
  })
})

// ─── 서비스 경로(가짜 Gemini·가짜 Claude) ───────────────────────────────

describe("compiled route with provider switch, escalation and cross fallback", () => {
  beforeEach(() => {
    __setRouterAnswerIndexForTests(compileFixture())
  })

  it("picks with Claude Haiku without calling Gemini when the provider is claude", async () => {
    stubModelEnv({ CHATBOT_ASSIST_PICK_PROVIDER: "claude", ANTHROPIC_API_KEY: "test-anthropic-key" })
    sdk.create.mockImplementation(claudePickTopic("녹화 파일 내려받기"))
    const result = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
    expect(result.answerIndex).toMatchObject({ decision: "answer", card: CARDS.download })
    expect(assistOf(result)).toMatchObject({ provider: "claude", model: "claude-haiku-5-5", accepted: true, crossFallback: false })
    expect(assistOf(result)?.usage).toMatchObject({ inputTokens: 3600, outputTokens: 9, calls: [{ stage: "pick", model: "claude-haiku-5-5" }] })
    expect(calls).toHaveLength(0)
    expect(claudeParams()[0].system[0].text).toBe(ANSWER_CARD_PICK_INSTRUCTION)
  })

  it("escalates a disagreeing Gemini pick to Claude Sonnet once, the same in stream and non-stream", async () => {
    stubModelEnv({ CHATBOT_ASSIST_ESCALATE: "on", ANTHROPIC_API_KEY: "test-anthropic-key" })
    behavior = geminiPickTopic("녹화 파일 내려받기")
    sdk.create.mockImplementation(claudePickTopic("수업 녹화와 다시보기"))
    const result = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
    expect(result.answerIndex).toMatchObject({ decision: "answer", card: CARDS.replay })
    expect(assistOf(result)).toMatchObject({
      provider: "claude",
      model: "claude-sonnet-5-5",
      escalated: true,
      escalation: { trigger: "disagree", first: { provider: "gemini", model: "gemini-4-hydrogen", pickCard: CARDS.download } },
    })
    expect(calls).toHaveLength(1)
    expect(sdk.create).toHaveBeenCalledTimes(1)
    expect(claudeParams()[0]).toMatchObject({ model: "claude-sonnet-5-5", thinking: { type: "between_tools" }, output_config: { effort: "low" } })
    __clearAnswerCacheForTests()
    const events: ChatbotStreamEvent[] = []
    await streamChatbotQuery({ message: "녹화 영상 다시보기 어디서 봐요", context: { showSources: true } }, {}, (event) => events.push(event))
    const replace = [...events].reverse().find((event) => event.type === "replace")
    expect(replace && replace.type === "replace" ? replace.answer : undefined).toBe(result.answer)
  })

  it("escalates an angry question (tone signal) and keeps the deterministic answer when Sonnet times out", async () => {
    stubModelEnv({ CHATBOT_ASSIST_ESCALATE: "on", ANTHROPIC_API_KEY: "test-anthropic-key" })
    behavior = geminiPickTopic("수업 녹화와 다시보기")
    sdk.create.mockRejectedValue(new sdk.errors.APIConnectionTimeoutError())
    const result = await evaluateChatbotQuery("도대체 녹화 영상 다시보기 어디서 봐요")
    expect(result.answerIndex).toMatchObject({ card: CARDS.replay })
    expect(assistOf(result)).toMatchObject({ escalated: true, escalation: { trigger: "context", failure: "timeout" }, rejectReason: "escalation_timeout" })
    expect(result.answer).toContain("[다시보기]")
    expect(result.modelState).toBe("timeout")
  })

  it("does not escalate twice and does not call Claude when the picks agree", async () => {
    stubModelEnv({ CHATBOT_ASSIST_ESCALATE: "on", ANTHROPIC_API_KEY: "test-anthropic-key" })
    behavior = geminiPickTopic("수업 녹화와 다시보기")
    const result = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
    expect(assistOf(result)).toMatchObject({ provider: "gemini", escalated: false })
    expect(sdk.create).not.toHaveBeenCalled()
  })

  it("falls back to Claude Haiku on Gemini 402 and 429, and skips the fallback without a key", async () => {
    for (const status of [402, 429]) {
      stubModelEnv({ CHATBOT_ASSIST_CROSS_FALLBACK: "on", ANTHROPIC_API_KEY: "test-anthropic-key" })
      __clearAnswerCacheForTests()
      __resetModelCircuitForTests()
      calls.length = 0
      sdk.create.mockReset()
      behavior = () => geminiError(status)
      sdk.create.mockImplementation(claudePickTopic("녹화 파일 내려받기"))
      const result = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
      expect(result.answerIndex, String(status)).toMatchObject({ card: CARDS.download })
      expect(assistOf(result), String(status)).toMatchObject({ provider: "claude", model: "claude-haiku-5-5", crossFallback: true, accepted: true })
      expect(assistOf(result)?.usage?.calls[0].stage, String(status)).toBe("cross")
      expect(sdk.create, String(status)).toHaveBeenCalledTimes(1)
    }
    // 402 로 열린 차단기도 대체로 넘긴다.
    calls.length = 0
    sdk.create.mockClear()
    __clearAnswerCacheForTests()
    const circuit = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
    expect(assistOf(circuit)).toMatchObject({ crossFallback: true })
    vi.unstubAllEnvs()
    stubModelEnv({ CHATBOT_ASSIST_CROSS_FALLBACK: "on" })
    __clearAnswerCacheForTests()
    __resetModelCircuitForTests()
    sdk.create.mockClear()
    behavior = () => geminiError(429)
    const noKey = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
    expect(noKey.answerIndex).toMatchObject({ card: CARDS.replay })
    expect(assistOf(noKey)).toMatchObject({ provider: "gemini", crossFallback: false, rejectReason: "http_error" })
    expect(sdk.create).not.toHaveBeenCalled()
  })

  it("turns escalation and cross fallback off over the daily budget (Gemini pick only)", async () => {
    stubModelEnv({
      CHATBOT_ASSIST_ESCALATE: "on",
      CHATBOT_ASSIST_CROSS_FALLBACK: "on",
      CHATBOT_CLAUDE_DAILY_BUDGET_USD: "0.001",
      ANTHROPIC_API_KEY: "test-anthropic-key",
    })
    recordClaudeUsage({ model: "claude-sonnet-5-5", inputTokens: 1000, outputTokens: 0 }, { kind: "assist" })
    behavior = geminiPickTopic("녹화 파일 내려받기")
    const result = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
    expect(result.answerIndex).toMatchObject({ card: CARDS.download })
    expect(assistOf(result)).toMatchObject({ provider: "gemini", escalated: false, budgetBlocked: true, escalation: { skipped: "budget" } })
    __clearAnswerCacheForTests()
    __resetModelCircuitForTests()
    behavior = () => geminiError(429)
    const failed = await evaluateChatbotQuery("녹화 영상 다시보기 어디서 봐요")
    expect(assistOf(failed)).toMatchObject({ provider: "gemini", crossFallback: false, budgetBlocked: true, rejectReason: "http_error" })
    expect(sdk.create).not.toHaveBeenCalled()
  })
})

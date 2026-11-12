import { afterEach, describe, expect, it, vi } from "vitest"
import { readChatbotClaudeConfig, resolveAnthropicKeys, shouldUseClaudeForAnswer } from "@/lib/chatbot/claude/config"
import {
  checkClaudeBudget,
  createSupabaseClaudeUsageStore,
  kstWindowStarts,
  recordClaudeUsage,
  resetClaudeBudgetStateForTests,
  type ClaudeUsageStore,
} from "@/lib/chatbot/claude/budget"
import { estimateClaudeCostUsd } from "@/lib/chatbot/claude/pricing"

describe("readChatbotClaudeConfig — 기본값은 gemini(운영 동작 그대로)", () => {
  it("env 가 없으면 gemini · 라벨링 off · 기본 모델", () => {
    const c = readChatbotClaudeConfig({})
    expect(c.provider).toBe("gemini")
    expect(c.labelingEnabled).toBe(false)
    expect(c.answerModel).toBe("claude-sonnet-5-5")
    expect(c.labelModel).toBe("claude-haiku-5-5")
    expect(shouldUseClaudeForAnswer(c)).toBe(false)
  })

  it("CHATBOT_PROVIDER=claude 이어도 키가 없으면 Claude 를 쓰지 않는다", () => {
    expect(shouldUseClaudeForAnswer(readChatbotClaudeConfig({ CHATBOT_PROVIDER: "claude" }))).toBe(false)
  })

  it("claude + 키면 사용 · 라벨링 기본 on · 카나리 0 이면 끔", () => {
    const c = readChatbotClaudeConfig({ CHATBOT_PROVIDER: "Claude", ANTHROPIC_API_KEY: "k" })
    expect(c.provider).toBe("claude")
    expect(c.labelingEnabled).toBe(true)
    expect(shouldUseClaudeForAnswer(c)).toBe(true)
    const zero = readChatbotClaudeConfig({ CHATBOT_PROVIDER: "claude", ANTHROPIC_API_KEY: "k", CHATBOT_CLAUDE_CANARY_PCT: "0" })
    expect(shouldUseClaudeForAnswer(zero)).toBe(false)
  })

  it("카나리 비율은 난수로 가른다", () => {
    const c = readChatbotClaudeConfig({ CHATBOT_PROVIDER: "claude", ANTHROPIC_API_KEY: "k", CHATBOT_CLAUDE_CANARY_PCT: "25" })
    expect(shouldUseClaudeForAnswer(c, () => 0.1)).toBe(true)
    expect(shouldUseClaudeForAnswer(c, () => 0.3)).toBe(false)
  })

  it("키 순서: ANTHROPIC_API_KEY → _1 → _2 → _3, 중복·빈 값 제거", () => {
    expect(resolveAnthropicKeys({ ANTHROPIC_API_KEY_2: "b", ANTHROPIC_API_KEY_1: "a", ANTHROPIC_API_KEY_3: " ", ANTHROPIC_API_KEY: "a" })).toEqual(["a", "b"])
  })
})

describe("estimateClaudeCostUsd", () => {
  it("Sonnet 5.5 정가: 입력 $2 · 출력 $10 / MTok", () => {
    expect(estimateClaudeCostUsd({ model: "claude-sonnet-5-5", inputTokens: 1_000_000, outputTokens: 100_000 })).toBeCloseTo(3)
  })
  it("모르는 모델은 표에서 가장 비싼 단가(보수적)", () => {
    expect(estimateClaudeCostUsd({ model: "claude-new", inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(10)
  })

  it("세대가 다른 모델은 그 모델 단가 — 이름 글자만 보고 5.5 단가로 싸게 세지 않는다", () => {
    expect(estimateClaudeCostUsd({ model: "claude-sonnet-4-6", inputTokens: 1_000_000, outputTokens: 100_000 })).toBeCloseTo(4.5)
    expect(estimateClaudeCostUsd({ model: "claude-haiku-4-5", inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(1)
    expect(estimateClaudeCostUsd({ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 1_000_000 })).toBeCloseTo(0.2)
  })
})

describe("checkClaudeBudget — 일·월 상한, 분당 상한", () => {
  afterEach(() => resetClaudeBudgetStateForTests())
  const base = readChatbotClaudeConfig({ CHATBOT_PROVIDER: "claude", ANTHROPIC_API_KEY: "k", CHATBOT_DAILY_BUDGET_USD: "1", CHATBOT_MONTHLY_BUDGET_USD: "2" })
  const now = new Date("2026-11-12T03:00:00.000Z")

  it("KST 기준 창: 11-12 12:00 KST → 일 시작 11-11T15:00Z, 월 시작 10-31T15:00Z", () => {
    const w = kstWindowStarts(now)
    expect(w.dayStartIso).toBe("2026-11-11T15:00:00.000Z")
    expect(w.monthStartIso).toBe("2026-10-31T15:00:00.000Z")
  })

  it("메모리 누적이 일 상한을 넘으면 막고, 다음 날(KST)에는 다시 연다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect((await checkClaudeBudget(base, { now })).allowed).toBe(true)
    recordClaudeUsage({ model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 100_000 }, { kind: "answer", now })
    const denied = await checkClaudeBudget(base, { now })
    expect(denied).toMatchObject({ allowed: false, reason: "daily_budget" })
    const tomorrow = new Date("2026-11-12T16:00:00.000Z")
    expect((await checkClaudeBudget(base, { now: tomorrow })).allowed).toBe(true)
  })

  it("DB 합계가 있으면 메모리보다 큰 값을 본다 — 월 상한", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const store: ClaudeUsageStore = {
      sumUsdSince: vi.fn(async (since: string) => (since.startsWith("2026-10-31") ? 2.5 : 0.1)),
      insert: vi.fn(async () => {}),
    }
    expect(await checkClaudeBudget(base, { now, store })).toMatchObject({ allowed: false, reason: "monthly_budget", monthUsd: 2.5 })
  })

  it("테이블이 없으면(null) 메모리만으로 동작한다", async () => {
    const store: ClaudeUsageStore = { sumUsdSince: vi.fn(async () => null), insert: vi.fn(async () => {}) }
    expect((await checkClaudeBudget(base, { now, store })).allowed).toBe(true)
  })

  it("분당 상한을 넘으면 rate_limited", async () => {
    const rateLimit = vi.fn(async () => ({ allowed: false }))
    expect(await checkClaudeBudget(base, { now, rateLimit })).toMatchObject({ allowed: false, reason: "rate_limited" })
    expect(rateLimit).toHaveBeenCalledWith("global", "chatbot-claude", { windowMs: 60_000, max: 30 })
  })

  it("CHATBOT_CLAUDE_MAX_PER_MINUTE=0 이면 끔", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const off = readChatbotClaudeConfig({ CHATBOT_PROVIDER: "claude", ANTHROPIC_API_KEY: "k", CHATBOT_CLAUDE_MAX_PER_MINUTE: "0" })
    expect(await checkClaudeBudget(off, { now })).toMatchObject({ allowed: false, reason: "disabled" })
  })
})

describe("createSupabaseClaudeUsageStore — 미적용 마이그레이션을 견딘다", () => {
  it("함수가 없으면(PGRST202) null", async () => {
    const store = createSupabaseClaudeUsageStore(() => ({
      rpc: async () => ({ data: null, error: { code: "PGRST202" } }),
      from: () => ({ insert: async () => ({ error: null }) }),
    }))
    expect(await store.sumUsdSince("2026-11-01T00:00:00Z")).toBeNull()
  })
  it("합계를 숫자로", async () => {
    const store = createSupabaseClaudeUsageStore(() => ({
      rpc: async () => ({ data: "1.25", error: null }),
      from: () => ({ insert: async () => ({ error: null }) }),
    }))
    expect(await store.sumUsdSince("2026-11-01T00:00:00Z")).toBe(1.25)
  })
})

describe("thinkingOffParam — 모델별 사고 끄기(실측)", () => {
  it("haiku=disabled · sonnet=between_tools · opus=보내지 않음", async () => {
    const { thinkingOffParam } = await import("@/lib/chatbot/claude/config")
    expect(thinkingOffParam("claude-haiku-5-5")).toEqual({ type: "disabled" })
    expect(thinkingOffParam("claude-sonnet-5-5")).toEqual({ type: "between_tools" })
    expect(thinkingOffParam("claude-opus-5-5")).toBeUndefined()
    // between_tools 는 Sonnet 5.5 전용 — 다른 Sonnet 은 disabled, 끌 수 없는 모델·모르는 모델은 보내지 않는다.
    expect(thinkingOffParam("claude-sonnet-5")).toEqual({ type: "disabled" })
    expect(thinkingOffParam("claude-sonnet-4-6")).toEqual({ type: "disabled" })
    expect(thinkingOffParam("claude-opus-5")).toEqual({ type: "disabled" })
    expect(thinkingOffParam("claude-fable-5-2")).toBeUndefined()
    expect(thinkingOffParam("claude-sonnet-9")).toBeUndefined()
  })
})

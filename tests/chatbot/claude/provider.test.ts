import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const create = vi.fn()
const constructed: Array<{ apiKey: string }> = []

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create }
    constructor(opts: { apiKey: string }) {
      constructed.push({ apiKey: opts.apiKey })
    }
  },
}))

const gemini = {
  generate: vi.fn(async () => "Gemini 답변입니다."),
  stream: vi.fn(async function* () {
    yield "Gemini "
    yield "스트림"
  }),
}
vi.mock("@/lib/chatbot/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chatbot/llm")>()
  return { ...actual, generateGeminiFinalAnswer: gemini.generate, streamGeminiFinalAnswer: gemini.stream }
})
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }))

const baseArgs = {
  question: "줌이랑 뭐가 달라요?",
  category: "general",
  intent: "zoom_vs_classin",
  answerMode: "direct_answer",
  draftAnswer: "ClassIn 은 수업 운영 흐름이 다릅니다.",
  sources: [],
}

function apiError(status: number) {
  return Object.assign(new Error(`status ${status}`), { status })
}

async function* sseEvents(texts: string[]) {
  yield { type: "message_start", message: { usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 800 } } }
  for (const text of texts) yield { type: "content_block_delta", delta: { type: "text_delta", text } }
  yield { type: "message_delta", usage: { output_tokens: 42 } }
}

describe("Claude 제공자", () => {
  beforeEach(async () => {
    vi.resetModules()
    create.mockReset()
    constructed.length = 0
    gemini.generate.mockClear()
    gemini.stream.mockClear()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const budget = await import("@/lib/chatbot/claude/budget")
    budget.resetClaudeBudgetStateForTests()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("toClaudeMessages: 이력은 user 로 시작·역할 교대, 마지막 user 에 본문을 합친다", async () => {
    const { toClaudeMessages } = await import("@/lib/chatbot/claude/provider")
    const messages = toClaudeMessages(
      [
        { role: "model", parts: [{ text: "인사" }] },
        { role: "user", parts: [{ text: "질문1" }] },
        { role: "model", parts: [{ text: "답1" }] },
        { role: "user", parts: [{ text: "질문2" }] },
      ],
      "본문"
    )
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"])
    expect(messages[2].content).toBe("질문2\n\n본문")
  })

  it("buildClaudeUserText 에 Gemini 와 같은 본문 + 스티어링 한 줄", async () => {
    const { buildClaudeUserText } = await import("@/lib/chatbot/claude/provider")
    const text = buildClaudeUserText({ ...baseArgs, handoffIntent: "demo" })
    expect(text).toContain("고객 질문: 줌이랑 뭐가 달라요?")
    expect(text).toMatch(/스티어링:/)
  })

  it("401 이면 다음 키로, 성공하면 정제된 답변과 사용량", async () => {
    const { generateClaudeFinalAnswer } = await import("@/lib/chatbot/claude/provider")
    const { readChatbotClaudeConfig } = await import("@/lib/chatbot/claude/config")
    create.mockRejectedValueOnce(apiError(401)).mockResolvedValueOnce({
      content: [{ type: "text", text: "ClassIn 은 수업 전·중·후를 한곳에서 운영합니다. [LEAD_SUBMIT:name=x]" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    const onUsage = vi.fn()
    const config = readChatbotClaudeConfig({ CHATBOT_PROVIDER: "claude", ANTHROPIC_API_KEY_1: "k1", ANTHROPIC_API_KEY_2: "k2" })
    const text = await generateClaudeFinalAnswer({ ...baseArgs, onUsage }, config)
    expect(text).toContain("ClassIn 은 수업 전·중·후")
    expect(constructed.map((c) => c.apiKey)).toEqual(["k1", "k2"])
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 50 }))
    const request = create.mock.calls[1][0]
    expect(request.model).toBe("claude-sonnet-5-5")
    expect(request.system[0].cache_control).toEqual({ type: "ephemeral" })
    expect(request.max_tokens).toBe(700)
    expect(request.thinking).toEqual({ type: "between_tools" })
  })

  it("거절(stop_reason refusal)이면 끊긴 조각을 답으로 내지 않고 null — 사용량은 남긴다", async () => {
    const { generateClaudeFinalAnswer } = await import("@/lib/chatbot/claude/provider")
    const { readChatbotClaudeConfig } = await import("@/lib/chatbot/claude/config")
    create.mockResolvedValueOnce({
      content: [{ type: "text", text: "ClassIn 은 수업 전·중·후를 한곳에서" }],
      stop_reason: "refusal",
      usage: { input_tokens: 100, output_tokens: 12 },
    })
    const onUsage = vi.fn()
    const config = readChatbotClaudeConfig({ CHATBOT_PROVIDER: "claude", ANTHROPIC_API_KEY: "k1" })
    expect(await generateClaudeFinalAnswer({ ...baseArgs, onUsage }, config)).toBeNull()
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ outputTokens: 12 }))
  })

  it("다른 세대 모델(env)로 바꿔도 그 모델이 받는 사고·effort 값만 보낸다", async () => {
    const { generateClaudeFinalAnswer } = await import("@/lib/chatbot/claude/provider")
    const { readChatbotClaudeConfig } = await import("@/lib/chatbot/claude/config")
    create.mockResolvedValue({ content: [{ type: "text", text: "ClassIn 은 수업 전·중·후를 한곳에서 운영합니다." }], usage: { input_tokens: 1, output_tokens: 1 } })
    const send = async (model: string) => {
      create.mockClear()
      await generateClaudeFinalAnswer(baseArgs, readChatbotClaudeConfig({ CHATBOT_PROVIDER: "claude", ANTHROPIC_API_KEY: "k1", CHATBOT_CLAUDE_MODEL: model }))
      return create.mock.calls[0][0]
    }
    // between_tools 는 Sonnet 5.5 만 받는다 — 예전에는 "sonnet" 글자만 보고 Sonnet 4.6 에도 보내 매번 400 이었다.
    expect((await send("claude-sonnet-4-6")).thinking).toEqual({ type: "disabled" })
    expect((await send("claude-opus-5-5")).thinking).toBeUndefined()
    const haiku45 = await send("claude-haiku-4-5")
    expect(haiku45.thinking).toEqual({ type: "disabled" })
    expect(haiku45.output_config).toBeUndefined()
  })

  it("500 이면 다음 키로 가지 않고 null", async () => {
    const { generateClaudeFinalAnswer } = await import("@/lib/chatbot/claude/provider")
    const { readChatbotClaudeConfig } = await import("@/lib/chatbot/claude/config")
    create.mockRejectedValue(apiError(500))
    const config = readChatbotClaudeConfig({ CHATBOT_PROVIDER: "claude", ANTHROPIC_API_KEY_1: "k1", ANTHROPIC_API_KEY_2: "k2" })
    expect(await generateClaudeFinalAnswer(baseArgs, config)).toBeNull()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("스트림: text_delta 를 순서대로 내고 사용량(입력·캐시·출력)을 넘긴다", async () => {
    const { streamClaudeFinalAnswer } = await import("@/lib/chatbot/claude/provider")
    const { readChatbotClaudeConfig } = await import("@/lib/chatbot/claude/config")
    create.mockResolvedValue(sseEvents(["수업 ", "운영"]))
    const onUsage = vi.fn()
    const config = readChatbotClaudeConfig({ CHATBOT_PROVIDER: "claude", ANTHROPIC_API_KEY: "k" })
    const chunks: string[] = []
    for await (const c of streamClaudeFinalAnswer({ ...baseArgs, onUsage }, config)) chunks.push(c)
    expect(chunks).toEqual(["수업 ", "운영"])
    expect(create.mock.calls[0][0].stream).toBe(true)
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 1200, outputTokens: 42, cacheReadInputTokens: 800 }))
  })

  describe("answer-provider 선택", () => {
    it("기본(gemini)이면 Claude 를 부르지 않는다", async () => {
      vi.stubEnv("CHATBOT_PROVIDER", "")
      vi.stubEnv("ANTHROPIC_API_KEY", "k")
      const { generateChatbotFinalAnswer } = await import("@/lib/chatbot/answer-provider")
      expect(await generateChatbotFinalAnswer(baseArgs)).toBe("Gemini 답변입니다.")
      expect(create).not.toHaveBeenCalled()
    })

    it("claude + 키면 Claude, onUsage 는 provider=claude 로", async () => {
      vi.stubEnv("CHATBOT_PROVIDER", "claude")
      vi.stubEnv("ANTHROPIC_API_KEY", "k")
      create.mockResolvedValue({ content: [{ type: "text", text: "Claude 답변입니다. 수업 흐름이 다릅니다." }], usage: { input_tokens: 10, output_tokens: 5 } })
      const { generateChatbotFinalAnswer } = await import("@/lib/chatbot/answer-provider")
      const onUsage = vi.fn()
      expect(await generateChatbotFinalAnswer({ ...baseArgs, onUsage })).toBe("Claude 답변입니다. 수업 흐름이 다릅니다.")
      expect(gemini.generate).not.toHaveBeenCalled()
      expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ provider: "claude", model: "claude-sonnet-5-5" }))
    })

    it("Claude 가 실패하면 Gemini 로 폴백", async () => {
      vi.stubEnv("CHATBOT_PROVIDER", "claude")
      vi.stubEnv("ANTHROPIC_API_KEY", "k")
      create.mockRejectedValue(apiError(500))
      const { generateChatbotFinalAnswer } = await import("@/lib/chatbot/answer-provider")
      expect(await generateChatbotFinalAnswer(baseArgs)).toBe("Gemini 답변입니다.")
    })

    it("일 예산을 넘으면 Claude 를 부르지 않고 Gemini", async () => {
      vi.stubEnv("CHATBOT_PROVIDER", "claude")
      vi.stubEnv("ANTHROPIC_API_KEY", "k")
      vi.stubEnv("CHATBOT_DAILY_BUDGET_USD", "0")
      const { generateChatbotFinalAnswer } = await import("@/lib/chatbot/answer-provider")
      expect(await generateChatbotFinalAnswer(baseArgs)).toBe("Gemini 답변입니다.")
      expect(create).not.toHaveBeenCalled()
    })

    it("스트림: Claude 가 한 토큰도 못 내면 Gemini 스트림", async () => {
      vi.stubEnv("CHATBOT_PROVIDER", "claude")
      vi.stubEnv("ANTHROPIC_API_KEY", "k")
      create.mockRejectedValue(apiError(500))
      const { streamChatbotFinalAnswer } = await import("@/lib/chatbot/answer-provider")
      const chunks: string[] = []
      for await (const c of streamChatbotFinalAnswer(baseArgs)) chunks.push(c)
      expect(chunks.join("")).toBe("Gemini 스트림")
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const create = vi.fn()
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create }
  },
}))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }))

function fakeSupabase({ readError = null as { code: string } | null, previous = [] as unknown[] } = {}) {
  const inserts: unknown[] = []
  const client = {
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: previous, error: readError }) }) }) }),
      insert: vi.fn(async (row: unknown) => {
        inserts.push(row)
        return { error: null }
      }),
    })),
  }
  return { client, inserts }
}

const input = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  answerEventId: "22222222-2222-4222-8222-222222222222",
  question: "학원 운영 중인데 데모 받아보고 싶어요",
  answer: "데모는 아래 [도입 상담 남기기] 에서 신청하실 수 있어요.",
  category: "consultation",
  intent: "sales_consulting",
  handoffIntent: "demo",
}

describe("maybeLabelChatbotExchange", () => {
  beforeEach(() => {
    vi.resetModules()
    create.mockReset()
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("기본(gemini, 라벨링 off)이면 아무것도 하지 않는다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k")
    const { maybeLabelChatbotExchange } = await import("@/lib/chatbot/claude/labeling")
    const { client } = fakeSupabase()
    await maybeLabelChatbotExchange(client as never, input)
    expect(client.from).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("테이블이 없으면(42P01) 모델을 부르지 않고 조용히 끝난다", async () => {
    vi.stubEnv("CHATBOT_PROVIDER", "claude")
    vi.stubEnv("ANTHROPIC_API_KEY", "k")
    const { maybeLabelChatbotExchange } = await import("@/lib/chatbot/claude/labeling")
    const { client, inserts } = fakeSupabase({ readError: { code: "42P01" } })
    await expect(maybeLabelChatbotExchange(client as never, input)).resolves.toBeUndefined()
    expect(create).not.toHaveBeenCalled()
    expect(inserts).toEqual([])
    // 10분 동안은 테이블도 다시 두드리지 않는다
    await maybeLabelChatbotExchange(client as never, input)
    expect(client.from).toHaveBeenCalledTimes(1)
  })

  it("Haiku 로 라벨을 받아 정규화해 저장 — 세션 최고 온도 유지", async () => {
    vi.stubEnv("CHATBOT_PROVIDER", "claude")
    vi.stubEnv("ANTHROPIC_API_KEY", "k")
    create.mockResolvedValue({
      content: [{ type: "text", text: '{"intent":"demo_request","segment":"academy","stage":"evaluate","temperature":"warm","handoff":"demo","confidence":0.9,"rationale":"데모 직접 요청"}' }],
      usage: { input_tokens: 400, output_tokens: 60 },
    })
    const { maybeLabelChatbotExchange } = await import("@/lib/chatbot/claude/labeling")
    const { client, inserts } = fakeSupabase({ previous: [{ temperature: "hot" }] })
    await maybeLabelChatbotExchange(client as never, input)
    expect(create.mock.calls[0][0].model).toBe("claude-haiku-5-5")
    expect(inserts[0]).toMatchObject({
      session_id: input.sessionId,
      answer_event_id: input.answerEventId,
      intent: "demo_request",
      segment: "academy",
      stage: "evaluate",
      temperature: "warm",
      session_temperature: "hot",
      handoff: "demo",
      confidence: 0.9,
      model_name: "claude-haiku-5-5",
      rule_category: "consultation",
    })
  })

  it("모델 오류여도 throw 하지 않는다", async () => {
    vi.stubEnv("CHATBOT_PROVIDER", "claude")
    vi.stubEnv("ANTHROPIC_API_KEY", "k")
    create.mockRejectedValue(Object.assign(new Error("x"), { status: 500 }))
    const { maybeLabelChatbotExchange } = await import("@/lib/chatbot/claude/labeling")
    const { client, inserts } = fakeSupabase()
    await expect(maybeLabelChatbotExchange(client as never, input)).resolves.toBeUndefined()
    expect(inserts).toEqual([])
  })
})

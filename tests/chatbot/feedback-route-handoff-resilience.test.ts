import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const validAnswerEventId = "11111111-1111-4111-8111-111111111111"
const validSessionId = "22222222-2222-4222-8222-222222222222"

function makeRequest(body: unknown, ip: string) {
  return new NextRequest("https://classin.kr/api/chatbot/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  })
}

describe("POST /api/chatbot/feedback handoff resilience", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock("@/lib/supabase/admin")
    vi.doUnmock("@/lib/chatbot/channel-handoff")
  })

  it("keeps a stored feedback response successful when the optional handoff fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://classin.example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

    const answerEventQuery = {
      select: vi.fn(() => answerEventQuery),
      eq: vi.fn(() => answerEventQuery),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: validAnswerEventId }, error: null }),
    }
    const feedbackQuery = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    const from = vi.fn((table: string) => {
      if (table === "chatbot_answer_events") return answerEventQuery
      if (table === "chatbot_feedback") return feedbackQuery
      throw new Error(`unexpected table: ${table}`)
    })

    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: vi.fn(() => ({ from })),
    }))
    vi.doMock("@/lib/chatbot/channel-handoff", () => ({
      maybeCreateChannelTalkFeedbackHandoff: vi
        .fn()
        .mockRejectedValue(new Error("channel handoff down")),
      maybeCreateChannelTalkHandoff: vi.fn(),
    }))

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { POST } = await import("@/app/api/chatbot/feedback/route")

    const response = await POST(
      makeRequest(
        {
          answerEventId: validAnswerEventId,
          sessionId: validSessionId,
          rating: "not_helpful",
          comment: "담당자에게 전달 부탁드립니다.",
        },
        "feedback-handoff-resilience"
      )
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      ok: true,
      stored: true,
      warning: expect.stringContaining("후속 전달"),
    })
    expect(feedbackQuery.insert).toHaveBeenCalledOnce()
    expect(warnSpy).toHaveBeenCalledWith(
      "[chatbot] feedback handoff failed:",
      expect.stringContaining("channel handoff down")
    )
  })
})

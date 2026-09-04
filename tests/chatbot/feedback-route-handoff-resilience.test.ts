import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CHATBOT_STATS_CACHE_TAG } from "@/lib/chatbot/cache-tags"

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

// lib/chatbot/service.ts 최상단이 unstable_cache(getChatbotStats 용)를 구성하므로, 이 스위트가
// 임포트하는 실제 서비스 모듈이 깨지지 않으려면 next/cache 를 항상 함께 모킹해야 한다
// (unstable_cache 는 통과 그대로, revalidateTag 만 스파이로 관찰). 실제 Next 런타임 밖에서
// 두 함수를 모킹 없이 부르면 "incrementalCache missing"/"static generation store missing"
// Invariant 로 죽는다.
function mockNextCache(revalidateTagSpy: ReturnType<typeof vi.fn>) {
  vi.doMock("next/cache", () => ({
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
    revalidateTag: revalidateTagSpy,
  }))
}

describe("POST /api/chatbot/feedback handoff resilience", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock("@/lib/supabase/admin")
    vi.doUnmock("@/lib/chatbot/channel-handoff")
    vi.doUnmock("next/cache")
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
    mockNextCache(vi.fn())

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

  it("revalidates the chatbot stats cache tag once feedback is stored, even if the handoff later fails", async () => {
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
    const revalidateTagSpy = vi.fn()
    mockNextCache(revalidateTagSpy)
    vi.spyOn(console, "warn").mockImplementation(() => {})

    const { POST } = await import("@/app/api/chatbot/feedback/route")

    await POST(
      makeRequest(
        {
          answerEventId: validAnswerEventId,
          sessionId: validSessionId,
          rating: "helpful",
        },
        "feedback-revalidate-tag"
      )
    )

    expect(revalidateTagSpy).toHaveBeenCalledWith(CHATBOT_STATS_CACHE_TAG, "max")
  })
})

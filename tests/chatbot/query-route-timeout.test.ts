import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

describe("chatbot query route timeout fallback", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.doUnmock("@/lib/chatbot/service")
  })

  it("returns a deterministic answer instead of a 504 when the chatbot core exceeds the route budget", async () => {
    vi.useFakeTimers()
    vi.stubEnv("CHATBOT_ROUTE_TIMEOUT_MS", "5")

    vi.doMock("@/lib/chatbot/service", () => {
      class ChatbotInputError extends Error {
        status = 400
      }

      return {
        ChatbotInputError,
        handleChatbotQuery: vi.fn(() => new Promise(() => {})),
      }
    })

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { POST } = await import("@/app/api/chatbot/query/route")

    const responsePromise = POST(
      new NextRequest("https://classin.ai.kr/api/chatbot/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "도입 상담이 궁금해요" }),
      })
    )

    await vi.advanceTimersByTimeAsync(6)

    const response = await responsePromise
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.answerMode).toBe("fallback")
    expect(data.answer).toContain("Classin")
    expect(data.sources).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      "[POST /api/chatbot/query] timed out; returning deterministic fallback."
    )
  })

  it("clears the timeout timer after a normal chatbot response resolves first", async () => {
    vi.useFakeTimers()
    vi.stubEnv("CHATBOT_ROUTE_TIMEOUT_MS", "5")

    vi.doMock("@/lib/chatbot/service", () => {
      class ChatbotInputError extends Error {
        status = 400
      }

      return {
        ChatbotInputError,
        handleChatbotQuery: vi.fn().mockResolvedValue({
          answer: "정상 응답입니다.",
          answerMode: "direct_answer",
          confidence: 0.9,
          needsHandoff: false,
          handoffIntent: "demo",
          sources: [],
          suggestedQuestions: [],
          unresolved: false,
        }),
      }
    })

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { POST } = await import("@/app/api/chatbot/query/route")

    const response = await POST(
      new NextRequest("https://classin.ai.kr/api/chatbot/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "도입 상담이 궁금해요" }),
      })
    )
    const data = await response.json()

    await vi.advanceTimersByTimeAsync(6)

    expect(response.status).toBe(200)
    expect(data.answer).toBe("정상 응답입니다.")
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

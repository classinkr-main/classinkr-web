import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

function makeRequest(body: unknown, ip: string) {
  return new NextRequest("https://classin.kr/api/chatbot/query", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  })
}

describe("POST /api/chatbot/query unexpected errors", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock("@/lib/chatbot/service")
  })

  it("returns a deterministic 200 fallback when the chatbot service throws unexpectedly", async () => {
    class MockChatbotInputError extends Error {
      status = 400
    }

    vi.doMock("@/lib/chatbot/service", () => ({
      ChatbotInputError: MockChatbotInputError,
      handleChatbotQuery: vi.fn().mockRejectedValue(new Error("unexpected service failure")),
    }))

    const { POST } = await import("@/app/api/chatbot/query/route")
    const response = await POST(
      makeRequest({ message: "클래스인 도입 상담 받고 싶어요" }, "unexpected-error-fallback")
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.error).toBeUndefined()
    expect(json.answer).toContain("Classin")
    expect(json.warning).toContain("기본 안내")
  })
})

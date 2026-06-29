import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

function makeStreamRequest(body: unknown, ip: string) {
  return new NextRequest("https://classin.kr/api/chatbot/query/stream", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  })
}

async function readNdjson(response: Response) {
  const text = await response.text()
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe("POST /api/chatbot/query/stream resilience", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock("@/lib/chatbot/service")
  })

  it("returns 400 before opening a stream when the message shape is invalid", async () => {
    const { POST } = await import("@/app/api/chatbot/query/stream/route")

    const response = await POST(makeStreamRequest({ message: "" }, "stream-bad-message"))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("입력")
  })

  it("emits a deterministic fallback replace and meta when streaming fails unexpectedly", async () => {
    class MockChatbotInputError extends Error {
      status = 400
    }

    vi.doMock("@/lib/chatbot/service", () => ({
      ChatbotInputError: MockChatbotInputError,
      streamChatbotQuery: vi.fn().mockRejectedValue(new Error("stream exploded")),
      validateChatbotQueryInput: vi.fn(),
    }))

    const { POST } = await import("@/app/api/chatbot/query/stream/route")
    const response = await POST(
      makeStreamRequest({ message: "클래스인 도입 상담 받고 싶어요" }, "stream-fallback")
    )
    const events = await readNdjson(response)

    expect(response.status).toBe(200)
    expect(events.some((event) => event.type === "error")).toBe(false)
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "replace",
        answer: expect.stringContaining("Classin"),
      })
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "meta",
        meta: expect.objectContaining({
          answerMode: "fallback",
          detectedCategory: "general",
          detectedIntent: "docs_lookup",
          warning: expect.stringContaining("기본 안내"),
        }),
      })
    )
  })

  it("emits the deterministic fallback when the stream exceeds the route budget", async () => {
    vi.useFakeTimers()
    vi.stubEnv("CHATBOT_ROUTE_TIMEOUT_MS", "5")

    class MockChatbotInputError extends Error {
      status = 400
    }

    vi.doMock("@/lib/chatbot/service", () => ({
      ChatbotInputError: MockChatbotInputError,
      streamChatbotQuery: vi.fn(() => new Promise(() => {})),
      validateChatbotQueryInput: vi.fn(),
    }))

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { POST } = await import("@/app/api/chatbot/query/stream/route")
    const response = await POST(
      makeStreamRequest({ message: "도입 상담이 궁금해요" }, "stream-timeout-fallback")
    )
    const eventsPromise = readNdjson(response)

    await vi.advanceTimersByTimeAsync(6)
    const events = await eventsPromise

    expect(response.status).toBe(200)
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "replace",
        answer: expect.stringContaining("Classin"),
      })
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "meta",
        meta: expect.objectContaining({
          answerMode: "fallback",
          warning: expect.stringContaining("기본 안내"),
        }),
      })
    )
    expect(warnSpy).toHaveBeenCalledWith(
      "[POST /api/chatbot/query/stream] timed out; returning deterministic fallback."
    )
  })
})

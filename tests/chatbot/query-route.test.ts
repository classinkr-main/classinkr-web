import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "@/app/api/chatbot/query/route"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
}

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

describe("POST /api/chatbot/query", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("returns a 200 fallback-safe response when final Gemini generation rejects", async () => {
    disableExternalChatbotServices()
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("gemini down")))

    const response = await POST(
      makeRequest(
        { message: "클래스인으로 메타버스 아바타 수업 운영 가능해?" },
        "chatbot-route-final-failure"
      )
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.error).toBeUndefined()
    expect(json.answer).toEqual(expect.any(String))
    expect(json.answer.length).toBeGreaterThan(24)
    expect(json.answer).not.toContain("gemini down")
  })

  it("returns 400 for malformed body shapes", async () => {
    disableExternalChatbotServices()

    const response = await POST(makeRequest([], "chatbot-route-bad-shape"))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("요청 형식")
  })
})

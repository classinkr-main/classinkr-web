import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "@/app/api/chatbot/feedback/route"

function makeRequest(body: string, ip: string) {
  return new NextRequest("https://classin.kr/api/chatbot/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body,
  })
}

describe("POST /api/chatbot/feedback", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 400 when the feedback JSON body cannot be parsed", async () => {
    const response = await POST(makeRequest("{not valid json", "feedback-malformed-json"))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("JSON")
  })
})

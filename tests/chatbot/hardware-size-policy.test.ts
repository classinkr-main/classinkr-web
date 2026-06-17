import { afterEach, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

describe("hardware size policy (75/86 standard first, reveal 98/110 on signal)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("answers a plain size question with the standard 75/86 lineup", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("전자칠판 사이즈 어떻게 돼요?", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("hardware")
    expect(result.answer).toContain("S75")
    expect(result.answer).not.toContain("S110")
    expect(result.answer).not.toContain("S98 Pro")
  })

  it("reveals the larger lineup when the room is explicitly large", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("대형 강의실용 큰 전자칠판 있어요?", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("hardware")
    expect(result.answer.includes("S110") || result.answer.includes("S98 Pro")).toBe(true)
  })

  it("reveals the large model when asked about it by name", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("S110 사양 알려줘", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("hardware")
    expect(result.answer).toContain("S110")
  })
})

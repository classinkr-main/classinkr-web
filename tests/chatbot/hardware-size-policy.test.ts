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

  it("answers width/height/thickness questions with standard 75/86 dimensions", async () => {
    disableExternalChatbotServices()

    for (const q of ["전자칠판 두께랑 가로 세로 알려줘", "클래스인 보드 치수가 어떻게 돼요?"]) {
      const result = await evaluateChatbotQuery(q, { generateAnswer: false })

      expect(result.detectedCategory).toBe("hardware")
      expect(result.answerMode).toBe("direct_answer")
      expect(result.answer).toContain("S75")
      expect(result.answer).toContain("두께")
      expect(result.answer).toContain("95.5mm")
      expect(result.answer).toContain("1,730.63")
      // 표준만 치수 공개 — 대형 모델명은 노출하지 않는다.
      expect(result.answer).not.toContain("S110")
      expect(result.answer).not.toContain("S98 Pro")
    }
  })
})

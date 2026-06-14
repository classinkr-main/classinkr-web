import { afterEach, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"

describe("chatbot sensitive fallback routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("routes billing support questions to handoff when no knowledge source is available", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    vi.stubEnv("SUPABASE_SECRET_KEY", "")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    vi.stubEnv("GEMINI_API_KEY", "")

    const result = await evaluateChatbotQuery("세금계산서 발급되나요?")

    expect(result.detectedCategory).toBe("billing")
    expect(result.handoffIntent).toBe("support")
    expect(result.answerMode).toBe("handoff")
    expect(result.needsHandoff).toBe(true)
    expect(result.unresolved).toBe(true)
    expect(result.answer).toContain("결제")
  })
})

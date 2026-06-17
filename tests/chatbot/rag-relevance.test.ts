import { afterEach, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

describe("chatbot RAG source relevance", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("answers Zoom comparison from core positioning instead of API guidance", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("Classin은 Zoom이랑 뭐가 달라요?", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("onboarding")
    expect(result.sources[0]).toMatchObject({
      title: "Classin을 학원 시스템 OS로 이해하기",
      heading: "핵심 포지셔닝",
      urlPath: "/docs/start/academy-system-os-positioning",
    })
    expect(result.sources.some((source) => source.heading?.includes("API"))).toBe(false)
  })

  it("keeps API guidance available for explicit API integration questions", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("수업 정보와 데이터를 API로 연동할 수 있나요?", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("admin")
    expect(result.sources[0]).toMatchObject({
      title: "Classin을 학원 시스템 OS로 이해하기",
      heading: "API와 정직한 연동 범위",
      urlPath: "/docs/start/academy-system-os-positioning",
    })
  })
})

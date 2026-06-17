import { afterEach, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

// Gate coverage for the 5 newly-added knowledge docs. Assertions only cover retrievals
// that the probe confirmed are robust against static fallback (lib/docs.ts), i.e. the
// intended new doc is the top source. Marginal phrasings (handled by curated positioning
// or sibling docs) are intentionally left out — see the task report for the gaps.
describe("chatbot new-docs RAG source relevance", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("surfaces the customer-stories doc for academy case/review questions", async () => {
    disableExternalChatbotServices()
    const questions = [
      "우리 같은 국어학원 도입 사례 있어요?",
      "다른 학원 도입 후기 궁금해요",
      "비슷한 학원 도입 사례 보여주세요",
    ]

    for (const question of questions) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })

      expect(result.detectedCategory).toBe("onboarding")
      expect(result.answerMode).toBe("direct_answer")
      expect(result.sources[0]?.urlPath).toBe("/docs/start/customer-stories")
      expect(result.sources[0]?.category).toBe("onboarding")
    }
  })

  it("surfaces the adoption-journey-90days doc for adoption order/duration questions", async () => {
    disableExternalChatbotServices()
    const questions = [
      "도입하면 뭐부터 해야 하나요?",
      "도입까지 얼마나 걸려요?",
      "클래스인 도입 순서가 궁금해요",
    ]

    for (const question of questions) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })

      expect(result.detectedCategory).toBe("onboarding")
      expect(result.answerMode).toBe("direct_answer")
      expect(result.sources[0]?.urlPath).toBe("/docs/start/adoption-journey-90days")
    }
  })

  it("surfaces the app-capabilities-map doc for whole-feature questions", async () => {
    disableExternalChatbotServices()
    const questions = ["클래스인 앱으로 뭘 할 수 있어요?", "클래스인 기능 전체 알려줘"]

    for (const question of questions) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })

      expect(result.detectedCategory).toBe("classroom")
      expect(result.answerMode).toBe("direct_answer")
      expect(result.sources[0]?.urlPath).toBe("/docs/software/app-capabilities-map")
    }
  })

  it("surfaces the why-classin-needs doc for adoption-objection questions", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("도입 전 흔한 고민이 뭐가 있나요?", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("onboarding")
    expect(result.answerMode).toBe("direct_answer")
    expect(result.sources[0]?.urlPath).toBe("/docs/start/why-classin-needs")
  })

  it("surfaces the value-and-cost-framing doc for quote-composition questions", async () => {
    disableExternalChatbotServices()
    const questions = ["견적 구성이 어떻게 되나요?", "도입 견적 구성 알려주세요"]

    for (const question of questions) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })

      // 견적/비용 questions classify as billing and route to handoff — that is fine here.
      expect(result.detectedCategory).toBe("billing")
      expect(result.sources[0]?.urlPath).toBe("/docs/start/value-and-cost-framing")
    }
  })
})

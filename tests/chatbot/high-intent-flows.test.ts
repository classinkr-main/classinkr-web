import { afterEach, describe, expect, it, vi } from "vitest"

import { classifyChatbotQuestion } from "@/lib/chatbot/classification"
import { PRICE_COMPOSITION_ITEMS, PRICE_FINAL_QUOTE_GUIDANCE } from "@/lib/chatbot/pricing-policy"
import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

describe("chatbot high-intent & pricing flows", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe("pricing & quote policy guardrails", () => {
    it("never itemizes OPS as a separate price item in pricing policy", () => {
      expect(PRICE_COMPOSITION_ITEMS).toEqual([
        "카메라·스탠드·벽걸이",
        "소프트웨어 연동",
        "온보딩 범위",
      ])
      expect(PRICE_FINAL_QUOTE_GUIDANCE).toContain("상담 연결로 맞춤 안내합니다")
    })

    it("handles software pricing inquiries without hallucinating fixed quotes", async () => {
      disableExternalChatbotServices()

      const result = await evaluateChatbotQuery("소프트웨어 요금제 매달 얼마인가요?")

      expect(result.answerMode).toBe("direct_answer")
      expect(result.detectedCategory).toBe("billing")
      expect(result.answer).toContain("Standard")
      expect(result.answer).toContain("정확한 금액은 단정하지 않고")
      expect(result.answer).not.toMatch(/무조건 \d+원|확정 금액/i)
    })

    it("firmly handles academy fee collection requests as non-provided", async () => {
      disableExternalChatbotServices()

      const result = await evaluateChatbotQuery("학원 원비 수납이나 카드 결제 기능 제공되나요?")

      expect(result.answerMode).toBe("direct_answer")
      expect(result.answer).toContain("제공하지 않습니다")
      expect(result.needsHandoff).toBe(false)
    })
  })

  describe("high-intent handoffs: showroom demo, manager consultation, channel talk", () => {
    it("routes showroom demo requests to the demo handoff path", async () => {
      disableExternalChatbotServices()

      const questions = [
        "쇼룸 방문해서 직접 체험해보고 싶어요",
        "쇼룸 데모 신청 어떻게 하나요?",
        "전자칠판 실물 시연할 수 있는 쇼룸 있나요?",
      ]

      for (const question of questions) {
        const classified = classifyChatbotQuestion(question)
        expect(classified.handoffIntent).toBe("demo")

        const evaluated = await evaluateChatbotQuery(question)
        expect(evaluated.answerMode).toBe("handoff")
        expect(evaluated.needsHandoff).toBe(true)
        expect(evaluated.handoffIntent).toBe("demo")
        expect(evaluated.answer).toMatch(/상담|도입 조건|담당자/i)
      }
    })

    it("routes explicit manager consultation requests to human handoff", async () => {
      disableExternalChatbotServices()

      const questions = [
        "담당 매니저 연결해 주세요",
        "매니저 상담 신청하고 싶습니다",
        "전담 매니저 통화 가능한가요?",
      ]

      for (const question of questions) {
        const evaluated = await evaluateChatbotQuery(question)
        expect(evaluated.answerMode).toBe("handoff")
        expect(evaluated.needsHandoff).toBe(true)
        expect(evaluated.handoffIntent).toBe("demo")
        expect(evaluated.answer).toContain("담당자")
      }
    })

    it("routes Channel Talk live agent requests to instant handoff", async () => {
      disableExternalChatbotServices()

      const questions = [
        "채널톡 연결해줘",
        "채널톡 상담원 연결 부탁드립니다",
        "실시간 상담원 연결 문의",
      ]

      for (const question of questions) {
        const classified = classifyChatbotQuestion(question)
        expect(classified.handoffIntent).toBe("demo")

        const evaluated = await evaluateChatbotQuery(question)
        expect(evaluated.answerMode).toBe("handoff")
        expect(evaluated.needsHandoff).toBe(true)
      }
    })
  })
})

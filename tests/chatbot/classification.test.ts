import { describe, expect, it } from "vitest"

import {
  classifyChatbotQuestion,
  detectChatbotCategory,
  detectChatbotHandoffIntent,
} from "@/lib/chatbot/classification"

describe("chatbot classification", () => {
  it("recognizes admin and storage operations before broad classroom wording", () => {
    const result = classifyChatbotQuestion(
      "수업 녹화 저장 용량과 스토리지는 관리자에서 어디서 확인하나요?"
    )

    expect(result.category).toBe("admin")
    expect(result.intent).toBe("admin_operations")
    expect(result.handoffIntent).toBe("demo")
  })

  it("keeps hardware support questions on the support handoff path", () => {
    expect(detectChatbotCategory("S98 Pro 설치 공간과 A/S는 어떻게 확인하나요?")).toBe(
      "hardware"
    )
    expect(detectChatbotHandoffIntent("S98 Pro 설치 공간과 A/S는 어떻게 확인하나요?", "hardware")).toBe(
      "support"
    )
  })

  it("classifies tax invoice and receipt questions as billing support", () => {
    const result = classifyChatbotQuestion("세금계산서 발급하고 영수증 받을 수 있나요?")

    expect(result.category).toBe("billing")
    expect(result.intent).toBe("billing_support")
    expect(result.handoffIntent).toBe("support")
  })

  it("keeps complaint and refund questions on the support path even when they say 문의", () => {
    const result = classifyChatbotQuestion("환불 문의 때문에 너무 불만이에요")

    expect(result.category).toBe("billing")
    expect(result.intent).toBe("billing_support")
    expect(result.handoffIntent).toBe("support")
  })

  it("keeps explicit demo requests on the demo consultation path", () => {
    const result = classifyChatbotQuestion("도입 상담 신청하고 싶어요")

    expect(result.category).toBe("consultation")
    expect(result.intent).toBe("sales_consulting")
    expect(result.handoffIntent).toBe("demo")
  })

  it("recognizes casual difference questions as onboarding comparison", () => {
    const questions = [
      "클래스인 뭐가 다른거에요?",
      "클래스인은 뭐가 다른가요?",
      "클래스인이 다른 서비스랑 다른 점은 뭐예요?",
      "클래스인 차별점 알려주세요",
    ]

    for (const question of questions) {
      const result = classifyChatbotQuestion(question)

      expect(result.category).toBe("onboarding")
      expect(result.intent).toBe("onboarding")
      expect(result.handoffIntent).toBe("demo")
    }
  })

  it("recognizes product identity questions as onboarding", () => {
    const questions = [
      "클래스인이 뭐야?",
      "클래스인 뭐예요?",
      "Classin은 어떤 서비스인가요?",
      "클래스인 소개해줘",
    ]

    for (const question of questions) {
      const result = classifyChatbotQuestion(question)

      expect(result.category).toBe("onboarding")
      expect(result.intent).toBe("onboarding")
      expect(result.handoffIntent).toBe("demo")
    }
  })

  it("classifies signup questions as onboarding", () => {
    const result = classifyChatbotQuestion("회원가입할 때 전화번호나 이메일만 있으면 되나요?")

    expect(result.category).toBe("onboarding")
    expect(result.intent).toBe("onboarding")
    expect(result.handoffIntent).toBe("demo")
  })

  it("classifies hardware spec questions as hardware", () => {
    const questions = [
      "클래스인 하드웨어 스펙",
      "전자칠판 스펙 알려줘",
      "Classin Board S86 사양 알려줘",
      "S98 Pro 규격이 어떻게 돼?",
    ]

    for (const question of questions) {
      const result = classifyChatbotQuestion(question)

      expect(result.category).toBe("hardware")
      expect(result.intent).toBe("hardware_support")
    }
  })
})

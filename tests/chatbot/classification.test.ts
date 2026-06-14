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
})

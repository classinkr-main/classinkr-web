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

  it("classifies Korean-pronounced EDB questions as classroom questions", () => {
    const result = classifyChatbotQuestion("이디비가 뭐야?")

    expect(result.category).toBe("classroom")
    expect(result.intent).toBe("classroom_consulting")
    expect(result.handoffIntent).toBe("demo")
  })

  it("classifies pre-adoption policy risk questions without falling back to general", () => {
    expect(detectChatbotCategory("콘텐츠 소유권은 어디에 있나요?")).toBe("admin")
    expect(detectChatbotCategory("메인 서버는 어디에 있나요?")).toBe("admin")
    expect(detectChatbotCategory("개인정보 처리 방식은 어떻게 관리되나요?")).toBe("admin")
    expect(detectChatbotCategory("서비스는 언제까지 사용할 수 있나요?")).toBe("onboarding")
    expect(detectChatbotCategory("전용 펜 팁 파손되면 어디서 구매하나요?")).toBe("hardware")
  })

  it("classifies software pricing, trial, and parent report questions before general fallback", () => {
    expect(detectChatbotCategory("소프트웨어만 쓸 수 있나요?")).toBe("billing")
    expect(detectChatbotCategory("구독형이랑 충전형 차이가 뭐예요?")).toBe("billing")
    expect(detectChatbotCategory("무료 체험 있나요?")).toBe("onboarding")
    expect(detectChatbotCategory("학부모 알림 문자도 자동으로 가나요?")).toBe("admin")
  })

  it("treats bare management verbs as classroom operations, not the admin console", () => {
    expect(detectChatbotCategory("수업 관리 어떻게 하나요?")).toBe("classroom")
    expect(detectChatbotCategory("학생 관리 기능 있나요?")).toBe("classroom")
    expect(detectChatbotCategory("교사 관리 화면 알려줘")).toBe("classroom")
    expect(detectChatbotCategory("코스 관리 어떻게 해요?")).toBe("classroom")
    // 명시적 관리자 신호가 함께 있으면 여전히 admin 으로 본다.
    expect(detectChatbotCategory("관리자 콘솔에서 수업 관리 어떻게 하나요?")).toBe("admin")
    expect(detectChatbotCategory("기관 관리 메뉴는 어디 있어요?")).toBe("admin")
  })

  it("routes API/integration-framed identity questions to the admin (API) path", () => {
    expect(detectChatbotCategory("API 연동으로 클래스인이 뭐 하는지 알려줘")).toBe("admin")
    expect(detectChatbotCategory("CRM 연동 되나요?")).toBe("admin")
    // API/연동 신호가 없는 순수 정체성 질문은 그대로 온보딩으로 남는다.
    expect(detectChatbotCategory("클래스인이 뭐야?")).toBe("onboarding")
    expect(detectChatbotCategory("Classin은 어떤 서비스인가요?")).toBe("onboarding")
  })
})

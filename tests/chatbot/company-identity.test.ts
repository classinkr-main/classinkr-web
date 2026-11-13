import { afterEach, describe, expect, it, vi } from "vitest"

import { isSubjectlessClassinIdentityQuestion } from "@/lib/chatbot/classification"
import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

// 위젯에서 주어 없이 묻는 "뭐하는 회사야"는 클래스인을 묻는 말이다. 되묻기 대신 회사·서비스 소개로 답한다.
describe("chatbot subject-less company/service identity questions", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("answers company questions with a direct company + service intro", async () => {
    disableExternalChatbotServices()
    for (const question of ["뭐하는 회사야", "뭐하는 회사예요?", "무슨 회사야", "어떤 회사예요", "무슨 일 하는 회사인가요", "뭐 파는 회사야", "이 회사 뭐야"]) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })

      expect(result.detectedCategory, question).toBe("onboarding")
      expect(result.answerMode, question).toBe("direct_answer")
      expect(result.answerMode, question).not.toBe("clarifying_question")
      expect(result.answer, question).toContain("EEO")
      expect(result.answer, question).toContain("수업 운영 솔루션")
      expect(result.answer, question).not.toContain("어떤 상황인지")
    }
  })

  it("answers service/site questions with the service intro", async () => {
    disableExternalChatbotServices()
    for (const question of ["무슨 서비스야", "여기 뭐하는 곳이야", "여긴 뭐하는 데야?"]) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })

      expect(result.detectedCategory, question).toBe("onboarding")
      expect(result.answerMode, question).toBe("direct_answer")
      expect(result.answer, question).toContain("수업 운영 솔루션")
    }
  })

  it("does not treat longer or topic-specific questions as identity questions", () => {
    expect(isSubjectlessClassinIdentityQuestion("무슨 회사 전자칠판이 좋아요?")).toBe(false)
    expect(isSubjectlessClassinIdentityQuestion("어떤 서비스 써야 해요?")).toBe(false)
    expect(isSubjectlessClassinIdentityQuestion("우리 학원에서 쓰는 출결 프로그램은 무슨 회사 건지 알려줄 수 있나요")).toBe(false)
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

// 갭 분석에서 deflect/오라우팅으로 새던 고빈도 FAQ를 결정론적으로 큐레이션한다.
describe("chatbot FAQ curation (gap fills)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("answers the headline pricing question instead of deflecting", async () => {
    disableExternalChatbotServices()

    for (const q of ["클래스인 요금이 어떻게 되나요?", "전자칠판 가격 얼마예요?"]) {
      const result = await evaluateChatbotQuery(q, { generateAnswer: false })
      expect(result.answerMode).toBe("direct_answer")
      expect(result.answer).toContain("구성")
      expect(result.answer).not.toContain("지금 바로 확정")
      expect(result.answer).not.toContain("일반 전자칠판과 다른 점")
    }
  })

  it("answers stand-vs-wall install questions instead of deflecting", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("스탠드형이랑 벽걸이형 중 뭐가 좋아요?", {
      generateAnswer: false,
    })
    expect(result.detectedCategory).toBe("hardware")
    expect(result.answerMode).toBe("direct_answer")
    expect(result.answer).toContain("스탠드")
    expect(result.answer).toContain("벽걸이")
    expect(result.answer).not.toContain("지금 바로 확정")

    const canMount = await evaluateChatbotQuery("벽걸이로 설치 가능해요?", { generateAnswer: false })
    expect(canMount.answerMode).toBe("direct_answer")
    expect(canMount.sources[0]?.heading).toBe("설치 형태와 현장 점검")
  })

  it("answers core-feature yes/no questions with an honest curated answer", async () => {
    disableExternalChatbotServices()

    const attendance = await evaluateChatbotQuery("출결 자동으로 되나요?", { generateAnswer: false })
    expect(attendance.answerMode).toBe("direct_answer")
    expect(attendance.answer).toContain("출결")
    expect(attendance.sources[0]?.heading).toBe("수업 기능 사용 안내")

    const recording = await evaluateChatbotQuery("녹화 되나요?", { generateAnswer: false })
    expect(recording.answerMode).toBe("direct_answer")
    expect(recording.answer).toContain("녹화")
    expect(recording.sources[0]?.heading).toBe("수업 기능 사용 안내")
  })

  it("does not curate weak/unproven areas as a capability claim", async () => {
    disableExternalChatbotServices()

    // 결제/수납 자동화는 약한 영역 — 기능 '됨'으로 단정하지 않는다.
    const billing = await evaluateChatbotQuery("학원 결제나 수납까지 자동으로 처리되나요?", {
      generateAnswer: false,
    })
    expect(billing.needsHandoff).toBe(false)
    expect(billing.sources[0]?.heading).not.toBe("수업 기능 사용 안내")

    // AI 자동 채점은 불확실 — 핵심 기능 큐레이션에서 제외(기존 라우팅 유지).
    const ai = await evaluateChatbotQuery("AI 자동 채점 기능이 있나요?", { generateAnswer: false })
    expect(ai.sources[0]?.heading).not.toBe("수업 기능 사용 안내")
  })

  it("keeps adoption-duration questions off the pricing path", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("도입까지 얼마나 걸려요?", { generateAnswer: false })
    // '얼마나 걸려요'(기간)는 가격이 아니므로 요금 구성 답이 나오면 안 된다.
    expect(result.sources[0]?.heading).not.toBe("요금·견적 구성 안내")
  })
})

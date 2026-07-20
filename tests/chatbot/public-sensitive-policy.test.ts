import { afterEach, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

describe("public chatbot sensitive-answer policy", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("locks security and privacy questions to an unresolved confirmation answer", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    const result = await evaluateChatbotQuery("학원의 콘텐츠와 학생 데이터는 안전한가요?", {
      generateAnswer: true,
    })

    expect(result.answerMode).toBe("direct_answer")
    expect(result.unresolved).toBe(true)
    expect(result.detectedCategory).toBe("admin")
    expect(result.answer).toContain("일괄 단정하지 않습니다")
    expect(result.answer).toContain("공식 개인정보처리방침")
    expect(result.answer).not.toContain("모든 정보는 암호화되어 보호됩니다")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    {
      question: "설치에는 얼마나 걸리나요?",
      includes: ["고정해서 안내할 수 없", "현장 확인"],
      excludes: [/반나절에서 하루/, /하루면/],
    },
    {
      question: "전자칠판 한 교실 설치는 반나절이면 끝나나요?",
      includes: ["고정해서 안내할 수 없", "현장 확인"],
      excludes: [/일반적으로\s*반나절/, /반나절(?:이면|에)\s*(?:끝|가능)/],
    },
    {
      question: "전자칠판 A/S는 어떻게 지원되나요?",
      includes: ["최신 조건 확인", "일괄 보장하지 않습니다"],
      excludes: [/무상(?:으로| A\/S가).*보장/, /당일.*처리/],
    },
    {
      question: "기존 시스템과 연동되나요?",
      includes: ["현재 API·계약 범위 확인", "기본 제공으로 단정할 수 없습니다"],
      excludes: [/즉시 줄여/, /자동으로 연동됩니다/],
    },
    {
      question: "API로 양방향 자동 동기화가 가능한가요?",
      includes: ["조회 가능한 데이터", "양방향·자동·실시간 동기화"],
      excludes: [/모두 가능/, /완전.*자동/],
    },
    {
      question: "S65 정확한 무게와 소비전력 사양을 알려주세요",
      includes: ["최신 규격서", "수치로 확정하지 않"],
      excludes: [/\d+\s*kg/, /\d+\s*w/i],
    },
    {
      question: "별도 PC나 카메라를 준비해야 하나요?",
      includes: ["모델과 선택한 패키지", "기본 포함이나 불필요로 단정하지 않습니다"],
      excludes: [/외장 PC 없이.*구동할 수 있습니다/, /카메라(?:가|는).*기본 포함(?:입니다|돼)/],
    },
  ])("returns a deterministic confirmation for $question", async ({ question, includes, excludes }) => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery(question, { generateAnswer: false })

    expect(result.answerMode).toBe("direct_answer")
    expect(result.unresolved).toBe(true)
    for (const expected of includes) expect(result.answer).toContain(expected)
    for (const forbidden of excludes) expect(result.answer).not.toMatch(forbidden)
  })

  it("does not hijack an administrator data-access question as chatbot self-knowledge", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("관리자는 어떤 데이터를 볼 수 있나요?", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("admin")
    expect(result.unresolved).toBe(true)
    expect(result.answer).toContain("관리자 접근 범위")
    expect(result.answer).not.toContain("저는 Classin 상담 가이드")
  })

  it("keeps individual-tutor pricing conditional and avoids feature exaggeration", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("개인 강사 요금제는 어떤 플랜을 추천하나요?", {
      generateAnswer: false,
    })

    expect(result.detectedIntent).toBe("tutor_pricing_recommend")
    expect(result.answer).toContain("일률적으로 추천하기보다")
    expect(result.answer).toContain("최신 가격 정책")
    expect(result.answer).not.toMatch(/Standard.*(?:가장|1순위|무조건).*추천/)
    expect(result.answer).not.toMatch(/100%|아무런 제약 없이|무제한/)
  })

  it("aligns the actual pricing response with the OPS pricing policy", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("가격은 어떤 항목으로 구성되나요?", {
      generateAnswer: false,
    })

    expect(result.answerMode).toBe("direct_answer")
    expect(result.answer).toContain("OPS(윈도우 기반 컴퓨팅)는 별도 견적 항목이 아니라")
    expect(result.answer).toContain("최종 견적과 구체 금액은 단정하지 않고")
    expect(result.answer).not.toMatch(/전자칠판\s*\+\s*OPS/i)
    expect(result.answer).not.toMatch(/^\s*-\s*OPS/im)
  })

  it("keeps parent feedback claims within verified data and delivery boundaries", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("학부모 피드백 보고서를 자동으로 보내주나요?", {
      generateAnswer: false,
    })

    expect(result.answer).toContain("자동 발송된다고 기본 기능처럼 단정하면 안 됩니다")
    expect(result.answer).not.toMatch(/AI (?:발음|스피킹) 점수|유지율|공수.*0/)
  })
})

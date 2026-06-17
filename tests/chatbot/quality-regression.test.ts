import { afterEach, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

describe("chatbot quality regressions", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("does not answer non-Classin questions from unrelated docs", async () => {
    disableExternalChatbotServices()
    const questions = ["오늘 날씨 어때?", "치킨 추천해줘"]

    for (const question of questions) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })

      expect(result.detectedCategory).toBe("general")
      expect(result.sources).toHaveLength(0)
      expect(result.needsHandoff).toBe(false)
      expect(result.answer).not.toContain("AI 튜터")
      expect(result.answer).not.toContain("교사 온보딩")
    }
  })

  it("answers short board questions instead of deflecting", async () => {
    disableExternalChatbotServices()

    // 넓은 질문: 짧은 라인업 답변
    const lineup = await evaluateChatbotQuery("어떤 모델 있어?", { generateAnswer: false })
    expect(lineup.detectedCategory).toBe("hardware")
    expect(lineup.answerMode).toBe("direct_answer")
    expect(lineup.answer).toContain("S75")
    expect(lineup.answer).not.toContain("지금 바로 확정")

    // 사양어(사이즈)가 섞이면 상세 사양 답변
    const specs = await evaluateChatbotQuery("어떤 칠판 있어, 사이즈", { generateAnswer: false })
    expect(specs.detectedCategory).toBe("hardware")
    expect(specs.answerMode).toBe("direct_answer")
    expect(specs.answer).toContain("S110")
    expect(specs.answer).not.toContain("지금 바로 확정")
  })

  it("does not treat unrelated 모델/사이즈 questions as board questions", async () => {
    disableExternalChatbotServices()

    // 결제 컨텍스트가 섞인 '모델'은 보드 라인업으로 보지 않는다
    const billing = await evaluateChatbotQuery("결제 모델이 어떻게 되나요?", { generateAnswer: false })
    expect(billing.detectedCategory).toBe("billing")
    expect(billing.answer).not.toContain("S75")
  })

  it("keeps login trouble on account recovery guidance", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("로그인이 자꾸 안 됩니다", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("troubleshooting")
    expect(result.answerMode).toBe("direct_answer")
    expect(result.needsHandoff).toBe(false)
    expect(result.sources[0]).toMatchObject({
      title: "비밀번호 변경 (PC)",
      heading: "로그인/비밀번호 기본 점검",
      urlPath: "/docs/start/password-change-pc",
    })
    expect(result.answer).toContain("비밀번호")
    expect(result.answer).not.toContain("전자칠판")
  })

  it("does not invent direct fixes for live-class instability without a focused source", async () => {
    disableExternalChatbotServices()
    const questions = ["학생이 수업에서 계속 나가요", "수업 중 화면 공유가 계속 끊겨요"]

    for (const question of questions) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })

      expect(result.detectedCategory).toBe("troubleshooting")
      expect(result.answerMode).not.toBe("direct_answer")
      expect(result.needsHandoff).toBe(false)
      expect(result.sources).toHaveLength(0)
      expect(result.answer).toContain("상황")
    }
  })

  it("rejects vague Gemini inference instead of presenting it as a final answer", async () => {
    disableExternalChatbotServices()
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    vi.stubEnv("GEMINI_FAST_MODEL", "")
    vi.stubEnv("GEMINI_REASONING_MODEL", "")
    vi.stubEnv("GEMINI_MODEL", "")

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "상황에 따라 다릅니다." }],
            },
          },
        ],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await evaluateChatbotQuery("클래스인으로 메타버스 아바타 가능해?")

    expect(result.sources).toHaveLength(0)
    expect(result.answerMode).not.toBe("direct_answer")
    expect(result.unresolved).toBe(true)
    expect(result.answer).not.toBe("상황에 따라 다릅니다.")
  })

  it("keeps unconfirmed hardware details cautious and concise", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("전자칠판 색상 옵션 알려줘", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("hardware")
    expect(result.answerMode).toBe("direct_answer")
    expect(result.needsHandoff).toBe(false)
    expect(result.sources[0]).toMatchObject({
      heading: "확인 필요한 하드웨어 세부 옵션",
      urlPath: "/docs/hardware/board-lineup-specs",
    })
    expect(result.answer).toContain("확정해서 안내하기 어렵습니다")
    expect(result.answer).not.toContain("블랙")
    expect(result.answer).not.toContain("화이트")
  })

  it("does not overclaim product boundaries for billing, files, and live features", async () => {
    disableExternalChatbotServices()
    const cases = [
      {
        question: "학원 결제나 수납까지 Classin에서 자동으로 처리되나요?",
        forbidden: ["자동 수납 가능", "결제/정산까지 기본 제공", "모든 PG 연동 완료"],
      },
      {
        question: "전자칠판에서 HWP 파일 바로 열 수 있나요?",
        expected: "PDF",
        forbidden: ["HWP 지원", "파일 형식 무제한"],
      },
      {
        question: "웹 라이브는 모든 요금제에서 되는 건가요?",
        expected: "요금",
        forbidden: ["모든 요금제 가능", "요금제 무관"],
      },
      {
        question: "우리 학원 CRM이랑 출결/숙제 데이터를 연동하고 싶어요",
        expected: "연동",
        forbidden: ["양방향 자동 동기화 기본", "계약 없이 바로 가능", "API 키 여기서 발급"],
      },
    ]

    for (const testCase of cases) {
      const result = await evaluateChatbotQuery(testCase.question, { generateAnswer: false })

      expect(result.needsHandoff).toBe(false)
      if (testCase.expected) expect(result.answer).toContain(testCase.expected)
      if (testCase.question.includes("웹 라이브")) {
        expect(result.sources).toHaveLength(1)
        expect(result.sources[0]?.heading).toBe("웹 라이브 요금과 사용 조건")
      }
      for (const forbidden of testCase.forbidden) {
        expect(result.answer).not.toContain(forbidden)
      }
    }
  })

  it("routes explicit refund consultation to support without making a refund promise", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("환불 때문에 담당자 상담 받고 싶어요", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("billing")
    expect(result.answerMode).toBe("handoff")
    expect(result.needsHandoff).toBe(true)
    expect(result.handoffIntent).toBe("support")
    expect(result.answer).not.toContain("환불 가능합니다")
    expect(result.answer).not.toContain("환불 불가")
  })
})

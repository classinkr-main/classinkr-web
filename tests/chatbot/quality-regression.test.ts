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

    // 사양어(사이즈)가 섞이면 상세 사양 답변 — 단, 대형 신호가 없으면 표준(75/86) 답변
    const specs = await evaluateChatbotQuery("어떤 칠판 있어, 사이즈", { generateAnswer: false })
    expect(specs.detectedCategory).toBe("hardware")
    expect(specs.answerMode).toBe("direct_answer")
    expect(specs.answer).toContain("S75")
    expect(specs.answer).toContain("S86")
    expect(specs.answer).toContain("표준")
    expect(specs.answer).not.toContain("S110")
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

  it("answers pre-adoption policy risks without guessing contract or legal facts", async () => {
    disableExternalChatbotServices()

    const cases = [
      {
        question: "서버는 어디에 있나요? 데이터가 중국으로 가나요?",
        expected: ["추정으로 답하면 안", "공식 정책", "계약"],
        forbidden: ["중국입니다", "한국입니다"],
      },
      {
        question: "콘텐츠 소유권은 학원에 있나요?",
        expected: ["약관", "계약", "확인"],
        forbidden: ["학원에 있습니다", "ClassIn에 있습니다"],
      },
      {
        question: "기본 스토리지 용량과 추가 단가는 얼마인가요?",
        expected: ["최신 계약", "숫자를 단정하지"],
        forbidden: ["30GB", "500GB", "무제한"],
      },
      {
        question: "무료 관리자와 유료 관리자 권한 차이가 뭔가요?",
        expected: ["계약", "계정 정책", "확인"],
        forbidden: ["무료 관리자는 모두 가능", "유료 전환 없습니다"],
      },
      {
        question: "전용 펜 팁 가격과 구매처 알려주세요",
        expected: ["최신 공급 조건", "금액을 단정하지"],
        forbidden: ["무료", "원입니다"],
      },
    ]

    for (const testCase of cases) {
      const result = await evaluateChatbotQuery(testCase.question, { generateAnswer: false })

      expect(result.sources[0]).toMatchObject({
        heading: "확인 필요한 정책·계약 항목",
        urlPath: "/docs/start/pre-adoption-faq-22-questions",
      })
      for (const expected of testCase.expected) expect(result.answer).toContain(expected)
      for (const forbidden of testCase.forbidden) expect(result.answer).not.toContain(forbidden)
    }
  })

  it("answers pre-adoption operational questions with permission and condition boundaries", async () => {
    disableExternalChatbotServices()

    const recording = await evaluateChatbotQuery("수업 녹화와 현장 녹화는 누가 저장 관리할 수 있나요?", {
      generateAnswer: false,
    })
    expect(recording.detectedCategory).toBe("classroom")
    expect(recording.sources[0]?.heading).toBe("녹화 저장과 권한 기준")
    expect(recording.answer).toContain("관리자 또는 권한 받은 계정")

    const signup = await evaluateChatbotQuery("회원가입 때 개인정보 뭐 필요해요?", {
      generateAnswer: false,
    })
    expect(signup.detectedCategory).toBe("onboarding")
    expect(signup.sources[0]?.heading).toBe("가입과 개인정보")
    expect(signup.answer).toContain("전화번호 또는 이메일")
    expect(signup.answer).toContain("개인정보처리방침")

    const offline = await evaluateChatbotQuery("오프라인 상태에서 칠판 필기 되나요?", {
      generateAnswer: false,
    })
    expect(offline.detectedCategory).toBe("hardware")
    expect(offline.sources[0]?.heading).toBe("오프라인 칠판 사용")
    expect(offline.answer).toContain("오프라인 상태에서도")
    expect(offline.answer).toContain("네트워크가 필요")
  })

  it("covers ChannelTalk-derived buyer and support questions", async () => {
    disableExternalChatbotServices()

    const classroom = await evaluateChatbotQuery(
      "구글클래스룸을 대체할 수 있나요? 100개 반 운영 가능한가요?",
      { generateAnswer: false }
    )
    expect(classroom.detectedCategory).toBe("classroom")
    expect(classroom.sources[0]?.heading).toBe("LMS와 과제 운영 범위")
    expect(classroom.answer).toContain("100개 이상 반")
    expect(classroom.answer).toContain("확인이 필요")

    const site = await evaluateChatbotQuery(
      "우리 사이트 입장 버튼에서 ClassIn 수업으로 바로 들어가게 할 수 있나요?",
      { generateAnswer: false }
    )
    expect(site.detectedCategory).toBe("admin")
    expect(site.sources[0]?.heading).toBe("사이트 입장 버튼 연동 확인")
    expect(site.answer).toContain("기본 제공 기능처럼 단정하면 안 됩니다")

    const s65 = await evaluateChatbotQuery("65인치 견적 받을 수 있나요?", {
      generateAnswer: false,
    })
    expect(s65.sources[0]?.heading).toBe("S65 견적 확인 필요")
    expect(s65.answerMode).toBe("handoff")
    expect(s65.answer).toContain("상세 규격서")
    expect(s65.answer).not.toContain("265W")

    const boardOnly = await evaluateChatbotQuery("전자칠판만 따로 판매하시기도 하나요?", {
      generateAnswer: false,
    })
    expect(boardOnly.sources[0]?.heading).toBe("전자칠판 단품과 시스템 구성")
    expect(boardOnly.answer).toContain("단품 구매")
    expect(boardOnly.answer).toContain("견적·공급 조건")

    const camera = await evaluateChatbotQuery(
      "두 명이 한 반에 들어왔는데 카메라는 한 명만 켜져요",
      { generateAnswer: false }
    )
    expect(camera.detectedCategory).toBe("troubleshooting")
    expect(camera.sources[0]?.heading).toBe("수업 카메라 충돌 점검")
    expect(camera.answer).toContain("계정 역할")
    expect(camera.answer).toContain("카메라 권한")
  })
})

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery, NO_SOURCE_FACT_ANSWER } from "@/lib/chatbot/service"

// 2026-11-18: 처음 보는 기본 질문 180개를 실제 모델로 돌렸더니 좋은 답이 29%였다. 실패의 상당수는 질문마다 다른
// 정해 둔 답이 없어서가 아니라 구조 때문이었다.
// 1) 낱말 목록에 없는 질문은 검색을 건너뛰고 되물었다(검색 생략 관문).
// 2) 출처가 없으면 사실을 묻는 질문에도 "상황을 한 문장만 더 알려주세요"라고 되물었다.
// 3) 넓은 정규식이 다른 질문을 가로챘다('얼마'→요금, '해줌'의 '줌'→Zoom 비교, '끊어주나요'→수업 끊김 등).
// 여기서는 이번 실패 질문과 같은 꼴의 변형 질문을 함께 넣어, 모델 없이 가로챈 답·일반 되묻기가 아닌지 본다.

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

const ask = (question: string) => evaluateChatbotQuery(question, { generateAnswer: false })

const GENERAL_CLARIFY_LEAD = "어떤 상황인지 한 가지만 더 알려 주시면"
const CATEGORY_CLARIFY_LEAD = "지금 바로 확정하기 어려워요"

beforeAll(() => {
  disableExternalChatbotServices()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterAll(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("search gate for questions outside the known vocabulary", () => {
  it("does not answer plain product questions with a generic clarify", async () => {
    const questions = [
      // 이번 실패 질문
      "웹캠 해상도 얼마나 돼야 하나요",
      "유선랜 꼭 꽂아야 하나요",
      "업데이트 자동으로 되나요",
      "화면 공유 되나요?",
      "워드 파일도 화면에 띄울 수 있어요?",
      "고객센터 몇시까지 해요",
      "계약서 전자서명 되는지 궁금",
      "아이 가입할 때 생년월일 꼭 넣어야 해요",
      "사업자등록 없이도 가입 되나요",
      "가입 승인 기다려야 하나요?",
      "점검 공지는 어디서 확인해요",
      "피아노 개인 레슨에 써도 되나요",
      "시험 문제 내고 객관식 채점 되나요",
      // 같은 꼴의 변형
      "웹캠 화질 어느 정도면 돼요",
      "블루투스 이어폰 써도 돼요?",
      "업데이트 주기가 얼마나 돼요",
      "드론 수업에도 쓸 수 있나요?",
    ]

    for (const question of questions) {
      const result = await ask(question)
      expect(result.answer, question).not.toContain(GENERAL_CLARIFY_LEAD)
      expect(result.answer, question).not.toContain(CATEGORY_CLARIFY_LEAD)
    }
  })

  it("does not paste an unselected doc chunk for a question outside the known vocabulary", async () => {
    // 검색이 새로 돌게 된 질문은 근거 선별이 답 문장을 골라 줄 때만 문서 문장을 쓴다. 모델이 없으면 못 찾았다고 답한다.
    for (const question of ["업데이트 자동으로 되나요", "점검 공지는 어디서 확인해요", "웹캠 화질 어느 정도면 돼요"]) {
      const result = await ask(question)
      expect(result.answer, question).toBe(NO_SOURCE_FACT_ANSWER)
      expect(result.sources, question).toHaveLength(0)
      expect(result.unresolved, question).toBe(true)
    }
  })

  it("keeps small talk and off-topic questions out of the search", async () => {
    for (const question of ["오늘 날씨 어때?", "치킨 추천해줘", "주식 뭐 사요?"]) {
      const result = await ask(question)
      expect(result.sources, question).toHaveLength(0)
      expect(result.answer, question).not.toBe(NO_SOURCE_FACT_ANSWER)
      expect(result.needsHandoff, question).toBe(false)
    }
  })

  it("leaves the internal CS copilot path as it was", async () => {
    for (const question of ["웹캠 해상도 얼마나 돼야 하나요", "업데이트 자동으로 되나요"]) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false, includeInternalDocs: true })
      expect(result.sources, question).toHaveLength(0)
    }
  })
})

describe("fact questions with no source", () => {
  it("says it could not find the answer instead of asking for more context", async () => {
    const questions = [
      "클래스인 투자받은 곳 어디예요",
      "클래스인 정기점검은 주기가 어떻게 돼요?",
      "코딩 교실인데 쓸 만한가요",
      "음악 합주 수업도 가능한가요",
      "수능 입시반 수업에도 돼요?",
      "어르신 대상 강좌에도 쓸 수 있을까요",
      "신청하고 첫 수업까지 며칠 걸리나요",
      "클래스인 AS는 어디로 접수해요",
    ]

    for (const question of questions) {
      const result = await ask(question)
      expect(result.answer, question).toBe(NO_SOURCE_FACT_ANSWER)
      expect(result.unresolved, question).toBe(true)
      expect(result.sources, question).toHaveLength(0)
    }
  })

  it("still asks back when the input does not say what it is about", async () => {
    for (const question of ["그거 안 열림", "업데이트", "음 그냥요"]) {
      const result = await ask(question)
      expect(result.answer, question).not.toBe(NO_SOURCE_FACT_ANSWER)
      expect(["clarifying_question", "fallback"], question).toContain(result.answerMode)
    }
  })
})

describe("broad patterns that hijacked other questions", () => {
  const PRICING_LEAD = "요금은 고정가표보다 '구성 기준'으로 봐요"

  it("reads 얼마 as money only when the question is about money", async () => {
    for (const question of [
      "클래스인 설치파일 용량 얼마에요",
      "업로드 속도는 얼마나 있어야 해요",
      "클래스인 업데이트 얼마나 자주 나와요",
      "웹캠 해상도 얼마나 돼야 하나요",
      "설치파일 크기 얼마나 돼요",
      "다운로드 속도 얼마나 나와야 해요",
      "원격 지원은 비용 따로 받나요",
    ]) {
      expect((await ask(question)).answer, question).not.toContain(PRICING_LEAD)
    }
    for (const question of ["전자칠판 얼마예요", "한 달에 얼마예요", "요금 얼마나 해요"]) {
      expect((await ask(question)).answer, question).toContain(PRICING_LEAD)
    }
  })

  it("does not read 줌 at the end of 해줌 as Zoom", async () => {
    for (const question of ["자막 번역 해줌? 클래스인", "녹화 해줌?", "자동으로 번역 해줌?"]) {
      expect((await ask(question)).answer, question).not.toContain("Zoom이 회의 중심이라면")
    }
    expect((await ask("줌이랑 뭐가 달라요?")).answer).toContain("Zoom이 회의 중심이라면")
  })

  it("does not open an attribute comparison with Zoom as if the answer were yes", async () => {
    for (const question of ["클래스인 줌보다 음질 좋아요?", "줌이랑 화면공유 방식 같아요?", "클래스인 줌보다 속도 빨라요?"]) {
      const answer = (await ask(question)).answer
      expect(answer.startsWith("네, 좋은 질문이에요"), question).toBe(false)
      expect(answer, question).toContain("말씀드리지 않을게요")
    }
  })

  it("reads 끊어 주다 for receipts as issuing a document, not a dropped class", async () => {
    for (const question of ["클래스인 현금영수증도 끊어주나요", "세금계산서 끊어주나요", "세금계산서 끊어줄 수 있어요?"]) {
      expect((await ask(question)).answer, question).not.toContain("수업이 끊기거나 튕기면")
    }
    expect((await ask("수업이 자꾸 끊어져요")).answer).toContain("수업이 끊기거나 튕기면")
  })

  it("does not read leaving a class on purpose as a live class problem", async () => {
    for (const question of ["아이가 수업 중간에 나가면 알림 오나요", "수업 나가면 다시 들어올 수 있나요"]) {
      const answer = (await ask(question)).answer
      expect(answer, question).not.toContain("수업 중 끊김이나 소리·마이크 문제는")
      expect(answer, question).not.toContain("수업이 끊기거나 튕기면")
    }
    expect((await ask("수업 중에 자꾸 나가요")).answer).toContain("수업이 끊기거나 튕기면")
  })

  it("does not answer an accessory question with the board spec sheet", async () => {
    for (const question of ["전자칠판 터치펜 같이 와요?", "전자칠판 리모컨 포함인가요?"]) {
      expect((await ask(question)).answer, question).not.toContain("사양 정리해드릴게요")
    }
    expect((await ask("전자칠판 터치 몇 점까지 돼요?")).answer).toContain("S75")
  })

  it("does not answer installing on another company's board with stand or wall mount options", async () => {
    for (const question of ["클래스인 엘지 전자칠판에도 설치돼요", "삼성 전자칠판에 클래스인 깔 수 있어요?"]) {
      const answer = (await ask(question)).answer
      expect(answer, question).not.toContain("이동형 스탠드와 벽걸이 둘 다")
      expect(answer, question).not.toContain("좋은 질문이에요")
      expect(answer, question).not.toContain("S75")
    }
    expect((await ask("전자칠판 벽걸이 설치 가능해요?")).answer).toContain("이동형 스탠드와 벽걸이 둘 다")
  })

  it("answers whether a feature exists instead of giving operating steps", async () => {
    for (const question of [
      "클래스인에 숙제 제출받는 기능 있나요",
      "클래스인 숙제 파일 학생이 여기서 제출할 수 있어요?",
      "학생들이 과제 올릴 수 있어요?",
    ]) {
      const answer = (await ask(question)).answer
      expect(answer, question).not.toContain("[새로 만들기] > [숙제]")
      expect(answer, question).not.toContain("아래 순서대로 따라 하시면")
    }
    expect((await ask("숙제 내는 방법 알려줘")).answer).toContain("[제출하기]")
  })

  it("answers facts about contact channels instead of connecting right away", async () => {
    for (const question of [
      "클래스인 전화 상담 번호가 어떻게 되나요",
      "클래스인 상담받는 데 돈 드나요",
      "원격 지원은 비용 따로 받나요",
      "개인정보 보호책임자 지정돼 있어요?",
      "도입 상담 전화로도 받나요",
      "카톡으로도 상담 돼요?",
    ]) {
      const result = await ask(question)
      expect(result.answer.startsWith("네, 담당자 상담으로"), question).toBe(false)
    }
    for (const question of ["상담원 연결해 주세요", "담당자 번호 알려주세요", "전화 상담 원해요", "책임자 바꿔"]) {
      const result = await ask(question)
      expect(result.answerMode, question).toBe("handoff")
      expect(result.answer, question).toContain("네, 담당자 상담으로")
    }
  })

  it("keeps the DPA answer for contract documents only", async () => {
    for (const question of ["개인정보 처리 위탁업체는 어디인가요", "개인정보 수탁사는 어디예요"]) {
      expect((await ask(question)).answer, question).not.toContain("DPA")
    }
    expect((await ask("DPA 양식 받을 수 있나요")).answer).toContain("DPA")
  })

  it("does not answer a teacher's nationality with the overseas access FAQ", async () => {
    expect((await ask("외국인 강사가 한국 학생 가르쳐도 돼요?")).answer).not.toContain("VPN 없이")
    expect((await ask("외국 학생도 수업 들을 수 있어요?")).answer).toContain("VPN 없이")
  })

  it("does not assume a penalty was already charged when asked before signing", async () => {
    expect((await ask("클래스인 중간에 해지하면 위약금 있어요?")).answer).not.toContain("청구됐다니")
    expect((await ask("위약금이 청구됐는데 근거가 뭐예요")).answer).toContain("청구됐다니")
  })

  it("does not read a screen sharing question as handing out board notes", async () => {
    const answer = (await ask("클래스인 일반 전자칠판은 학생 화면 공유 안 되죠")).answer
    expect(answer).not.toContain("판서는 파일로 저장하거나")
    expect(answer).not.toContain("화면 공유가 학생에게 안 보이거나")
    expect((await ask("판서 내용 학생한테 공유해 줄 수 있어요?")).answer).toContain("판서는 파일로 저장하거나")
  })

  it("adds the pair-talk caveat only when pairs are asked about", async () => {
    for (const question of ["클래스인 소그룹 토론방 기능 있어요", "클래스인 소그룹 토론방 나눠져요"]) {
      const answer = (await ask(question)).answer
      expect(answer, question).toContain("[그룹 토론]")
      expect(answer, question).not.toContain("두 명씩")
    }
    expect((await ask("학생 두 명씩 짝지어 토론 시키려면?")).answer).toContain("두 명씩")
  })
})

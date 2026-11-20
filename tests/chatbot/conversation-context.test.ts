import { describe, expect, it } from "vitest"

import {
  parseDocPagePath,
  parsePreviousTurnInput,
  resolveConversationTurn,
  type PreviousTurn,
} from "@/lib/chatbot/conversation-context"

// 대화 맥락 넓히기(순수 함수). 예시 질문은 이 시험을 위해 지었다(평가 묶음 문항이 아니다).

const ANSWER_MODES = ["direct_answer", "doc_suggestion", "clarifying_question", "handoff", "fallback"]
const camera: PreviousTurn = { question: "카메라가 안 켜져요", answerMode: "direct_answer" }

describe("resolveConversationTurn: 직전 턴이 없으면 글을 바꾸지 않는다", () => {
  it.each(["휴대폰이요", "그러면 아이패드는요", "카메라가 안 켜져요", "녹화 파일은 어디서 받아요?"])("%s", (message) => {
    const turn = resolveConversationTurn(message, null, null)
    expect(turn.routingText).toBe(message)
    expect(turn.expanded).toBe(false)
    expect(turn.reason).toBe("none")
  })

  it("지시어만 있는 말은 대상 불명이다(글은 그대로)", () => {
    for (const message of ["이거 뭐예요", "그거 어떻게 해요?", "이게 뭐예요?"]) {
      const turn = resolveConversationTurn(message, null, null)
      expect(turn.reason, message).toBe("target_unknown")
      expect(turn.routingText).toBe(message)
      expect(turn.expanded).toBe(false)
    }
  })

  it("지시어가 있어도 내용 낱말이 있으면 대상 불명이 아니다", () => {
    expect(resolveConversationTurn("이거 학원에서 쓰려면 강사 계정 몇 개 필요해요?", null, null).reason).toBe("none")
  })
})

describe("resolveConversationTurn: 짧은 대답", () => {
  it("직전 질문 + 지금 대답으로 넓힌다", () => {
    const turn = resolveConversationTurn("휴대폰이요", camera, null)
    expect(turn).toMatchObject({ reason: "short_reply", expanded: true, routingText: "카메라가 안 켜져요 휴대폰이요" })
  })

  it("혼자서도 답이 서는 말은 넓히지 않는다(standsAlone)", () => {
    const turn = resolveConversationTurn("요금은요?", camera, null, { standsAlone: (text) => text.includes("요금") })
    expect(turn).toMatchObject({ reason: "none", expanded: false, routingText: "요금은요?" })
  })

  it("자기 서술어가 있는 새 질문은 그대로 둔다", () => {
    for (const message of ["그럼 녹화 파일은 어디서 봐요?", "마이크도 안 들려요", "학생 초대는 어떻게 하나요?"]) {
      expect(resolveConversationTurn(message, camera, null).expanded, message).toBe(false)
    }
  })

  it("내용 낱말이 많은 긴 질문은 그대로 둔다", () => {
    const turn = resolveConversationTurn("전자칠판 설치 기사님 방문 일정 변경 가능한가요", camera, null)
    expect(turn.expanded).toBe(false)
  })

  it("직전 질문에 내용이 없으면(인사) 넓히지 않는다", () => {
    expect(resolveConversationTurn("휴대폰이요", { question: "안녕하세요" }, null).expanded).toBe(false)
  })
})

describe("resolveConversationTurn: 직전 답이 물은 정보의 답(askedSlot)", () => {
  it("기기를 물었으면 기기 이름 대답을 넓힌다", () => {
    const turn = resolveConversationTurn("아이폰 써요", { question: "다시보기 영상이 안 나와요", askedSlot: "device" }, null, {
      standsAlone: () => true,
    })
    expect(turn).toMatchObject({ reason: "slot_answer", expanded: true, routingText: "다시보기 영상이 안 나와요 아이폰 써요" })
  })

  it("규모를 물었으면 인원 대답을 넓힌다(조금 길어도)", () => {
    const turn = resolveConversationTurn("강사 3명에 학생은 40명 정도예요", { question: "도입 비용이 궁금해요", askedSlot: "size" }, null)
    expect(turn.reason).toBe("slot_answer")
    expect(turn.routingText).toBe("도입 비용이 궁금해요 강사 3명에 학생은 40명 정도예요")
  })

  it("보기를 물었으면 보기 고르기를 넓힌다", () => {
    const turn = resolveConversationTurn("전자칠판이요", { question: "클래스인이 뭐예요?", askedSlot: "choice" }, null, {
      standsAlone: () => true,
    })
    expect(turn).toMatchObject({ reason: "choice", expanded: true })
  })
})

describe("resolveConversationTurn: 지시어 후속 질문", () => {
  it("그러면 …은요", () => {
    const turn = resolveConversationTurn("그러면 아이패드는요", camera, null)
    expect(turn).toMatchObject({ reason: "follow_up", expanded: true, routingText: "카메라가 안 켜져요 아이패드는요" })
  })

  it("아까 그거 다시요: 지시어를 빼고 붙인다", () => {
    const turn = resolveConversationTurn("아까 그거 다시 알려주세요", camera, null)
    expect(turn).toMatchObject({ reason: "follow_up", expanded: true, routingText: "카메라가 안 켜져요 다시 알려주세요" })
  })

  it("해 봤는데 또 안 돼요: 다시 생긴 문제 신고로 표시한다", () => {
    const turn = resolveConversationTurn("해 봤는데 또 안 돼요", camera, null)
    expect(turn).toMatchObject({ reason: "follow_up", expanded: true, retryReport: true })
  })

  it("그거 받았는데 안 열려요: 앞 턴의 무엇을 가리킨다", () => {
    const turn = resolveConversationTurn("그거 받았는데 안 열려요", { question: "숙제 파일은 어디서 받아요?" }, null)
    expect(turn).toMatchObject({ reason: "follow_up", expanded: true, routingText: "숙제 파일은 어디서 받아요? 받았는데 안 열려요" })
  })
})

describe("resolveConversationTurn: 문서 페이지", () => {
  const page = parseDocPagePath("/docs/start/camera-mic-troubleshooting")!

  it("'방금 본 내용'은 그 문서를 가리킨다(직전 턴이 있어도)", () => {
    const turn = resolveConversationTurn("방금 본 내용을 우리 학원 상황에 맞게 정리해줄 수 있나요?", camera, page)
    expect(turn).toMatchObject({ reason: "page_context", expanded: false, pageDoc: page })
    expect(turn.routingText).toBe("방금 본 내용을 우리 학원 상황에 맞게 정리해줄 수 있나요?")
  })

  it("직전 턴 없는 '이거'도 그 문서를 가리킨다", () => {
    expect(resolveConversationTurn("이거 뭐예요", null, page).reason).toBe("page_context")
  })

  it("내용 낱말이 있는 질문은 경로와 상관없이 그대로다", () => {
    const turn = resolveConversationTurn("학생 초대는 어떻게 하나요?", null, page)
    expect(turn).toMatchObject({ reason: "none", expanded: false })
    expect(turn.pageDoc).toBeUndefined()
  })
})

describe("parsePreviousTurnInput", () => {
  it("없으면 null", () => {
    expect(parsePreviousTurnInput(undefined, ANSWER_MODES)).toEqual({ ok: true, value: null })
    expect(parsePreviousTurnInput(null, ANSWER_MODES)).toEqual({ ok: true, value: null })
  })

  it("공백을 정리하고 꼴을 받는다", () => {
    expect(parsePreviousTurnInput({ question: "  카메라가   안 켜져요 ", askedSlot: "device", answerMode: "direct_answer" }, ANSWER_MODES)).toEqual({
      ok: true,
      value: { question: "카메라가 안 켜져요", askedSlot: "device", answerMode: "direct_answer" },
    })
  })

  it.each([
    ["문자열", "카메라"],
    ["배열", []],
    ["질문 없음", { askedSlot: "device" }],
    ["빈 질문", { question: "  " }],
    ["200자 초과", { question: "가".repeat(201) }],
    ["모르는 askedSlot", { question: "카메라", askedSlot: "budget" }],
    ["모르는 answerMode", { question: "카메라", answerMode: "maybe" }],
  ])("틀린 꼴은 오류(%s)", (_label, raw) => {
    expect(parsePreviousTurnInput(raw, ANSWER_MODES).ok).toBe(false)
  })
})

describe("parseDocPagePath", () => {
  it("문서 경로만 받는다", () => {
    expect(parseDocPagePath("/docs/start/camera-mic-troubleshooting?from=nav#steps")).toEqual({
      path: "/docs/start/camera-mic-troubleshooting",
      category: "start",
      slug: "camera-mic-troubleshooting",
    })
    for (const raw of ["/", "/docs", "/docs/start", "/pricing", "/docs/../admin/x", "https://example.com/docs/a/b", 3, null]) {
      expect(parseDocPagePath(raw), String(raw)).toBeNull()
    }
  })
})

describe("resolveConversationTurn: 의문사", () => {
  it("잇는 말이 있으면 의문사가 있어도 잇는다", () => {
    const turn = resolveConversationTurn("그러면 아이패드는 어떻게 해요?", camera, null)
    expect(turn).toMatchObject({ reason: "follow_up", expanded: true })
  })
})

// 2026-11-20 검토 결과 고침. 예시 질문은 이 시험을 위해 지었다.
describe("resolveConversationTurn: 내용 없는 직전 턴은 직전 턴이 없는 것과 같다", () => {
  it.each(["안녕하세요", "이거 뭐예요"])("직전 질문 '%s' 뒤 '이거 뭐예요'는 대상 불명이다", (previous) => {
    const turn = resolveConversationTurn("이거 뭐예요", { question: previous }, null)
    expect(turn).toMatchObject({ reason: "target_unknown", expanded: false, routingText: "이거 뭐예요" })
  })
})

describe("resolveConversationTurn: 문서 페이지를 가리키는 말만 page_context 다", () => {
  const page = parseDocPagePath("/docs/start/camera-mic-troubleshooting")!

  it.each([
    "학생이 글씨를 못 써요",
    "선생님이 페이지를 넘기면 학생 화면도 넘어가나요?",
    "학생이 안내 문자를 못 받아요",
    "이 글씨가 너무 작아요",
  ])("조사 '이'·다른 낱말은 문서를 가리키지 않는다: %s", (message) => {
    const turn = resolveConversationTurn(message, null, page)
    expect(turn.reason).toBe("none")
    expect(turn.pageDoc).toBeUndefined()
  })

  it.each([
    "이 안내 말고 영수증은 어디서 받아요?",
    "이 내용이랑 상관없는데 직원 채용 공고는 어디서 봐요?",
    "여기 나온 거 말고 다른 회사 제품이랑 연동돼요?",
  ])("'말고·상관없는데'가 붙으면 다른 것을 묻는다: %s", (message) => {
    expect(resolveConversationTurn(message, null, page).reason).toBe("none")
  })

  it("문서를 가리키는 말 밖에 내용 낱말이 많으면 새 질문이다", () => {
    expect(resolveConversationTurn("이 페이지 보다가 궁금한데 무료 체험 인원 제한 있어요?", null, page).reason).toBe("none")
  })

  it.each(["이 문서 쉽게 설명해 주세요", "방금 본 내용 정리해 줘", "이 내용 학원에도 적용돼요?"])("그 문서에 대한 말은 page_context: %s", (message) => {
    expect(resolveConversationTurn(message, null, page)).toMatchObject({ reason: "page_context", pageDoc: page })
  })
})

describe("resolveConversationTurn: 슬롯 낱말이 든 새 질문은 넓히지 않는다", () => {
  it.each([
    ["학생 30명인데 녹화 파일은 어디서 받아요?", { question: "견적 받고 싶어요", askedSlot: "size" as const }],
    ["강사 3명인데 학생 초대는 어떻게 하나요?", { question: "데모 신청하고 싶어요", askedSlot: "size" as const }],
    ["아직 모르겠는데 학생은 수업에 어떻게 들어가요?", { question: "학원에 도입하려면 어떻게 해야 하나요?", askedSlot: "timing" as const }],
    ["바로 쓰고 싶은데 앱 설치는 어떻게 해요?", { question: "학원에 도입하려면 어떻게 해야 하나요?", askedSlot: "timing" as const }],
  ])("%s", (message, previousTurn) => {
    expect(resolveConversationTurn(message, previousTurn, null)).toMatchObject({ reason: "none", expanded: false, routingText: message })
  })

  it("슬롯 대답에 묻는 말만 붙으면 넓힌다('아이폰인데 어떻게 해요?')", () => {
    const turn = resolveConversationTurn("아이폰인데 어떻게 해요?", { question: "다시보기 영상이 안 나와요", askedSlot: "device" }, null)
    expect(turn).toMatchObject({ reason: "slot_answer", expanded: true })
  })

  it("보기를 물은 뒤 묻는 말('요금은 어떻게 돼요?')은 보기 고르기가 아니다", () => {
    const turn = resolveConversationTurn("요금은 어떻게 돼요?", { question: "클래스인이 뭐예요?", askedSlot: "choice" }, null)
    expect(turn.expanded).toBe(false)
  })
})

describe("resolveConversationTurn: 명사 하나로 화제를 바꾸는 짧은 말", () => {
  it.each(["출결은요?", "숙제는요?", "녹화는요?"])("잇는 말·기기 이름 없이는 넓히지 않는다: %s", (message) => {
    expect(resolveConversationTurn(message, camera, null)).toMatchObject({ reason: "none", expanded: false })
  })

  it("기기 이름은 앞 턴 문제가 나는 곳이라 넓힌다", () => {
    expect(resolveConversationTurn("전자칠판은요?", camera, null)).toMatchObject({ reason: "short_reply", expanded: true })
  })

  it("봇이 되물은 뒤의 명사 대답은 넓힌다", () => {
    const turn = resolveConversationTurn("숙제 파일이요", { question: "파일이 안 열려요", answerMode: "clarifying_question" }, null)
    expect(turn).toMatchObject({ reason: "short_reply", expanded: true, routingText: "파일이 안 열려요 숙제 파일이요" })
    // 같은 말이라도 직전 답이 되묻기가 아니면 화제를 바꾸는 말일 수 있어 넓히지 않는다.
    expect(resolveConversationTurn("숙제 파일이요", { question: "파일이 안 열려요", answerMode: "direct_answer" }, null).expanded).toBe(false)
  })

  it("넓혀도 앞 답과 같은 답이 나오고 새 낱말이 없으면(answersNewWords=false) 넓히지 않는다", () => {
    const answersNewWords = (routingText: string, previous: string, words: string[]) => {
      expect(routingText).toBe("카메라가 안 켜져요 출결은요?")
      expect(previous).toBe("카메라가 안 켜져요")
      expect(words).toEqual(["출결"])
      return false
    }
    expect(resolveConversationTurn("그러면 출결은요?", camera, null, { answersNewWords })).toMatchObject({ reason: "none", expanded: false })
    expect(resolveConversationTurn("그러면 출결은요?", camera, null, { answersNewWords: () => true })).toMatchObject({ reason: "follow_up" })
  })

  it("기기 이름은 answersNewWords 를 묻지 않는다", () => {
    const turn = resolveConversationTurn("그러면 아이패드는요", camera, null, { answersNewWords: () => false })
    expect(turn).toMatchObject({ reason: "follow_up", expanded: true })
  })
})

describe("resolveConversationTurn: 같은 대화의 앞 턴을 가리키는 말(G2)", () => {
  it.each(["아까 챗봇이 알려준 대로 했는데 안 돼요", "아까 알려준 거 해봤는데 안 돼요", "아까 그거 해봤는데도 똑같아요"])(
    "내용 낱말 수와 상관없이 잇고 다시 생긴 문제로 표시한다: %s",
    (message) => {
      expect(resolveConversationTurn(message, camera, null)).toMatchObject({ reason: "follow_up", expanded: true, retryReport: true })
    }
  )

  it("'아까 그거 말고 …'는 앞 턴 말고 다른 것을 묻는다", () => {
    expect(resolveConversationTurn("아까 그거 말고 요금은요?", camera, null).expanded).toBe(false)
  })

  it("직전 턴이 없으면 글을 바꾸지 않고 대상 불명으로도 보지 않는다", () => {
    expect(resolveConversationTurn("아까 챗봇이 알려준 대로 했는데 안 돼요", null, null)).toMatchObject({ reason: "none", expanded: false })
  })
})

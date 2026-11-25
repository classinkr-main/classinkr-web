import { describe, expect, it } from "vitest"

import { absentTargetOf } from "@/lib/chatbot/answer-index/checks"
import { prepareQuery } from "@/lib/chatbot/answer-index/compile"
import { decide, mainClauseOf, toAnswerIndexTrace } from "@/lib/chatbot/answer-index/decide"
import { adjectivalEndingAt, compactWithBoundaries } from "@/lib/chatbot/answer-index/lexicon"
import {
  askingSentencesOf,
  hasOwnTopicWords,
  isAskingSegment,
  prepareText,
  segmentQuestion,
  splitQuestion,
} from "@/lib/chatbot/answer-index/normalize"
import { CARDS, compileFixture } from "./index-fixture"

// R2 B2(결정형): 질문 나누기 v2·주제 이어 붙이기·질문 순서·없는 개념 묻는 대상·공백 답 조건·승격 가드·관형형 끝.
// 시험 문장은 이 파일에서 새로 썼다.

const segments = (text: string) => splitQuestion(text).segments

describe("질문 나누기 v2", () => {
  it("번호 목록(줄·글 안)은 항목마다 나눈다", () => {
    expect(segments("1. 녹화 되나요\n2. 출석 체크 되나요")).toEqual(["녹화 되나요", "출석 체크 되나요"])
    expect(segments("1. 화면공유 되나요 2. 판서 저장되나요 3. 휴대폰으로도 되나요")).toEqual(["화면공유 되나요", "판서 저장되나요", "휴대폰으로도 되나요"])
  })

  it("묻는 문장이 둘 이상이면 문장마다, 상황 문장은 다음 묻는 문장에 붙인다", () => {
    expect(segments("녹화는 어떻게 하나요? 그리고 출석도 자동이에요?")).toEqual(["녹화는 어떻게 하나요?", "출석도 자동이에요?"])
    expect(segments("학원에서 쓰려고 해요. 녹화 되나요? 출석은 어디서 봐요?")).toEqual(["학원에서 쓰려고 해요. 녹화 되나요?", "출석은 어디서 봐요?"])
    // '??' 는 한 번의 끊김이다.
    expect(segments("앱도 있나요?? 웹에서도 들어가져요?")).toEqual(["앱도 있나요??", "웹에서도 들어가져요?"])
  })

  it("증상 신고 문장도 묻는 문장으로 센다", () => {
    expect(segments("앱에서 로그인이 안 돼요. 비밀번호는 어디서 바꿔요?")).toEqual(["앱에서 로그인이 안 돼요.", "비밀번호는 어디서 바꿔요?"])
  })

  it("잇는 말: 그리고·의문사 절의 -고·요청 -시고·쉼표 목록·줄임 말투", () => {
    expect(segments("화면은 어떻게 띄우고 판서 기능도 있나요?")).toEqual(["화면은 어떻게 띄우고", "판서 기능도 있나요?"])
    expect(segments("이름 바꾸는 법 알려주시고 인증 문자가 안 와요")).toEqual(["이름 바꾸는 법 알려주시고", "인증 문자가 안 와요"])
    expect(segments("비번 까먹음 그리고 문자 인증 안옴")).toEqual(["비번 까먹음", "문자 인증 안옴"])
    expect(segments("설치 방법, 요금 있는지 알려주세요")).toEqual(["설치 방법", "요금 있는지 알려주세요"])
    expect(segments("최대 인원, 출석 확인 궁금해요")).toEqual(["최대 인원 궁금해요", "출석 확인 궁금해요"])
    expect(segments("중국에서도 되나요 느리진 않나")).toEqual(["중국에서도 되나요", "느리진 않나"])
  })

  it("명사를 잇는 '이랑·하고'는 v1 처럼 묻는 꼬리를 나눠 붙인다", () => {
    expect(segments("녹화랑 출석 체크 되나요")).toEqual(["녹화 되나요", "출석 체크 되나요"])
  })

  it("나누지 않는다: 상황 절 + 질문 하나, 동사 '-하고', 조건으로 받는 쉼표, 고르는 질문, 비교, 내용 없는 되물음", () => {
    const single = [
      "학생이 서른 명쯤 되는데, 이 정도 규모에서도 쓸 수 있나요?",
      "앱을 설치하고 나서 로그인은 어떻게 하면 되나요?",
      "학생을 한꺼번에 초대하고 싶어요, 엑셀로 등록하는 방법이 있나요?",
      "손 들기 기능이 있나요, 있다면 선생님은 어떻게 확인하나요?",
      "녹화 파일은 어디에 저장되고, 얼마나 오래 보관되나요?",
      "폰으로 해도 돼요 아님 컴퓨터 있어야 되요",
      "줌이랑 뭐가 달라요",
      "앱 실행이 안 됩니다. 언제 해결되나요?",
      "수업하고 싶어요",
    ]
    for (const text of single) expect(segments(text)).toEqual([text])
  })

  it("최대 3조각, 넘는 조각은 overflow 로 돌려준다", () => {
    const split = splitQuestion("1. 녹화 되나요\n2. 출석 되나요\n3. 퀴즈 되나요\n4. 채팅 되나요")
    expect(split.segments).toEqual(["녹화 되나요", "출석 되나요", "퀴즈 되나요"])
    expect(split.overflow).toEqual(["채팅 되나요"])
  })

  it("v1(segmentQuestion, 옛 흐름이 읽음)은 그대로다", () => {
    expect(segmentQuestion("맥북에도 깔리나요? 학생은 아이패드 쓰는데")).toEqual(["맥북에도 깔리나요?", "학생은 아이패드 쓰는데"])
    expect(segmentQuestion("녹화, 출석, 과제 다 되나요").length).toBeLessThanOrEqual(2)
  })

  it("묻는 꼴·제 주제 낱말·묻는 문장 판별", () => {
    expect(isAskingSegment("다운로드 가능한지")).toBe(true)
    expect(isAskingSegment("수업 시간까지")).toBe(false)
    expect(isAskingSegment("로그인이 안 돼요.")).toBe(false)
    expect(hasOwnTopicWords("되면 어디서 봐요?")).toBe(false)
    expect(hasOwnTopicWords("안 오면 어떻게 해요?")).toBe(false)
    expect(hasOwnTopicWords("휴대폰으로도 되나요")).toBe(true)
    expect(askingSentencesOf("다음 달에 재가입할 예정입니다. 계정 탈퇴는 어떻게 해요?")).toEqual(["계정 탈퇴는 어떻게 해요?"])
    expect(askingSentencesOf("녹화 되나요?")).toBeNull()
  })

  it("공백 뺀 200자를 넘으면 묻는 문장만 조각 후보다", () => {
    const filler = "수업 준비를 하면서 여러 가지를 해 보았는데 잘 모르겠어서 이렇게 적어 봅니다 ".repeat(8)
    const split = splitQuestion(`${filler.trim()}. 녹화 되나요? 출석은 어디서 봐요?`)
    expect(split.segments).toEqual(["녹화 되나요?", "출석은 어디서 봐요?"])
  })
})

describe("관형형 끝·없는 개념이 묻는 대상인지", () => {
  it("짧은 형태 뒤에 붙어 낱말을 끝내는 '한·인·된…'은 관형형이다", () => {
    const { compact, wordStart } = compactWithBoundaries("수상한 결제 문자")
    expect(adjectivalEndingAt(compact, wordStart, 2)).toBe("한")
    const other = compactWithBoundaries("수상 이력")
    expect(adjectivalEndingAt(other.compact, other.wordStart, 2)).toBeNull()
  })

  const target = (question: string, form: string) => {
    const prepared = prepareText(question)
    const compact = prepared.normalized.replace(/\s+/g, "")
    const start = compact.indexOf(form)
    return absentTargetOf({ normalized: prepared.normalized, raw: question }, { id: "x", form, start, end: start + form.length }, askingSentencesOf(question))
  }

  it("비교·제외·장소·꾸밈·때 부사어·상황 문장이면 묻는 대상이 아니다", () => {
    expect(target("총판 말고 학생 비밀번호 재설정 어떻게 해요", "총판")).toEqual({ target: false, reason: "exclusion" })
    expect(target("로드맵처럼 수업 순서를 정하는 방법", "로드맵")).toEqual({ target: false, reason: "comparison" })
    expect(target("독서실 와이파이에서 수업이 끊겨요", "독서실")).toEqual({ target: false, reason: "modifier" })
    // 장소 부사어가 아닌 꾸밈은 대상일 수 있다(남은 질문을 답하는 카드가 있으면 꼬리 없이 답한다).
    expect(target("방과후 수업 녹화 영상은 어디서 봐요", "방과후")).toEqual({ target: true, reason: "modifier" })
    expect(target("휴원 기간에도 녹화본 볼 수 있나요", "휴원")).toEqual({ target: false, reason: "adjunct" })
    expect(target("논문 pdf 띄우는 방법", "논문")).toEqual({ target: false, reason: "modifier" })
    expect(target("다음 달에 재가입할 예정입니다. 계정 탈퇴는 어떻게 해요?", "재가입")).toEqual({ target: false, reason: "context" })
  })

  it("그 개념을 묻거나 괄호 풀이가 붙으면 묻는 대상이다", () => {
    expect(target("대기실 기능 있나요", "대기실")).toEqual({ target: true, reason: null })
    expect(target("총판 모집 하나요", "총판")).toEqual({ target: true, reason: null })
    expect(target("외부 송출(RTMP 등)이 되는지", "외부송출")).toEqual({ target: true, reason: null })
    expect(target("isms 있나요", "isms")).toEqual({ target: true, reason: null })
  })

  it("주절은 상황 절 뒤 마지막 조각이다", () => {
    expect(mainClauseOf("화면 공유가 안 되는데 지난 코스를 정리하는 방법")).toBe("지난 코스를 정리하는 방법")
  })
})

describe("조각 판정 잇기(결정형)", () => {
  const index = compileFixture()

  it("답 순서는 질문 순서다(못 찾은 조각이 앞이어도)", () => {
    const decision = decide(index, "회사 주식 상장했나요? 그리고 녹화 되나요?")
    expect(decision.kind).toBe("answer")
    expect(decision.card).toBe(CARDS.replay)
    expect(decision.segments?.map((segment) => [segment.kind, segment.card])).toEqual([
      ["abstain", null],
      ["answer", CARDS.replay],
    ])
    expect(decision.partial).toBe(true)
    const trace = toAnswerIndexTrace(decision, { version: "test", router: "compiled" })
    expect(trace.segments).toBe(2)
    expect(trace.parts?.map((part) => [part.by, part.notice])).toEqual([
      ["none", true],
      ["index", false],
    ])
  })

  it("넘친 조각은 abstain(overflow)으로 뒤에 붙어 꼬리 대상이 된다", () => {
    const decision = decide(index, "1. 녹화 되나요\n2. 학생 강퇴 돼요\n3. 채팅 금지 되나요\n4. 회사 주식 상장했나요")
    expect(decision.segments?.length).toBe(4)
    expect(decision.segments?.[3]).toMatchObject({ kind: "abstain", card: null, source: "overflow" })
    expect(decision.partial).toBe(true)
  })

  it("없는 개념이 제외 문맥이면 공백으로 가지 않고 주의 표시만 남긴다", () => {
    const asked = decide(index, "ISMS 인증 있나요")
    expect(asked).toMatchObject({ kind: "gap", card: CARDS.gapCert, absentHit: "A_isms" })
    // 'ISMS 인증'의 ISMS 는 꾸미는 자리지만 남은 질문('인증 있나요')을 답하는 카드가 없어 공백 답이다.
    expect(asked.cautions).toEqual([{ kind: "absent", id: "A_isms", form: "ISMS", target: true, reason: "modifier" }])
    const excluded = decide(index, "ISMS 말고 학생 채팅 금지 되나요")
    expect(excluded.kind).not.toBe("gap")
    expect(excluded.absentHit).toBeNull()
    expect(excluded.cautions).toEqual([{ kind: "absent", id: "A_isms", form: "ISMS", target: false, reason: "exclusion" }])
  })

  it("증상 판별에서만 나온 표는 주절이 다른 대상의 방법을 물으면 승격하지 않는다", () => {
    const question = "녹화가 안 되는데 학생 강퇴하는 방법"
    const voteSources = new Map([[CARDS.replay, ["symptom:recording"]]])
    const guarded = decide(index, question, { votes: [CARDS.replay], voteSources })
    expect(guarded.rescue === "vote" && guarded.card === CARDS.replay).toBe(false)
  })

  it("같은 질문이면 같은 판정이다", () => {
    const question = "녹화 되나요? 되면 어디서 봐요? 그리고 강퇴도 돼요?"
    expect(JSON.stringify(decide(index, question))).toBe(JSON.stringify(decide(index, question)))
  })

  it("prepareQuery 의 없는 개념 맞춤은 관형형 끝을 버린다", () => {
    expect(prepareQuery(index, "ISMS 인증 있나요").absent.map((match) => match.id)).toEqual(["A_isms"])
  })
})

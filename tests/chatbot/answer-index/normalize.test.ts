import { describe, expect, it } from "vitest"

import {
  detectAskType,
  extractTriedActions,
  glossForIndex,
  isTailOnly,
  normalizeForIndex,
  normalizeText,
  prepareText,
  segmentQuestion,
  stripBrand,
  stripQuestionTail,
} from "@/lib/chatbot/answer-index/normalize"
import { checkCompiledScope, countSentences, isCompiledScope } from "@/lib/chatbot/answer-index/scope"
import { glossForRouting } from "@/lib/chatbot/tone"

// 답 색인 사양 §3.3 ①②(정규화·묻는 꼴·꼬리·나누기), §3.2 ⑤(범위 관문), §12.1 I4(질문당 2ms 이하).

describe("정규화", () => {
  it("NFC·전각→반각·소문자·문장부호·감탄 자모를 정리하고 브랜드 낱말을 지운다", () => {
    expect(normalizeText("ＣｌａｓｓＩｎ 녹화！！ 되나요？ㅠㅠ")).toBe("녹화 되나요")
    expect(normalizeText("클래스인에서 화면 공유는?")).toBe("에서 화면 공유는")
    expect(normalizeText("Class In 앱 설치")).toBe("앱 설치")
    // '클래스 인원'의 '클래스 인'은 브랜드가 아니다.
    expect(stripBrand("클래스 인원 제한")).toBe("클래스 인원 제한")
    expect(normalizeText("ISMS-P 인증")).toBe("isms p 인증")
  })

  it("질문 꼬리를 떼되 다 떼서 비면 남기고, 낱말 안쪽은 떼지 않는다", () => {
    expect(normalizeForIndex("녹화 되나요?")).toBe("녹화")
    expect(normalizeForIndex("녹화돼요")).toBe("녹화")
    expect(normalizeForIndex("학생 내보낼 수 있나요")).toBe("학생 내보낼")
    expect(normalizeForIndex("화면 공유 가능한가요")).toBe("화면 공유")
    expect(normalizeForIndex("가격 알려주세요")).toBe("가격")
    expect(normalizeForIndex("이거 뭐예요")).toBe("이거")
    expect(normalizeForIndex("녹화 되나요 궁금해요")).toBe("녹화")
    // '불가능한가요'의 '가능한가요'는 낱말 첫머리가 아니라 떼지 않는다.
    expect(stripQuestionTail("녹화 불가능한가요")).toBe("녹화")
    expect(stripQuestionTail("불가능")).toBe("불가능")
    expect(normalizeForIndex("되나요?")).toBe("되나요")
    expect(isTailOnly("되나요")).toBe(true)
    expect(isTailOnly("녹화")).toBe(false)
  })

  it("라우팅 풀이는 tone.ts glossForRouting 과 같은 결과를 낸다", () => {
    const samples = [
      "어케 녹화해요",
      "쌤이 업뎃하래요",
      "login 안대요",
      "camera black screen",
      "how to invite students",
      "screen share 어디서",
      "ㅇㄷ서 다보기 봐요",
      "zoom이랑 비교",
      "그냥 한글만 있는 질문",
      "Recording not working 오류",
    ]
    for (const sample of samples) expect(glossForIndex(sample)).toBe(glossForRouting(sample))
  })

  it("묻는 꼴을 꼬리를 떼기 전에 정한다", () => {
    expect(detectAskType("로그인이 안 돼요")).toBe("symptom")
    expect(detectAskType("화면이 멈춰요")).toBe("symptom")
    // '하면 안 되나요'(허락)와 '못 하게'(막기)는 증상이 아니다.
    expect(detectAskType("수업 중에 나가면 안 되나요")).toBe("yesno")
    expect(detectAskType("학생 채팅 못 하게 할 수 있나요")).toBe("yesno")
    expect(detectAskType("가격 얼마예요")).toBe("cost")
    expect(detectAskType("설치 얼마나 걸려요")).toBe("when")
    expect(detectAskType("줌이랑 뭐가 달라요")).toBe("compare")
    expect(detectAskType("최대 몇 명까지 들어와요")).toBe("quantity")
    expect(detectAskType("다시보기 어디서 봐요")).toBe("where")
    expect(detectAskType("학생 초대 어떻게 해요")).toBe("howto")
    expect(detectAskType("판서가 뭐예요")).toBe("definition")
    expect(detectAskType("녹화 되나요")).toBe("yesno")
    expect(detectAskType("담당자가 누구예요")).toBe("who")
    expect(detectAskType("안녕")).toBeNull()
  })

  it("prepareText 는 브랜드 → 라우팅 풀이 → 정규화 → 묻는 꼴 → 꼬리 순서로 만든다", () => {
    const prepared = prepareText("클래스인 recording 어케 봐요?")
    expect(prepared.glossed).toContain("녹화")
    expect(prepared.glossed).toContain("어떻게")
    expect(prepared.askType).toBe("howto")
    expect(prepared.compact).not.toMatch(/\s/)
    expect(prepared.normalized).not.toContain("클래스인")
  })
})

describe("두 조각 나누기", () => {
  it("물음표 두 개면 앞 물음표에서 나눈다", () => {
    expect(segmentQuestion("맥북에도 깔리나요? 학생은 아이패드 쓰는데")).toEqual(["맥북에도 깔리나요?", "학생은 아이패드 쓰는데"])
  })

  it("'이랑·하고·그리고·,'로 나누고 왼쪽에 묻는 꼬리가 없으면 오른쪽 꼬리를 붙인다", () => {
    expect(segmentQuestion("녹화랑 출석 체크 되나요")).toEqual(["녹화 되나요", "출석 체크 되나요"])
    expect(segmentQuestion("최대 인원, 수업 시간 제한 있나요")).toEqual(["최대 인원 있나요", "수업 시간 제한 있나요"])
    expect(segmentQuestion("녹화도 되고 출석도 돼요?")).toEqual(["녹화도 돼요?", "출석도 돼요?"])
  })

  it("비교·관계 질문, 내용 없는 조각, 60자 넘는 질문은 나누지 않는다", () => {
    expect(segmentQuestion("줌이랑 뭐가 달라요")).toEqual(["줌이랑 뭐가 달라요"])
    expect(segmentQuestion("학생이랑 선생님 둘 다 볼 수 있나요")).toEqual(["학생이랑 선생님 둘 다 볼 수 있나요"])
    expect(segmentQuestion("수업하고 싶어요")).toEqual(["수업하고 싶어요"])
    const long = `${"녹화 파일을 다운로드해서 다른 곳에 올리고 싶은데 ".repeat(3)}가능한가요? 그리고 출석은요?`
    expect(segmentQuestion(long)).toEqual([long.trim()])
  })

  it("조각은 최대 2개다", () => {
    expect(segmentQuestion("녹화, 출석, 과제 다 되나요").length).toBeLessThanOrEqual(2)
  })
})

describe("범위 관문", () => {
  it("한국어·공백 뺀 80자 이하·문장 3개 이하만 범위 안이다", () => {
    expect(isCompiledScope("녹화 되나요?")).toBe(true)
    expect(checkCompiledScope("how do I record?").reason).toBe("not_korean")
    expect(checkCompiledScope("   ").reason).toBe("empty")
    expect(checkCompiledScope("가".repeat(81)).reason).toBe("too_long")
    expect(isCompiledScope("가".repeat(80))).toBe(true)
    expect(checkCompiledScope("안녕하세요. 로그인이 안 돼요. 비밀번호도 바꿨어요. 어떻게 해요?").reason).toBe("too_many_sentences")
  })

  it("CHATBOT_COMPILED_MAX_CHARS 로 길이 문턱을 바꾼다", () => {
    expect(isCompiledScope("녹화 파일 어디서 받아요", { CHATBOT_COMPILED_MAX_CHARS: "5" })).toBe(false)
    expect(isCompiledScope("녹화", { CHATBOT_COMPILED_MAX_CHARS: "abc" })).toBe(true)
  })

  it("문장 끝 어미 뒤 공백도 문장 경계로 센다", () => {
    expect(countSentences("로그인이 안 돼요 비밀번호 바꿨어요 다시 해도 안 돼요 도와주세요")).toBe(4)
    expect(countSentences("녹화 되나요")).toBe(1)
  })
})

describe("이미 해 본 동작(R3 a2, 규격 S14)", () => {
  it("이미 했다는 표지와 동작 말이 함께 있을 때만 그 동작 이름을 뽑는다", () => {
    expect(extractTriedActions("앱을 지웠다가 다시 깔았는데도 수업 알림이 안 와요")).toEqual(["재설치"])
    expect(extractTriedActions("재부팅도 해 봤고 업데이트도 했는데 화면이 까맣게 나와요")).toEqual(["업데이트", "재시작"])
    expect(extractTriedActions("로그아웃하고 다시 로그인했는데 그대로예요")).toEqual(["다시 로그인"])
    expect(extractTriedActions("칠판 껐다 켜도 터치가 안 돼요")).toEqual(["껐다 켜기"])
    expect(extractTriedActions("업데이트 후에도 화면 공유가 안 돼요")).toEqual(["업데이트"])
    expect(extractTriedActions("이미 여러 번 재설치했어요")).toEqual(["재설치"])
  })

  it("해 보라는 물음·원인 서술만 있으면 뽑지 않는다", () => {
    expect(extractTriedActions("재설치하면 되나요?")).toEqual([])
    expect(extractTriedActions("업데이트 자동으로 되나요")).toEqual([])
    expect(extractTriedActions("이미 수업이 시작됐는데 학생이 못 들어와요")).toEqual([])
  })
})

describe("시간 예산(§12.1 I4)", () => {
  it("정규화·묻는 꼴·꼬리·나누기는 질문당 평균 2ms 이하다", () => {
    const questions = ["수업 중에 애들 채팅 못치게 할 수 있나요?", "녹화랑 출석 체크 되나요", "클래스인 요금 얼마예요", "로그인이 안 돼요 ㅠㅠ", "how to invite students"]
    const started = performance.now()
    const rounds = 200
    for (let round = 0; round < rounds; round += 1) for (const question of questions) {
      prepareText(question)
      segmentQuestion(question)
    }
    const perQuestion = (performance.now() - started) / (rounds * questions.length)
    expect(perQuestion).toBeLessThan(2)
  })
})

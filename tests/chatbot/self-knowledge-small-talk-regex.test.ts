import { describe, expect, it } from "vitest"

import { CHATBOT_SELF_KNOWLEDGE_ENTRIES, findChatbotSelfKnowledgeEntry } from "@/lib/chatbot/self-knowledge"

const smallTalk = CHATBOT_SELF_KNOWLEDGE_ENTRIES.find((entry) => entry.key === "small_talk")!

// 고치기 전 정규식(중첩 반복 (?:\S+\s*){0,n})으로 판정해 고정한 표. 뜻이 그대로여야 한다.
const CAUGHT = [
  "수업 듣기 싫어", "공부하기 싫다", "학원 가기 싫어요", "일어나기 싫어", "오늘 수업 듣기 싫어요 ㅠㅠ",
  "숙제하기싫어", "아 진짜 수업하기 싫다", "너무 학교 가기 싫네", "수업듣기싫어", "하기싫음",
  "정말 정말 정말 수업 듣기 싫어", "아침에 일어나기 싫어서요", "가기싫다", "졸려", "졸려요",
  "심심해", "배고파요", "피곤해ㅠ", "피곤해요ㅋㅋ", "너무 졸려",
  "오늘 너무 졸려요", "나 진짜 심심해", "아 배고파 ㅎㅎ", "피곤해 ㅠㅠ ", "진짜 너무 피곤해요",
  "정말정말졸려", "심심해요ㅎ", "오늘따라 배고파", "공부 하기 싫어", "수업 하기 싫다",
]
const MISSED = [
  "클래스인 수업 입장이 안 돼요", "다시보기가 안 떠요", "숙제는 어떻게 내요?", "졸려서 수업 못 들었는데 다시보기 되나요", "심심해 보여요",
  "피곤해서 녹화본 볼래요 어디서 봐요", "", "안녕하세요", "요금 알려주세요", "저는 정말 오늘 아침에 일어나기 싫어",
  "하나 둘 셋 넷 수업 듣기 싫어", "하나 둘 셋 넷 다섯 졸려", "졸려 죽겠는데 방법 알려줘", "  수업 듣기 싫어", "  졸려",
  "배고파 밥 먹고 싶다 알려줘", "싫어", "하기", "수업 듣기", "졸려요 ㅋㅋ 그런데 질문",
  "아 졸려 정말", "그냥 심심해서 물어봐요", "피곤해 보이네요 선생님", "배고픈데", "ㅋㅋ 졸려 죽겠다",
  "졸려 ㅠ 근데", "피곤해 죽겠어요", "하나 둘 셋 넷 다섯 수업 듣기 싫어", "오늘은 정말 너무 힘들고 수업 듣기 싫어", "수업 시작",
]

describe("small_talk 정규식", () => {
  it("고치기 전과 같은 문장을 잡는다", () => {
    expect(CAUGHT).toHaveLength(30)
    expect(MISSED).toHaveLength(30)
    for (const s of CAUGHT) expect(smallTalk.match.test(s), s).toBe(true)
    for (const s of MISSED) expect(smallTalk.match.test(s), s).toBe(false)
  })

  it("공백 위치가 다른 짧은 입력에서도 옛 정규식과 같다", () => {
    const OLD =
      /^(?:\S+\s*){0,3}(?:수업\s*)?(?:듣기|하기|가기|공부하기|일어나기)\s*싫|^(?:\S+\s*){0,2}(?:졸려|심심해|배고파|피곤해)(?:요)?\s*(?:ㅋ|ㅠ|ㅎ)*\s*$/
    const parts = ["수업", "듣기", "하기", "가기", "싫어", "졸려", "요", "ㅋㅋ", "가", " ", "  ", "\n", "일어나기", "공부하기", "심심해"]
    let seed = 7
    const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n
    for (let i = 0; i < 4000; i++) {
      let s = ""
      for (let k = rnd(7); k > 0; k--) s += parts[rnd(parts.length)]
      expect(smallTalk.match.test(s), JSON.stringify(s)).toBe(OLD.test(s))
    }
  })

  // 공개 입력: 공백 없는 긴 입력이 요청 하나에 CPU 를 오래 쓰지 않아야 한다(느린 기계 여유로 50ms).
  const long: Record<string, string> = {
    한글_한_글자: "가".repeat(1000),
    이모지: "😀".repeat(500),
    영문_한_낱말: "a".repeat(1000),
    조합형_섞임: "ㅎ".repeat(300) + "한".repeat(233),
    공백만: " ".repeat(1000),
  }
  for (const [name, text] of Object.entries(long)) {
    it(`1000자 입력(${name})을 50ms 안에 판정한다`, () => {
      const started = performance.now()
      findChatbotSelfKnowledgeEntry(text)
      for (const entry of CHATBOT_SELF_KNOWLEDGE_ENTRIES) entry.match.test(text)
      expect(performance.now() - started).toBeLessThan(50)
    })
  }
})

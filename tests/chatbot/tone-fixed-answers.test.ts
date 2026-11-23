import { describe, expect, it } from "vitest"

import { buildFollowUp } from "@/lib/chatbot/follow-up"
import {
  MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER,
  UNVERIFIED_FIXED_ANSWERS,
  isUnverifiedFixedAnswerText,
} from "@/lib/chatbot/fixed-answers"
import { applyToneToAnswer, detectConversationTone } from "@/lib/chatbot/tone"

const QUESTIONS = ["죄송한데 이거 어떻게 하는지 잘 몰라서요", "처음이라 몰라서 걱정이에요", "처음이라 몰라서요", "급해요 어떡하죠"]
const GUIDE_OPENERS = /순서대로 알려 드릴게요|같이 차근차근|죄송해하지|걱정되셨|당황하셨/

describe("고정 답 다섯 개와 차단기 변형에는 첫마디와 영업 끝 질문이 붙지 않는다", () => {
  const answers = [...UNVERIFIED_FIXED_ANSWERS, MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER]
  for (const answer of answers) {
    for (const question of QUESTIONS) {
      it(`${answer.slice(0, 14)} × ${question}`, () => {
        const tone = detectConversationTone(question)
        expect(applyToneToAnswer(answer, tone, { offerHandoff: false })).toBe(answer)
        const followUp = buildFollowUp({
          question: `${question} 도입 견적이 궁금해요`,
          answer,
          category: "consultation",
          intent: "sales_consulting",
          handoffIntent: "demo",
          answerMode: "answer",
          tone,
        })
        expect(followUp).toBeNull()
      })
    }
  }

  it("화난 질문의 사과는 그대로 붙는다", () => {
    const tone = detectConversationTone("도대체 몇 번째예요 최악이네요")
    const out = applyToneToAnswer(UNVERIFIED_FIXED_ANSWERS[0], tone, { offerHandoff: false })
    expect(out).toContain("죄송")
    expect(out).not.toMatch(GUIDE_OPENERS)
  })

  it("차단기 변형에는 '잠시 뒤 다시'가 없고 고정 답으로 알아본다", () => {
    expect(MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER).not.toContain("잠시 뒤")
    expect(isUnverifiedFixedAnswerText(MODEL_UNAVAILABLE_CIRCUIT_OPEN_ANSWER)).toBe(true)
    expect(isUnverifiedFixedAnswerText("녹화는 수업 화면 아래 버튼으로 시작해요.")).toBe(false)
  })
})

describe("'이게 뭐예요?'", () => {
  it("단독이면 중립이다", () => {
    const tone = detectConversationTone("이게 뭐예요?")
    expect(tone.angry).toBe(false)
    expect(applyToneToAnswer("ClassIn은 온라인 수업 도구예요.", tone, { offerHandoff: false })).toBe("ClassIn은 온라인 수업 도구예요.")
  })
  it("다른 화남 신호와 함께면 화남이다", () => {
    expect(detectConversationTone("이게 뭐예요 진짜 최악이네").angry).toBe(true)
    expect(detectConversationTone("이게 뭐예요!!").angry).toBe(true)
    expect(detectConversationTone("세 번째 문의인데 이게 뭐예요").angry).toBe(true)
  })
})

describe("priorKind", () => {
  const kind = (q: string) => detectConversationTone(q).priorKind
  it("같은 대화", () => {
    expect(kind("아까 그거 다시 알려주세요")).toBe("same_chat")
    expect(kind("해봤는데 또 안 돼요")).toBe("same_chat")
    expect(kind("아까 챗봇이 알려준 대로 했어요")).toBe("same_chat")
  })
  it("다른 창", () => {
    expect(kind("다른 창에서 챗봇이 알려준 거예요")).toBe("other_window")
    expect(kind("지난번 이 채팅에서 7일이라고 했잖아요")).toBe("other_window")
  })
  it("지난 문의", () => {
    expect(kind("지난주에 문의했는데 답이 없어요")).toBe("past_inquiry")
    expect(kind("어제 그거 아직도 안 고쳐졌어요")).toBe("past_inquiry")
  })
  it("관련 없으면 null 이고 기존 priorContext 값은 그대로다", () => {
    const tone = detectConversationTone("녹화는 어떻게 해요")
    expect(tone.priorKind).toBeNull()
    expect(tone.priorContext).toBeNull()
    expect(detectConversationTone("지난주에 문의했는데").priorContext).toBe("inquiry")
  })
})

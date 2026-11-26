import { describe, expect, it } from "vitest"

import { applyToneToAnswer, detectConversationTone } from "@/lib/chatbot/tone"

/**
 * R2 B5(두괄식): 말투 층의 공감 한마디는 첫 문단이 결론이면 그 다음 문단에 둔다. 목록·예고로 시작하거나 한 문단짜리 답은 지금처럼 맨 앞이고,
 * 화난·반복 문의의 사과는 맨 앞이다. 여러 번 입혀도 결과가 같다.
 */

describe("B5 tone: empathy line after the conclusion", () => {
  const anxious = detectConversationTone("걱정돼요 녹화가 안 남았으면 어떡하죠")
  const opener = "걱정되셨겠어요. 같이 차근차근 확인해 볼게요."

  it("puts the empathy line after the first paragraph when it is a conclusion", () => {
    const answer = "녹화본은 수업이 끝나고 몇 분 뒤에 올라와요.\n\n1. [코스]를 엽니다.\n2. [수업 기록]을 누릅니다."
    const toned = applyToneToAnswer(answer, anxious, { offerHandoff: false })
    expect(toned.split("\n\n")).toEqual(["녹화본은 수업이 끝나고 몇 분 뒤에 올라와요.", opener, "1. [코스]를 엽니다.\n2. [수업 기록]을 누릅니다."])
    expect(applyToneToAnswer(toned, anxious, { offerHandoff: false })).toBe(toned)
  })

  it("keeps the empathy line first for list-first, preview-first and one-paragraph answers", () => {
    for (const answer of ["1. [코스]를 엽니다.\n2. [수업 기록]을 누릅니다.", "아래 순서대로 따라 하시면 됩니다.\n\n1. [코스]를 엽니다.", "녹화본은 수업 뒤 몇 분 안에 올라와요."]) {
      expect(applyToneToAnswer(answer, anxious, { offerHandoff: false }).startsWith(opener), answer).toBe(true)
    }
  })

  it("keeps the apology first for angry messages", () => {
    const angry = detectConversationTone("도대체 왜 녹화가 안 돼요")
    const toned = applyToneToAnswer("녹화본은 수업 뒤 몇 분 안에 올라와요.\n\n1. [코스]를 엽니다.", angry, { offerHandoff: false })
    expect(toned.startsWith("불편을 드려 정말 죄송합니다.")).toBe(true)
  })
})

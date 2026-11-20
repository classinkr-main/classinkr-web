import { describe, expect, it } from "vitest"

import { appendFollowUp, buildFollowUp, detectAskedSlot } from "@/lib/chatbot/follow-up"
import { detectConversationTone } from "@/lib/chatbot/tone"

const base = {
  category: "consultation",
  intent: "sales_consulting",
  handoffIntent: "demo",
  answerMode: "answer",
  tone: detectConversationTone("도입 상담 받고 싶어요"),
}

describe("detectAskedSlot", () => {
  it("영업 끝 질문의 종류를 알아본다", () => {
    for (const question of ["도입 상담 받고 싶어요", "전자칠판 도입 상담", "도입을 생각 중이에요"]) {
      const answer = "상담으로 이어 드릴 수 있어요."
      const followUp = buildFollowUp({ ...base, question, answer })
      expect(followUp).not.toBeNull()
      const slot = detectAskedSlot(appendFollowUp(answer, followUp))
      expect(["size", "rooms", "mode", "timing", null]).toContain(slot)
    }
    const answer = appendFollowUp("상담으로 이어 드릴 수 있어요.", buildFollowUp({ ...base, question: "도입 상담 받고 싶어요", answer: "상담으로 이어 드릴 수 있어요." }))
    expect(detectAskedSlot(answer)).toBe("size")
  })
  it("기기 질문을 알아본다", () => {
    const answer = "1. 설정을 연다.\n\nPC는 왼쪽 아래\n\n쓰시는 기기가 PC인지 휴대폰·태블릿인지 알려 주시면, 그 기기에 맞는 순서만 짧게 다시 정리해 드릴게요."
    expect(detectAskedSlot(answer)).toBe("device")
  })
  it("보기 고르기 질문을 알아본다", () => {
    expect(detectAskedSlot("두 가지 방법이 있어요.\n\n수업 전과 수업 중 중에서 어느 쪽이 궁금하세요?")).toBe("choice")
  })
  it("물은 것이 없으면 null", () => {
    expect(detectAskedSlot("녹화는 수업 화면 아래 버튼으로 시작해요.")).toBeNull()
  })
})

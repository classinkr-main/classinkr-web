import { describe, expect, it } from "vitest"

import { buildPreviousTurn } from "@/scripts/lib/chatbot-live-eval-checks"
import { detectAskedSlot } from "@/lib/chatbot/follow-up"
import { buildPreviousTurnPayload, shouldShowUnresolvedNudge, type WidgetTurnMessage } from "@/lib/chatbot/widget-turn"

// 위젯이 보내는 직전 턴과 재촉 말풍선 규칙(2026-11-20 조사 G1·G17). 예시 글은 이 시험을 위해 지었다.

const DEVICE_LINE = "쓰시는 기기가 PC인지 휴대폰·태블릿인지 알려 주시면, 그 기기에 맞는 순서만 짧게 다시 정리해 드릴게요."

describe("buildPreviousTurnPayload", () => {
  it("가장 최근 질문과 그 답으로 직전 턴을 만들고, 답 끝 질문의 종류를 싣는다", () => {
    const messages: WidgetTurnMessage[] = [
      { role: "assistant", content: "안녕하세요!" },
      { role: "user", content: "다시보기 영상이  안 나와요" },
      { role: "assistant", content: `다시보기를 확인해 주세요.\n\n${DEVICE_LINE}`, answerMode: "direct_answer" },
    ]
    expect(buildPreviousTurnPayload(messages)).toEqual({ question: "다시보기 영상이 안 나와요", askedSlot: "device", answerMode: "direct_answer" })
  })

  it("측정 스크립트와 같은 직전 턴을 만든다", () => {
    const answer = `다시보기를 확인해 주세요.\n\n${DEVICE_LINE}`
    const fromWidget = buildPreviousTurnPayload([
      { role: "user", content: "다시보기 영상이 안 나와요" },
      { role: "assistant", content: answer, answerMode: "direct_answer" },
    ])
    expect(fromWidget).toEqual(buildPreviousTurn("다시보기 영상이 안 나와요", answer, "direct_answer", detectAskedSlot))
  })

  it("위젯이 붙인 재촉 말풍선은 건너뛰고, 질문은 200자로 자른다", () => {
    const long = "가".repeat(250)
    const turn = buildPreviousTurnPayload([
      { role: "user", content: long },
      { role: "assistant", content: "답이에요.", answerMode: "doc_suggestion" },
      { role: "assistant", content: "도입, 수업 운영, 계정/오류, 결제 중 어느 쪽인지 알려주시면 더 짧게 좁혀드릴게요." },
    ])
    expect(turn).toEqual({ question: "가".repeat(200), answerMode: "doc_suggestion" })
  })

  it("마지막 질문이 답을 받지 못했거나(오류) 대화가 없으면 보내지 않는다", () => {
    expect(buildPreviousTurnPayload([{ role: "assistant", content: "안녕하세요!" }])).toBeUndefined()
    expect(
      buildPreviousTurnPayload([
        { role: "user", content: "카메라가 안 켜져요" },
        { role: "assistant", content: "카메라 권한을 확인해 주세요.", answerMode: "direct_answer" },
        { role: "user", content: "휴대폰이요" },
        { role: "assistant", content: "지금은 답변을 불러오지 못했습니다." },
      ])
    ).toBeUndefined()
  })
})

describe("shouldShowUnresolvedNudge", () => {
  it("서버가 되묻거나 안내 답을 낸 뒤에는 세 번 이어져도 붙이지 않는다", () => {
    for (const answerMode of ["clarifying_question", "fallback"]) {
      expect(shouldShowUnresolvedNudge({ streak: 3, threshold: 3, answerMode })).toBe(false)
      expect(shouldShowUnresolvedNudge({ streak: 5, threshold: 3, answerMode })).toBe(false)
    }
  })

  it("그 밖의 못 풀림이 세 번 이어지면 붙이고, 상담 연결 답이면 붙이지 않는다", () => {
    expect(shouldShowUnresolvedNudge({ streak: 3, threshold: 3, answerMode: "doc_suggestion" })).toBe(true)
    expect(shouldShowUnresolvedNudge({ streak: 2, threshold: 3, answerMode: "doc_suggestion" })).toBe(false)
    expect(shouldShowUnresolvedNudge({ streak: 3, threshold: 3, answerMode: "handoff", needsHandoff: true })).toBe(false)
  })
})

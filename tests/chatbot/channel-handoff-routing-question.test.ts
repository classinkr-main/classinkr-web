import { describe, expect, it } from "vitest"

import { formatHandoffMessage, type ChannelTalkHandoffCandidate } from "@/lib/chatbot/channel-handoff"

// 2026-11-20 검토: 직전 턴으로 넓힌 검색용 질문으로 답했는데 상담 전환 본문에는 "휴대폰이요"만 남아 상담원이 맥락을 볼 수 없었다.
// 예시 질문은 이 시험을 위해 지었다.

const base: ChannelTalkHandoffCandidate = {
  answerEventId: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000002",
  question: "휴대폰이요",
  answer: "카메라가 안 켜지면 권한부터 확인해 주세요.",
  answerMode: "handoff",
  confidence: 0.5,
  unresolved: true,
  needsHandoff: true,
  handoffIntent: "support",
  sources: [],
}

describe("상담 전환 본문의 검색용 질문", () => {
  it("넓힌 검색용 질문이 있으면 고객 질문 아래에 한 줄로 싣는다", () => {
    const message = formatHandoffMessage({ ...base, routingQuestion: "카메라가 안 켜져요 휴대폰이요" }, ["needs_handoff"])
    expect(message).toContain("[고객 질문]\n휴대폰이요\n검색용 질문(직전 대화로 넓힘): 카메라가 안 켜져요 휴대폰이요")
  })

  it("넓히지 않았으면 그 줄이 없다", () => {
    expect(formatHandoffMessage(base, ["needs_handoff"])).not.toContain("검색용 질문")
    expect(formatHandoffMessage({ ...base, routingQuestion: "휴대폰이요" }, ["needs_handoff"])).not.toContain("검색용 질문")
  })
})

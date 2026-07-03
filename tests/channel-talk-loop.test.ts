import { describe, expect, it } from "vitest"

import {
  CHANNEL_TALK_LEAD_SOURCE,
  buildLeadPayloadFromConversation,
  buildPromotionPayload,
  isQuestionAlreadyPromoted,
  leadBoardDeepLink,
  truncateLabel,
} from "@/lib/channel-talk-loop"

describe("channel talk loop — FAQ 후보 승격", () => {
  const suggestion = {
    question: "구글클래스룸을 대체할 수 있는지 여쭤보고 싶습니다",
    count: 3,
    category: "consultation",
    lastAskedAt: "2026-06-18T01:00:00.000Z",
    sampleConversationIds: ["c1", "c2"],
  }

  it("draft starter 추천 질문 payload를 만든다", () => {
    const payload = buildPromotionPayload(suggestion)

    expect(payload.placement).toBe("starter")
    expect(payload.status).toBe("draft")
    expect(payload.prompt).toBe(suggestion.question)
    expect(payload.category).toBe("consultation")
    expect(payload.metadata).toMatchObject({
      source: "channel_talk_mining",
      count: 3,
      lastAskedAt: "2026-06-18T01:00:00.000Z",
      sampleConversationIds: ["c1", "c2"],
    })
  })

  it("label은 칩 노출용으로 잘라 말줄임표를 붙인다", () => {
    expect(truncateLabel("짧은 질문")).toBe("짧은 질문")
    const long = "가".repeat(40)
    const label = truncateLabel(long)
    expect(label.endsWith("…")).toBe(true)
    expect(Array.from(label).length).toBeLessThanOrEqual(25)
    expect(buildPromotionPayload({ ...suggestion, question: long }).label).toBe(label)
  })

  it("prompt의 연속 공백을 접는다", () => {
    const payload = buildPromotionPayload({
      ...suggestion,
      question: "  견적서   좀 받을 수 있을까요?  ",
    })
    expect(payload.prompt).toBe("견적서 좀 받을 수 있을까요?")
  })

  it("이미 등록된 prompt는 문장부호·대소문자가 달라도 중복으로 본다", () => {
    const existing = ["구글클래스룸을 대체할 수 있는지 여쭤보고 싶습니다!!", null, undefined]
    expect(isQuestionAlreadyPromoted(suggestion.question, existing)).toBe(true)
    expect(isQuestionAlreadyPromoted("전혀 다른 질문입니다", existing)).toBe(false)
    expect(isQuestionAlreadyPromoted("", existing)).toBe(false)
  })
})

describe("channel talk loop — 미매칭 상담 리드 등록", () => {
  const base = {
    id: "chat-1",
    messageCount: 4,
    firstQuestion: "65인치 견적서 좀 받을 수 있을까요?",
    lastMessageText: "네 확인 후 연락드릴게요",
    lastMessageAt: "2026-06-18T01:05:00.000Z",
  }

  it("연락처가 있으면 channel_talk source 리드 payload를 만든다", () => {
    const payload = buildLeadPayloadFromConversation({
      ...base,
      name: "김원장",
      phone: "010-1234-5678",
    })

    expect(payload).not.toBeNull()
    expect(payload?.source).toBe(CHANNEL_TALK_LEAD_SOURCE)
    expect(payload?.source_detail).toBe("채널톡 상담")
    expect(payload?.name).toBe("김원장")
    expect(payload?.phone).toBe("010-1234-5678")
    expect(payload?.message).toBe(base.firstQuestion)
    expect(payload?.notes).toContain("chat-1")
    expect(payload?.notes).toContain("첫 질문: 65인치 견적서")
    expect(payload?.notes).toContain("최근 메시지: 네 확인 후")
    expect(payload?.notes).toContain("메시지 4건 · 최근 2026-06-18")
  })

  it("이름·이메일·전화가 전부 없으면 null (API 400 예방)", () => {
    expect(buildLeadPayloadFromConversation(base)).toBeNull()
    expect(buildLeadPayloadFromConversation({ ...base, name: "  " })).toBeNull()
  })

  it("첫 질문·최근 메시지가 없어도 notes는 만들어진다", () => {
    const payload = buildLeadPayloadFromConversation({
      id: "chat-2",
      messageCount: 1,
      email: "owner@example.com",
    })
    expect(payload?.message).toBeUndefined()
    expect(payload?.notes).toContain("chat-2")
    expect(payload?.notes).toContain("메시지 1건")
  })

  it("리드 보드 딥링크는 ?lead=<id>로 드로어를 연다", () => {
    expect(leadBoardDeepLink("lead-123")).toBe("/admin/crm/customers/leads?lead=lead-123")
    expect(leadBoardDeepLink("a b")).toBe("/admin/crm/customers/leads?lead=a%20b")
  })
})

import { describe, expect, it } from "vitest"

import {
  buildCopilotHandoffRequest,
  copilotConversationHref,
} from "@/lib/channel-talk-copilot-handoff"

const conversation = {
  id: "chat-1",
  state: "opened",
  tags: ["하드웨어"],
  messageCount: 4,
  firstQuestion: "연락은 010-1234-5678 또는 someone@example.test 로 부탁드려요",
  lastMessageText: "카드 1234-5678-9012-3456 은 안 됩니다",
  lastMessageAt: "2026-11-25T01:00:00.000Z",
  matchedLeadId: "lead-9",
  matchedLeadOrg: "예시 기관",
  name: "테스트 고객",
  email: "someone@example.test",
  phone: "010-1234-5678",
}

describe("buildCopilotHandoffRequest", () => {
  it("fills the bridge tag and a masked customer context without name or contact", () => {
    const request = buildCopilotHandoffRequest(conversation, [
      { author: "customer", text: "전화는 010-2222-3333" },
      { author: "agent", text: "확인했습니다" },
    ])

    expect(request.tags).toContain("bridge:channel-talk")
    expect(request.customerContext).toMatchObject({
      source: "channel-talk",
      channelTalkChatId: "chat-1",
      leadId: "lead-9",
      organization: "예시 기관",
      contactOnFile: true,
    })
    const text = JSON.stringify(request)
    for (const secret of ["010-1234-5678", "someone@example.test", "1234-5678-9012-3456", "010-2222-3333", "테스트 고객"]) {
      expect(text).not.toContain(secret)
    }
    expect(text).toContain("[phone]")
    expect(request.initialMessage).toContain("[email]")
    expect(request.customerContext).not.toHaveProperty("name")
    expect(request.customerContext).not.toHaveProperty("phone")
    expect(request.customerContext).not.toHaveProperty("email")
  })

  it("keeps only the latest few transcript messages and works with no question", () => {
    const transcript = Array.from({ length: 10 }, (_, index) => ({ author: "customer" as const, text: `메시지 ${index}` }))
    const request = buildCopilotHandoffRequest({ id: "chat-2" }, transcript)
    expect(request.title).toBe("채널톡 상담")
    expect(request.initialMessage).toBeUndefined()
    expect((request.customerContext.recentMessages as unknown[]).length).toBe(6)
    expect(request.customerContext.contactOnFile).toBe(false)
  })

  it("builds the copilot deep link", () => {
    expect(copilotConversationHref("abc-123")).toBe("/admin/cs-chatbot?conversation=abc-123")
  })
})

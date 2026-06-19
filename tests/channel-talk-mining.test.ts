import { describe, expect, it } from "vitest"

import { mineFaqSuggestions } from "@/lib/channel-talk-mining"
import type { ChannelConversationRecord } from "@/lib/repositories/channel-conversations"

function conversation(
  id: string,
  messages: string[],
  firstQuestion = "💁🏻‍♀️ 고객 성공 매니저와 채팅 연결"
): ChannelConversationRecord {
  return {
    id,
    userChatId: id,
    state: "opened",
    tags: [],
    messageCount: messages.length,
    firstQuestion,
    firstAskedAt: "2026-06-18T01:00:00.000Z",
    lastMessageAt: "2026-06-18T01:05:00.000Z",
    syncedAt: "2026-06-18T01:06:00.000Z",
    transcript: messages.map((text, index) => ({
      id: `${id}-${index}`,
      author: "customer",
      text,
      at: `2026-06-18T01:0${index}:00.000Z`,
    })),
  }
}

describe("channel talk FAQ mining", () => {
  it("mines real customer questions from transcripts instead of menu labels", () => {
    const suggestions = mineFaqSuggestions(
      [
        conversation("c1", [
          "💁🏻‍♀️ 고객 성공 매니저와 채팅 연결",
          "안녕하세요 65인치 견적서 좀 받을 수 있을까요? buyer@example.com",
        ]),
        conversation("c2", [
          "010-1234-5678",
          "구글클래스룸을 대체할 수 있는지 여쭤보고 싶습니다",
        ]),
      ],
      [],
      { minCount: 1, limit: 10 }
    )

    const questions = suggestions.map((suggestion) => suggestion.question).join("\n")

    expect(questions).toContain("65인치 견적서")
    expect(questions).toContain("[email]")
    expect(questions).not.toContain("buyer@example.com")
    expect(questions).toContain("구글클래스룸")
    expect(questions).not.toContain("고객 성공 매니저")
    expect(questions).not.toContain("010-1234-5678")
  })

  it("excludes questions already covered by the golden set", () => {
    const suggestions = mineFaqSuggestions(
      [conversation("c1", ["구글클래스룸을 대체할 수 있는지 여쭤보고 싶습니다"])],
      ["구글클래스룸을 대체할 수 있는지 여쭤보고 싶습니다"],
      { minCount: 1 }
    )

    expect(suggestions).toHaveLength(0)
  })
})

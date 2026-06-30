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

  it("tags each mined question with the chatbot classifier category", () => {
    const suggestions = mineFaqSuggestions(
      [
        conversation("hw", ["전자칠판 마이크 사양이 어떻게 되나요?"]),
        conversation("bill", ["수업료 자동 결제 기능이 있나요?"]),
        conversation("class", ["구글클래스룸을 대체할 수 있나요?"]),
      ],
      [],
      { minCount: 1, limit: 10 }
    )

    const categoryFor = (needle: string) =>
      suggestions.find((suggestion) => suggestion.question.includes(needle))?.category

    expect(categoryFor("마이크")).toBe("hardware")
    expect(categoryFor("결제")).toBe("billing")
    expect(categoryFor("구글클래스룸")).toBe("classroom")
  })

  it("keeps up to 3 distinct verbatim samples, most recent first", () => {
    const at = (hour: string) => `2026-06-18T${hour}:00:00.000Z`
    const sampleConvo = (id: string, text: string, hour: string): ChannelConversationRecord => ({
      id,
      userChatId: id,
      state: "opened",
      tags: [],
      messageCount: 1,
      firstQuestion: "💁🏻‍♀️ 고객 성공 매니저와 채팅 연결",
      firstAskedAt: at(hour),
      lastMessageAt: at(hour),
      syncedAt: at("12"),
      transcript: [{ id: `${id}-0`, author: "customer", text, at: at(hour) }],
    })

    const [suggestion] = mineFaqSuggestions(
      [
        sampleConvo("a", "녹화 저장 위치가 어디인가요", "01"),
        sampleConvo("b", "녹화 저장 위치가 어디인가요?", "03"),
        sampleConvo("c", "녹화 저장 위치가 어디인가요!", "02"),
        sampleConvo("d", "녹화 저장 위치가 어디인가요...", "04"),
      ],
      [],
      { minCount: 1, limit: 10 }
    )

    // 문장 부호만 다른 4개가 한 군집으로 묶이고, count 는 대화 수(4)로 집계된다.
    expect(suggestion.count).toBe(4)
    expect(suggestion.sampleQuestions).toHaveLength(3)
    // 최근순(04→03→02)으로 정렬되고, 가장 오래된 01 표현은 잘려나간다.
    expect(suggestion.sampleQuestions[0]).toBe("녹화 저장 위치가 어디인가요...")
    expect(suggestion.sampleQuestions).not.toContain("녹화 저장 위치가 어디인가요")
  })

  it("ranks by frequency and honors minCount and limit", () => {
    const frequent = ["a1", "a2", "a3"].map((id) =>
      conversation(id, ["전자칠판 견적서를 받아볼 수 있나요?"])
    )
    const occasional = [conversation("b1", ["설치는 보통 며칠 걸리나요?"])]
    const rare = [conversation("c1", ["펜 팁은 따로 구매하나요?"])]

    const ranked = mineFaqSuggestions([...frequent, ...occasional, ...rare], [], {
      minCount: 2,
      limit: 10,
    })

    // minCount=2 라서 1회만 등장한 질문(occasional/rare)은 제외된다.
    expect(ranked).toHaveLength(1)
    expect(ranked[0].question).toContain("견적서")
    expect(ranked[0].count).toBe(3)

    const limited = mineFaqSuggestions([...frequent, ...occasional, ...rare], [], {
      minCount: 1,
      limit: 2,
    })
    expect(limited).toHaveLength(2)
    // 빈도 높은 질문이 항상 맨 앞에 온다.
    expect(limited[0].question).toContain("견적서")
  })
})

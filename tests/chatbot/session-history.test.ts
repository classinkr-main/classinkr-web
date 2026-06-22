import { describe, expect, it } from "vitest"

import { normalizeSessionHistoryForGemini } from "@/lib/chatbot/service"

describe("chatbot session history", () => {
  it("keeps only complete user/model turns in chronological order", () => {
    const rows = [
      { role: "assistant", content: "older assistant message outside the recent pair" },
      { role: "user", content: "첫 질문" },
      { role: "assistant", content: "첫 답변" },
      { role: "user", content: "둘째 질문" },
      { role: "assistant", content: "둘째 답변" },
      { role: "user", content: "아직 답변 없는 최신 질문" },
    ]

    expect(normalizeSessionHistoryForGemini(rows)).toEqual([
      { role: "user", parts: [{ text: "첫 질문" }] },
      { role: "model", parts: [{ text: "첫 답변" }] },
      { role: "user", parts: [{ text: "둘째 질문" }] },
      { role: "model", parts: [{ text: "둘째 답변" }] },
    ])
  })
})

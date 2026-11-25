import { describe, expect, it } from "vitest"

import {
  buildApprovedHistory,
  CONTEXT_RESET_KIND,
  isHumanApprovedAnswer,
  messagesAfterLastContextReset,
  type HistoryMessage,
} from "@/lib/internal-cs-chat/history"

function msg(id: string, role: string, content: string, extra: Partial<HistoryMessage> = {}): HistoryMessage {
  return { id, role, content, review_state: role === "assistant" ? "pending" : "not_required", corrected_content: null, ...extra }
}

const boundary = (id: string) =>
  msg(id, "system", "맥락 비움", { metadata: { kind: CONTEXT_RESET_KIND } })

describe("buildApprovedHistory", () => {
  it("keeps every user question and only human-written approved answers", () => {
    const history = buildApprovedHistory([
      msg("u1", "user", "질문 1"),
      msg("a1", "assistant", "AI 원문", { review_state: "approved", corrected_content: "사람이 고친 답" }),
      msg("u2", "user", "질문 2"),
      msg("a2", "assistant", "검토 전 답"),
    ])
    expect(history).toEqual([
      { role: "user", text: "질문 1" },
      { role: "model", text: "사람이 고친 답" },
      { role: "user", text: "질문 2" },
    ])
  })

  it("drops quick_approved rows and approvals whose correction equals the AI original", () => {
    const history = buildApprovedHistory([
      msg("a1", "assistant", "원문 A", { review_state: "approved", corrected_content: "원문 A", feedback_labels: [] }),
      msg("a2", "assistant", "원문 B", { review_state: "approved", corrected_content: "다른 글", feedback_labels: ["quick_approved"] }),
      msg("a3", "assistant", "원문 C", { review_state: "approved", corrected_content: "원문   C" }),
      msg("a4", "assistant", "원문 D", { review_state: "approved", corrected_content: null }),
    ])
    expect(history).toEqual([])
    expect(isHumanApprovedAnswer(msg("a", "assistant", "x", { review_state: "approved", corrected_content: "y" }))).toBe(true)
  })

  it("uses only the messages after the last context-reset boundary", () => {
    const messages = [
      msg("u1", "user", "예전 질문"),
      boundary("b1"),
      msg("u2", "user", "중간 질문"),
      boundary("b2"),
      msg("u3", "user", "경계 뒤 질문"),
      msg("a3", "assistant", "원문", { review_state: "approved", corrected_content: "경계 뒤 승인 답" }),
    ]
    expect(messagesAfterLastContextReset(messages).map((message) => message.id)).toEqual(["u3", "a3"])
    expect(buildApprovedHistory(messages)).toEqual([
      { role: "user", text: "경계 뒤 질문" },
      { role: "model", text: "경계 뒤 승인 답" },
    ])
    expect(buildApprovedHistory([...messages, boundary("b3")])).toEqual([])
  })

  it("keeps only the latest eight turns", () => {
    const turns = Array.from({ length: 12 }, (_, index) => msg(`u${index}`, "user", `질문 ${index}`))
    const history = buildApprovedHistory(turns)
    expect(history).toHaveLength(8)
    expect(history[0].text).toBe("질문 4")
  })
})

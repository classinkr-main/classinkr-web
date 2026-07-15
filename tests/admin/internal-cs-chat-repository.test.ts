import { describe, expect, it } from "vitest"

import {
  buildInternalCsConversationInsert,
  buildInternalCsMessageInsert,
  buildInternalCsReviewPatch,
} from "@/lib/repositories/internal-cs-chat"

describe("internal CS chat persistence policy", () => {
  it("creates new conversations in the human queue with audit ownership", () => {
    expect(buildInternalCsConversationInsert({ actor: "cs@example.test", title: "  녹화 문의  " })).toMatchObject({
      title: "녹화 문의",
      status: "queue",
      priority: "normal",
      created_by: "cs@example.test",
      updated_by: "cs@example.test",
    })
  })

  it("always stores assistant output as internal and pending human review", () => {
    expect(
      buildInternalCsMessageInsert({
        conversationId: "conversation-1",
        role: "assistant",
        content: "  초안 답변  ",
        modelProvider: "google",
        modelName: "gemini-3.5-flash",
        modelMode: "fast",
        actor: "cs@example.test",
      })
    ).toMatchObject({
      content: "초안 답변",
      visibility: "internal",
      review_state: "pending",
      regression_outcome: "not_evaluated",
      created_by: "cs@example.test",
    })
  })

  it("does not put human and system messages through assistant approval", () => {
    const insert = buildInternalCsMessageInsert({
      conversationId: "conversation-1",
      role: "internal_note",
      content: "본사 회신 대기",
      modelName: "must-be-ignored",
      actor: "cs@example.test",
    })
    expect(insert.review_state).toBe("not_required")
    expect(insert.model_name).toBeNull()
  })

  it("records the human actor, correction, and regression label in the review patch", () => {
    const patch = buildInternalCsReviewPatch({
      conversationId: "conversation-1",
      messageId: "message-1",
      decision: "changes_requested",
      reviewNote: "세대 확인 필요",
      correctedContent: "S86 3.0 기준으로 다시 확인합니다.",
      feedbackLabels: [" source_conflict ", "source_conflict"],
      regressionCandidate: true,
      regressionOutcome: "needs_fix",
      actor: "민재",
      now: new Date("2026-07-15T00:00:00.000Z"),
    })
    expect(patch).toEqual({
      review_state: "changes_requested",
      reviewed_by: "민재",
      reviewed_at: "2026-07-15T00:00:00.000Z",
      review_note: "세대 확인 필요",
      corrected_content: "S86 3.0 기준으로 다시 확인합니다.",
      feedback_labels: ["source_conflict"],
      regression_candidate: true,
      regression_outcome: "needs_fix",
    })
  })
})

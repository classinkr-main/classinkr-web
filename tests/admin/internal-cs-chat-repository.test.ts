import { describe, expect, it } from "vitest"

import {
  buildInternalCsAssetAnalysisPatch,
  buildInternalCsAssetInsert,
  buildInternalCsAssetReviewPatch,
  buildInternalCsConversationInsert,
  buildInternalCsIntegrationEventInsert,
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

  it("stores a private image asset with pending human review", () => {
    expect(
      buildInternalCsAssetInsert({
        conversationId: "5df88f98-b2cc-4e56-b1b1-384fc33ebde9",
        kind: "screenshot",
        source: "admin_upload",
        storagePath: "5df88f98-b2cc-4e56-b1b1-384fc33ebde9/hash.png",
        originalFileName: "  capture.png  ",
        mimeType: "image/png",
        sizeBytes: 1024,
        sha256: "A".repeat(64),
        actor: "cs@example.test",
      })
    ).toMatchObject({
      storage_bucket: "internal-cs-assets",
      original_file_name: "capture.png",
      sha256: "a".repeat(64),
      status: "uploaded",
      review_state: "pending",
      created_by: "cs@example.test",
    })
  })

  it("keeps AI image analysis pending while recording its model and completion time", () => {
    expect(
      buildInternalCsAssetAnalysisPatch({
        conversationId: "conversation-1",
        assetId: "asset-1",
        status: "ready",
        analysisSummary: "  결제 오류 화면  ",
        analysisPayload: { extractedText: "PAYMENT_FAILED" },
        modelProvider: "google",
        modelName: "gemini-3.5-flash",
        actor: "cs@example.test",
        analyzedAt: new Date("2026-07-16T00:00:00.000Z"),
      })
    ).toEqual({
      status: "ready",
      analysis_summary: "결제 오류 화면",
      analysis_payload: { extractedText: "PAYMENT_FAILED" },
      model_provider: "google",
      model_name: "gemini-3.5-flash",
      error_message: null,
      analyzed_at: "2026-07-16T00:00:00.000Z",
      review_state: "pending",
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      corrected_analysis: null,
      updated_by: "cs@example.test",
    })
  })

  it("requires a human actor to approve or correct image analysis", () => {
    expect(
      buildInternalCsAssetReviewPatch({
        conversationId: "conversation-1",
        assetId: "asset-1",
        decision: "changes_requested",
        reviewNote: "계정 번호는 마스킹",
        correctedAnalysis: "결제 실패 화면이며 계정 번호는 제외함",
        actor: "cs-owner@example.test",
        now: new Date("2026-07-16T01:00:00.000Z"),
      })
    ).toEqual({
      review_state: "changes_requested",
      reviewed_by: "cs-owner@example.test",
      reviewed_at: "2026-07-16T01:00:00.000Z",
      review_note: "계정 번호는 마스킹",
      corrected_analysis: "결제 실패 화면이며 계정 번호는 제외함",
      updated_by: "cs-owner@example.test",
    })
  })

  it("normalizes integration event identity for replay protection", () => {
    expect(
      buildInternalCsIntegrationEventInsert({
        conversationId: "conversation-1",
        direction: "inbound",
        transport: "mcp",
        eventType: "  cs.analysis.created  ",
        sourceSystem: "  desktop-agent  ",
        idempotencyKey: "  event-123  ",
        correlationId: "  trace-123  ",
        payload: { content: "analysis" },
        actor: "integration:desktop-agent",
      })
    ).toEqual({
      conversation_id: "conversation-1",
      asset_id: null,
      direction: "inbound",
      transport: "mcp",
      event_type: "cs.analysis.created",
      source_system: "desktop-agent",
      idempotency_key: "event-123",
      correlation_id: "trace-123",
      status: "accepted",
      payload: { content: "analysis" },
      result: {},
      created_by: "integration:desktop-agent",
    })
  })
})

import { describe, expect, it } from "vitest"

import {
  buildChannelConversationCaseUpsert,
  ChannelConversationCaseValidationError,
} from "@/lib/repositories/channel-conversation-cases"

function validInput() {
  return {
    conversationId: "chat-1",
    candidateKey: "recording:teacher-session",
    reviewState: "pending" as const,
    causeState: "suspected" as const,
    outcomeStatus: "solution_provided" as const,
    surfaceSymptom: "녹화가 중간에 끝났습니다.",
    actualCause: "교사가 수업에서 나간 뒤 다른 기기로 재입장했습니다.",
    diagnosticQuestions: ["수업 중 교사 계정이 퇴장했나요?"],
    resolution: "재입장 후 녹화를 다시 시작합니다.",
    evidenceMessageIds: ["agent-2"],
    linkedGuideSlug: "cs-recording-interrupted",
    sourceLastMessageAt: "2026-08-05T10:00:00.000Z",
    actor: "CS 담당자",
    now: new Date("2026-08-07T01:00:00.000Z"),
  }
}

describe("buildChannelConversationCaseUpsert", () => {
  it("normalizes a human-reviewed case without changing its evidence ids", () => {
    const row = buildChannelConversationCaseUpsert(validInput())

    expect(row).toMatchObject({
      conversation_id: "chat-1",
      candidate_key: "recording:teacher-session",
      review_state: "pending",
      cause_state: "suspected",
      outcome_status: "solution_provided",
      evidence_message_ids: ["agent-2"],
      reviewed_by: "CS 담당자",
      reviewed_at: "2026-08-07T01:00:00.000Z",
    })
  })

  it("requires an actual cause and evidence before approving a confirmed case", () => {
    expect(() =>
      buildChannelConversationCaseUpsert({
        ...validInput(),
        reviewState: "approved",
        causeState: "confirmed",
        actualCause: "",
        evidenceMessageIds: [],
      })
    ).toThrow(ChannelConversationCaseValidationError)

    expect(() =>
      buildChannelConversationCaseUpsert({
        ...validInput(),
        reviewState: "approved",
        causeState: "confirmed",
        evidenceMessageIds: [],
      })
    ).toThrow("근거 메시지")
  })

  it("allows unresolved and suspected findings to remain pending", () => {
    const unresolved = buildChannelConversationCaseUpsert({
      ...validInput(),
      causeState: "unresolved",
      actualCause: null,
      evidenceMessageIds: [],
    })

    expect(unresolved.actual_cause).toBeNull()
    expect(unresolved.evidence_message_ids).toEqual([])
  })

  it("rejects unsafe candidate keys and guide slugs", () => {
    expect(() =>
      buildChannelConversationCaseUpsert({ ...validInput(), candidateKey: "../../other" })
    ).toThrow("후보 키")
    expect(() =>
      buildChannelConversationCaseUpsert({ ...validInput(), linkedGuideSlug: "Guide/Unsafe" })
    ).toThrow("가이드 slug")
  })
})

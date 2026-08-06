import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getDurableConversationsByIds: vi.fn(),
  listChannelConversationCases: vi.fn(),
  upsertChannelConversationCase: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/channel-conversations", () => ({
  getDurableConversationsByIds: mocks.getDurableConversationsByIds,
}))

vi.mock("@/lib/repositories/channel-conversation-cases", () => {
  class ChannelConversationCaseValidationError extends Error {}
  return {
    CHANNEL_CASE_REVIEW_STATES: ["pending", "approved", "rejected"],
    CHANNEL_CASE_CAUSE_STATES: ["unresolved", "suspected", "confirmed"],
    CHANNEL_CASE_OUTCOME_STATUSES: [
      "unknown",
      "solution_provided",
      "customer_confirmed_resolved",
      "still_unresolved",
    ],
    ChannelConversationCaseValidationError,
    isChannelConversationCasesNotReadyError: (error: unknown) =>
      error instanceof Error && error.message === "not-ready",
    listChannelConversationCases: mocks.listChannelConversationCases,
    upsertChannelConversationCase: mocks.upsertChannelConversationCase,
  }
})

import { GET, PATCH } from "@/app/api/admin/channel-talk/conversations/[id]/cases/route"

const conversation = {
  id: "chat-1",
  userChatId: "chat-1",
  state: "closed" as const,
  tags: ["classroom"],
  firstQuestion: "학생 전화 010-1234-5678 코스가 안 보여요",
  firstAskedAt: "2026-08-06T05:00:00.000Z",
  lastMessageAt: "2026-08-06T05:03:00.000Z",
  syncedAt: "2026-08-06T05:04:00.000Z",
  messageCount: 3,
  transcript: [
    {
      id: "customer-1",
      author: "customer" as const,
      text: "학생 전화 010-1234-5678 코스가 안 보여요",
      at: "2026-08-06T05:00:00.000Z",
    },
    {
      id: "agent-1",
      author: "agent" as const,
      text: "확인 결과 수업 후 가입해서 이전 수업 데이터 권한이 없던 문제였습니다.",
      at: "2026-08-06T05:02:00.000Z",
    },
    {
      id: "customer-2",
      author: "customer" as const,
      text: "이제 잘 보여요",
      at: "2026-08-06T05:03:00.000Z",
    },
  ],
}

function context(id = "chat-1") {
  return { params: Promise.resolve({ id }) }
}

function request(method: "GET" | "PATCH" = "GET", body?: unknown) {
  return new NextRequest("https://classin.kr/api/admin/channel-talk/conversations/chat-1/cases", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    candidateKey: "late_joiner_replay:customer-1",
    reviewState: "approved",
    causeState: "confirmed",
    outcomeStatus: "customer_confirmed_resolved",
    surfaceSymptom: "학생 전화 010-1234-5678 코스가 안 보여요",
    actualCause: "담당자 이메일 cs@example.com 확인 결과 수업 후 가입 문제",
    diagnosticQuestions: ["수업 종료 후 가입했나요?"],
    resolution: "비밀번호: secret 설정 후 정상화",
    evidenceMessageIds: ["customer-1", "agent-1"],
    linkedGuideSlug: "cs-late-joiner-replay",
    ...overrides,
  }
}

describe("admin Channel Talk conversation case route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({
      source: "supabase",
      role: "ADMIN",
      name: "CS 담당자",
      userId: "admin-1",
      capabilities: [],
    })
    mocks.getDurableConversationsByIds.mockResolvedValue(
      new Map([[conversation.id, conversation]])
    )
    mocks.listChannelConversationCases.mockResolvedValue([])
  })

  it("returns the authentication response without reading a conversation", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    )

    const response = await GET(request(), context())

    expect(response.status).toBe(401)
    expect(mocks.getDurableConversationsByIds).not.toHaveBeenCalled()
  })

  it("returns redacted transcript suggestions and a non-blocking storage warning", async () => {
    mocks.listChannelConversationCases.mockRejectedValue(new Error("not-ready"))

    const response = await GET(request(), context())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.storageReady).toBe(false)
    expect(payload.transcript[0].text).toContain("[phone]")
    expect(payload.transcript[0].text).not.toContain("010-1234-5678")
    expect(payload.suggestions).toHaveLength(1)
    expect(payload.suggestions[0].causeState).toBe("confirmed")
  })

  it("returns 404 when the durable conversation does not exist", async () => {
    mocks.getDurableConversationsByIds.mockResolvedValue(new Map())

    const response = await GET(request(), context("missing"))

    expect(response.status).toBe(404)
  })

  it("rejects evidence ids that are absent from the source transcript", async () => {
    const response = await PATCH(
      request("PATCH", validBody({ evidenceMessageIds: ["missing"] })),
      context()
    )

    expect(response.status).toBe(400)
    expect(mocks.upsertChannelConversationCase).not.toHaveBeenCalled()
  })

  it("requires agent evidence before approving a confirmed cause", async () => {
    const response = await PATCH(
      request("PATCH", validBody({ evidenceMessageIds: ["customer-1"] })),
      context()
    )

    expect(response.status).toBe(400)
    expect(mocks.upsertChannelConversationCase).not.toHaveBeenCalled()
  })

  it("redacts editable PII and saves the reviewer and source version", async () => {
    mocks.upsertChannelConversationCase.mockImplementation(async (input) => ({
      id: "case-1",
      conversation_id: input.conversationId,
      candidate_key: input.candidateKey,
      review_state: input.reviewState,
      cause_state: input.causeState,
      outcome_status: input.outcomeStatus,
      surface_symptom: input.surfaceSymptom,
      actual_cause: input.actualCause,
      diagnostic_questions: input.diagnosticQuestions,
      resolution: input.resolution,
      evidence_message_ids: input.evidenceMessageIds,
      linked_guide_slug: input.linkedGuideSlug,
      source_last_message_at: input.sourceLastMessageAt,
      reviewed_by: input.actor,
      reviewed_at: "2026-08-07T00:00:00.000Z",
      created_at: "2026-08-07T00:00:00.000Z",
      updated_at: "2026-08-07T00:00:00.000Z",
    }))

    const response = await PATCH(request("PATCH", validBody()), context())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.upsertChannelConversationCase).toHaveBeenCalledWith(
      expect.objectContaining({
        surfaceSymptom: "학생 전화 [phone] 코스가 안 보여요",
        actualCause: "담당자 이메일 [email] 확인 결과 수업 후 가입 문제",
        resolution: "비밀번호 [redacted] 설정 후 정상화",
        actor: "CS 담당자",
        sourceLastMessageAt: conversation.lastMessageAt,
      })
    )
    expect(payload.case.reviewState).toBe("approved")
  })

  it("surfaces a missing review table as 503 on save", async () => {
    mocks.upsertChannelConversationCase.mockRejectedValue(new Error("not-ready"))

    const response = await PATCH(request("PATCH", validBody()), context())

    expect(response.status).toBe(503)
  })
})

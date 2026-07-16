import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { InternalCsAssetRow } from "@/lib/repositories/internal-cs-chat"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getInternalCsConversation: vi.fn(),
  createInternalCsMessage: vi.fn(),
  isInternalCsChatNotReadyError: vi.fn(() => false),
  buildInternalCsCopilotContext: vi.fn(),
  generateInternalCsAnswer: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  getInternalCsConversation: mocks.getInternalCsConversation,
  createInternalCsMessage: mocks.createInternalCsMessage,
  isInternalCsChatNotReadyError: mocks.isInternalCsChatNotReadyError,
}))

vi.mock("@/lib/internal-cs-chat/context", () => ({
  buildInternalCsCopilotContext: mocks.buildInternalCsCopilotContext,
}))

vi.mock("@/lib/internal-cs-chat/gemini", () => ({
  generateInternalCsAnswer: mocks.generateInternalCsAnswer,
}))

import {
  buildInternalCsAssetEvidence,
  POST,
} from "@/app/api/admin/cs-chat/conversations/[id]/generate/route"

const conversation = {
  id: "conversation-1",
  title: "녹화 문의",
  status: "active",
  priority: "normal",
  assignee_user_id: null,
  assignee_name: null,
  tags: ["topic:recording"],
  customer_context: {},
  created_by: "cs-owner",
  updated_by: "cs-owner",
  resolved_at: null,
  resolved_by: null,
  archived_at: null,
  archived_by: null,
  archive_reason: null,
  last_message_at: null,
  created_at: "2026-07-15T00:00:00.000Z",
  updated_at: "2026-07-15T00:00:00.000Z",
}

const previousMessages = [
  {
    id: "previous-user",
    conversation_id: "conversation-1",
    role: "user",
    content: "이전 질문",
    review_state: "not_required",
    corrected_content: null,
  },
  {
    id: "approved-assistant",
    conversation_id: "conversation-1",
    role: "assistant",
    content: "이전 AI 답변",
    review_state: "approved",
    corrected_content: "담당자가 승인한 수정 답변",
  },
  {
    id: "pending-assistant",
    conversation_id: "conversation-1",
    role: "assistant",
    content: "아직 검토하지 않은 답변",
    review_state: "pending",
    corrected_content: null,
  },
]

const sourceRefs = [{ id: "article-recording", label: "녹화 관리" }]
const generation = {
  answer: "검토 전 내부 CS 답변",
  mode: "fast",
  model: "gemini-3.5-flash",
  origin: "model",
  fallbackUsed: false,
  attemptedModels: ["gemini-3.5-flash"],
  citations: sourceRefs,
  reviewState: "pending",
  guardrails: [
    "cs_owner_review_required",
    "internal_only_until_approved",
    "unverified_claims_must_be_labeled",
  ],
}

function request(body: unknown) {
  return new NextRequest(
    "https://classin.kr/api/admin/cs-chat/conversations/conversation-1/generate",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

function routeContext(id = "conversation-1") {
  return { params: Promise.resolve({ id }) }
}

function userMessage() {
  return {
    id: "user-message-1",
    conversation_id: "conversation-1",
    role: "user",
    content: "녹화 권한 충돌을 확인해줘",
    review_state: "not_required",
  }
}

function assistantMessage() {
  return {
    id: "assistant-message-1",
    conversation_id: "conversation-1",
    role: "assistant",
    content: generation.answer,
    review_state: "pending",
    model_name: generation.model,
    model_mode: generation.mode,
  }
}

function setSuccessfulDefaults() {
  mocks.requireVerifiedAdminContext.mockResolvedValue({
    source: "supabase",
    role: "ADMIN",
    name: "CS 담당자",
    userId: "cs-user-1",
  })
  mocks.getInternalCsConversation.mockResolvedValue({
    conversation,
    messages: previousMessages,
  })
  mocks.buildInternalCsCopilotContext.mockResolvedValue({
    internalContext: "공개 근거 + 내부 운영 가이드 + 본사 소통 기준",
    sourceRefs,
    deterministicFallback: "담당자 검토 필요",
    publicEvidence: { answer: "공개 안전 초안", sources: [{ id: "source" }] },
    curatedEvidence: {
      entries: [
        {
          id: "software-current-scope",
          title: "소프트웨어 기능의 현행 범위",
          status: "conditional",
          externalUse: "reviewed_summary_allowed",
          summary: "현재 정본 기준",
        },
      ],
      recommendedTags: ["area:software"],
      reviewRequired: false,
      reviewReasons: [],
    },
  })
  mocks.generateInternalCsAnswer.mockResolvedValue(generation)
  mocks.createInternalCsMessage
    .mockResolvedValueOnce(userMessage())
    .mockResolvedValueOnce(assistantMessage())
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("internal CS attachment evidence", () => {
  it("labels pending image analysis as unverified context", () => {
    const evidence = buildInternalCsAssetEvidence([
      {
        id: "asset-1",
        original_file_name: "refund-screen.png",
        analysis_summary: "The screen shows a refund request.",
        analysis_payload: {
          extractedText: ["REFUND REQUESTED"],
          sensitiveDataWarnings: ["Account identifier is visible"],
        },
        review_state: "pending",
        corrected_analysis: null,
      } as unknown as InternalCsAssetRow,
    ])

    expect(evidence.count).toBe(1)
    expect(evidence.text).toContain("treat as unverified unless approved")
    expect(evidence.text).toContain("REFUND REQUESTED")
    expect(evidence.sourceRefs).toEqual([
      expect.objectContaining({
        id: "internal-cs-asset:asset-1",
        kind: "internal_asset",
        reviewState: "pending",
      }),
    ])
  })
})

describe("POST /api/admin/cs-chat/conversations/[id]/generate", () => {
  it("requires an authorized CS/admin session", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    )

    const response = await POST(request({ question: "문의" }), routeContext())

    expect(response.status).toBe(403)
    expect(mocks.getInternalCsConversation).not.toHaveBeenCalled()
  })

  it.each([
    [{}, "question is required"],
    [{ question: "문의", requestedMode: "turbo" }, "requestedMode"],
    [{ question: "문의", requiresEvidenceReview: "yes" }, "requiresEvidenceReview"],
  ])("returns 400 for invalid body fields", async (body, expectedError) => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })

    const response = await POST(request(body), routeContext())
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain(expectedError)
    expect(mocks.createInternalCsMessage).not.toHaveBeenCalled()
  })

  it("returns 404 without saving the user question when the conversation is missing", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.getInternalCsConversation.mockResolvedValue(null)

    const response = await POST(request({ question: "문의" }), routeContext("missing"))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe("Conversation not found")
    expect(json.result).toEqual({
      userMessageSaved: false,
      userMessageId: null,
      assistantMessageSaved: false,
    })
    expect(mocks.createInternalCsMessage).not.toHaveBeenCalled()
  })

  it("saves the user question once and the generated assistant message as pending review", async () => {
    setSuccessfulDefaults()

    const response = await POST(
      request({
        question: "녹화 권한 충돌을 확인해줘",
        requestedMode: "auto",
        requiresEvidenceReview: true,
      }),
      routeContext()
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.message).toMatchObject({
      id: "assistant-message-1",
      review_state: "pending",
    })
    expect(json.result).toMatchObject({
      userMessageSaved: true,
      userMessageId: "user-message-1",
      assistantMessageSaved: true,
      assistantMessageId: "assistant-message-1",
      reviewState: "pending",
    })

    expect(mocks.createInternalCsMessage).toHaveBeenNthCalledWith(1, {
      conversationId: "conversation-1",
      role: "user",
      content: "녹화 권한 충돌을 확인해줘",
      actor: "CS 담당자",
    })
    expect(mocks.generateInternalCsAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedMode: "auto",
        requiresEvidenceReview: true,
        history: [
          { role: "user", text: "이전 질문" },
          { role: "model", text: "담당자가 승인한 수정 답변" },
        ],
      })
    )
    expect(mocks.createInternalCsMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        role: "assistant",
        content: generation.answer,
        modelProvider: "google",
        modelName: "gemini-3.5-flash",
        modelMode: "fast",
        sourceRefs,
        metadata: expect.objectContaining({
          userMessageId: "user-message-1",
          guardrails: generation.guardrails,
          citations: sourceRefs,
          curatedKnowledgeIds: ["software-current-scope"],
          recommendedTags: ["area:software"],
        }),
      })
    )
  })

  it("adds a normalized topic line to the queue context when conversation tags resolve", async () => {
    setSuccessfulDefaults()
    mocks.getInternalCsConversation.mockResolvedValue({
      conversation: { ...conversation, tags: ["area:board", "topic:warranty"] },
      messages: previousMessages,
    })

    const response = await POST(
      request({ question: "보드 세대 확인" }),
      routeContext()
    )

    expect(response.status).toBe(201)
    expect(mocks.generateInternalCsAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        internalContext: expect.stringContaining("정규화 주제: hardware"),
      })
    )
  })

  it("forces evidence review when curated knowledge contains conflicts", async () => {
    setSuccessfulDefaults()
    mocks.buildInternalCsCopilotContext.mockResolvedValue({
      internalContext: "보드 세대 충돌",
      sourceRefs,
      deterministicFallback: "모델·세대 확인 필요",
      publicEvidence: { answer: null, sources: [] },
      curatedEvidence: {
        entries: [
          {
            id: "board-generations",
            title: "보드 라인업·세대·사양 충돌",
            status: "conflicting_sources",
            externalUse: "confirmation_required",
            summary: "세대 확인 필요",
          },
        ],
        recommendedTags: ["area:board", "evidence:conflict"],
        reviewRequired: true,
        reviewReasons: ["보드 라인업·세대·사양 충돌: 자료 충돌"],
      },
    })

    const response = await POST(
      request({ question: "S86 사양을 알려줘", requestedMode: "auto" }),
      routeContext()
    )

    expect(response.status).toBe(201)
    expect(mocks.buildInternalCsCopilotContext).toHaveBeenCalledWith(
      "S86 사양을 알려줘",
      { queueTags: conversation.tags, includeInternalDocs: true }
    )
    expect(mocks.generateInternalCsAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ requiresEvidenceReview: true })
    )
    expect(mocks.createInternalCsMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        metadata: expect.objectContaining({
          requestedEvidenceReview: false,
          requiresEvidenceReview: true,
          curatedEvidenceReviewReasons: ["보드 라인업·세대·사양 충돌: 자료 충돌"],
        }),
      })
    )
  })

  it("reports partial persistence when assistant-message storage fails after the user save", async () => {
    setSuccessfulDefaults()
    mocks.createInternalCsMessage
      .mockReset()
      .mockResolvedValueOnce(userMessage())
      .mockRejectedValueOnce(new Error("assistant insert failed"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await POST(
      request({ question: "녹화 권한 충돌을 확인해줘", requestedMode: "deep" }),
      routeContext()
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.result).toEqual({
      userMessageSaved: true,
      userMessageId: "user-message-1",
      assistantMessageSaved: false,
    })
  })
})

import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 내부 CS 미해결 신호(폴백 답변·수정요청)를 공개 챗봇과 같은 보강 큐(question_clusters)로
// 흘려보내는 유입 라인을 검증한다. upsertQuestionCluster 는 스파이로 대체하고, PII redaction 은
// 공개 챗봇과 동일한 실제 헬퍼를 그대로 통과시켜 실제 동작을 확인한다.
const mocks = vi.hoisted(() => ({
  upsertQuestionCluster: vi.fn(),
  createSupabaseAdminClient: vi.fn(() => ({ __client: "gap-ingest-test" })),
  requireVerifiedAdminContext: vi.fn(),
  reviewInternalCsMessage: vi.fn(),
  getInternalCsConversation: vi.fn(),
  createInternalCsMessage: vi.fn(),
  buildInternalCsCopilotContext: vi.fn(),
  generateInternalCsAnswer: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock("@/lib/chatbot/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chatbot/service")>(
    "@/lib/chatbot/service"
  )
  return { ...actual, upsertQuestionCluster: mocks.upsertQuestionCluster }
})

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/internal-cs-chat", () => ({
  INTERNAL_CS_REGRESSION_OUTCOMES: ["not_evaluated", "pass", "needs_fix", "promoted", "excluded"],
  isInternalCsChatNotReadyError: vi.fn(() => false),
  reviewInternalCsMessage: mocks.reviewInternalCsMessage,
  getInternalCsConversation: mocks.getInternalCsConversation,
  createInternalCsMessage: mocks.createInternalCsMessage,
}))

vi.mock("@/lib/internal-cs-chat/context", () => ({
  buildInternalCsCopilotContext: mocks.buildInternalCsCopilotContext,
}))

vi.mock("@/lib/internal-cs-chat/gemini", () => ({
  generateInternalCsAnswer: mocks.generateInternalCsAnswer,
}))

import { ingestInternalCsGap } from "@/lib/internal-cs-chat/gap-ingest"
import { PATCH } from "@/app/api/admin/cs-chat/conversations/[id]/messages/[messageId]/route"
import { POST as generatePost } from "@/app/api/admin/cs-chat/conversations/[id]/generate/route"

async function importRealService() {
  return vi.importActual<typeof import("@/lib/chatbot/service")>("@/lib/chatbot/service")
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("ingestInternalCsGap", () => {
  it("routes a fallback signal into upsertQuestionCluster with the internal_cs_fallback source and one reference", async () => {
    await ingestInternalCsGap({
      question: "녹화가 안 돼요",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      source: "internal_cs_fallback",
    })

    expect(mocks.upsertQuestionCluster).toHaveBeenCalledTimes(1)
    expect(mocks.upsertQuestionCluster).toHaveBeenCalledWith(
      expect.anything(),
      null,
      { redacted: "녹화가 안 돼요" },
      null,
      null,
      {
        source: "internal_cs_fallback",
        internalCsRef: { conversationId: "conversation-1", messageId: "assistant-1" },
      }
    )
  })

  it("redacts phone numbers and emails before storing the canonical question", async () => {
    await ingestInternalCsGap({
      question: "전화  010-1234-5678 메일 test@classin.com 확인 바랍니다",
      conversationId: "conversation-2",
      messageId: "assistant-2",
      source: "internal_cs_review",
    })

    expect(mocks.upsertQuestionCluster).toHaveBeenCalledTimes(1)
    const call = mocks.upsertQuestionCluster.mock.calls[0]
    expect(call[2]).toEqual({ redacted: "전화 [phone] 메일 [email] 확인 바랍니다" })
    expect(call[5]).toMatchObject({ source: "internal_cs_review" })
  })

  it("skips ingestion when the question or identifiers are empty", async () => {
    await ingestInternalCsGap({
      question: "   ",
      conversationId: "conversation-3",
      messageId: "assistant-3",
      source: "internal_cs_fallback",
    })
    await ingestInternalCsGap({
      question: "정상 질문",
      conversationId: "",
      messageId: "assistant-4",
      source: "internal_cs_fallback",
    })

    expect(mocks.upsertQuestionCluster).not.toHaveBeenCalled()
  })

  it("never propagates internal failures — it logs once and resolves", async () => {
    mocks.upsertQuestionCluster.mockRejectedValueOnce(new Error("boom"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      ingestInternalCsGap({
        question: "실패 케이스",
        conversationId: "conversation-5",
        messageId: "assistant-5",
        source: "internal_cs_fallback",
      })
    ).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})

// 재유입 시 참조 누적/중복 제거/10개 캡 — 이 병합 규칙은 upsertQuestionCluster 안에 있으므로
// 스파이가 아닌 실제 함수를 가짜 supabase 로 구동해 확인한다.
describe("upsertQuestionCluster internal CS reference merge", () => {
  function makeSupabase(existingRow: unknown) {
    const calls: {
      updatePatch: Record<string, unknown> | null
      insertRow: Record<string, unknown> | null
      eventInserted: boolean
    } = { updatePatch: null, insertRow: null, eventInserted: false }

    const supabase = {
      from(table: string) {
        if (table === "question_cluster_events") {
          return {
            insert: () => {
              calls.eventInserted = true
              return Promise.resolve({ error: null })
            },
          }
        }
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: existingRow, error: null }) }),
          }),
          update: (patch: Record<string, unknown>) => {
            calls.updatePatch = patch
            return { eq: () => Promise.resolve({ error: null }) }
          },
          insert: (row: Record<string, unknown>) => {
            calls.insertRow = row
            return {
              select: () => ({ single: async () => ({ data: { id: "cluster-new" }, error: null }) }),
            }
          },
        }
      },
    }
    return { supabase, calls }
  }

  function refs(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      conversationId: `conversation-${index}`,
      messageId: `message-${index}`,
    }))
  }

  it("prepends the newest reference and caps the accumulated list at 10", async () => {
    const service = await importRealService()
    const { supabase, calls } = makeSupabase({
      id: "cluster-1",
      sample_questions: ["기존 질문"],
      metadata: { source: "internal_cs_review", internalCs: refs(10) },
    })

    await service.upsertQuestionCluster(
      supabase as never,
      null,
      { redacted: "재유입 질문" },
      null,
      null,
      {
        source: "internal_cs_fallback",
        internalCsRef: { conversationId: "conversation-new", messageId: "message-new" },
      }
    )

    const metadata = calls.updatePatch?.metadata as {
      source: string
      internalCs: { conversationId: string; messageId: string }[]
    }
    expect(metadata.internalCs).toHaveLength(10)
    expect(metadata.internalCs[0]).toEqual({
      conversationId: "conversation-new",
      messageId: "message-new",
    })
    // 가장 오래된 참조(message-9)는 캡으로 밀려난다.
    expect(metadata.internalCs.some((ref) => ref.messageId === "message-9")).toBe(false)
    // 기존 source 는 보존된다 (최초 유입 경로 표시 유지).
    expect(metadata.source).toBe("internal_cs_review")
    // 기존 status(ignored/published 포함)는 되돌리지 않는다 — 업데이트 패치에 status 없음.
    expect(calls.updatePatch).not.toHaveProperty("status")
  })

  it("removes a duplicate messageId instead of growing the list", async () => {
    const service = await importRealService()
    const { supabase, calls } = makeSupabase({
      id: "cluster-1",
      sample_questions: [],
      metadata: { internalCs: refs(3) },
    })

    await service.upsertQuestionCluster(
      supabase as never,
      null,
      { redacted: "중복 재유입" },
      null,
      null,
      {
        source: "internal_cs_review",
        internalCsRef: { conversationId: "conversation-1", messageId: "message-1" },
      }
    )

    const metadata = calls.updatePatch?.metadata as {
      internalCs: { conversationId: string; messageId: string }[]
    }
    expect(metadata.internalCs).toHaveLength(3)
    expect(metadata.internalCs[0]).toEqual({ conversationId: "conversation-1", messageId: "message-1" })
    expect(metadata.internalCs.filter((ref) => ref.messageId === "message-1")).toHaveLength(1)
  })

  it("inserts a new cluster with the internal source and skips the answer-event link when there is no answer event", async () => {
    const service = await importRealService()
    const { supabase, calls } = makeSupabase(null)

    await service.upsertQuestionCluster(
      supabase as never,
      null,
      { redacted: "신규 내부 CS 질문" },
      null,
      null,
      {
        source: "internal_cs_fallback",
        internalCsRef: { conversationId: "conversation-9", messageId: "message-9" },
      }
    )

    expect(calls.insertRow?.status).toBe("candidate")
    expect(calls.insertRow?.metadata).toEqual({
      source: "internal_cs_fallback",
      internalCs: [{ conversationId: "conversation-9", messageId: "message-9" }],
    })
    expect(calls.eventInserted).toBe(false)
  })
})

// 검토 PATCH 훅 — changes_requested 전이 시 선행 user 질문을 자동 유입, excludeFromGapQueue 시 건너뜀.
describe("message review PATCH gap ingestion hook", () => {
  const conversationId = "conversation-review"
  const assistantMessageId = "assistant-msg-1"

  function reviewedMessage(reviewState: string) {
    return {
      id: assistantMessageId,
      conversation_id: conversationId,
      role: "assistant",
      review_state: reviewState,
      metadata: { userMessageId: "user-msg-1" },
    }
  }

  function conversationWithQuestion() {
    return {
      conversation: { id: conversationId, tags: [] },
      messages: [
        {
          id: "user-msg-1",
          role: "user",
          content: "학원 결제 연동 되나요",
          created_at: "2026-07-16T00:00:00.000Z",
        },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "검토 전 초안",
          created_at: "2026-07-16T00:00:01.000Z",
        },
      ],
      assets: [],
      integrationEvents: [],
    }
  }

  function patchRequest(body: Record<string, unknown>) {
    return new NextRequest(
      `https://classin.kr/api/admin/cs-chat/conversations/${conversationId}/messages/${assistantMessageId}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    )
  }

  function routeContext() {
    return { params: Promise.resolve({ id: conversationId, messageId: assistantMessageId }) }
  }

  async function runPatch(body: Record<string, unknown>, options: { lookupFails?: boolean } = {}) {
    mocks.requireVerifiedAdminContext.mockResolvedValue({
      role: "ADMIN",
      name: "CS 담당자",
      userId: "cs-1",
    })
    if (options.lookupFails) {
      mocks.getInternalCsConversation.mockRejectedValue(new Error("lookup failed"))
    } else {
      mocks.getInternalCsConversation.mockResolvedValue(conversationWithQuestion())
    }
    return PATCH(patchRequest(body), routeContext())
  }

  it("ingests the preceding user question as an internal_cs_review gap on changes_requested", async () => {
    mocks.reviewInternalCsMessage.mockResolvedValue(reviewedMessage("changes_requested"))

    const response = await runPatch({ decision: "changes_requested", reviewNote: "표현 수정" })
    expect(response.status).toBe(200)

    expect(mocks.upsertQuestionCluster).toHaveBeenCalledTimes(1)
    const call = mocks.upsertQuestionCluster.mock.calls[0]
    expect(call[2]).toEqual({ redacted: "학원 결제 연동 되나요" })
    expect(call[5]).toEqual({
      source: "internal_cs_review",
      internalCsRef: { conversationId, messageId: assistantMessageId },
    })
  })

  it("skips ingestion when excludeFromGapQueue is true", async () => {
    mocks.reviewInternalCsMessage.mockResolvedValue(reviewedMessage("changes_requested"))

    const response = await runPatch({ decision: "changes_requested", excludeFromGapQueue: true })
    expect(response.status).toBe(200)

    expect(mocks.upsertQuestionCluster).not.toHaveBeenCalled()
    expect(mocks.getInternalCsConversation).not.toHaveBeenCalled()
  })

  it("does not ingest when the decision is not changes_requested", async () => {
    mocks.reviewInternalCsMessage.mockResolvedValue(reviewedMessage("approved"))

    const response = await runPatch({ decision: "approved" })
    expect(response.status).toBe(200)

    expect(mocks.upsertQuestionCluster).not.toHaveBeenCalled()
  })

  it("keeps the review response successful when the conversation lookup for ingestion fails", async () => {
    mocks.reviewInternalCsMessage.mockResolvedValue(reviewedMessage("changes_requested"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await runPatch({ decision: "changes_requested" }, { lookupFails: true })

    expect(response.status).toBe(200)
    expect(mocks.upsertQuestionCluster).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it("rejects a non-boolean excludeFromGapQueue", async () => {
    const response = await runPatch({ decision: "changes_requested", excludeFromGapQueue: "yes" })

    expect(response.status).toBe(400)
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()
  })
})

// 생성 라우트 훅 — 모델이 전부 실패해 deterministic 폴백이 저장되면 그 질문은 지식 공백 신호다.
describe("generate route fallback gap ingestion hook", () => {
  const guardrails = [
    "cs_owner_review_required",
    "internal_only_until_approved",
    "unverified_claims_must_be_labeled",
  ]

  function generation(origin: "model" | "deterministic") {
    return {
      answer: origin === "deterministic" ? "AI 초안을 생성하지 못했습니다." : "모델 답변",
      mode: "fast",
      model: origin === "deterministic" ? null : "gemini-3.5-flash",
      origin,
      fallbackUsed: origin === "deterministic",
      attemptedModels: ["gemini-3.5-flash"],
      citations: [],
      reviewState: "pending",
      guardrails,
    }
  }

  function generateRequest(question: string) {
    return new NextRequest(
      "https://classin.kr/api/admin/cs-chat/conversations/conversation-1/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      }
    )
  }

  function setDefaults(origin: "model" | "deterministic") {
    mocks.requireVerifiedAdminContext.mockResolvedValue({
      role: "ADMIN",
      name: "CS 담당자",
      userId: "cs-1",
    })
    mocks.getInternalCsConversation.mockResolvedValue({
      conversation: {
        id: "conversation-1",
        title: "폴백 대화",
        status: "active",
        priority: "normal",
        tags: [],
      },
      messages: [],
      assets: [],
      integrationEvents: [],
    })
    mocks.buildInternalCsCopilotContext.mockResolvedValue({
      internalContext: "내부 근거",
      sourceRefs: [],
      deterministicFallback: "확인된 자료만으로 답변해 주세요.",
      publicEvidence: { answer: null, sources: [] },
      curatedEvidence: null,
    })
    mocks.generateInternalCsAnswer.mockResolvedValue(generation(origin))
    mocks.createInternalCsMessage
      .mockReset()
      .mockResolvedValueOnce({ id: "user-message-1", role: "user" })
      .mockResolvedValueOnce({ id: "assistant-message-1", role: "assistant" })
  }

  it("ingests the question as internal_cs_fallback when the saved answer is the deterministic fallback", async () => {
    setDefaults("deterministic")

    const response = await generatePost(generateRequest("전자칠판 견적 기준을 알려줘"), {
      params: Promise.resolve({ id: "conversation-1" }),
    })

    expect(response.status).toBe(201)
    expect(mocks.upsertQuestionCluster).toHaveBeenCalledTimes(1)
    expect(mocks.upsertQuestionCluster).toHaveBeenCalledWith(
      expect.anything(),
      null,
      { redacted: "전자칠판 견적 기준을 알려줘" },
      null,
      null,
      {
        source: "internal_cs_fallback",
        internalCsRef: { conversationId: "conversation-1", messageId: "assistant-message-1" },
      }
    )
  })

  it("does not ingest when a model answered", async () => {
    setDefaults("model")

    const response = await generatePost(generateRequest("전자칠판 견적 기준을 알려줘"), {
      params: Promise.resolve({ id: "conversation-1" }),
    })

    expect(response.status).toBe(201)
    expect(mocks.upsertQuestionCluster).not.toHaveBeenCalled()
  })
})

import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 회귀 검수 루프의 백엔드 절반: 후보 목록 API(계약 5), 문서 매핑 시 promoted 전파(계약 7),
// 회귀 판정 전용 경량 PATCH 경로(검토 필드 불변). repo 함수는 실제 구현을 가짜 supabase 로
// 구동해 검증하고, 라우트 계층은 spy 로 배선을 검증한다.
const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  requireVerifiedAdminContext: vi.fn(),
  verifyAdmin: vi.fn(),
  updateQuestionCluster: vi.fn(),
  promoteRegressionOutcomes: vi.fn(),
  reviewInternalCsMessage: vi.fn(),
  updateInternalCsRegressionOutcome: vi.fn(),
  getInternalCsConversation: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
  verifyAdmin: mocks.verifyAdmin,
}))

vi.mock("@/lib/chatbot/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chatbot/service")>(
    "@/lib/chatbot/service"
  )
  return {
    ...actual,
    updateQuestionCluster: mocks.updateQuestionCluster,
    upsertQuestionCluster: vi.fn(),
  }
})

vi.mock("@/lib/repositories/internal-cs-chat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/internal-cs-chat")>(
    "@/lib/repositories/internal-cs-chat"
  )
  return {
    ...actual,
    promoteRegressionOutcomes: mocks.promoteRegressionOutcomes,
    reviewInternalCsMessage: mocks.reviewInternalCsMessage,
    updateInternalCsRegressionOutcome: mocks.updateInternalCsRegressionOutcome,
    getInternalCsConversation: mocks.getInternalCsConversation,
  }
})

import { GET as regressionCandidatesGet } from "@/app/api/admin/cs-chat/regression-candidates/route"
import { PATCH as questionsPatch } from "@/app/api/admin/chatbot/questions/[id]/route"
import { PATCH as messagesPatch } from "@/app/api/admin/cs-chat/conversations/[id]/messages/[messageId]/route"

async function importRealRepo() {
  return vi.importActual<typeof import("@/lib/repositories/internal-cs-chat")>(
    "@/lib/repositories/internal-cs-chat"
  )
}

function listChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ["select", "eq", "neq", "order"]) {
    chain[method] = vi.fn(() => chain)
  }
  chain.limit = vi.fn(() => Promise.resolve(result))
  return chain
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("listInternalCsRegressionCandidates", () => {
  const pendingRow = {
    id: "message-pending",
    conversation_id: "conversation-1",
    content: "미판정 답변",
    corrected_content: null,
    review_state: "changes_requested",
    regression_outcome: "not_evaluated",
    reviewed_at: "2026-07-16T02:00:00.000Z",
    updated_at: "2026-07-16T02:10:00.000Z",
  }
  const judgedRow = {
    id: "message-judged",
    conversation_id: "conversation-2",
    content: "  원본   답변  ",
    corrected_content: "수정된 답변",
    review_state: "approved",
    regression_outcome: "pass",
    reviewed_at: null,
    updated_at: "2026-07-16T01:00:00.000Z",
  }

  it("returns not_evaluated candidates first and maps rows to the contract shape", async () => {
    const repo = await importRealRepo()
    const pendingChain = listChain({ data: [pendingRow], error: null })
    const judgedChain = listChain({ data: [judgedRow], error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValueOnce(pendingChain).mockReturnValueOnce(judgedChain),
    })

    const items = await repo.listInternalCsRegressionCandidates(50)

    expect(items).toEqual([
      {
        id: "message-pending",
        conversationId: "conversation-1",
        excerpt: "미판정 답변",
        capturedAt: "2026-07-16T02:00:00.000Z",
        outcome: "not_evaluated",
        reviewState: "changes_requested",
      },
      {
        id: "message-judged",
        conversationId: "conversation-2",
        excerpt: "수정된 답변",
        capturedAt: "2026-07-16T01:00:00.000Z",
        outcome: "pass",
        reviewState: "approved",
      },
    ])
    // 미판정 우선 정렬은 2단계 쿼리로 구현된다: not_evaluated 먼저, 남은 자리만 판정 완료분.
    expect(pendingChain.eq).toHaveBeenCalledWith("regression_candidate", true)
    expect(pendingChain.eq).toHaveBeenCalledWith("regression_outcome", "not_evaluated")
    expect(pendingChain.limit).toHaveBeenCalledWith(50)
    expect(judgedChain.neq).toHaveBeenCalledWith("regression_outcome", "not_evaluated")
    expect(judgedChain.limit).toHaveBeenCalledWith(49)
  })

  it("skips the judged query when not_evaluated rows already fill the limit", async () => {
    const repo = await importRealRepo()
    const pendingChain = listChain({ data: [pendingRow], error: null })
    const from = vi.fn().mockReturnValue(pendingChain)
    mocks.createSupabaseAdminClient.mockReturnValue({ from })

    const items = await repo.listInternalCsRegressionCandidates(1)

    expect(items).toHaveLength(1)
    expect(from).toHaveBeenCalledTimes(1)
    expect(pendingChain.limit).toHaveBeenCalledWith(1)
  })
})

describe("promoteRegressionOutcomes", () => {
  it("updates only not_evaluated/needs_fix rows to promoted and deduplicates message ids", async () => {
    const repo = await importRealRepo()
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.update = vi.fn(() => chain)
    chain.in = vi.fn(() => chain)
    chain.select = vi.fn(() => Promise.resolve({ data: [{ id: "message-1" }], error: null }))
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) })

    const promoted = await repo.promoteRegressionOutcomes([
      { messageId: "message-1" },
      { messageId: "message-1" },
      { messageId: "message-2" },
    ])

    expect(promoted).toBe(1)
    expect(chain.update).toHaveBeenCalledWith({ regression_outcome: "promoted" })
    expect(chain.in).toHaveBeenCalledWith("id", ["message-1", "message-2"])
    // pass/excluded 는 불변 — outcome 필터가 SQL 레벨에서 보장한다.
    expect(chain.in).toHaveBeenCalledWith("regression_outcome", ["not_evaluated", "needs_fix"])
  })

  it("does not touch the database when there are no references", async () => {
    const repo = await importRealRepo()
    const from = vi.fn()
    mocks.createSupabaseAdminClient.mockReturnValue({ from })

    const promoted = await repo.promoteRegressionOutcomes([])

    expect(promoted).toBe(0)
    expect(from).not.toHaveBeenCalled()
  })
})

describe("updateInternalCsRegressionOutcome", () => {
  function updateChain(result: { data: unknown; error: unknown }) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.update = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.neq = vi.fn(() => chain)
    chain.select = vi.fn(() => chain)
    chain.maybeSingle = vi.fn(() => Promise.resolve(result))
    return chain
  }

  it("re-judges a non-promoted candidate (needs_fix→pass) and patches only regression_outcome", async () => {
    const repo = await importRealRepo()
    const row = { id: "message-1", regression_outcome: "pass", review_state: "changes_requested" }
    const chain = updateChain({ data: row, error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) })

    const result = await repo.updateInternalCsRegressionOutcome({
      conversationId: "conversation-1",
      messageId: "message-1",
      outcome: "pass",
    })

    expect(result).toEqual({ status: "updated", message: row })
    // 검토 필드(review_state/reviewed_*/corrected_content/feedback_labels)를 덮지 않는다.
    expect(chain.update).toHaveBeenCalledWith({ regression_outcome: "pass" })
    expect(chain.eq).toHaveBeenCalledWith("id", "message-1")
    expect(chain.eq).toHaveBeenCalledWith("conversation_id", "conversation-1")
    expect(chain.eq).toHaveBeenCalledWith("role", "assistant")
    // stale 패널 가드: promoted 행은 update 문 자체가 건드리지 않는다 (DB 불변).
    expect(chain.neq).toHaveBeenCalledWith("regression_outcome", "promoted")
  })

  it("reports a promoted conflict instead of overwriting a promoted judgement", async () => {
    const repo = await importRealRepo()
    const guardedUpdate = updateChain({ data: null, error: null })
    const existsCheck = updateChain({
      data: { id: "message-1", regression_outcome: "promoted" },
      error: null,
    })
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValueOnce(guardedUpdate).mockReturnValueOnce(existsCheck),
    })

    const result = await repo.updateInternalCsRegressionOutcome({
      conversationId: "conversation-1",
      messageId: "message-1",
      outcome: "pass",
    })

    expect(result).toEqual({ status: "promoted_conflict" })
    expect(guardedUpdate.neq).toHaveBeenCalledWith("regression_outcome", "promoted")
    // 후속 조회는 갱신이 아니라 존재/상태 확인이다.
    expect(existsCheck.update).not.toHaveBeenCalled()
  })

  it("distinguishes a missing message from a promoted guard", async () => {
    const repo = await importRealRepo()
    const guardedUpdate = updateChain({ data: null, error: null })
    const existsCheck = updateChain({ data: null, error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValueOnce(guardedUpdate).mockReturnValueOnce(existsCheck),
    })

    const result = await repo.updateInternalCsRegressionOutcome({
      conversationId: "conversation-1",
      messageId: "missing-message",
      outcome: "pass",
    })

    expect(result).toEqual({ status: "not_found" })
  })
})

describe("GET /api/admin/cs-chat/regression-candidates", () => {
  it("requires an authorized CS/admin session", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    )

    const response = await regressionCandidatesGet(
      new NextRequest("https://classin.kr/api/admin/cs-chat/regression-candidates")
    )

    expect(response.status).toBe(403)
  })

  it("responds with the contract item shape", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    const pendingChain = listChain({
      data: [
        {
          id: "message-1",
          conversation_id: "conversation-1",
          content: "후보 답변",
          corrected_content: null,
          review_state: "changes_requested",
          regression_outcome: "not_evaluated",
          reviewed_at: "2026-07-16T03:00:00.000Z",
          updated_at: "2026-07-16T03:00:00.000Z",
        },
      ],
      error: null,
    })
    const judgedChain = listChain({ data: [], error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValueOnce(pendingChain).mockReturnValueOnce(judgedChain),
    })

    const response = await regressionCandidatesGet(
      new NextRequest("https://classin.kr/api/admin/cs-chat/regression-candidates")
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      items: [
        {
          id: "message-1",
          conversationId: "conversation-1",
          excerpt: "후보 답변",
          capturedAt: "2026-07-16T03:00:00.000Z",
          outcome: "not_evaluated",
          reviewState: "changes_requested",
        },
      ],
    })
  })
})

describe("PATCH /api/admin/chatbot/questions/[id] promoted propagation", () => {
  const clusterId = "3f8e8b1c-2c3d-4e5f-8a9b-0c1d2e3f4a5b"
  const articleId = "9a7b6c5d-4e3f-4a1b-8c9d-0e1f2a3b4c5d"

  function questionsRequest(body: Record<string, unknown>) {
    return new NextRequest(`https://classin.kr/api/admin/chatbot/questions/${clusterId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  function questionsContext() {
    return { params: Promise.resolve({ id: clusterId }) }
  }

  function clusterWithRefs() {
    return {
      cluster: {
        id: clusterId,
        mapped_article_id: articleId,
        status: "approved",
        metadata: {
          source: "internal_cs_fallback",
          internalCs: [
            { conversationId: "conversation-1", messageId: "message-1" },
            { conversationId: "conversation-2", messageId: "message-2" },
          ],
        },
      },
    }
  }

  it("promotes referenced internal CS messages when the PATCH sets mappedArticleId", async () => {
    mocks.verifyAdmin.mockResolvedValue(undefined)
    mocks.updateQuestionCluster.mockResolvedValue(clusterWithRefs())
    mocks.promoteRegressionOutcomes.mockResolvedValue(2)

    const response = await questionsPatch(
      questionsRequest({ mappedArticleId: articleId, status: "approved" }),
      questionsContext()
    )

    expect(response.status).toBe(200)
    expect(mocks.promoteRegressionOutcomes).toHaveBeenCalledWith([
      { messageId: "message-1" },
      { messageId: "message-2" },
    ])
  })

  it("keeps the PATCH response successful when propagation fails", async () => {
    mocks.verifyAdmin.mockResolvedValue(undefined)
    mocks.updateQuestionCluster.mockResolvedValue(clusterWithRefs())
    mocks.promoteRegressionOutcomes.mockRejectedValue(new Error("propagation down"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await questionsPatch(
      questionsRequest({ mappedArticleId: articleId }),
      questionsContext()
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.cluster.id).toBe(clusterId)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it("does not propagate when the PATCH body does not set mappedArticleId", async () => {
    mocks.verifyAdmin.mockResolvedValue(undefined)
    mocks.updateQuestionCluster.mockResolvedValue(clusterWithRefs())

    const response = await questionsPatch(
      questionsRequest({ status: "approved" }),
      questionsContext()
    )

    expect(response.status).toBe(200)
    expect(mocks.promoteRegressionOutcomes).not.toHaveBeenCalled()
  })

  it("does not propagate when the cluster has no internal CS references", async () => {
    mocks.verifyAdmin.mockResolvedValue(undefined)
    mocks.updateQuestionCluster.mockResolvedValue({
      cluster: { id: clusterId, mapped_article_id: articleId, metadata: { source: "chatbot_mvp_exact_match" } },
    })

    const response = await questionsPatch(
      questionsRequest({ mappedArticleId: articleId }),
      questionsContext()
    )

    expect(response.status).toBe(200)
    expect(mocks.promoteRegressionOutcomes).not.toHaveBeenCalled()
  })
})

describe("PATCH messages/[messageId] regression-outcome-only path", () => {
  const conversationId = "conversation-judge"
  const messageId = "assistant-judge-1"

  function patchRequest(body: Record<string, unknown>) {
    return new NextRequest(
      `https://classin.kr/api/admin/cs-chat/conversations/${conversationId}/messages/${messageId}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    )
  }

  function routeContext() {
    return { params: Promise.resolve({ id: conversationId, messageId }) }
  }

  it("updates only the regression outcome without touching review fields or the conversation", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.updateInternalCsRegressionOutcome.mockResolvedValue({
      status: "updated",
      message: {
        id: messageId,
        regression_outcome: "excluded",
        review_state: "changes_requested",
      },
    })

    const response = await messagesPatch(patchRequest({ regressionOutcome: "excluded" }), routeContext())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.message.regression_outcome).toBe("excluded")
    expect(mocks.updateInternalCsRegressionOutcome).toHaveBeenCalledWith({
      conversationId,
      messageId,
      outcome: "excluded",
    })
    // 검토 경로는 호출되지 않는다 — review_state/reviewed_*/corrected_content/대화 상태 불변.
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()
  })

  it("returns 409 when judging a message the doc-mapping loop already promoted", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.updateInternalCsRegressionOutcome.mockResolvedValue({ status: "promoted_conflict" })

    const response = await messagesPatch(patchRequest({ regressionOutcome: "pass" }), routeContext())
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toBe("이미 문서 반영(promoted)된 항목입니다")
    expect(mocks.reviewInternalCsMessage).not.toHaveBeenCalled()
  })

  it("returns 404 when the assistant message does not exist", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.updateInternalCsRegressionOutcome.mockResolvedValue({ status: "not_found" })

    const response = await messagesPatch(patchRequest({ regressionOutcome: "pass" }), routeContext())

    expect(response.status).toBe(404)
  })

  it("rejects an unknown regression outcome", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })

    const response = await messagesPatch(patchRequest({ regressionOutcome: "banana" }), routeContext())

    expect(response.status).toBe(400)
    expect(mocks.updateInternalCsRegressionOutcome).not.toHaveBeenCalled()
  })

  it("still rejects a body without decision and without regressionOutcome", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })

    const response = await messagesPatch(patchRequest({}), routeContext())
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe("Invalid human review decision")
  })

  it("keeps the full review path unchanged when decision is present", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS 담당자" })
    mocks.reviewInternalCsMessage.mockResolvedValue({
      id: messageId,
      review_state: "approved",
      regression_outcome: "pass",
      metadata: {},
    })

    const response = await messagesPatch(
      patchRequest({ decision: "approved", regressionOutcome: "pass" }),
      routeContext()
    )

    expect(response.status).toBe(200)
    expect(mocks.reviewInternalCsMessage).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "approved", regressionOutcome: "pass" })
    )
    expect(mocks.updateInternalCsRegressionOutcome).not.toHaveBeenCalled()
  })
})

import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 러너 lib 는 spy 로 배선만 검증하고, 후보 조회 repo 함수는 실제 구현을 가짜 supabase 로 구동한다.
const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  requireVerifiedAdminContext: vi.fn(),
  runInternalCsRegressionEval: vi.fn(),
  createDefaultRegressionEvalDeps: vi.fn(() => ({ deps: true })),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/internal-cs-chat/regression-eval", () => ({
  runInternalCsRegressionEval: mocks.runInternalCsRegressionEval,
  createDefaultRegressionEvalDeps: mocks.createDefaultRegressionEvalDeps,
}))

import { POST as regressionEvalPost } from "@/app/api/admin/cs-chat/regression-eval/route"

async function importRealRepo() {
  return vi.importActual<typeof import("@/lib/repositories/internal-cs-chat")>(
    "@/lib/repositories/internal-cs-chat"
  )
}

function queryResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then?: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
  } = {}
  for (const method of ["select", "eq", "neq", "in", "order", "limit", "maybeSingle", "single"]) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function evalRequest(body?: Record<string, unknown>) {
  return new NextRequest("https://classin.kr/api/admin/cs-chat/regression-eval", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("listInternalCsRegressionEvalCandidates", () => {
  const notEvaluatedRow = {
    id: "assistant-1",
    conversation_id: "conversation-1",
    content: "미판정 답변",
    corrected_content: "  수정본  ",
    review_state: "changes_requested",
    metadata: { userMessageId: "user-1" },
  }

  it("queries not_evaluated regression candidates when no ids are given", async () => {
    const repo = await importRealRepo()
    const chain = queryResult({ data: [notEvaluatedRow], error: null })
    const from = vi.fn(() => chain)
    mocks.createSupabaseAdminClient.mockReturnValue({ from })

    const candidates = await repo.listInternalCsRegressionEvalCandidates({ limit: 5 })

    expect(candidates).toEqual([
      {
        messageId: "assistant-1",
        conversationId: "conversation-1",
        content: "미판정 답변",
        correctedContent: "수정본",
        reviewState: "changes_requested",
        metadata: { userMessageId: "user-1" },
      },
    ])
    expect(chain.eq).toHaveBeenCalledWith("role", "assistant")
    expect(chain.eq).toHaveBeenCalledWith("regression_candidate", true)
    expect(chain.eq).toHaveBeenCalledWith("regression_outcome", "not_evaluated")
    expect(chain.limit).toHaveBeenCalledWith(5)
  })

  it("fetches the explicit assistant messages when ids are provided (no outcome filter)", async () => {
    const repo = await importRealRepo()
    const chain = queryResult({ data: [notEvaluatedRow], error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) })

    await repo.listInternalCsRegressionEvalCandidates({ messageIds: ["assistant-1", "assistant-1"], limit: 5 })

    expect(chain.in).toHaveBeenCalledWith("id", ["assistant-1"])
    expect(chain.eq).toHaveBeenCalledWith("role", "assistant")
    expect(chain.eq).not.toHaveBeenCalledWith("regression_outcome", "not_evaluated")
  })
})

describe("POST /api/admin/cs-chat/regression-eval", () => {
  it("requires an authorized CS/admin session", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    )

    const response = await regressionEvalPost(evalRequest({}))

    expect(response.status).toBe(403)
    expect(mocks.runInternalCsRegressionEval).not.toHaveBeenCalled()
  })

  it("runs with defaults for an empty body and returns items + skipped", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.runInternalCsRegressionEval.mockResolvedValue({
      items: [{ messageId: "m1", conversationId: "c1", suggestedOutcome: "pass", rationale: "ok", regeneratedExcerpt: "x", judgeModel: "j" }],
      skipped: [{ messageId: "m2", reason: "no reference" }],
    })

    const response = await regressionEvalPost(evalRequest())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.runInternalCsRegressionEval).toHaveBeenCalledWith(
      { messageIds: undefined, limit: undefined },
      { deps: true }
    )
    expect(json.items).toHaveLength(1)
    expect(json.skipped).toHaveLength(1)
  })

  it("passes explicit messageIds and limit through", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })
    mocks.runInternalCsRegressionEval.mockResolvedValue({ items: [], skipped: [] })

    await regressionEvalPost(evalRequest({ messageIds: ["a", "b"], limit: 3 }))

    expect(mocks.runInternalCsRegressionEval).toHaveBeenCalledWith(
      { messageIds: ["a", "b"], limit: 3 },
      { deps: true }
    )
  })

  it("rejects a non-string messageIds array", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })

    const response = await regressionEvalPost(evalRequest({ messageIds: [1, 2] }))

    expect(response.status).toBe(400)
    expect(mocks.runInternalCsRegressionEval).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric limit", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS" })

    const response = await regressionEvalPost(evalRequest({ limit: "five" }))

    expect(response.status).toBe(400)
  })
})

import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 러너 lib 는 spy 로 배선만 검증하고, 후보 조회 repo 함수는 실제 구현을 가짜 supabase 로 구동한다.
const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  requireVerifiedAdminContext: vi.fn(),
  runInternalCsRegressionEval: vi.fn(),
  createDefaultRegressionEvalDeps: vi.fn(() => ({ deps: true })),
  checkRateLimitDistributed: vi.fn(),
}))

vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

// capability 검사(requireCsCopilotCapability)는 실제 구현을 쓴다 — 기본 부여·엄격 스위치 동작을 그대로 확인한다.
vi.mock("@/lib/admin-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth")
  return { ...actual, requireVerifiedAdminContext: mocks.requireVerifiedAdminContext }
})

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

beforeEach(() => {
  mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true, remaining: 2, resetAt: 0 })
})

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
        feedbackLabels: [],
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
  it("limits each user to 3 evaluation runs per minute", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS", userId: "cs-user-1" })
    mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: false, remaining: 0, resetAt: 0 })

    const response = await regressionEvalPost(evalRequest())

    expect(response.status).toBe(429)
    expect(mocks.checkRateLimitDistributed).toHaveBeenCalledWith(
      "cs-user-1",
      "admin-internal-cs-regression-eval",
      { windowMs: 60_000, max: 3 }
    )
    expect(mocks.runInternalCsRegressionEval).not.toHaveBeenCalled()
  })

  it("requires an authorized CS/admin session", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    )

    const response = await regressionEvalPost(evalRequest({}))

    expect(response.status).toBe(403)
    expect(mocks.runInternalCsRegressionEval).not.toHaveBeenCalled()
  })

  it("keeps the default capability grant for copilot roles and denies under the strict switch without cs.regression.run", async () => {
    mocks.runInternalCsRegressionEval.mockResolvedValue({ items: [], skipped: [] })
    mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "BRANCH", name: "CS", userId: "u1", capabilities: [] })
    expect((await regressionEvalPost(evalRequest({}))).status).toBe(200)

    vi.stubEnv("CS_COPILOT_STRICT_CAPABILITIES", "1")
    try {
      mocks.runInternalCsRegressionEval.mockClear()
      const denied = await regressionEvalPost(evalRequest({}))
      expect(denied.status).toBe(403)
      expect(await denied.json()).toMatchObject({ requiredCapability: "cs.regression.run" })
      expect(mocks.runInternalCsRegressionEval).not.toHaveBeenCalled()

      mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "CS", userId: "u1", capabilities: ["cs.regression.run"] })
      expect((await regressionEvalPost(evalRequest({}))).status).toBe(200)
    } finally {
      vi.unstubAllEnvs()
    }
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

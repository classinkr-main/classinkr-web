// 라운드4 P0-1 — 초안 배치 API(app/api/admin/branch/ledger-drafts/batch/route.ts) 회귀.
// tests/api/branch-ledger-drafts-route.test.ts의 vi.mock 관례(admin-auth·repository만 목,
// 파서(lib/branch/ledger-draft-body)는 실제 코드로 실행)를 그대로 따른다 — 배치 라우트가
// 단건과 같은 검증 문구를 쓰는지도 이 파서를 실제로 태워야 확인할 수 있다.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const requireVerifiedAdminContext = vi.fn()
const createBranchSalesLedgerDraft = vi.fn()
const updateBranchSalesLedgerDraft = vi.fn()
const applyBranchSalesLedgerDraft = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["ADMIN"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/branch-sales-ledger-drafts", () => ({
  createBranchSalesLedgerDraft,
  updateBranchSalesLedgerDraft,
  applyBranchSalesLedgerDraft,
  isBranchSalesLedgerDraftsNotReadyError: () => false,
  isBranchSalesLedgerDuplicateActiveCorrectionError: () => false,
  isBranchSalesLedgerNonPositiveAmountError: () => false,
}))

function mockAdmin() {
  requireVerifiedAdminContext.mockResolvedValue({
    source: "supabase",
    role: "ADMIN",
    name: "Tester",
    userId: "admin-1",
  })
}

function postBatchRequest(body: Record<string, unknown>) {
  return new NextRequest("https://classin.kr/api/admin/branch/ledger-drafts/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function patchBatchRequest(body: Record<string, unknown>) {
  return new NextRequest("https://classin.kr/api/admin/branch/ledger-drafts/batch", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const validCreateInput = {
  kind: "new-row",
  customer: "테스트 학원",
  month: "2026-08",
  amount: 1_000_000,
}

describe("POST /api/admin/branch/ledger-drafts/batch — 생성/수정 묶음", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("items가 201건이면 요청 전체를 400으로 거부하고 저장소를 호출하지 않는다", async () => {
    mockAdmin()
    const items = Array.from({ length: 201 }, () => ({ op: "create", input: validCreateInput }))
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await POST(postBatchRequest({ items }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(typeof json.error).toBe("string")
    expect(createBranchSalesLedgerDraft).not.toHaveBeenCalled()
  })

  it("items가 빈 배열이면 400으로 거부한다", async () => {
    mockAdmin()
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await POST(postBatchRequest({ items: [] }))

    expect(response.status).toBe(400)
    expect(createBranchSalesLedgerDraft).not.toHaveBeenCalled()
  })

  it("create 2건 중 1건이 amount<=0이면 그 건만 400이고 나머지는 성공하며, 응답은 200에 부분 실패 summary를 담는다", async () => {
    mockAdmin()
    createBranchSalesLedgerDraft.mockResolvedValue({
      draft: { id: "draft-1", ...validCreateInput },
      dedupedRecent: false,
    })
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await POST(
      postBatchRequest({
        items: [
          { op: "create", input: validCreateInput },
          { op: "create", input: { ...validCreateInput, amount: 0 } },
        ],
      }),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.results).toHaveLength(2)
    expect(json.results[0]).toMatchObject({ index: 0, ok: true, status: 201 })
    expect(json.results[1].ok).toBe(false)
    expect(json.results[1].status).toBe(400)
    expect(json.results[1].error).toContain("감액은 장부 가감으로")
    expect(json.summary).toEqual({ total: 2, succeeded: 1, failed: 1 })
    // amount<=0인 두 번째 항목은 저장소까지 가지 않고 파서 단계에서 걸러진다.
    expect(createBranchSalesLedgerDraft).toHaveBeenCalledTimes(1)
  })

  it("create 항목의 status:\"checked\"가 저장소 입력에 그대로 전달된다", async () => {
    mockAdmin()
    createBranchSalesLedgerDraft.mockResolvedValue({
      draft: { id: "draft-1", ...validCreateInput, status: "checked" },
      dedupedRecent: false,
    })
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await POST(
      postBatchRequest({ items: [{ op: "create", input: { ...validCreateInput, status: "checked" } }] }),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.results[0]).toMatchObject({ index: 0, ok: true, status: 201 })
    expect(createBranchSalesLedgerDraft).toHaveBeenCalledWith(
      expect.objectContaining({ status: "checked" }),
      "Tester",
    )
  })

  it("update 항목이 conflict를 반환하면 결과에 409 + draft를 담는다", async () => {
    mockAdmin()
    updateBranchSalesLedgerDraft.mockResolvedValue({
      outcome: "conflict",
      draft: { id: "draft-1", note: "다른 곳에서 이미 수정됨" },
    })
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await POST(
      postBatchRequest({
        items: [
          { op: "update", id: "draft-1", input: { note: "내 변경" }, expectedUpdatedAt: "2026-07-18T00:00:00Z" },
        ],
      }),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.results[0]).toMatchObject({ index: 0, ok: false, status: 409 })
    expect(json.results[0].draft.note).toBe("다른 곳에서 이미 수정됨")
    expect(json.summary).toEqual({ total: 1, succeeded: 0, failed: 1 })
  })

  it("update 항목이 checked-by-other를 반환하면 결과에 409 + reason을 담는다", async () => {
    mockAdmin()
    updateBranchSalesLedgerDraft.mockResolvedValue({
      outcome: "checked-by-other",
      draft: { id: "draft-1", checkedBy: "other-actor" },
    })
    const { POST } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await POST(
      postBatchRequest({
        items: [{ op: "update", id: "draft-1", input: { amount: 2_000_000, status: "checked" } }],
      }),
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.results[0]).toMatchObject({ index: 0, ok: false, status: 409, reason: "checked-by-other" })
    expect(json.results[0].draft.checkedBy).toBe("other-actor")
  })
})

describe("PATCH /api/admin/branch/ledger-drafts/batch — 상태 전이 묶음", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("ids가 0건이면 400으로 거부하고 저장소를 호출하지 않는다", async () => {
    mockAdmin()
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await PATCH(patchBatchRequest({ action: "check", ids: [] }))

    expect(response.status).toBe(400)
    expect(updateBranchSalesLedgerDraft).not.toHaveBeenCalled()
    expect(applyBranchSalesLedgerDraft).not.toHaveBeenCalled()
  })

  it('action="check"는 updateBranchSalesLedgerDraft(id, {status:"checked"}, actor)로 매핑된다', async () => {
    mockAdmin()
    updateBranchSalesLedgerDraft.mockResolvedValue({
      outcome: "updated",
      draft: { id: "draft-1", status: "checked" },
    })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await PATCH(patchBatchRequest({ action: "check", ids: ["draft-1"] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.results).toEqual([
      { id: "draft-1", ok: true, status: 200, draft: { id: "draft-1", status: "checked" } },
    ])
    expect(json.summary).toEqual({ total: 1, succeeded: 1, failed: 0 })
    expect(updateBranchSalesLedgerDraft).toHaveBeenCalledWith("draft-1", { status: "checked" }, "Tester")
  })

  it('action="apply"는 applyBranchSalesLedgerDraft(id, actor)로 매핑되고, null이면 409를 결과에 담는다', async () => {
    mockAdmin()
    applyBranchSalesLedgerDraft
      .mockResolvedValueOnce({ id: "draft-1", status: "applied" })
      .mockResolvedValueOnce(null)
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await PATCH(patchBatchRequest({ action: "apply", ids: ["draft-1", "draft-2"] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.results[0]).toEqual({ id: "draft-1", ok: true, status: 200, draft: { id: "draft-1", status: "applied" } })
    expect(json.results[1]).toEqual({
      id: "draft-2",
      ok: false,
      status: 409,
      error: "체크 완료 초안만 적용할 수 있습니다.",
    })
    expect(json.summary).toEqual({ total: 2, succeeded: 1, failed: 1 })
    expect(applyBranchSalesLedgerDraft).toHaveBeenNthCalledWith(1, "draft-1", "Tester")
    expect(applyBranchSalesLedgerDraft).toHaveBeenNthCalledWith(2, "draft-2", "Tester")
  })
})

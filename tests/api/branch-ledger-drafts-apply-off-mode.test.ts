// REV 시트 쓰기(ADR-011) 꺼짐 회귀 — 스위치가 꺼져 있으면(env 없음·Preview·글자가 "1" 이 아님) 장부 반영이 이 기능
// 전과 똑같아야 한다. 라우트([id]·batch)와 반영 서비스(lib/branch/sheet-writeback/apply-service.ts)는 실제 코드로 돌리고,
// 맨 끝 저장소(초안 RPC·감사 표)·인증·googleapis 만 목으로 둔다. 실제 시트·DB 호출 없음.
//
// "전과 같다"의 기준은 HEAD(0bc1d80f) 라우트의 반영 계약이다:
//   [id] PATCH action=apply → applyBranchSalesLedgerDraft(id, actor) 한 번, 성공 200 {draft},
//   null 409 "체크 완료 초안만 적용할 수 있습니다.", 미적용 503·활성 정정 중복 409·0 이하 금액 400(원문), 그 밖 500 고정 문구.
//   batch PATCH action=apply → ids 를 순서대로(중복도 그대로) 하나씩, 항목 결과 + summary, 한 요청 200건까지.
// 꺼짐에서 더해지는 것은 응답의 sheet(disabled)·summary.sheet·sheetWrite.mode 칸뿐이고, 시트·감사 표에는 닿지 않는다.
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const requireVerifiedAdminContext = vi.fn()
const applyBranchSalesLedgerDraft = vi.fn()
const fetchBranchSalesLedgerDraftById = vi.fn()
const reverseBranchSalesLedgerEntryByDraftId = vi.fn()

const NOT_READY = "매출 장부 내부 원본 DB 마이그레이션이 아직 적용되지 않았습니다."
const DUPLICATE = "이미 이 딜·월에 적용된 정정 항목이 있습니다. 기존 항목을 먼저 반전한 뒤 다시 적용하세요."
const NON_POSITIVE = "금액이 0 이하인 초안은 체크 완료할 수 없습니다. 금액을 입력한 뒤 다시 시도하세요."

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["ADMIN"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/branch-sales-ledger-drafts", () => ({
  applyBranchSalesLedgerDraft,
  fetchBranchSalesLedgerDraftById,
  reverseBranchSalesLedgerEntryByDraftId,
  createBranchSalesLedgerDraft: vi.fn(),
  updateBranchSalesLedgerDraft: vi.fn(),
  deleteBranchSalesLedgerDraft: vi.fn(),
  isBranchSalesLedgerDraftsNotReadyError: (e: unknown) => e instanceof Error && e.message === NOT_READY,
  isBranchSalesLedgerDuplicateActiveCorrectionError: (e: unknown) => e instanceof Error && e.message === DUPLICATE,
  isBranchSalesLedgerNonPositiveAmountError: (e: unknown) => e instanceof Error && e.message === NON_POSITIVE,
}))

// 시트 쓰기 감사 저장소 — 꺼짐 반영에서는 하나도 불리면 안 된다(되돌리기 가드의 조회만 예외 — 아래 reverse).
const insertSheetWriteAttempts = vi.fn()
const updateSheetWriteAttempt = vi.fn()
const findLedgerEntryIdByDraftId = vi.fn()
const latestSheetWritesByDraftIds = vi.fn(async () => new Map())
const SHEET_WRITES_NOT_READY = "매출 장부 시트 쓰기 기록 DB 마이그레이션이 아직 적용되지 않았습니다."
vi.mock("@/lib/repositories/branch-sales-ledger-sheet-writes", () => ({
  insertSheetWriteAttempts,
  updateSheetWriteAttempt,
  findLedgerEntryIdByDraftId,
  latestSheetWritesByDraftIds,
  lastSuccessfulRevSyncStartedAt: vi.fn(async () => null),
  isSheetWritesNotReadyError: (e: unknown) => e instanceof Error && e.message === SHEET_WRITES_NOT_READY,
}))

// googleapis(공용 sheets) — 꺼짐이면 읽기·쓰기 모두 0회.
const sheetsGet = vi.fn()
const sheetsBatchUpdate = vi.fn()
vi.mock("@/lib/google", () => ({
  sheets: { spreadsheets: { get: sheetsGet, batchUpdate: sheetsBatchUpdate } },
  drive: {},
}))

function mockAdmin() {
  requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", name: "Tester", userId: "admin-1" })
}

function patchOne(id: string, body: Record<string, unknown>) {
  return new NextRequest(`https://classin.kr/api/admin/branch/ledger-drafts/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function patchBatch(body: Record<string, unknown>) {
  return new NextRequest("https://classin.kr/api/admin/branch/ledger-drafts/batch", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const applied = (id: string) => ({ id, kind: "edit-row", status: "applied", appliedBy: "Tester" })
const DISABLED = { code: "disabled", message: "시트 쓰기 꺼짐 — 장부에만 반영됨" }

// 꺼짐이어야 하는 env 조합 — 글자 그대로 "1" + "production" 만 켜짐(config.ts).
const OFF_ENVS: Array<[string, { BRANCH_REV_SHEET_WRITE_ENABLED?: string; VERCEL_ENV?: string }]> = [
  ["env 없음", {}],
  ["Production 인데 스위치 없음", { VERCEL_ENV: "production" }],
  ["스위치 1 이지만 Preview", { BRANCH_REV_SHEET_WRITE_ENABLED: "1", VERCEL_ENV: "preview" }],
  ["스위치 1 이지만 로컬(VERCEL_ENV 없음)", { BRANCH_REV_SHEET_WRITE_ENABLED: "1" }],
  ["Production + 스위치 true", { BRANCH_REV_SHEET_WRITE_ENABLED: "true", VERCEL_ENV: "production" }],
  ["Production + 스위치 ' 1'", { BRANCH_REV_SHEET_WRITE_ENABLED: " 1", VERCEL_ENV: "production" }],
]

function stubEnvs(env: { BRANCH_REV_SHEET_WRITE_ENABLED?: string; VERCEL_ENV?: string }) {
  // 실행 환경에 남은 값이 섞이지 않게 둘 다 먼저 비운다.
  vi.stubEnv("BRANCH_REV_SHEET_WRITE_ENABLED", env.BRANCH_REV_SHEET_WRITE_ENABLED ?? "")
  vi.stubEnv("VERCEL_ENV", env.VERCEL_ENV ?? "")
}

function expectNoSheetOrAuditCalls() {
  expect(sheetsGet).not.toHaveBeenCalled()
  expect(sheetsBatchUpdate).not.toHaveBeenCalled()
  expect(insertSheetWriteAttempts).not.toHaveBeenCalled()
  expect(updateSheetWriteAttempt).not.toHaveBeenCalled()
  expect(findLedgerEntryIdByDraftId).not.toHaveBeenCalled()
  // 켜짐 갈래만 초안을 먼저 읽는다(체크 상태·baseline) — 꺼짐은 RPC 하나만.
  expect(fetchBranchSalesLedgerDraftById).not.toHaveBeenCalled()
}

beforeEach(() => {
  mockAdmin()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe.each(OFF_ENVS)("스위치 꺼짐(%s) — [id] PATCH action=apply 는 기능 전과 같다", (_label, env) => {
  beforeEach(() => stubEnvs(env))

  it("applyBranchSalesLedgerDraft(id, actor) 를 한 번만 부르고 200 {draft} — sheet 는 disabled", async () => {
    applyBranchSalesLedgerDraft.mockResolvedValueOnce(applied("draft-1"))
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "apply" }), params("draft-1"))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ draft: applied("draft-1"), sheet: DISABLED })
    expect(applyBranchSalesLedgerDraft).toHaveBeenCalledTimes(1)
    expect(applyBranchSalesLedgerDraft).toHaveBeenCalledWith("draft-1", "Tester")
    expectNoSheetOrAuditCalls()
  })

  it.each([
    ["체크 완료 아님(null)", null, 409, "체크 완료 초안만 적용할 수 있습니다."],
    ["마이그레이션 미적용", new Error(NOT_READY), 503, NOT_READY],
    ["활성 정정 중복", new Error(DUPLICATE), 409, DUPLICATE],
    ["0 이하 금액", new Error(NON_POSITIVE), 400, NON_POSITIVE],
    ["그 밖 오류", new Error("[branch-sales-ledger-drafts] 적용 실패: boom"), 500, "Failed to update sales ledger draft"],
  ])("%s → 기능 전 상태·문구 그대로", async (_case, outcome, status, error) => {
    if (outcome instanceof Error) applyBranchSalesLedgerDraft.mockRejectedValueOnce(outcome)
    else applyBranchSalesLedgerDraft.mockResolvedValueOnce(outcome)
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "apply" }), params("draft-1"))
    const json = await response.json()

    expect(response.status).toBe(status)
    expect(json.error).toBe(error)
    expect(json.draft).toBeUndefined()
    expect(json.sheet).toEqual(DISABLED)
    expect(applyBranchSalesLedgerDraft).toHaveBeenCalledTimes(1)
    expectNoSheetOrAuditCalls()
  })
})

describe.each(OFF_ENVS)("스위치 꺼짐(%s) — batch PATCH action=apply 는 기능 전과 같다", (_label, env) => {
  beforeEach(() => stubEnvs(env))

  it("ids 를 요청 순서대로(중복도 그대로) 하나씩 반영하고, 켜짐의 50건 상한을 걸지 않는다", async () => {
    // 켜짐이면 50건을 넘는 몫은 400 이다 — 꺼짐은 배치 상한(200)까지 기능 전처럼 전부 반영한다.
    const ids = [...Array.from({ length: 120 }, (_, index) => `draft-${index + 1}`), "draft-1"]
    applyBranchSalesLedgerDraft.mockImplementation(async (id: string) => applied(id))
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await PATCH(patchBatch({ action: "apply", ids }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(applyBranchSalesLedgerDraft.mock.calls).toEqual(ids.map((id) => [id, "Tester"]))
    expect(json.results).toHaveLength(ids.length)
    expect(json.results.every((result: { ok: boolean; status: number }) => result.ok && result.status === 200)).toBe(true)
    expect(json.results.map((result: { id: string }) => result.id)).toEqual(ids)
    expect(json.summary).toEqual({ total: ids.length, succeeded: ids.length, failed: 0, sheet: { disabled: ids.length } })
    expect(json.sheetWrite).toEqual({ mode: "off" })
    expectNoSheetOrAuditCalls()
  })

  it("부분 실패는 항목 결과에만 담고 요청은 200 — 기능 전 번역 그대로", async () => {
    applyBranchSalesLedgerDraft
      .mockResolvedValueOnce(applied("a"))
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error(DUPLICATE))
      .mockRejectedValueOnce(new Error("boom"))
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")

    const response = await PATCH(patchBatch({ action: "apply", ids: ["a", "b", "c", "d"] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.results).toEqual([
      { id: "a", ok: true, status: 200, draft: applied("a"), sheet: DISABLED },
      { id: "b", ok: false, status: 409, error: "체크 완료 초안만 적용할 수 있습니다.", sheet: DISABLED },
      { id: "c", ok: false, status: 409, error: DUPLICATE, sheet: DISABLED },
      { id: "d", ok: false, status: 500, error: "Failed to update sales ledger draft", sheet: DISABLED },
    ])
    expect(json.summary).toEqual({ total: 4, succeeded: 1, failed: 3, sheet: { disabled: 4 } })
    expectNoSheetOrAuditCalls()
  })
})

describe("스위치 꺼짐 — 되돌리기(reverse)는 시트에 쓴 기록이 없으면 기능 전과 같다", () => {
  beforeEach(() => stubEnvs({}))

  it("감사 표에 기록이 없으면 장부 상쇄를 그대로 부른다", async () => {
    reverseBranchSalesLedgerEntryByDraftId.mockResolvedValueOnce({ id: "entry-1", entryStatus: "reversed" })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "reverse", reason: "잘못 입력" }), params("draft-1"))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ entry: { id: "entry-1", entryStatus: "reversed" } })
    expect(reverseBranchSalesLedgerEntryByDraftId).toHaveBeenCalledWith("draft-1", "Tester", "잘못 입력")
  })

  it("감사 표가 아직 없어도(마이그레이션 전) 장부 상쇄를 그대로 부른다", async () => {
    latestSheetWritesByDraftIds.mockRejectedValueOnce(new Error(SHEET_WRITES_NOT_READY))
    reverseBranchSalesLedgerEntryByDraftId.mockResolvedValueOnce(null)
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")

    const response = await PATCH(patchOne("draft-1", { action: "reverse" }), params("draft-1"))

    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe("해당 초안에 연결된 적용 항목을 찾을 수 없습니다.")
    expect(reverseBranchSalesLedgerEntryByDraftId).toHaveBeenCalledWith("draft-1", "Tester", undefined)
  })
})

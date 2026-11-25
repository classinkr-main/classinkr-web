// 시트 고정(BRANCH_REV_SHEET_LOCKED_AT, D5) — 장부 초안 라우트의 응답 모양과 되돌리기 가드 문구(F-22).
//   GET  : 예정·적용 중이면 sheetWrite.lock = {lockedAt, active}, 적용 중이면 mode 는 플래그와 상관없이 "off". 없으면 칸 없음.
//   [id] : 시트에 쓴 정정의 되돌리기 409 문구가 "장부에서 원래 값으로 다시 입력"으로 바뀐다(가드는 같다).
//   batch: apply 응답의 sheetWrite 도 같은 lock 칸.
// 저장소·인증·반영 서비스는 목(기존 tests/api/branch-ledger-drafts-sheet-write.test.ts 와 같은 방식).
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const requireVerifiedAdminContext = vi.fn()
const listBranchSalesLedgerDrafts = vi.fn()
const listBranchSalesLedgerEntries = vi.fn()
const reverseBranchSalesLedgerEntryByDraftId = vi.fn()
const applyLedgerDraftsWithSheetWrite = vi.fn()
const latestSheetWritesByDraftIds = vi.fn()
const lastSuccessfulRevSyncStartedAt = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"],
  CRM_STAFF_ADMIN_API_ROLES: ["ADMIN"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/branch-sales-ledger-drafts", () => ({
  BRANCH_SALES_LEDGER_DRAFT_STATUSES: ["draft", "checked", "applied", "cancelled"],
  LEDGER_LIST_MAX: 1000,
  listBranchSalesLedgerDrafts,
  listBranchSalesLedgerEntries,
  reverseBranchSalesLedgerEntryByDraftId,
  createBranchSalesLedgerDraft: vi.fn(),
  updateBranchSalesLedgerDraft: vi.fn(),
  deleteBranchSalesLedgerDraft: vi.fn(),
  isBranchSalesLedgerDraftsNotReadyError: () => false,
  isBranchSalesLedgerDuplicateActiveCorrectionError: () => false,
  isBranchSalesLedgerNonPositiveAmountError: () => false,
  isBranchSalesLedgerDraftHasSheetWritesError: () => false,
}))

vi.mock("@/lib/branch/sheet-writeback/apply-service", () => ({ applyLedgerDraftsWithSheetWrite }))

vi.mock("@/lib/repositories/branch-sales-ledger-sheet-writes", () => ({
  latestSheetWritesByDraftIds,
  lastSuccessfulRevSyncStartedAt,
  isSheetWritesNotReadyError: () => false,
}))

function stubEnv(lockedAt: string, now: string) {
  vi.stubEnv("BRANCH_REV_SHEET_WRITE_ENABLED", "1")
  vi.stubEnv("VERCEL_ENV", "production")
  vi.stubEnv("BRANCH_REV_SHEET_LOCKED_AT", lockedAt)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(now))
}

async function getSheetWrite() {
  const { GET } = await import("@/app/api/admin/branch/ledger-drafts/route")
  const response = await GET(new NextRequest("https://classin.kr/api/admin/branch/ledger-drafts"))
  expect(response.status).toBe(200)
  return (await response.json()).sheetWrite
}

beforeEach(() => {
  requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", name: "Tester", userId: "admin-1" })
  listBranchSalesLedgerDrafts.mockResolvedValue({ generatedAt: "x", health: { ok: true, message: null }, drafts: [] })
  listBranchSalesLedgerEntries.mockResolvedValue({ generatedAt: "x", health: { ok: true, message: null }, entries: [] })
  latestSheetWritesByDraftIds.mockResolvedValue(new Map())
  lastSuccessfulRevSyncStartedAt.mockResolvedValue("2026-11-30T08:00:00.000Z")
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("GET /api/admin/branch/ledger-drafts — sheetWrite.lock", () => {
  it("적용 중(12/1 0시 KST 이후)이면 lock active 와 mode off 가 함께 나간다 — 쓰기 플래그가 남아 있어도", async () => {
    stubEnv("2026-12-01", "2026-11-30T15:00:00Z")
    expect(await getSheetWrite()).toEqual({
      mode: "off",
      lastRevSyncStartedAt: "2026-11-30T08:00:00.000Z",
      health: { ok: true, message: null },
      lock: { lockedAt: "2026-12-01", active: true },
    })
  })

  it("예정(날짜 전)이면 lock active:false, mode 는 지금 그대로", async () => {
    stubEnv("2026-12-01", "2026-11-30T14:59:00Z")
    expect(await getSheetWrite()).toMatchObject({ mode: "on", lock: { lockedAt: "2026-12-01", active: false } })
  })

  it.each([["없음", ""], ["형식 틀림", "12/1"]])("%s 이면 lock 칸이 없다(응답이 지금과 같다)", async (_label, value) => {
    stubEnv(value, "2026-12-05T00:00:00Z")
    const sheetWrite = await getSheetWrite()
    expect(sheetWrite).toEqual({
      mode: "on",
      lastRevSyncStartedAt: "2026-11-30T08:00:00.000Z",
      health: { ok: true, message: null },
    })
    expect("lock" in sheetWrite).toBe(false)
  })
})

describe("PATCH /api/admin/branch/ledger-drafts/[id] action=reverse — 시트에 쓴 정정(F-22)", () => {
  async function reverse() {
    latestSheetWritesByDraftIds.mockResolvedValue(new Map([["draft-1", { status: "written", code: "written" }]]))
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/[id]/route")
    return PATCH(
      new NextRequest("https://classin.kr/api/admin/branch/ledger-drafts/draft-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reverse" }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    )
  }

  it("고정 중이면 가드는 같고 문구만 '장부에서 원래 값으로 다시 입력'", async () => {
    stubEnv("2026-12-01", "2026-12-02T00:00:00Z")
    const response = await reverse()
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: "시트는 12월 1일 기준으로 고정돼 되돌릴 수 없습니다 — 장부에서 원래 값으로 다시 입력하세요",
      reason: "sheet-written",
    })
    expect(reverseBranchSalesLedgerEntryByDraftId).not.toHaveBeenCalled()
  })

  it("고정 전에는 지금 문구 그대로", async () => {
    stubEnv("2026-12-01", "2026-11-25T00:00:00Z")
    const response = await reverse()
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe("시트에 반영된 항목입니다 — 시트에서 직접 되돌리거나 원래 값으로 다시 입력해 주세요")
  })
})

describe("PATCH /api/admin/branch/ledger-drafts/batch action=apply — sheetWrite.lock", () => {
  async function batchApply() {
    applyLedgerDraftsWithSheetWrite.mockResolvedValue({
      mode: "off",
      results: [{ id: "d1", ok: true, status: 200, draft: { id: "d1" }, sheet: { code: "disabled", message: "시트 쓰기 꺼짐 — 장부에만 반영됨" } }],
    })
    const { PATCH } = await import("@/app/api/admin/branch/ledger-drafts/batch/route")
    const response = await PATCH(
      new NextRequest("https://classin.kr/api/admin/branch/ledger-drafts/batch", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply", ids: ["d1"] }),
      }),
    )
    return (await response.json()).sheetWrite
  }

  it("고정 중이면 GET 과 같은 lock 을 싣는다", async () => {
    stubEnv("2026-12-01", "2026-12-02T00:00:00Z")
    expect(await batchApply()).toEqual({ mode: "off", lock: { lockedAt: "2026-12-01", active: true } })
  })

  it("없으면 지금 응답 그대로", async () => {
    stubEnv("", "2026-12-02T00:00:00Z")
    expect(await batchApply()).toEqual({ mode: "off" })
  })
})

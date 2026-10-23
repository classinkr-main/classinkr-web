// REV 시트 쓰기(ADR-011) — 매출시트 화면(/admin/crm/deals/rev-sheet)의 "장부 미반영" 배지 배선.
// 장부 항목 조회가 draft_id 를 함께 읽고, 시트에 쓴 정정 중 다음 REV 동기화가 이미 미러로 들인 것만 미반영에서 뺀다.
// 감사 표가 없거나(마이그레이션 전) 조회가 실패하면 기존 동작(빼지 않음) — 실패는 경고로 알린다.
// supabase·감사 저장소·Compass 브리지는 전부 목이다.
import { afterEach, describe, expect, it, vi } from "vitest"

import { createRecordingSupabaseClient, type RecordedQuery } from "../helpers/recording-supabase-client"

const latestSheetWritesByDraftIds = vi.fn()
const lastSuccessfulRevSyncStartedAt = vi.fn()
const SHEET_WRITES_NOT_READY_MESSAGE = "매출 장부 시트 쓰기 기록 DB 마이그레이션이 아직 적용되지 않았습니다."

const LEDGER_ROWS = [
  { amount: 100_000, applied_at: "2026-10-20T00:00:00Z", entry_type: "manual-new", draft_id: "d-new" },
  { amount: 300_000, applied_at: "2026-10-22T00:00:00Z", entry_type: "manual-edit", draft_id: "d-absorbed" },
  { amount: 500_000, applied_at: "2026-10-21T00:00:00Z", entry_type: "manual-edit", draft_id: "d-after-sync" },
  { amount: 700_000, applied_at: "2026-10-19T00:00:00Z", entry_type: "manual-edit", draft_id: "d-failed" },
]
let ledgerRows: unknown[] = LEDGER_ROWS

const recording = createRecordingSupabaseClient((query: RecordedQuery) => {
  if (query.table === "branch_sales_ledger_entries") return { data: ledgerRows }
  return { data: [] }
})

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => recording.client }))
vi.mock("@/lib/compass/bridge", () => ({ getCompassRevenue: vi.fn(async () => ({ down: false, rows: [] })) }))
vi.mock("@/lib/repositories/branch-sales-ledger-sheet-writes", () => ({
  latestSheetWritesByDraftIds,
  lastSuccessfulRevSyncStartedAt,
  isSheetWritesNotReadyError: (error: unknown) =>
    error instanceof Error && error.message === SHEET_WRITES_NOT_READY_MESSAGE,
}))

function written(draftId: string, writtenAt: string, status = "written") {
  return [draftId, { draftId, status, code: "written", writtenAt }] as const
}

async function workspace() {
  const { getAdminCrmRevenueSheetWorkspace } = await import("@/lib/admin-crm-revenue-sheet")
  return getAdminCrmRevenueSheetWorkspace()
}

afterEach(() => {
  vi.clearAllMocks()
  recording.queries.length = 0
  ledgerRows = LEDGER_ROWS
})

describe("getAdminCrmRevenueSheetWorkspace — 시트에 쓴 정정의 미반영 제외", () => {
  it("장부 항목을 draft_id 와 함께 읽고, 동기화가 들인 written 정정만 뺀다(동기화 뒤에 쓴 것·실패한 것은 남는다)", async () => {
    lastSuccessfulRevSyncStartedAt.mockResolvedValue("2026-10-23T08:00:00.000Z")
    latestSheetWritesByDraftIds.mockResolvedValue(
      new Map([
        written("d-absorbed", "2026-10-23T07:00:00.000Z"),
        written("d-after-sync", "2026-10-23T09:00:00.000Z"),
        written("d-failed", "2026-10-23T07:00:00.000Z", "failed"),
      ]),
    )

    const result = await workspace()

    const ledgerQuery = recording.queries.find((query) => query.table === "branch_sales_ledger_entries")
    expect(ledgerQuery?.select).toBe("amount, applied_at, entry_type, draft_id")
    // 시트 쓰기는 기존 행 정정만 한다 — 새 행 항목의 초안은 묻지 않는다.
    expect(latestSheetWritesByDraftIds).toHaveBeenCalledWith(["d-absorbed", "d-after-sync", "d-failed"])
    expect(result.manualLedgerGap).toEqual({
      count: 3,
      amount: 1_300_000,
      newCount: 1,
      newAmount: 100_000,
      editCount: 2,
      latestAppliedAt: "2026-10-21T00:00:00Z",
    })
    expect(result.warnings).toEqual([])
  })

  it("성공한 REV 동기화 기록이 없으면 아무것도 빼지 않는다", async () => {
    lastSuccessfulRevSyncStartedAt.mockResolvedValue(null)
    latestSheetWritesByDraftIds.mockResolvedValue(new Map([written("d-absorbed", "2026-10-23T07:00:00.000Z")]))

    const result = await workspace()

    expect(result.manualLedgerGap.count).toBe(4)
    expect(result.manualLedgerGap.editCount).toBe(3)
  })

  it("감사 표가 없으면(마이그레이션 전) 기존 동작 — 경고도 남기지 않는다", async () => {
    lastSuccessfulRevSyncStartedAt.mockResolvedValue("2026-10-23T08:00:00.000Z")
    latestSheetWritesByDraftIds.mockRejectedValue(new Error(SHEET_WRITES_NOT_READY_MESSAGE))

    const result = await workspace()

    expect(result.manualLedgerGap.count).toBe(4)
    expect(result.warnings).toEqual([])
  })

  it("그 밖의 조회 실패는 기존 동작 + 경고(과대집계일 수 있음을 숨기지 않는다)", async () => {
    lastSuccessfulRevSyncStartedAt.mockRejectedValue(new Error("[branch-sales-ledger-sheet-writes] 동기화 기록 조회 실패: x"))
    latestSheetWritesByDraftIds.mockResolvedValue(new Map([written("d-absorbed", "2026-10-23T07:00:00.000Z")]))

    const result = await workspace()

    expect(result.manualLedgerGap.count).toBe(4)
    expect(result.warnings).toContain(
      "시트에 쓴 장부 정정을 확인하지 못했습니다 — 미반영 배지 수치에 시트 반영분이 섞여 있을 수 있습니다.",
    )
  })

  it("정정 항목이 없으면 감사 표를 묻지 않는다", async () => {
    ledgerRows = [LEDGER_ROWS[0]]

    const result = await workspace()

    expect(latestSheetWritesByDraftIds).not.toHaveBeenCalled()
    expect(lastSuccessfulRevSyncStartedAt).not.toHaveBeenCalled()
    expect(result.manualLedgerGap.count).toBe(1)
  })
})

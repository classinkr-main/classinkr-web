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

// 배너가 읽는 미러(branch_rev_deals) 행 — synced_at 이 그 행 데이터의 시각이다(이중 집계 제외 기준, absorptionCutoff).
// 기본은 08:00 동기화가 08:05 에 미러를 바꾼 상태.
function mirrorRow(syncedAt: string) {
  return {
    id: "deal-1",
    sheet_row: 3,
    customer_name: "가나학원",
    branch_contact: null,
    team: "BD",
    manager: null,
    deal_type: null,
    status: null,
    first_payment: null,
    product_version: null,
    region: null,
    importance: null,
    note: null,
    contract_target: 0,
    monthly_payments: {},
    monthly_confirmed: {},
    monthly_high_conf: {},
    pending: null,
    pending_weeks: null,
    synced_at: syncedAt,
  }
}
let mirrorRows: unknown[] = [mirrorRow("2026-10-23T08:05:00.000Z")]

const recording = createRecordingSupabaseClient((query: RecordedQuery) => {
  if (query.table === "branch_sales_ledger_entries") return { data: ledgerRows }
  if (query.table === "branch_rev_deals") return { data: mirrorRows }
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
  mirrorRows = [mirrorRow("2026-10-23T08:05:00.000Z")]
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

  it("미러가 그 동기화보다 오래됐으면(재캡처·교체 전) 그 동기화를 기준으로 빼지 않는다 — 미러 시각까지만", async () => {
    // 07:00 에 쓴 정정은 08:00 동기화가 읽었지만, 이 배너가 읽은 미러는 06:30 데이터라 아직 그 값이 없다.
    mirrorRows = [mirrorRow("2026-10-23T06:30:00.000Z")]
    lastSuccessfulRevSyncStartedAt.mockResolvedValue("2026-10-23T08:00:00.000Z")
    latestSheetWritesByDraftIds.mockResolvedValue(
      new Map([written("d-absorbed", "2026-10-23T07:00:00.000Z"), written("d-after-sync", "2026-10-23T06:00:00.000Z")]),
    )

    const result = await workspace()

    // d-absorbed(07:00)는 남고, 06:30 미러보다 먼저 쓴 d-after-sync(06:00)만 빠진다.
    expect(result.manualLedgerGap.count).toBe(3)
    expect(result.manualLedgerGap.amount).toBe(1_100_000)
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

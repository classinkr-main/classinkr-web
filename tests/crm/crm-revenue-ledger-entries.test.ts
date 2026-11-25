// CRM 매출(/admin/crm 매출 대시보드 · REV 시트 워크스페이스)도 시트 행 + 장부 항목(D1)이다.
// supabase 는 기록용 가짜 클라이언트(tests/helpers/recording-supabase-client)다. 데이터는 가명.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createRecordingSupabaseClient, type RecordedQuery } from "../helpers/recording-supabase-client"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const mocks = vi.hoisted(() => ({ readLedger: vi.fn(), readSources: vi.fn() }))

let mirrorRows: unknown[] = []
let entryRows: unknown[] = []
const recording = createRecordingSupabaseClient((query: RecordedQuery) => {
  if (query.table === "branch_rev_deals") return { data: mirrorRows }
  if (query.table === "branch_sales_ledger_entries") return { data: entryRows }
  return { data: [] }
})

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => recording.client }))
vi.mock("@/lib/compass/bridge", () => ({ getCompassRevenue: vi.fn(async () => ({ down: false, rows: [] })) }))
vi.mock("@/lib/repositories/branch-sales-ledger-sheet-writes", () => ({
  latestSheetWritesByDraftIds: vi.fn(async () => new Map()),
  lastSuccessfulRevSyncStartedAt: vi.fn(async () => null),
  isSheetWritesNotReadyError: () => false,
}))
vi.mock("@/lib/branch/ledger-revenue", async () => ({
  ...(await vi.importActual<typeof import("@/lib/branch/ledger-revenue")>("@/lib/branch/ledger-revenue")),
  readLedgerRevenueDeals: mocks.readLedger,
  readLedgerOverlaySources: mocks.readSources,
}))

function deal(overrides: Partial<BranchRevDeal>): BranchRevDeal {
  return {
    id: "line-x", sheet_row: 3, customer_name: "예시학원1", branch_contact: null, team: "BD", manager: "예시A",
    deal_type: "Direct", status: "Renew", first_payment: null, product_version: null, region: null, importance: null,
    note: null, contract_target: 0, monthly_payments: {}, monthly_red: {}, monthly_confirmed: {}, monthly_high_conf: {},
    raw: {}, synced_at: "2026-11-22T00:00:00.000Z", ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-25T03:00:00.000Z"))
  recording.queries.length = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  mirrorRows = []
  entryRows = []
})

describe("CRM 매출 대시보드 — 시트 행 + 장부 항목", () => {
  it("장부 신규 행의 확정이 시트 확정에 들어가고, 미매칭(ledger:<id>)으로 병기된다", async () => {
    mocks.readLedger.mockResolvedValue({
      deals: [
        deal({ id: "line-1", monthly_payments: { "2026-10": 100_000 }, monthly_confirmed: { "2026-10": 100_000 }, monthly_red: { "2026-10": true } }),
        deal({
          id: "ledger-e-1", sheet_row: 3, customer_name: "예시학원1", monthly_payments: { "2026-11": 40_000 },
          monthly_confirmed: { "2026-11": 40_000 }, monthly_red: { "2026-11": true }, raw: { ledgerDeal: { origin: "entry" } },
        }),
      ],
      sheetOnlyDeals: [],
      source: { kind: "import", asOf: null },
      info: {},
    })
    const { getAdminCrmRevenueDashboard } = await import("@/lib/admin-crm-revenue")
    const dashboard = await getAdminCrmRevenueDashboard(6)
    expect(dashboard.sheet?.confirmedAmount).toBe(140_000)
    expect(dashboard.sheet?.dealCount).toBe(2)
    // 같은 행 번호·고객이어도 장부 딜은 시트 record key 를 쓰지 않는다(원본 링크·목록 키와 겹치지 않는다).
    const keys = dashboard.sheetMatches.map((row) => row.key)
    expect(keys).toContain("ledger:ledger-e-1")
    expect(new Set(keys).size).toBe(keys.length)
    // 장부 딜은 링크로 풀 수 없어 미매칭 행 수에서 뺀다(금액은 미매칭 시트 금액에 병기).
    expect(dashboard.identity?.unmatchedSheetDealCount).toBe(1)
    expect(dashboard.sheet?.unlinkedAmount).toBe(140_000)
  })

  it("REV + 장부 읽기가 실패하면 미러 행으로 집계한다(기존 폴백)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.readLedger.mockRejectedValue(new Error("rev down"))
    mirrorRows = [{ ...deal({ id: "mirror-1", monthly_payments: { "2026-10": 10 }, monthly_confirmed: { "2026-10": 10 } }) }]
    const { getAdminCrmRevenueDashboard } = await import("@/lib/admin-crm-revenue")
    const dashboard = await getAdminCrmRevenueDashboard(6)
    expect(dashboard.sheet?.confirmedAmount).toBe(10)
  })

  it("과거 미확정 리스크의 장부 링크는 열 필터 없이(cf=none) 연다", async () => {
    mocks.readLedger.mockResolvedValue({
      deals: [deal({ id: "line-9", customer_name: "예시학원9", monthly_payments: { "2026-09": 500 }, monthly_confirmed: { "2026-09": 0 }, monthly_red: { "2026-09": false } })],
      sheetOnlyDeals: [], source: { kind: "import", asOf: null }, info: {},
    })
    const { getAdminCrmRevenueDashboard } = await import("@/lib/admin-crm-revenue")
    const dashboard = await getAdminCrmRevenueDashboard(6)
    const risk = dashboard.risks.find((item) => item.id === "sheet:line-9")
    expect(risk?.href).toBe(`/admin/branch/ledger?lens=rev&cf=none&q=${encodeURIComponent("예시학원9")}`)
  })
})

describe("REV 시트 워크스페이스 — 미러 행 + 장부 항목", () => {
  const sources = (overrides: Record<string, unknown> = {}) => ({
    fiscalYear: 2026, months: [], entries: [], drafts: [], reversedDraftIds: [], sheetWrites: {},
    lastRevSyncStartedAt: null, ledgerReadable: true, sheetWritesReadable: true, truncated: false, ...overrides,
  })
  const mirror = (overrides: Record<string, unknown> = {}) => ({
    id: "mirror-b", sheet_row: 20, customer_name: "예시학원B", branch_contact: null, team: "BD", manager: "예시B",
    deal_type: "Direct", status: "Renew", first_payment: null, product_version: null, region: null, importance: null,
    note: null, contract_target: 0, monthly_payments: { "2026-11": 300_000 }, monthly_confirmed: { "2026-11": 300_000 },
    monthly_high_conf: {}, pending: null, pending_weeks: null, row_id: "r_000000000020", row_id_issue: null,
    pending_cells: null, month_week_mismatch: null, synced_at: "2026-11-22T00:00:00.000Z", ...overrides,
  })
  const entry = (overrides: Record<string, unknown>) => ({
    id: "e-x", draftId: "d-x", entryType: "manual-new", entryStatus: "active", sourceSheetRow: null, sourceSnapshot: {},
    customer: "예시학원N", manager: "예시A", team: "BD", month: "2026-11", amount: 0, note: "",
    appliedAt: "2026-11-23T01:00:00.000Z", metadata: { confidence: "confirmed", week: "month" }, ...overrides,
  })

  it("정정은 원본 행의 그 달을 대체하고(Row ID), 신규는 장부 행으로 더한다 — 장부 행 표시·동기화 시각은 시트 행만", async () => {
    mirrorRows = [mirror()]
    entryRows = [
      { amount: 260_000, applied_at: "2026-11-23T01:00:00Z", entry_type: "manual-edit", draft_id: "d-edit" },
      { amount: 100_000, applied_at: "2026-11-24T01:00:00Z", entry_type: "manual-new", draft_id: "d-new" },
    ]
    mocks.readSources.mockResolvedValue(sources({
      months: ["2026-11"],
      entries: [
        entry({
          id: "e-edit", draftId: "d-edit", entryType: "manual-edit", sourceDealId: "old-line", sourceSheetRow: 20,
          customer: "예시학원B", manager: "예시B", amount: 260_000,
          sourceSnapshot: { sheetBaseline: { v: 1, rowId: "r_000000000020", sheetRow: 20, customer: "예시학원B", month: "2026-11", weeks: [{ value: 300_000, color: "r" }], capturedAt: "2026-11-20T00:00:00.000Z" } },
        }),
        entry({ id: "e-new", draftId: "d-new", customer: "예시학원A2", amount: 100_000 }),
      ],
    }))
    const { getAdminCrmRevenueSheetWorkspace } = await import("@/lib/admin-crm-revenue-sheet")
    const workspace = await getAdminCrmRevenueSheetWorkspace()

    expect(workspace.summary.confirmedAmount).toBe(360_000)
    expect(workspace.summary.scheduledAmount).toBe(360_000)
    const ledgerRow = workspace.rows.find((row) => row.ledgerEntry)
    expect(ledgerRow).toMatchObject({ customerName: "예시학원A2", sourceRecordKey: "ledger:ledger-e-new", linkStatus: null, confirmedAmount: 100_000 })
    expect(workspace.rows.find((row) => row.id === "mirror-b")).toMatchObject({ confirmedAmount: 260_000 })
    expect(workspace.summary.latestSyncedAt).toBe("2026-11-22T00:00:00.000Z")
    // 장부 행은 매칭 대상이 아니다 — 미매칭 행·금액은 시트 행만.
    expect(workspace.summary.unmatchedRowCount).toBe(1)
    expect(workspace.summary.unmatchedAmount).toBe(260_000)
    // 배지 세는 규칙은 그대로 — 장부 입력 2건(신규 1 · 정정 1).
    expect(workspace.manualLedgerGap).toMatchObject({ count: 2, newCount: 1, editCount: 1 })
    // 정정의 원본 행을 Row ID 로 찾도록 raw 경로를 함께 읽는다(무거운 raw 전체는 읽지 않는다).
    const mirrorQuery = recording.queries.find((query) => query.table === "branch_rev_deals")
    expect(mirrorQuery?.select).toContain("row_id:raw->rowId")
    expect(mirrorQuery?.select).toContain("pending_cells:raw->pendingCells")
  })

  it("장부 항목을 못 읽으면 시트 값만 쓰고 경고한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mirrorRows = [mirror()]
    mocks.readSources.mockRejectedValue(new Error("db down"))
    const { getAdminCrmRevenueSheetWorkspace } = await import("@/lib/admin-crm-revenue-sheet")
    const workspace = await getAdminCrmRevenueSheetWorkspace()
    expect(workspace.summary.confirmedAmount).toBe(300_000)
    expect(workspace.warnings.some((warning) => warning.includes("장부 항목을 읽지 못해"))).toBe(true)
  })

  it("빨간 예정 칸(raw.pendingCells)은 그 주 시작일(KST)부터 확정으로 읽는다(F-08, 미러 경로)", async () => {
    mirrorRows = [mirror({
      monthly_payments: { "2026-11": 50_000 }, monthly_confirmed: { "2026-11": 0 },
      pending_cells: { "2026-11": [{ week: 4, start: "2026-11-22", amount: 50_000 }] },
    })]
    mocks.readSources.mockResolvedValue(sources())
    const { getAdminCrmRevenueSheetWorkspace } = await import("@/lib/admin-crm-revenue-sheet")
    const workspace = await getAdminCrmRevenueSheetWorkspace()
    expect(workspace.summary.confirmedAmount).toBe(50_000)
  })
})

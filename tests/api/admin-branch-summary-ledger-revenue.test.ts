// GET /api/admin/branch/summary — 확정 타일 = 시트 행 + 장부 항목(D1), 장부 가감 = 확정 − 시트만(D3), 전기 대비 같은 범위(F-40),
// 담당 범위 팀 ∩ 담당(F-41), 개인 DSH 행 모양(F-24), DSH 실적 장부 배선(D4 — lib/branch/dsh-ledger.ts 계약).
// DB·시트·Drive 에 붙지 않는다 — REV·DSH·KPI·장부 저장소는 전부 목이다. 데이터는 가명(예시학원N · 예시A~C).
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildLedgerOverlay, type LedgerOverlayEntry } from "@/lib/branch/ledger-overlay"
import { listRevRevenue } from "@/lib/branch/computations/pipeline"
import { buildMonthlyGoalChart } from "@/lib/branch/monthly-goal-chart"
import { dshTotalsFromRows } from "@/components/admin/branch/ledger/dsh-derive"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  readDsh: vi.fn(),
  readKpi: vi.fn(),
  readRev: vi.fn(),
  campaigns: vi.fn(),
  runs: vi.fn(),
  events: vi.fn(),
  listEntries: vi.fn(),
  listDrafts: vi.fn(),
  applyLedgerStatusToDsh: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin, BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"] }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock("@/lib/branch/google-sheets", () => ({ envSheetId: () => "sheet-id", getSheetModifiedTime: vi.fn(async () => null) }))
vi.mock("@/lib/branch/read-dsh-kpi", () => ({ readDshPreferDbWithSource: mocks.readDsh, readKpiBlocksPreferDb: mocks.readKpi }))
vi.mock("@/lib/branch/read-rev-deals", () => ({ readRevDealsPreferActiveWithSource: mocks.readRev }))
vi.mock("@/lib/branch/computations/campaigns", () => ({ summarizeCampaigns: mocks.campaigns }))
vi.mock("@/lib/repositories/branch-sync", () => ({ getRecentSyncRuns: mocks.runs }))
vi.mock("@/lib/repositories/public-events", () => ({ listCachedPublicEvents: mocks.events }))
vi.mock("@/lib/repositories/branch-sales-ledger-drafts", () => ({
  listBranchSalesLedgerEntries: mocks.listEntries,
  listBranchSalesLedgerDrafts: mocks.listDrafts,
}))
vi.mock("@/lib/repositories/branch-sales-ledger-sheet-writes", () => ({
  latestSheetWritesByDraftIds: vi.fn(async () => new Map()),
  lastSuccessfulRevSyncStartedAt: vi.fn(async () => null),
  isSheetWritesNotReadyError: () => false,
}))
vi.mock("@/lib/branch/dsh-ledger", () => ({ applyLedgerStatusToDsh: mocks.applyLedgerStatusToDsh }))

const ROW_ID_B = "r_000000000020"

function deal(overrides: Partial<BranchRevDeal>): BranchRevDeal {
  return {
    id: "line-x", sheet_row: 1, customer_name: "예시학원X", branch_contact: null, team: "BD", manager: "예시A",
    deal_type: "Direct", status: "Renew", first_payment: "2025-05-01", product_version: "ClassIn 연간", region: null,
    importance: null, note: null, contract_target: 0, monthly_payments: {}, monthly_red: {}, monthly_confirmed: {},
    monthly_high_conf: {}, raw: {}, synced_at: "2026-11-22T00:00:00.000Z", ...overrides,
  }
}

// 예시B 11월 300,000(빨강) → 장부 정정 260,000. 예시A 장부 신규 11월 +100,000 확정. 예시A 10월 시트 50,000 확정.
// 예시C(MKT) 11월 환불 −30,000. 예시B 10월 장부 신규 70,000 확정(다른 담당의 전기 — F-40).
const SHEET_DEALS = [
  deal({
    id: "line-b", sheet_row: 20, customer_name: "예시학원B", manager: "예시B",
    monthly_payments: { "2026-11": 300_000 }, monthly_confirmed: { "2026-11": 300_000 }, monthly_red: { "2026-11": true },
    raw: { rowId: ROW_ID_B, weeklyPayments: { "2026-11": [300_000, 0, 0, 0, 0] } },
  }),
  deal({
    id: "line-a", sheet_row: 10, customer_name: "예시학원A", manager: "예시A",
    monthly_payments: { "2026-10": 50_000 }, monthly_confirmed: { "2026-10": 50_000 }, monthly_red: { "2026-10": true },
  }),
  deal({
    id: "line-c", sheet_row: 30, customer_name: "예시학원C", manager: "예시C", team: "MKT",
    monthly_payments: { "2026-11": -30_000 }, monthly_confirmed: { "2026-11": -30_000 }, monthly_red: { "2026-11": true },
  }),
]

function entry(overrides: Partial<LedgerOverlayEntry>): LedgerOverlayEntry {
  return {
    id: "e-x", draftId: "d-x", entryType: "manual-new", entryStatus: "active", sourceSheetRow: null, sourceSnapshot: {},
    customer: "예시학원N", manager: "예시A", team: "BD", month: "2026-11", amount: 0, note: "",
    appliedAt: "2026-11-23T01:00:00.000Z", metadata: { confidence: "confirmed", week: "month" }, ...overrides,
  }
}

const ENTRIES: LedgerOverlayEntry[] = [
  entry({
    id: "e-edit-b", draftId: "d-edit-b", entryType: "manual-edit", sourceDealId: "line-b-old", sourceSheetRow: 20,
    customer: "예시학원B", manager: "예시B", amount: 260_000,
    sourceSnapshot: { sheetBaseline: { v: 1, rowId: ROW_ID_B, sheetRow: 20, customer: "예시학원B", month: "2026-11", weeks: [{ value: 300_000, color: "r" }], capturedAt: "2026-11-20T00:00:00.000Z" } },
  }),
  entry({ id: "e-new-a", draftId: "d-new-a", customer: "예시학원A2", manager: "예시A", amount: 100_000 }),
  entry({ id: "e-new-b-oct", draftId: "d-new-b-oct", customer: "예시학원B2", manager: "예시B", month: "2026-10", amount: 70_000 }),
]

const DSH = {
  members: { 예시A: "BD", 예시B: "BD", 예시C: "MKT" },
  breakdown: [],
  rows: [
    { level: "team", team: "ALL", kind: "goal", annual: 1_000_000, quarters: [0, 0, 1_000_000, 0], months: { "2026-10": 500_000, "2026-11": 500_000 } },
    { level: "team", team: "BD", kind: "goal", annual: 800_000, quarters: [0, 0, 800_000, 0], months: { "2026-10": 400_000, "2026-11": 400_000 } },
    { level: "member", team: "BD", member: "예시A", kind: "goal", annual: 300_000, quarters: [0, 0, 300_000, 0], months: { "2026-10": 150_000, "2026-11": 150_000 } },
    { level: "member", team: "BD", member: "예시A", kind: "status", annual: 40_000, quarters: [0, 0, 40_000, 0], months: { "2026-10": 40_000, "2026-11": 0 } },
    { level: "member", team: "BD", member: "예시B", kind: "goal", annual: 500_000, quarters: [0, 0, 500_000, 0], months: { "2026-10": 250_000, "2026-11": 250_000 } },
  ],
}

function req(query: string) {
  return new NextRequest(`https://classin.kr/api/admin/branch/summary${query}`)
}

async function summary(query: string) {
  const { GET } = await import("@/app/api/admin/branch/summary/route")
  const response = await GET(req(query))
  expect(response.status).toBe(200)
  return response.json()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-25T03:00:00.000Z"))
  mocks.verifyAdmin.mockResolvedValue(null)
  mocks.readDsh.mockResolvedValue({ dsh: DSH, source: { kind: "mirror", asOf: null } })
  mocks.readKpi.mockResolvedValue({ fy: [], months: {} })
  mocks.readRev.mockResolvedValue({ deals: SHEET_DEALS, source: { kind: "import", asOf: "2026-11-22T00:00:00.000Z", runId: "run-1" } })
  mocks.campaigns.mockResolvedValue({ count_30d: 0, avg_open_pct: 0, recent: [] })
  mocks.runs.mockResolvedValue([])
  mocks.events.mockResolvedValue([])
  mocks.listEntries.mockImplementation(async (options: { status?: string } = {}) => ({
    generatedAt: "x", health: { ok: true, message: null }, entries: options.status === "reversed" ? [] : ENTRIES, truncated: false,
  }))
  mocks.listDrafts.mockResolvedValue({ generatedAt: "x", health: { ok: true, message: null }, drafts: [], truncated: false })
  mocks.applyLedgerStatusToDsh.mockImplementation(async ({ dsh }: { dsh: unknown }) => ({ dsh, info: null }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("summary 확정 타일 — 시트 행 + 장부 항목(D1)", () => {
  it("F-01 재현: 예시B 11월 260,000 이 300,000 을 대체하고 예시A +100,000 확정이 더해진다 — 목표 차트 11월 값과 같다", async () => {
    const body = await summary("?period=M&month=2026-11")
    // 260,000 + 100,000 − 30,000(환불, D2)
    expect(body.revenue.confirmed).toBe(330_000)
    // D3: 같은 기간·범위의 시트만 확정 → 장부 가감 = +60,000
    expect(body.revenue.sheet_only_confirmed).toBe(270_000)
    expect(body.revenue.confirmed - body.revenue.sheet_only_confirmed).toBe(60_000)
    expect(body.revenue.ledger_included).toBe(true)

    // 장부 화면과 같은 함수(buildLedgerOverlay → buildMonthlyGoalChart)로 만든 11월 막대 확정과 같다.
    const rows = buildLedgerOverlay({ sheetRows: listRevRevenue(SHEET_DEALS), ledgerEntries: ENTRIES }).rows
    const chart = buildMonthlyGoalChart(rows, [{ month: "2026-11", goal: 500_000 }], "2026-11-25")
    expect(chart[0].confirmed).toBe(body.revenue.confirmed)

    // 월별 누적선도 같은 정의 — 11월 증가분 = 330,000, 10월 = 50,000 + 예시B 장부 신규 70,000.
    const months: string[] = body.monthly_series.months
    const nov = months.indexOf("2026-11")
    expect(body.monthly_series.revenue_cum[nov] - body.monthly_series.revenue_cum[nov - 1]).toBe(330_000)
    expect(body.monthly_series.revenue_cum[nov - 1] - body.monthly_series.revenue_cum[nov - 2]).toBe(120_000)
  })

  it("F-40: 전기(10월) 확정도 같은 정의·같은 범위 — 다른 담당의 장부 입력은 담당 범위 전기에 들어가지 않는다", async () => {
    const all = await summary("?period=M&month=2026-11")
    expect(all.revenue.prev_confirmed).toBe(120_000)
    const mine = await summary("?period=M&month=2026-11&manager=예시A")
    expect(mine.revenue).toMatchObject({ confirmed: 100_000, sheet_only_confirmed: 0, prev_confirmed: 50_000, goal: 150_000 })
    // 4월(회계연도 첫 달)·연간은 전기가 없다.
    expect((await summary("?period=Y")).revenue.prev_confirmed).toBeNull()
  })

  it("F-41: 팀을 고른 채 담당을 고르면 팀 ∩ 담당 — 표와 같은 범위", async () => {
    const bd = await summary("?team=BD&period=M&month=2026-11&manager=예시A")
    expect(bd.revenue.confirmed).toBe(100_000)
    const mkt = await summary("?team=MKT&period=M&month=2026-11&manager=예시A")
    expect(mkt.revenue).toMatchObject({ confirmed: 0, sheet_only_confirmed: 0 })
    // 팀만: MKT 11월 = 환불 −30,000.
    expect((await summary("?team=MKT&period=M&month=2026-11")).revenue.confirmed).toBe(-30_000)
  })

  it("F-42: 담당 이름 대소문자가 달라도 같은 사람이다", async () => {
    const body = await summary("?period=M&month=2026-11&manager=예시a")
    expect(body.revenue.confirmed).toBe(100_000)
  })

  it("장부 항목을 못 읽으면 시트만으로 세고 ledger_included=false", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.listEntries.mockRejectedValue(new Error("db down"))
    const body = await summary("?period=M&month=2026-11")
    expect(body.revenue).toMatchObject({ confirmed: 270_000, sheet_only_confirmed: 270_000, ledger_included: false })
  })
})

describe("F-24 — 개인 범위 DSH 행 모양", () => {
  it("담당 범위의 dsh_rows 는 멤버 행 + 합성 ALL 행이라 화면 dshTotalsFromRows 가 개인 목표·실적을 낸다", async () => {
    const body = await summary("?period=M&month=2026-11&manager=예시A&breakdown=1")
    const rows = body.dsh_rows as Array<{ level: string; team: string; member?: string; kind: string }>
    expect(rows.some((row) => row.level === "team" && row.team === "ALL" && row.kind === "goal")).toBe(true)
    expect(rows.filter((row) => row.level === "member").every((row) => row.member === "예시A")).toBe(true)
    const totals = dshTotalsFromRows(body.dsh_rows)
    expect(totals).not.toBeNull()
    expect(totals?.goal.annual).toBe(300_000)
    expect(totals?.status.annual).toBe(40_000)
  })
})

describe("D4 — DSH 실적 장부 배선(lib/branch/dsh-ledger.ts 계약)", () => {
  it("개인 범위를 걸기 전에 회계연도 전체·전 팀 D1 딜로 부르고, 돌려준 DSH 와 info 를 쓴다", async () => {
    const spliced = {
      ...DSH,
      rows: DSH.rows.map((row) => (row.kind === "status" ? { ...row, months: { ...row.months, "2026-11": 99_000 } } : row)),
    }
    const info = { lockedAt: "2026-12-01", lockMonth: "2026-12", ledgerMonths: ["2026-12"] }
    mocks.applyLedgerStatusToDsh.mockImplementation(async () => ({ dsh: spliced, info }))

    const body = await summary("?team=BD&period=M&month=2026-11&manager=예시A&breakdown=1")

    expect(mocks.applyLedgerStatusToDsh).toHaveBeenCalledTimes(1)
    const args = mocks.applyLedgerStatusToDsh.mock.calls[0][0] as { dsh: unknown; fiscalYear: number; now: Date; deals: BranchRevDeal[] }
    expect(args.dsh).toBe(DSH)
    expect(args.fiscalYear).toBe(2026)
    expect(args.now).toBeInstanceOf(Date)
    // 팀·담당 범위와 무관하게 전 팀 D1 딜(정정 반영 + 장부 신규).
    expect(args.deals.map((d) => d.id).sort()).toEqual(["ledger-e-new-a", "ledger-e-new-b-oct", "line-a", "line-b", "line-c"])
    expect(args.deals.find((d) => d.id === "line-b")?.monthly_payments["2026-11"]).toBe(260_000)

    expect(body.dsh_ledger).toEqual(info)
    const personal = (body.dsh_rows as Array<{ level: string; team: string; kind: string; months: Record<string, number> }>)
      .find((row) => row.level === "team" && row.team === "ALL" && row.kind === "status")
    expect(personal?.months["2026-11"]).toBe(99_000)
  })

  it("고정이 없으면(info null) dsh_ledger 키를 싣지 않는다", async () => {
    const body = await summary("?period=M&month=2026-11")
    expect("dsh_ledger" in body).toBe(false)
  })
})

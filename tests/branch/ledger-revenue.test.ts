// 서버 매출 = 시트 행 + 장부 항목(D1) — lib/branch/ledger-revenue.ts readLedgerRevenueDeals 의 동작 테스트.
// REV 리더·장부 저장소·시트 쓰기 저장소는 목이다(DB·시트에 붙지 않는다). 데이터는 전부 가명(예시학원N · 예시A~C).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const mocks = vi.hoisted(() => ({
  readRev: vi.fn(),
  listEntries: vi.fn(),
  listDrafts: vi.fn(),
  latestSheetWrites: vi.fn(),
  lastRevSync: vi.fn(),
}))

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock("@/lib/branch/read-rev-deals", () => ({ readRevDealsPreferActiveWithSource: mocks.readRev }))
vi.mock("@/lib/repositories/branch-sales-ledger-drafts", () => ({
  listBranchSalesLedgerEntries: mocks.listEntries,
  listBranchSalesLedgerDrafts: mocks.listDrafts,
}))
vi.mock("@/lib/repositories/branch-sales-ledger-sheet-writes", () => ({
  latestSheetWritesByDraftIds: mocks.latestSheetWrites,
  lastSuccessfulRevSyncStartedAt: mocks.lastRevSync,
  isSheetWritesNotReadyError: () => false,
}))

import {
  LEDGER_REVENUE_CACHE_TAGS,
  isLedgerRevenueDeal,
  readLedgerRevenueDeals,
  scopeLedgerRevenueDeals,
} from "@/lib/branch/ledger-revenue"
import { confirmedRevenueInMonths } from "@/lib/branch/computations/core-kpi"

const ROW_ID_B = "r_000000000020"
const NOW = new Date("2026-11-25T03:00:00.000Z")

function deal(overrides: Partial<BranchRevDeal>): BranchRevDeal {
  return {
    id: "line-x",
    sheet_row: 1,
    customer_name: "예시학원X",
    branch_contact: null,
    team: "BD",
    manager: "예시A",
    deal_type: "Direct",
    status: "Renew",
    first_payment: "2025-05-01",
    product_version: "ClassIn 연간",
    region: null,
    importance: null,
    note: null,
    contract_target: 0,
    monthly_payments: {},
    monthly_red: {},
    monthly_confirmed: {},
    monthly_high_conf: {},
    raw: {},
    synced_at: "2026-11-22T00:00:00.000Z",
    ...overrides,
  }
}

// F-01 재현 표본: 예시B 11월 300,000(빨강) — 장부 정정 260,000 으로 대체. 예시A 장부 신규 +100,000 확정.
// 예시C 11월 환불 −30,000(빨강, D2). 예시A 10월 100,000 확정(시트).
const SHEET_DEALS = [
  deal({
    id: "line-b", sheet_row: 20, customer_name: "예시학원B", manager: "예시B",
    monthly_payments: { "2026-11": 300_000 }, monthly_confirmed: { "2026-11": 300_000 }, monthly_red: { "2026-11": true },
    raw: { rowId: ROW_ID_B, weeklyPayments: { "2026-11": [300_000, 0, 0, 0, 0] } },
  }),
  deal({
    id: "line-a", sheet_row: 10, customer_name: "예시학원A", manager: "예시A",
    monthly_payments: { "2026-10": 100_000 }, monthly_confirmed: { "2026-10": 100_000 }, monthly_red: { "2026-10": true },
  }),
  deal({
    id: "line-c", sheet_row: 30, customer_name: "예시학원C", manager: "예시C", team: "MKT",
    monthly_payments: { "2026-11": -30_000 }, monthly_confirmed: { "2026-11": -30_000 }, monthly_red: { "2026-11": true },
  }),
]

function entry(overrides: Record<string, unknown>) {
  return {
    id: "e-x",
    draftId: "d-x",
    entryType: "manual-new",
    entryStatus: "active",
    sourceDealId: undefined,
    sourceSheetRow: null,
    sourceSnapshot: {},
    customer: "예시학원N",
    manager: "예시A",
    team: "BD",
    month: "2026-11",
    amount: 0,
    currency: "CNY",
    note: "",
    appliedAt: "2026-11-23T01:00:00.000Z",
    metadata: { confidence: "confirmed", week: "month" },
    ...overrides,
  }
}

const EDIT_B = entry({
  id: "e-edit-b", draftId: "d-edit-b", entryType: "manual-edit", sourceDealId: "line-b-old-sync", sourceSheetRow: 20,
  customer: "예시학원B", manager: "예시B", amount: 260_000,
  sourceSnapshot: { sheetBaseline: { v: 1, rowId: ROW_ID_B, sheetRow: 20, customer: "예시학원B", month: "2026-11", weeks: [{ value: 300_000, color: "r" }], capturedAt: "2026-11-20T00:00:00.000Z" } },
})
const NEW_A = entry({ id: "e-new-a", draftId: "d-new-a", customer: "예시학원A2", manager: "예시A", amount: 100_000 })
const REVERSED = entry({ id: "e-rev", draftId: "d-rev", entryStatus: "reversed", customer: "예시학원R", amount: 999_000 })
// 시트에 쓴 정정 — 쓴 뒤 시작한 REV 동기화가 시트 행에 이미 담았다(ADR-011, 이중 계상 금지).
const ABSORBED = entry({
  id: "e-abs", draftId: "d-abs", entryType: "manual-edit", sourceDealId: "line-a", sourceSheetRow: 10,
  customer: "예시학원A", manager: "예시A", month: "2026-10", amount: 120_000,
})

function setLedger({
  active = [EDIT_B, NEW_A, ABSORBED],
  reversed = [REVERSED],
  drafts = [] as unknown[],
} = {}) {
  mocks.listEntries.mockImplementation(async (options: { status?: string } = {}) => ({
    generatedAt: "x",
    health: { ok: true, message: null },
    entries: options.status === "reversed" ? reversed : active,
    truncated: false,
  }))
  mocks.listDrafts.mockResolvedValue({ generatedAt: "x", health: { ok: true, message: null }, drafts, truncated: false })
  mocks.latestSheetWrites.mockResolvedValue(new Map([["d-abs", { draftId: "d-abs", status: "written", code: "written", writtenAt: "2026-11-20T00:00:00.000Z" }]]))
  mocks.lastRevSync.mockResolvedValue("2026-11-21T00:00:00.000Z")
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.readRev.mockResolvedValue({ deals: SHEET_DEALS, source: { kind: "import", asOf: "2026-11-22T00:00:00.000Z", runId: "run-1" } })
  setLedger()
})

afterEach(() => vi.restoreAllMocks())

describe("readLedgerRevenueDeals — 시트 행 + 장부 항목(D1)", () => {
  it("회계연도 열두 달로 장부 항목·상쇄·적용 초안을 읽고, 미러 폴백은 raw 와 함께 읽는다", async () => {
    await readLedgerRevenueDeals({ fiscalYear: 2026, now: NOW })
    const months = { from: "2026-04", to: "2027-03" }
    expect(mocks.listEntries).toHaveBeenCalledWith({ months })
    expect(mocks.listEntries).toHaveBeenCalledWith({ status: "reversed", months })
    expect(mocks.listDrafts).toHaveBeenCalledWith({ statuses: ["applied"], months })
    expect(mocks.readRev).toHaveBeenCalledWith(2026, undefined, { withRaw: true })
  })

  it("정정은 그 (시트 행, 달)을 대체하고 신규는 더한다 — 상쇄·시트가 이미 읽은 정정은 빠지고 환불은 그대로", async () => {
    const result = await readLedgerRevenueDeals({ fiscalYear: 2026, now: NOW })
    const nov = ["2026-11"]
    // 예시B 260,000(300,000 대체) + 예시A 신규 100,000 + 예시C 환불 −30,000
    expect(confirmedRevenueInMonths(result.deals, nov, "2026-11-25")).toBe(330_000)
    expect(confirmedRevenueInMonths(result.sheetOnlyDeals, nov, "2026-11-25")).toBe(270_000)
    // 정정은 딜 수·딜 id 를 바꾸지 않는다. 신규만 장부 딜로 더해진다.
    expect(result.deals.map((d) => d.id)).toEqual(["line-b", "line-a", "line-c", "ledger-e-new-a"])
    expect(result.deals.find((d) => d.id === "line-b")?.monthly_payments["2026-11"]).toBe(260_000)
    // 시트가 이미 읽은 정정(d-abs) — 10월은 시트 값 그대로(120,000 으로 바뀌지 않는다).
    expect(confirmedRevenueInMonths(result.deals, ["2026-10"], "2026-11-25")).toBe(100_000)
    // 상쇄된 항목(999,000)은 어디에도 없다.
    expect(result.deals.some((d) => d.customer_name === "예시학원R")).toBe(false)
    expect(result.source).toEqual({ kind: "import", asOf: "2026-11-22T00:00:00.000Z", runId: "run-1" })
    expect(result.info).toMatchObject({ entryCount: 3, unresolved: 0, superseded: 0, truncated: false, ledgerReadable: true })
  })

  it("같은 (시트 행, 달)에 정정이 둘이면 가장 늦게 반영한 것만 센다(쌓이지 않는다)", async () => {
    const later = { ...EDIT_B, id: "e-edit-b2", draftId: "d-edit-b2", amount: 250_000, appliedAt: "2026-11-24T01:00:00.000Z" }
    setLedger({ active: [EDIT_B, later] })
    const result = await readLedgerRevenueDeals({ fiscalYear: 2026, now: NOW })
    expect(confirmedRevenueInMonths(result.deals, ["2026-11"], "2026-11-25")).toBe(250_000 - 30_000)
    expect(result.info.superseded).toBe(1)
  })

  it("항목 없는 적용 초안은 안전망으로 얹고, 상쇄된 초안은 되살리지 않는다(화면과 같다)", async () => {
    const appliedDraft = {
      id: "d-orphan", kind: "new-row", status: "applied", sourceSheetRow: null, sourceSnapshot: {},
      customer: "예시학원O", manager: "예시A", team: "BD", month: "2026-11", amount: 40_000, note: "",
      metadata: { confidence: "confirmed", week: "month" }, appliedAt: "2026-11-23T00:00:00.000Z", updatedAt: "2026-11-23T00:00:00.000Z",
    }
    const reversedDraft = { ...appliedDraft, id: "d-rev", customer: "예시학원R", amount: 999_000 }
    setLedger({ active: [], drafts: [appliedDraft, reversedDraft] })
    const result = await readLedgerRevenueDeals({ fiscalYear: 2026, now: NOW })
    expect(confirmedRevenueInMonths(result.deals, ["2026-11"], "2026-11-25")).toBe(300_000 + 40_000 - 30_000)
    expect(result.deals.map((d) => d.id)).toContain("draft-d-orphan")
    expect(result.deals.some((d) => d.id === "draft-d-rev")).toBe(false)
  })

  it("장부 항목이 없으면 시트 딜 그대로(같은 참조)", async () => {
    setLedger({ active: [], reversed: [] })
    const result = await readLedgerRevenueDeals({ fiscalYear: 2026, now: NOW })
    expect(result.deals).toBe(SHEET_DEALS)
    expect(result.sheetOnlyDeals).toBe(SHEET_DEALS)
    expect(result.info).toMatchObject({ entryCount: 0, ledgerReadable: true })
  })

  it("장부 항목을 읽지 못하면 시트만 돌려주고 ledgerReadable=false 로 알린다(빈 장부로 숨기지 않는다)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.listEntries.mockRejectedValue(new Error("db down"))
    const result = await readLedgerRevenueDeals({ fiscalYear: 2026, now: NOW })
    expect(result.deals).toBe(SHEET_DEALS)
    expect(result.info.ledgerReadable).toBe(false)
  })

  it("REV 읽기 실패는 그대로 던진다(0 매출로 바꾸지 않는다)", async () => {
    mocks.readRev.mockRejectedValue(new Error("rev down"))
    await expect(readLedgerRevenueDeals({ fiscalYear: 2026, now: NOW })).rejects.toThrow("rev down")
  })

  it("시트 쓰기 기록을 못 읽어도 장부 항목은 센다(흡수 판정만 빠진다)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.latestSheetWrites.mockRejectedValue(new Error("audit down"))
    const result = await readLedgerRevenueDeals({ fiscalYear: 2026, now: NOW })
    // 흡수를 못 가려 d-abs 정정(120,000)이 10월에 얹힌다 — 이중 계상 쪽으로 틀린다(화면과 같은 실패 방향).
    expect(confirmedRevenueInMonths(result.deals, ["2026-10"], "2026-11-25")).toBe(120_000)
    expect(result.info.ledgerReadable).toBe(true)
  })
})

describe("scopeLedgerRevenueDeals — 팀 ∩ 담당(F-41), 담당은 branchManagerMatches(F-42)", () => {
  it("팀만·담당만·둘 다", async () => {
    const { deals } = await readLedgerRevenueDeals({ fiscalYear: 2026, now: NOW })
    expect(scopeLedgerRevenueDeals(deals, { team: "MKT" }).map((d) => d.id)).toEqual(["line-c"])
    // 대소문자가 달라도 같은 담당이다.
    expect(scopeLedgerRevenueDeals(deals, { manager: "예시a" }).map((d) => d.id)).toEqual(["line-a", "ledger-e-new-a"])
    expect(scopeLedgerRevenueDeals(deals, { team: "MKT", manager: "예시A" })).toEqual([])
    expect(scopeLedgerRevenueDeals(deals, { team: "ALL", manager: null })).toHaveLength(deals.length)
  })

  it("장부에서 온 딜을 가린다", async () => {
    const { deals } = await readLedgerRevenueDeals({ fiscalYear: 2026, now: NOW })
    expect(deals.filter(isLedgerRevenueDeal).map((d) => d.id)).toEqual(["ledger-e-new-a"])
  })
})

describe("캐시 태그", () => {
  it("장부 입력 캐시 태그는 저장소 상수와 같은 문자열이다(드리프트 방지)", async () => {
    const drafts = await vi.importActual<typeof import("@/lib/repositories/branch-sales-ledger-drafts")>("@/lib/repositories/branch-sales-ledger-drafts")
    const sheetWrites = await vi.importActual<typeof import("@/lib/repositories/branch-sales-ledger-sheet-writes")>("@/lib/repositories/branch-sales-ledger-sheet-writes")
    const sync = await vi.importActual<typeof import("@/lib/repositories/branch-sync")>("@/lib/repositories/branch-sync")
    expect([...LEDGER_REVENUE_CACHE_TAGS]).toEqual([
      drafts.BRANCH_SALES_LEDGER_ENTRIES_CACHE_TAG,
      drafts.BRANCH_SALES_LEDGER_DRAFTS_CACHE_TAG,
      sheetWrites.BRANCH_SALES_LEDGER_SHEET_WRITES_CACHE_TAG,
      sync.BRANCH_SYNC_RUNS_CACHE_TAG,
    ])
  })
})

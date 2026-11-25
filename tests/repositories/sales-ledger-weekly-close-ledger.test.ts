// 주간 마감 스냅샷 = 시트 행 + 장부 항목(D1). 12/1 시트 고정 뒤 매출이 장부에만 쌓여도 "변경 없음"으로 끝나지 않게
// 장부 딜이 라인·checksum 에 들어간다. supabase 는 이 파일의 작은 가짜 클라이언트다(DB 에 붙지 않는다).
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const mocks = vi.hoisted(() => ({ readLedger: vi.fn() }))

interface Inserted { table: string; rows: Array<Record<string, unknown>> }

const db = {
  knownChecksums: new Set<string>(),
  inserted: [] as Inserted[],
  runChecksum: null as string | null,
}

function fakeClient() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let insertRows: Array<Record<string, unknown>> | null = null
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value
          return builder
        },
        insert: (rows: Record<string, unknown> | Array<Record<string, unknown>>) => {
          insertRows = Array.isArray(rows) ? rows : [rows]
          db.inserted.push({ table, rows: insertRows })
          if (table === "sales_ledger_import_runs") db.runChecksum = String(insertRows[0].source_checksum)
          return builder
        },
        update: () => builder,
        maybeSingle: async () => {
          const checksum = String(filters.source_checksum ?? "")
          return db.knownChecksums.has(checksum)
            ? { data: { id: "run-old", started_at: "2026-11-18T00:00:00Z", source_name: "old", row_counts: {}, metadata: { dataSource: "db-import" } }, error: null }
            : { data: null, error: null }
        },
        single: async () => ({ data: { id: "run-new", started_at: "2026-11-25T00:00:00Z", source_name: "weekly-close" }, error: null }),
        then: (resolve: (value: { data: unknown; error: null }) => void) => {
          if (table === "branch_rev_lines" && insertRows) {
            resolve({ data: insertRows.map((row, index) => ({ id: `line-${index}`, source_record_key: row.source_record_key })), error: null })
            return
          }
          resolve({ data: null, error: null })
        },
      }
      return builder
    },
  }
}

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => fakeClient() }))
vi.mock("@/lib/branch/ledger-revenue", async () => ({
  ...(await vi.importActual<typeof import("@/lib/branch/ledger-revenue")>("@/lib/branch/ledger-revenue")),
  readLedgerRevenueDeals: mocks.readLedger,
}))

import { captureWeeklyCloseSnapshot } from "@/lib/repositories/sales-ledger-weekly-close"

function deal(overrides: Partial<BranchRevDeal>): BranchRevDeal {
  return {
    id: "line-x", sheet_row: 3, customer_name: "예시학원1", branch_contact: null, team: "BD", manager: "예시A",
    deal_type: "Direct", status: "Renew", first_payment: null, product_version: null, region: null, importance: null,
    note: null, contract_target: 0, monthly_payments: { "2026-11": 100_000 }, monthly_red: { "2026-11": true },
    monthly_confirmed: { "2026-11": 100_000 }, monthly_high_conf: {}, raw: {}, synced_at: "", ...overrides,
  }
}

const SHEET = [deal({ id: "line-1" })]
// 같은 고객의 장부 신규 행 둘 — 시트 행 번호·고객으로 키를 만들면 겹친다.
const LEDGER = [
  deal({ id: "ledger-e-1", sheet_row: 0, monthly_payments: { "2026-12": 40_000 }, monthly_confirmed: { "2026-12": 40_000 }, monthly_red: { "2026-12": true }, raw: { ledgerDeal: { origin: "entry" } } }),
  deal({ id: "ledger-e-2", sheet_row: 0, monthly_payments: { "2026-12": 60_000 }, monthly_confirmed: { "2026-12": 0 }, monthly_red: { "2026-12": false }, raw: { ledgerDeal: { origin: "entry" } } }),
]

function ledgerResult(deals: BranchRevDeal[]) {
  return { deals, sheetOnlyDeals: SHEET, source: { kind: "import", asOf: null, runId: "run-1" }, info: {} }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.knownChecksums = new Set()
  db.inserted = []
  db.runChecksum = null
})

describe("captureWeeklyCloseSnapshot — 장부 항목 포함(D1)", () => {
  it("장부 항목이 더해지면 같은 시트 상태여도 unchanged:false 로 새 스냅샷을 남긴다", async () => {
    mocks.readLedger.mockResolvedValue(ledgerResult(SHEET))
    const first = await captureWeeklyCloseSnapshot("tester")
    expect(first.unchanged).toBe(false)
    const sheetOnlyChecksum = db.runChecksum!
    db.knownChecksums.add(sheetOnlyChecksum)

    // 시트 그대로 다시 찍으면 같은 checksum → 변경 없음.
    const again = await captureWeeklyCloseSnapshot("tester")
    expect(again.unchanged).toBe(true)

    // 장부에만 입력이 쌓였다(12/1 고정 뒤) → checksum 이 달라 새 스냅샷.
    db.inserted = []
    mocks.readLedger.mockResolvedValue(ledgerResult([...SHEET, ...LEDGER]))
    const withLedger = await captureWeeklyCloseSnapshot("tester")
    expect(withLedger.unchanged).toBe(false)
    expect(db.runChecksum).not.toBe(sheetOnlyChecksum)

    // 장부 딜은 'ledger:<id>' 키로 각각 라인이 된다(같은 고객끼리 겹치지 않는다).
    const lines = db.inserted.find((item) => item.table === "branch_rev_lines")!.rows
    expect(lines.map((row) => row.source_record_key)).toEqual(["sheet:3:예시학원1", "ledger:ledger-e-1", "ledger:ledger-e-2"])
    expect(withLedger.run.rowCounts.rev_lines).toBe(3)
    // 12월 확정 40,000 · 예정 60,000 이 기간 항목으로 남는다.
    const entries = db.inserted.find((item) => item.table === "branch_rev_period_entries")!.rows
    const dec = entries.filter((row) => row.period_month === "2026-12")
    expect(dec.map((row) => [row.confidence, row.amount])).toEqual([["confirmed", 40_000], ["expected", 60_000]])
    expect(withLedger.run.dataSource).toBe("db-import")
  })

  it("KST 영업 회계연도로 읽는다", async () => {
    vi.useFakeTimers()
    // 2027-04-01 00:30 KST = 2027-03-31 15:30 UTC — UTC 로 읽으면 FY2026 이다.
    vi.setSystemTime(new Date("2027-03-31T15:30:00.000Z"))
    mocks.readLedger.mockResolvedValue(ledgerResult(SHEET))
    await captureWeeklyCloseSnapshot("tester")
    expect(mocks.readLedger).toHaveBeenCalledWith(expect.objectContaining({ fiscalYear: 2027 }))
    vi.useRealTimers()
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"

import { splitMonthConfidence } from "@/lib/branch/computations/rev-confirmed"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

type Row = Record<string, unknown>

// In-memory PostgREST boundary: capture writes are read back through the real import reader.
function importClient() {
  const tables: Record<string, Row[]> = {}
  const from = (table: string) => {
    let inserted: Row[] | null = null
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      insert: (values: Row | Row[]) => {
        inserted = JSON.parse(JSON.stringify(Array.isArray(values) ? values : [values])) as Row[]
        inserted.forEach((row, index) => {
          row.id = `${table}-${index}`
          row.created_at = "2026-10-15T00:00:00Z"
          row.source_week ??= null
        })
        tables[table] = inserted
        return builder
      },
      update: () => builder,
      single: async () => ({ data: { id: "run-new", started_at: "2026-10-15T00:00:00Z" }, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      range: async (start: number, end: number) => ({ data: (tables[table] ?? []).slice(start, end + 1), error: null }),
      then: (resolve: (value: { data: Row[] | null; error: null }) => unknown) => resolve({ data: inserted, error: null }),
    }
    return builder
  }
  return { from, tables }
}

function deal(overrides: Partial<BranchRevDeal> = {}): BranchRevDeal {
  return {
    id: "mirror-row", sheet_row: 7, customer_name: "Synthetic account", branch_contact: null,
    team: "BD", manager: null, deal_type: null, status: null, first_payment: null,
    product_version: null, region: null, importance: null, note: null, contract_target: 100,
    monthly_payments: {}, monthly_confirmed: {}, monthly_high_conf: {}, monthly_red: {},
    raw: { row: ["Synthetic account", "원본"], custom: { retained: true } },
    synced_at: "2026-10-15T00:00:00Z", ...overrides,
  }
}

async function captureAndRead(source: BranchRevDeal, beforeRead?: (tables: Record<string, Row[]>) => void) {
  vi.resetModules()
  const client = importClient()
  vi.doMock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }))
  vi.doMock("@/lib/repositories/branch-deals", () => ({ listBranchRevDealsFresh: async () => [source] }))
  const { captureRevDbImport } = await import("@/lib/repositories/sales-ledger-rev-import")
  const { readRevDealsFromActiveImport } = await import("@/lib/repositories/sales-ledger-imports")
  await captureRevDbImport("test", { activate: false })
  beforeRead?.(client.tables)
  const rows = await readRevDealsFromActiveImport(2026, undefined, "run-new")
  return { result: rows![0], client }
}

describe("REV native capture/read fidelity", () => {
  afterEach(() => { vi.resetModules(); vi.restoreAllMocks() })

  it.each([
    { name: "confirmed refund", total: -80, confirmed: -80, high: 0 },
    { name: "net-zero confidence offset", total: 0, confirmed: 100, high: -100 },
    { name: "explicit confirmed zero overrides a legacy red flag", total: 100, confirmed: 0, high: 40 },
    { name: "signed components above a positive net", total: 50, confirmed: 100, high: -50 },
  ])("preserves $name", async ({ total, confirmed, high }) => {
    const month = "2026-08"
    const source = deal({ monthly_payments: { [month]: total }, monthly_confirmed: { [month]: confirmed },
      monthly_high_conf: { [month]: high }, monthly_red: { [month]: true } })
    const { result } = await captureAndRead(source)
    expect(result.monthly_payments).toEqual(source.monthly_payments)
    expect(result.monthly_confirmed?.[month]).toBe(confirmed)
    expect(splitMonthConfidence(result, month, total)).toEqual(splitMonthConfidence(source, month, total))
  })

  it("keeps zero-only months and parser-projected weekly cells without changing the original raw payload", async () => {
    const source = deal({ monthly_payments: { "2026-08": 0 }, monthly_confirmed: { "2026-08": 0 },
      raw: { row: ["Synthetic", 100, -100], weeklyPayments: { "2026-08": [100, -100, 0, 0, 0] }, custom: { retained: true } } })
    const { result, client } = await captureAndRead(source)
    expect(client.tables.branch_rev_lines[0].raw).toEqual(source.raw)
    expect(result.raw.weeklyPayments).toEqual(source.raw.weeklyPayments)
    expect(result.raw.custom).toEqual(source.raw.custom)
    expect(result.monthly_payments).toEqual({ "2026-08": 0 })
    expect(result.monthly_confirmed).toEqual({ "2026-08": 0 })
  })

  it("retains past uncoloured and legacy-red confirmed fallbacks", async () => {
    const legacyColourMaps: Record<string, boolean>[] = [{}, { "2020-08": true }]
    for (const monthly_red of legacyColourMaps) {
      const source = deal({ monthly_payments: { "2020-08": 125 }, monthly_red })
      const { result } = await captureAndRead(source)
      expect(splitMonthConfidence(result, "2020-08", 125)).toEqual({ confirmed: 125, highConfidence: 0, expected: 0 })
    }
  })

  it("keeps parser weeks for other months when a period entry supplies an explicit zero week", async () => {
    const source = deal({ monthly_payments: { "2026-08": 10, "2026-09": 0 },
      raw: { weeklyPayments: { "2026-08": [10, 0, 0, 0, 0] } } })
    const { result } = await captureAndRead(source, (tables) => {
      tables.branch_rev_period_entries.find((row) => row.period_month === "2026-09")!.source_week = "1w"
    })
    expect(result.raw.weeklyPayments).toEqual({ "2026-08": [10, 0, 0, 0, 0], "2026-09": [0, 0, 0, 0, 0] })
  })

  it("keeps future uncoloured amounts expected and positive-only colour maps clamped", async () => {
    const future = await captureAndRead(deal({ monthly_payments: { "9999-08": 100 } }))
    expect(splitMonthConfidence(future.result, "9999-08", 100)).toEqual({ confirmed: 0, highConfidence: 0, expected: 100 })
    const capped = await captureAndRead(deal({ monthly_payments: { "2026-08": 50 }, monthly_confirmed: { "2026-08": 100 } }))
    expect(splitMonthConfidence(capped.result, "2026-08", 50)).toEqual({ confirmed: 50, highConfidence: 0, expected: 0 })
  })
})

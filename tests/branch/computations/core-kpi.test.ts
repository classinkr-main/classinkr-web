import { describe, it, expect } from "vitest"
import { closingDeals, bottleneckKpi, summarizeRevenue } from "@/lib/branch/computations/core-kpi"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import type { KpiRow } from "@/lib/branch/parsers/kpi"
import type { DshOutput } from "@/lib/branch/parsers/dsh"

const mk = (o: Partial<BranchRevDeal>): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD",
  manager: "Han", deal_type: "Direct", status: "New", first_payment: null,
  product_version: null, region: "서울", importance: "A", note: null,
  contract_target: 0, monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "", ...o,
})

describe("core-kpi", () => {
  const dsh: DshOutput = { members: {}, rows: [
    { level: "team", team: "ALL", kind: "goal", annual: 1000, quarters: [100, 200, 300, 400], months: { "2026-10": 100 } },
    { level: "team", team: "BD", kind: "goal", annual: 500, quarters: [50, 100, 150, 200], months: { "2026-10": 50 } },
    { level: "team", team: "BD", kind: "status", annual: 99999, quarters: [99999, 99999, 99999, 99999], months: { "2026-10": 99999 } },
  ] }
  const now = new Date("2026-10-15T00:00:00Z")
  const deals = [
    mk({ monthly_payments: { "2026-10": 80, "2026-11": 200, "2026-04": 400, "2025-10": 999 }, monthly_confirmed: { "2026-10": 60, "2026-11": 50, "2026-04": 20, "2025-10": 999 } }),
    mk({ monthly_payments: { "2026-10": -10 }, monthly_confirmed: { "2026-10": -10 } }),
    mk({ team: "CSM", monthly_payments: { "2026-10": 0 }, monthly_confirmed: { "2026-10": 5 }, monthly_high_conf: { "2026-10": -5 } }),
  ]

  it("uses REV confirmed revenue and the approved DSH total goal rather than DSH status", () => {
    const total = summarizeRevenue(dsh, deals, "ALL", "M", now)
    expect(total).toMatchObject({ confirmed: 55, goal: 100 })
    expect(total.pacing_pct).toBeCloseTo(55, 8)
    expect(summarizeRevenue(dsh, deals, "BD", "M", now)).toEqual({ confirmed: 50, goal: 50, pacing_pct: 100 })
    expect(summarizeRevenue(dsh, [], "ALL", "M", now).confirmed).toBe(0)
  })

  it("keeps fiscal quarter/year, signed offsets and legacy-team ledger amounts in their scopes", () => {
    expect(summarizeRevenue(dsh, deals, "ALL", "Q", now).confirmed).toBe(105)
    expect(summarizeRevenue(dsh, deals, "ALL", "Y", now)).toEqual({ confirmed: 125, goal: 1000, pacing_pct: 12.5 })
    expect(summarizeRevenue(dsh, deals, "CSM", "M", now).confirmed).toBe(5)
  })

  it("closing deals: firstPayment within 30d", () => {
    const now = new Date("2026-05-01T00:00:00Z")
    const out = closingDeals([
      mk({ first_payment: "2026-05-15", contract_target: 100 }),
      mk({ first_payment: "2026-08-01", contract_target: 200 }),
    ], now)
    expect(out.count).toBe(1); expect(out.total_target).toBe(100)
  })
  it("bottleneck picks lowest pct metric", () => {
    const rows: KpiRow[] = [{ member: "A", pairs: {
      LD: { goal: 10, actual: 5 }, ACC: { goal: 10, actual: 9 },
      OPP: { goal: 10, actual: 8 }, SOL: { goal: 10, actual: 7 }, VST: { goal: 10, actual: 6 },
    }}]
    const out = bottleneckKpi(rows, new Set())
    expect(out.metric).toBe("LD"); expect(out.pct).toBe(50)
  })
})

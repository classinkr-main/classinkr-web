import { describe, it, expect } from "vitest"
import { closingDeals, bottleneckKpi } from "@/lib/branch/computations/core-kpi"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import type { KpiRow } from "@/lib/branch/parsers/kpi"

const mk = (o: Partial<BranchRevDeal>): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD",
  manager: "Han", deal_type: "Direct", status: "New", first_payment: null,
  product_version: null, region: "서울", importance: "A", note: null,
  contract_target: 0, monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "", ...o,
})

describe("core-kpi", () => {
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

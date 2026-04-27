import { describe, it, expect } from "vitest"
import { computeHeatmap } from "@/lib/branch/computations/heatmap"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const mk = (over: Partial<BranchRevDeal>): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD",
  manager: "Han", deal_type: "Direct", status: "New", first_payment: null,
  product_version: null, region: "서울", importance: "A", note: null,
  contract_target: 0, monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "",
  ...over,
})

describe("computeHeatmap", () => {
  const now = new Date("2026-05-15T00:00:00Z")
  it("target = sum of M (incl. firstPayment-less deals)", () => {
    const out = computeHeatmap([
      mk({ region: "서울", contract_target: 1000 }),
      mk({ region: "서울", contract_target: 500, first_payment: "2026-04-01", monthly_payments: { "2026-04": 200 }, monthly_red: { "2026-04": true } }),
    ], "Y", now)
    expect(out[0].target).toBe(1500)
    expect(out[0].revenue).toBe(200)
  })
  it("status thresholds", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01", monthly_payments: { "2026-04": 950 }, monthly_red: { "2026-04": true } }),
      mk({ region: "B", contract_target: 1000, first_payment: "2026-04-01", monthly_payments: { "2026-04": 800 }, monthly_red: { "2026-04": true } }),
      mk({ region: "C", contract_target: 1000, first_payment: "2026-04-01", monthly_payments: { "2026-04": 500 }, monthly_red: { "2026-04": true } }),
    ], "Y", now)
    const map = Object.fromEntries(out.map((r) => [r.region, r.status]))
    expect(map.A).toBe("good"); expect(map.B).toBe("warning"); expect(map.C).toBe("critical")
  })
  it("ignores cells without red flag", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01",
          monthly_payments: { "2026-04": 800 }, monthly_red: {} }),
    ], "Y", now)
    expect(out[0].revenue).toBe(0)
  })
})

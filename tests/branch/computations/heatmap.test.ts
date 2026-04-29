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
  const now = new Date("2026-05-15T00:00:00Z") // FY26 Q1, month index 2

  it("target = sum of contract_target (lifetime, period-independent)", () => {
    const out = computeHeatmap([
      mk({ region: "서울", contract_target: 1000 }),
      mk({ region: "서울", contract_target: 500, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 200 }, monthly_red: { "2026-04": true } }),
    ], "Y", now)
    expect(out[0].target).toBe(1500)
    expect(out[0].revenue).toBe(200)
    expect(out[0].open_target).toBe(1000)
  })

  it("future months become projection regardless of red flag", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 400, "2026-06": 600 },
        monthly_red: { "2026-04": true, "2026-06": true } }),
    ], "Q", now)
    // 2026-04 past+red → confirmed (400)
    // 2026-06 future → projection (600), red flag ignored
    expect(out[0].revenue).toBe(400)
    expect(out[0].projected).toBe(600)
    expect(out[0].expected).toBe(1000)
  })

  it("past month without red flag is projection when red-flag system in use", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 800, "2026-05": 200 },
        monthly_red: { "2026-04": true } }),
    ], "Y", now)
    expect(out[0].revenue).toBe(800)
    expect(out[0].projected).toBe(200)
  })

  it("treats months as confirmed when no red flags exist (sheet without color convention)", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 800 }, monthly_red: {} }),
    ], "Y", now)
    expect(out[0].revenue).toBe(800)
    expect(out[0].projected).toBe(0)
  })

  it("M/Q/Y produce different progress because numerator scopes by period but target is fixed", () => {
    // Schedule: 100 each month, all 12 months of FY26
    const monthly: Record<string, number> = {}
    const red: Record<string, boolean> = {}
    for (let m = 4; m <= 12; m++) {
      monthly[`2026-${String(m).padStart(2, "0")}`] = 100
      red[`2026-${String(m).padStart(2, "0")}`] = true
    }
    for (let m = 1; m <= 3; m++) {
      monthly[`2027-${String(m).padStart(2, "0")}`] = 100
      red[`2027-${String(m).padStart(2, "0")}`] = true
    }
    const deal = mk({
      region: "A", contract_target: 1200, first_payment: "2026-04-01",
      monthly_payments: monthly, monthly_red: red,
    })
    const yOut = computeHeatmap([deal], "Y", now)
    const qOut = computeHeatmap([deal], "Q", now)
    const mOut = computeHeatmap([deal], "M", now)
    // Y: all 12 months → expected=1200, progress=100%
    expect(yOut[0].progress).toBeCloseTo(100)
    // Q: 3 months (Apr-May-Jun) → expected=300, progress=25%
    expect(qOut[0].progress).toBeCloseTo(25)
    // M: 1 month (May) → expected=100, progress=8.33%
    expect(mOut[0].progress).toBeCloseTo(100 / 12, 1)
  })

  it("status thresholds based on expected/target", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 950 }, monthly_red: { "2026-04": true } }),
      mk({ region: "B", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 800 }, monthly_red: { "2026-04": true } }),
      mk({ region: "C", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 500 }, monthly_red: { "2026-04": true } }),
    ], "Y", now)
    const map = Object.fromEntries(out.map((r) => [r.region, r.status]))
    expect(map.A).toBe("good")
    expect(map.B).toBe("warning")
    expect(map.C).toBe("critical")
  })

  it("velocity returns finite ratio of progress to elapsed quarter time", () => {
    const jan = new Date("2027-01-15T00:00:00Z")
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2027-01-01",
        monthly_payments: { "2027-01": 100 }, monthly_red: { "2027-01": true } }),
    ], "Q", jan)
    expect(out[0].velocity).toBeGreaterThan(0)
    expect(Number.isFinite(out[0].velocity)).toBe(true)
  })
})

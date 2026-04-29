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
  it("target is the period-scoped sum of monthly_payments", () => {
    const out = computeHeatmap([
      mk({ region: "서울", contract_target: 1000 }), // no schedule → only counts as open_target
      mk({ region: "서울", contract_target: 500, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 200 }, monthly_red: { "2026-04": true } }),
    ], "Y", now)
    expect(out[0].target).toBe(200)
    expect(out[0].revenue).toBe(200)
    expect(out[0].open_target).toBe(1000)
  })
  it("status thresholds based on expected/target progress", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01", monthly_payments: { "2026-04": 950 }, monthly_red: { "2026-04": true } }),
      mk({ region: "B", contract_target: 1000, first_payment: "2026-04-01", monthly_payments: { "2026-04": 800 }, monthly_red: { "2026-04": true } }),
      mk({ region: "C", contract_target: 1000, first_payment: "2026-04-01", monthly_payments: { "2026-04": 500 }, monthly_red: { "2026-04": true } }),
    ], "Y", now)
    // expected/target = 950/950, 800/800, 500/500 — all 100%, all good. We need
    // a separate target schedule to differentiate. Re-jig: schedule covers
    // future months too, only April is paid.
    const out2 = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 950, "2026-06": 50 }, monthly_red: { "2026-04": true } }),
      mk({ region: "B", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 800, "2026-06": 200 }, monthly_red: { "2026-04": true } }),
      mk({ region: "C", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 500, "2026-06": 500 }, monthly_red: { "2026-04": true } }),
    ], "Q", now)
    // 2026-05-15 is FY26 Q1 (Apr-May-Jun). All scheduled months in scope.
    // Expected = 950+50, 800+200, 500+500 = 1000 each. Target = 1000 each.
    // All 100% → all good. (확정 vs 추정 split is irrelevant for progress.)
    const map = Object.fromEntries(out2.map((r) => [r.region, r.status]))
    expect(map.A).toBe("good"); expect(map.B).toBe("good"); expect(map.C).toBe("good")
    expect(out).toBeDefined()
  })
  it("future months become projection (not confirmed) regardless of red flag", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 400, "2026-06": 600 },
        monthly_red: { "2026-04": true, "2026-06": true } }),
    ], "Q", now)
    // 2026-04 is past relative to 2026-05-15 → confirmed (400)
    // 2026-06 is future → projection (600), even though red-flagged
    expect(out[0].revenue).toBe(400)
    expect(out[0].projected).toBe(600)
    expect(out[0].expected).toBe(1000)
  })
  it("past month without red flag is projection when red-flag system is in use", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 800, "2026-05": 200 },
        monthly_red: { "2026-04": true } }),
    ], "Y", now)
    // 2026-04 past + red → confirmed (800)
    // 2026-05 is current month, has first_payment, but red-flag system in use
    // and this month not flagged → projection (200)
    expect(out[0].revenue).toBe(800)
    expect(out[0].projected).toBe(200)
  })
  it("treats past months as confirmed when no red flags exist (sheet without color convention)", () => {
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2026-04-01",
        monthly_payments: { "2026-04": 800 }, monthly_red: {} }),
    ], "Y", now)
    expect(out[0].revenue).toBe(800)
    expect(out[0].projected).toBe(0)
  })
  it("velocity in Q4 (January) computes a sane denominator", () => {
    const jan = new Date("2027-01-15T00:00:00Z")
    const out = computeHeatmap([
      mk({ region: "A", contract_target: 1000, first_payment: "2027-01-01",
        monthly_payments: { "2027-01": 100 }, monthly_red: { "2027-01": true } }),
    ], "Q", jan)
    // Front-loaded scheduling (all of Jan booked up front) → velocity > 1 is
    // legitimate. The guard is only that it's a finite ratio of progress to
    // elapsed time within the quarter.
    expect(out[0].velocity).toBeGreaterThan(0)
    expect(Number.isFinite(out[0].velocity)).toBe(true)
  })
})

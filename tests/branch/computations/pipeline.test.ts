import { describe, it, expect } from "vitest"
import { dealProbability, pipelineValue, stageOf, listPipeline, listRevRevenue } from "@/lib/branch/computations/pipeline"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const mk = (over: Partial<BranchRevDeal>): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD", manager: "Han",
  deal_type: "Direct", status: "New", first_payment: null, product_version: null,
  region: "서울", importance: "A", note: null, contract_target: 0,
  monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "", ...over,
})

describe("pipeline", () => {
  it("contract when firstPayment present", () => { const d = mk({ first_payment: "2026-04-10" }); expect(dealProbability(d)).toBe(1); expect(stageOf(d)).toBe("contract") })
  it("negotiation note", () => { const d = mk({ note: "Negotiation phase" }); expect(dealProbability(d)).toBe(0.7) })
  it("renew + KA cap 0.6", () => { const d = mk({ status: "Renew", importance: "KA" }); expect(dealProbability(d)).toBe(0.5) })
  it("channel reduces base", () => { const d = mk({ deal_type: "Channel" }); expect(dealProbability(d)).toBeCloseTo(0.17, 2) })
  it("pipelineValue multiplies target", () => { const d = mk({ contract_target: 1000, status: "Renew" }); expect(pipelineValue(d)).toBe(400) })
  it("listPipeline filters by team", () => {
    const rows = listPipeline([mk({ id:"a", team:"BD" }), mk({ id:"b", team:"MKT" })], { team: "BD" })
    expect(rows.map((r) => r.id)).toEqual(["a"])
  })
  it("normalizes confirmed CSM placeholder names in pipeline rows and filters", () => {
    const deals = [
      mk({ id: "a", manager: "New 2", team: "CSM", monthly_payments: { "2026-04": 100 } }),
      mk({ id: "b", manager: "Somang", team: "CSM", monthly_payments: { "2026-04": 200 } }),
    ]

    expect(listPipeline(deals, { manager: "minjae" }).map((r) => r.manager)).toEqual(["Minjae"])
    expect(listRevRevenue(deals, { manager: "Minjae" }).map((r) => r.manager)).toEqual(["Minjae"])
  })
})

import { describe, it, expect } from "vitest"
import { runDataQuality } from "@/lib/branch/computations/data-quality"
import type { DshOutput } from "@/lib/branch/parsers/dsh"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const emptyDsh: DshOutput = { rows: [], members: {} }

const mk = (over: Partial<BranchRevDeal>): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD",
  manager: "Han", deal_type: "Direct", status: "New", first_payment: null,
  product_version: null, region: "서울", importance: "A", note: null,
  contract_target: 0, monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "",
  ...over,
})

describe("runDataQuality", () => {
  it("flags missing DSH team", () => {
    const dsh: DshOutput = { rows: [], members: {} }
    const out = runDataQuality({
      deals: [], dsh, kpi: [], seg: [], hwInbound: [], hwOutbound: [], hwStock: [],
    })
    expect(out.find((i) => i.id === "DQ-7")).toBeTruthy()
  })

  // REV_RANGE 상한(현재 '2. REV'!A1:CF1000 → 1000행) 사용률 규칙(DQ-15).
  describe("DQ-15 REV range usage", () => {
    it("does not fire below the 90% warn threshold", () => {
      const out = runDataQuality({
        deals: [mk({ sheet_row: 899 })], dsh: emptyDsh, kpi: [], seg: [],
        hwInbound: [], hwOutbound: [], hwStock: [],
      })
      expect(out.find((i) => i.id === "DQ-15")).toBeUndefined()
    })

    it("warns once max sheet_row reaches 90% of the range upper bound", () => {
      const out = runDataQuality({
        deals: [mk({ sheet_row: 900 })], dsh: emptyDsh, kpi: [], seg: [],
        hwInbound: [], hwOutbound: [], hwStock: [],
      })
      const issue = out.find((i) => i.id === "DQ-15")
      expect(issue?.severity).toBe("warn")
      expect(issue?.message).toContain("상한 증설 검토")
    })

    it("errors once max sheet_row reaches the range upper bound (truncation risk)", () => {
      const out = runDataQuality({
        deals: [mk({ sheet_row: 1000 })], dsh: emptyDsh, kpi: [], seg: [],
        hwInbound: [], hwOutbound: [], hwStock: [],
      })
      const issue = out.find((i) => i.id === "DQ-15")
      expect(issue?.severity).toBe("error")
      expect(issue?.message).toContain("범위 절단 의심")
    })

    it("is skipped entirely when there are no deals", () => {
      const out = runDataQuality({
        deals: [], dsh: emptyDsh, kpi: [], seg: [], hwInbound: [], hwOutbound: [], hwStock: [],
      })
      expect(out.find((i) => i.id === "DQ-15")).toBeUndefined()
    })
  })
})

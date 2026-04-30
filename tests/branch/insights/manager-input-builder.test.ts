import { describe, it, expect } from "vitest"
import { buildManagerInsightInput } from "@/lib/branch/insights/manager-input-builder"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import type { KpiRow } from "@/lib/branch/parsers/kpi"

const mk = (over: Partial<BranchRevDeal> = {}): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD",
  manager: "Han", deal_type: "Direct", status: "New", first_payment: null,
  product_version: null, region: "서울", importance: "A", note: null,
  contract_target: 1000, monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "",
  ...over,
})

const kpiRow: KpiRow = {
  member: "Han",
  pairs: {
    LD: { goal: 100, actual: 50 },
    ACC: { goal: 50, actual: 5 },
    OPP: { goal: 50, actual: 30 },
    SOL: { goal: 100, actual: 90 },
    VST: { goal: 200, actual: 100 },
  },
}

describe("buildManagerInsightInput", () => {
  const now = new Date("2026-05-15T00:00:00Z")
  it("aggregates per-manager metrics", () => {
    const input = buildManagerInsightInput({
      manager: "Han", team: "BD", scope: "Q", now,
      fiscalPeriod: "FY2026-Q1",
      deals: [
        mk({ contract_target: 1000, first_payment: "2026-04-10", monthly_payments: { "2026-04": 500 }, monthly_red: { "2026-04": true } }),
        mk({ contract_target: 2000, first_payment: null, status: "Renew", deal_type: "Channel" }),
      ],
      kpiRow,
    })
    expect(input.metrics.deals_total).toBe(2)
    expect(input.metrics.deals_confirmed).toBe(1)
    expect(input.metrics.confirmed_revenue).toBe(500)
    expect(input.metrics.new_count).toBe(1)
    expect(input.metrics.renew_count).toBe(1)
    expect(input.metrics.direct_count).toBe(1)
    expect(input.metrics.channel_count).toBe(1)
  })
  it("identifies weakest and strongest KPIs", () => {
    const input = buildManagerInsightInput({
      manager: "Han", team: "BD", scope: "Q", now,
      fiscalPeriod: "FY2026-Q1",
      deals: [mk({})], kpiRow,
    })
    expect(input.weakest_kpi?.name).toBe("ACC")  // 10%
    expect(input.strongest_kpi?.name).toBe("SOL")  // 90%
  })
  it("flags caveats when data sparse", () => {
    const input = buildManagerInsightInput({
      manager: "Ghost", team: null, scope: "Q", now,
      fiscalPeriod: "FY2026-Q1",
      deals: [], kpiRow: null,
    })
    expect(input.data_caveats).toContain("이 매니저에게 할당된 REV 딜이 없음")
    expect(input.data_caveats).toContain("KPI 시트에서 이 매니저 활동 데이터 누락")
  })
})

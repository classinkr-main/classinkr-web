import { describe, it, expect } from "vitest"
import { buildInsightInput, digestInput } from "@/lib/branch/insights/input-builder"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import type { DshOutput } from "@/lib/branch/parsers/dsh"

const emptyDsh: DshOutput = { rows: [], members: {}, breakdown: [] }
const baseArgs = {
  team: "ALL" as const,
  scope: "Q" as const,
  now: new Date("2026-05-15T00:00:00Z"),
  dsh: emptyDsh,
  kpi: [],
  deals: [] as BranchRevDeal[],
  events: [],
  campaigns: [],
  hwAlerts: [],
}

describe("buildInsightInput", () => {
  it("includes summary_metrics with zero defaults", () => {
    const out = buildInsightInput(baseArgs)
    expect(out.summary_metrics.total_goal).toBe(0)
    expect(out.summary_metrics.top_region).toBeNull()
    expect(out.summary_metrics.best_manager).toBeNull()
  })
  it("includes data_caveats for missing data", () => {
    const out = buildInsightInput(baseArgs)
    expect(out.data_caveats).toContain("REV 시트에서 가져온 딜 데이터가 없음 (sync 미실행 가능성)")
    expect(out.data_caveats).toContain("KPI 시트에서 가져온 활동 데이터가 없음")
    expect(out.data_caveats).toContain("향후 30일 예정 행사 없음")
    expect(out.data_caveats).toContain("최근 30일 발송 캠페인 없음")
  })
  it("deal_mix is empty for non-ALL teams", () => {
    const out = buildInsightInput({ ...baseArgs, team: "BD" })
    expect(out.deal_mix.by_category).toEqual([])
    expect(out.deal_mix.by_status_type).toEqual([])
    expect(out.deal_mix.by_channel).toEqual([])
  })
  it("digestInput is deterministic", () => {
    const a = buildInsightInput(baseArgs)
    const b = buildInsightInput(baseArgs)
    expect(digestInput(a)).toBe(digestInput(b))
  })
})

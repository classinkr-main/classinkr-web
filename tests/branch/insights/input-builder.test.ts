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
  it("deal_mix dedupes per-scope duplicated breakdown combos (3중 계상 방지)", () => {
    // 파서 breakdown은 같은 (kind, category, status_type, channel) 콤보를 스코프별
    // (전사 + 팀/멤버 섹션)로 반복 방출한다 — 전사 행(최대 annual)은 부분 행들의 합.
    // summary 라우트 deal_mix와 동일하게 dedupeDshByKind(최대-annual 채택)를 거쳐야 한다.
    const mk = (kind: "goal" | "status", annual: number) => ({
      kind,
      category: "Software",
      status_type: "New",
      channel: "Direct",
      annual,
      quarters: [annual / 4, annual / 4, annual / 4, annual / 4] as [number, number, number, number],
      months: { "2026-05": annual / 12 },
    })
    const out = buildInsightInput({
      ...baseArgs,
      scope: "Y" as const,
      dsh: {
        rows: [],
        members: {},
        // 전사 60M = 팀 40M + 멤버 20M — raw 합산이면 goal 120M으로 부푼다.
        breakdown: [mk("goal", 60_000_000), mk("goal", 40_000_000), mk("goal", 20_000_000), mk("status", 24_000_000), mk("status", 16_000_000), mk("status", 8_000_000)],
      },
    })
    expect(out.deal_mix.by_category).toEqual([
      { name: "Software", goal: 60_000_000, actual: 24_000_000, pct: 40 },
    ])
  })
  it("digestInput is deterministic", () => {
    const a = buildInsightInput(baseArgs)
    const b = buildInsightInput(baseArgs)
    expect(digestInput(a)).toBe(digestInput(b))
  })
})

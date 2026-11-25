import { describe, it, expect } from "vitest"
import { checkNumericalSanity } from "@/lib/branch/insights/sanity-check"
import { toInsightCompassBlock, toInsightKaBlock, type InsightInput } from "@/lib/branch/insights/input-builder"
import type { InsightResult } from "@/lib/branch/insights/gemini-runner"

const mkInput = (over: Partial<InsightInput> = {}): InsightInput => ({
  fiscalPeriod: "FY2026-Q1", team: "ALL", scope: "Q",
  team_pacing: { goal: 100000, status: 17000, pacing_pct: 17 },
  summary_metrics: {
    total_goal: 100000, total_confirmed_revenue: 17000, total_pipeline_value: 5000,
    gap_to_goal: 83000,
    top_region: { region: "서울", revenue: 8000 },
    worst_region: { region: "인천", progress_pct: 5 },
    best_manager: { name: "Han", achievement_pct: 67 },
    worst_manager: { name: "Junhyuk", achievement_pct: 5 },
  },
  deal_mix: { by_category: [], by_status_type: [], by_channel: [] },
  data_caveats: [],
  managers: [], regions: [],
  bottleneck_kpi: { name: "ACC", pct: 2.3, worst_member: "Junhyuk" },
  closing_deals: [], events_30d: [], campaigns_30d: [], hw_alerts: [],
  ka_quarter: toInsightKaBlock(null),
  compass_weekly: toInsightCompassBlock(null),
  ...over,
})

describe("checkNumericalSanity", () => {
  it("flags numbers not in input", () => {
    const w = checkNumericalSanity(mkInput(), {
      one_liner: "달성률 99% 부진",   // 99 not in input
      next_actions: [],
    } as InsightResult)
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].field).toBe("one_liner")
  })
  it("accepts numbers within 10% of input", () => {
    const w = checkNumericalSanity(mkInput(), {
      one_liner: "Q1 달성률 17%로 부진",   // matches pacing_pct=17
      next_actions: [{ title: "테스트", why: "달성률 18% 개선", owner: "Han" }],   // 18 within 10% of 17
    } as InsightResult)
    expect(w.length).toBe(0)
  })
  it("ignores tiny numbers (months, indices)", () => {
    const w = checkNumericalSanity(mkInput(), {
      one_liner: "Q1 의 5단계 액션",   // 1, 5 are too small to flag
      next_actions: [],
    } as InsightResult)
    expect(w.length).toBe(0)
  })

  it("보고서 4줄도 검사하고 KA·Compass 주간 수치와 만 단위 금액은 입력으로 인정한다", () => {
    const compass = { ...toInsightCompassBlock(null), state: "ready" as const, inflow: [34, 21] as [number, number], stages: [{ stage: "데모", this_week: 15, prev_week: 18 }] }
    const ka = { ...toInsightKaBlock(null), state: "ready" as const, confirmed: 420000, open: 180000, customer_count: 6 }
    const w = checkNumericalSanity(mkInput({ compass_weekly: compass, ka_quarter: ka }), {
      one_liner: "", next_actions: [],
      report_notes: ["매출 달성률 17%입니다.", "KA 확정 ¥42.0만, 미확정 ¥18만입니다.", "유입 34건으로 그 전 주보다 13건 늘었습니다.", "데모가 77건입니다."],
    } as InsightResult)
    expect(w.map((x) => x.field)).toEqual(["report_notes[3]"])
  })
})

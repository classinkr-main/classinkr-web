import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import type { KpiRow, KpiMetric } from "@/lib/branch/parsers/kpi"
import type { DshOutput } from "@/lib/branch/parsers/dsh"
import { teamPacing } from "./pacing"
import { dealProbability, revenueFromRev } from "./pipeline"
import type { Period } from "./heatmap"

export interface CoreKpiSummary {
  revenue: { confirmed: number; goal: number; pacing_pct: number }
  bottleneck_kpi: { metric: KpiMetric | null; pct: number; worst_member: string | null }
  closing_deals: { count: number; total_target: number }
  events_30d: { count: number; regions: number }
  campaigns_30d: { count: number; avg_open_pct: number; conv_revenue: number }
}

export function summarizeRevenue(dsh: DshOutput, deals: BranchRevDeal[], team: string, scope: Period, now: Date): CoreKpiSummary["revenue"] {
  // 확정액은 파이프라인·장부와 같은 REV 산식이며 DSH는 승인된 목표만 제공한다.
  // 이전 조직 장부도 전체 합계에는 남기되 현재 소속으로 재귀속하지 않는다.
  const confirmed = deals.reduce((sum, deal) => team === "ALL" || deal.team === team
    ? sum + revenueFromRev(deal, scope, now) : sum, 0)
  const hasTotalGoal = dsh.rows.some((row) => row.level === "team" && row.team === "ALL" && row.kind === "goal")
  const goal = team === "ALL" && !hasTotalGoal
    ? ["BD", "MKT", "CSM"].reduce((sum, key) => sum + teamPacing(dsh, key, scope, now).goal, 0)
    : teamPacing(dsh, team, scope, now).goal
  return { confirmed, goal, pacing_pct: goal > 0 ? (confirmed / goal) * 100 : 0 }
}

export function bottleneckKpi(rows: KpiRow[], teamMembers: Set<string>): CoreKpiSummary["bottleneck_kpi"] {
  const filtered = teamMembers.size === 0 ? rows : rows.filter((r) => teamMembers.has(r.member))
  if (filtered.length === 0) return { metric: null, pct: 0, worst_member: null }
  const totals: Record<KpiMetric, number> = { LD: 0, ACC: 0, OPP: 0, SOL: 0, VST: 0 }
  const goals: Record<KpiMetric, number> = { LD: 0, ACC: 0, OPP: 0, SOL: 0, VST: 0 }
  const metrics: KpiMetric[] = ["LD","ACC","OPP","SOL","VST"]
  for (const m of metrics) {
    for (const r of filtered) { totals[m] += r.pairs[m].actual; goals[m] += r.pairs[m].goal }
  }
  let worstMetric: KpiMetric | null = null; let worstPct = Infinity
  for (const m of metrics) {
    const pct = goals[m] > 0 ? (totals[m] / goals[m]) * 100 : 0
    if (pct < worstPct) { worstPct = pct; worstMetric = m }
  }
  if (!worstMetric) return { metric: null, pct: 0, worst_member: null }
  const wm = worstMetric
  const worstMember = filtered
    .map((r) => ({ m: r.member, pct: r.pairs[wm].goal > 0 ? (r.pairs[wm].actual / r.pairs[wm].goal) * 100 : 0 }))
    .sort((a, b) => a.pct - b.pct)[0]?.m ?? null
  return { metric: worstMetric, pct: worstPct, worst_member: worstMember }
}

export function closingDeals(deals: BranchRevDeal[], now: Date): CoreKpiSummary["closing_deals"] {
  const deadline = new Date(now); deadline.setUTCDate(deadline.getUTCDate() + 30)
  const candidates = deals.filter((d) => {
    if (d.first_payment) {
      const fp = new Date(d.first_payment); return fp >= now && fp <= deadline
    }
    return dealProbability(d) >= 0.7
  })
  return { count: candidates.length, total_target: candidates.reduce((s, d) => s + Number(d.contract_target ?? 0), 0) }
}

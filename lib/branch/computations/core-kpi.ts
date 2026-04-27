import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import type { KpiRow, KpiMetric } from "@/lib/branch/parsers/kpi"
import type { DshOutput } from "@/lib/branch/parsers/dsh"
import { teamPacing } from "./pacing"
import { dealProbability } from "./pipeline"
import type { Period } from "./heatmap"

export interface CoreKpiSummary {
  revenue: { confirmed: number; goal: number; pacing_pct: number }
  bottleneck_kpi: { metric: KpiMetric | null; pct: number; worst_member: string | null }
  closing_deals: { count: number; total_target: number }
  events_30d: { count: number; regions: number }
  campaigns_30d: { count: number; avg_open_pct: number; conv_revenue: number }
}

export function summarizeRevenue(dsh: DshOutput, _deals: BranchRevDeal[], team: string, scope: Period, now: Date): CoreKpiSummary["revenue"] {
  if (team === "ALL") {
    let goal = 0, status = 0
    for (const t of ["BD","MKT","CSM"]) {
      const p = teamPacing(dsh, t, scope, now); goal += p.goal; status += p.status
    }
    return { confirmed: status, goal, pacing_pct: goal > 0 ? (status / goal) * 100 : 0 }
  }
  const pace = teamPacing(dsh, team, scope, now)
  return { confirmed: pace.status, goal: pace.goal, pacing_pct: pace.pacing_pct }
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

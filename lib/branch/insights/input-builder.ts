import "server-only"
import { createHash } from "crypto"
import type { DshOutput, DshBreakdownRow } from "@/lib/branch/parsers/dsh"
import type { KpiRow } from "@/lib/branch/parsers/kpi"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { teamPacing } from "@/lib/branch/computations/pacing"
import { deriveMemberTeams } from "@/lib/branch/computations/member-teams"
import { computeHeatmap } from "@/lib/branch/computations/heatmap"
import { dealProbability } from "@/lib/branch/computations/pipeline"
import { fyOf, fiscalQuarter, ymKey } from "@/lib/branch/fiscal"
import type { Period } from "@/lib/branch/computations/heatmap"

export type TeamScope = "ALL" | "BD" | "MKT" | "CSM"

export interface InsightInput {
  fiscalPeriod: string
  team: TeamScope
  scope: Period
  team_pacing: { goal: number; status: number; pacing_pct: number }

  // pre-computed top-line numbers so the LLM doesn't re-derive
  summary_metrics: {
    total_goal: number
    total_confirmed_revenue: number
    total_pipeline_value: number
    gap_to_goal: number
    top_region: { region: string; revenue: number } | null
    worst_region: { region: string; progress_pct: number } | null
    best_manager: { name: string; achievement_pct: number } | null
    worst_manager: { name: string; achievement_pct: number } | null
  }

  // deal mix from DSH (only when team === "ALL"; otherwise empty arrays)
  deal_mix: {
    by_category: Array<{ name: string; goal: number; actual: number; pct: number }>
    by_status_type: Array<{ name: string; goal: number; actual: number; pct: number }>
    by_channel: Array<{ name: string; goal: number; actual: number; pct: number }>
  }

  // data caveats so LLM can mention gaps explicitly
  data_caveats: string[]

  managers: Array<{
    name: string; team: string|null
    goal: number; status: number; pipeline: number
    achievement_pct: number
    deals_total: number; deals_confirmed: number
    new_renew: { new: number; renew: number }
    kpi: Record<string, [number, number]>
  }>
  regions: Array<{ region: string; target: number; revenue: number; progress_pct: number; status: string }>
  bottleneck_kpi: { name: string; pct: number; worst_member: string|null }
  closing_deals: Array<{ customer: string; manager: string|null; expected: number; due: string|null }>
  events_30d: Array<{ title: string; date: string; region?: string|null }>
  campaigns_30d: Array<{ name: string; sent_at: string; open_pct: number }>
  hw_alerts: Array<{ product: string; current: number; threshold: number }>
}

export function digestInput(inp: InsightInput): string {
  return createHash("sha256").update(JSON.stringify(inp)).digest("hex")
}

export interface BuildArgs {
  team: TeamScope
  scope: Period
  now: Date
  dsh: DshOutput
  kpi: KpiRow[]
  deals: BranchRevDeal[]
  events: Array<{ title: string; startsAt: string; location: string|null }>
  campaigns: Array<{ subject: string; sentAt?: string; openPct: number }>
  hwAlerts: Array<{ product: string; current: number; threshold: number }>
}

function pickBreakdownValue(row: DshBreakdownRow, scope: Period, now: Date): number {
  if (scope === "Y") return row.annual
  if (scope === "Q") return row.quarters[fiscalQuarter(now.getUTCMonth() + 1) - 1] ?? 0
  return row.months[ymKey(now)] ?? 0
}

function buildMix(
  breakdown: DshBreakdownRow[],
  dim: "category" | "status_type" | "channel",
  scope: Period,
  now: Date,
): Array<{ name: string; goal: number; actual: number; pct: number }> {
  const goals = new Map<string, number>()
  const actuals = new Map<string, number>()
  for (const row of breakdown) {
    const key = row[dim]
    if (row.kind === "goal") goals.set(key, (goals.get(key) ?? 0) + pickBreakdownValue(row, scope, now))
    else actuals.set(key, (actuals.get(key) ?? 0) + pickBreakdownValue(row, scope, now))
  }
  const keys = new Set([...goals.keys(), ...actuals.keys()])
  return [...keys].map((k) => {
    const g = goals.get(k) ?? 0
    const ac = actuals.get(k) ?? 0
    return { name: k, goal: g, actual: ac, pct: g > 0 ? (ac / g) * 100 : 0 }
  }).sort((x, y) => y.goal - x.goal)
}

export function buildInsightInput(a: BuildArgs): InsightInput {
  const fy = fyOf(a.now)
  const q = fiscalQuarter(a.now.getUTCMonth() + 1)

  let pacing = { goal: 0, status: 0, pacing_pct: 0 }
  if (a.team === "ALL") {
    for (const t of ["BD","MKT","CSM"] as const) {
      const p = teamPacing(a.dsh, t, a.scope, a.now)
      pacing.goal += p.goal; pacing.status += p.status
    }
  } else {
    pacing = { ...teamPacing(a.dsh, a.team, a.scope, a.now) }
  }
  pacing.pacing_pct = pacing.goal > 0 ? (pacing.status / pacing.goal) * 100 : 0

  const memberTeams = deriveMemberTeams(a.deals)
  const members = a.team === "ALL"
    ? Object.keys(memberTeams)
    : Object.entries(memberTeams).filter(([, t]) => t === a.team).map(([m]) => m)
  const managers = members.map((m) => {
    const k = a.kpi.find((r) => r.member === m)
    const dealsOf = a.deals.filter((d) => d.manager === m)
    const confirmed = dealsOf
      .filter((d) => d.first_payment)
      .reduce((s, d) => {
        const hasRed = Object.keys(d.monthly_red).length > 0
        return s + Object.entries(d.monthly_payments).reduce((acc, [ym, v]) => {
          if (hasRed && !d.monthly_red[ym]) return acc
          return acc + Number(v)
        }, 0)
      }, 0)
    const goalRow = a.dsh.rows.find((r) => r.level === "member" && r.member === m && r.kind === "goal")
    const goalVal = goalRow?.annual ?? 0
    const pipelineSum = dealsOf
      .filter((d) => !d.first_payment)
      .reduce((s, d) => s + Number(d.contract_target ?? 0) * dealProbability(d), 0)
    return {
      name: m,
      team: memberTeams[m] ?? null,
      goal: goalVal,
      status: confirmed,
      pipeline: pipelineSum,
      achievement_pct: goalVal > 0 ? (confirmed / goalVal) * 100 : 0,
      deals_total: dealsOf.length,
      deals_confirmed: dealsOf.filter((d) => d.first_payment).length,
      new_renew: dealsOf.reduce((acc, d) => {
        if (d.status === "New") acc.new += 1
        else if (d.status === "Renew") acc.renew += 1
        return acc
      }, { new: 0, renew: 0 }),
      kpi: k ? Object.fromEntries(
        Object.entries(k.pairs).map(([m2, v]) => [m2, [v.goal, v.actual]] as const),
      ) as Record<string, [number, number]> : {},
    }
  })

  const regions = computeHeatmap(a.deals, a.scope, a.now, a.team)
    .slice(0, 12)
    .map((r) => ({ region: r.region, target: r.target, revenue: r.revenue, progress_pct: r.progress, status: r.status }))

  const KPIM = ["LD","ACC","OPP","SOL","VST"] as const
  const totals: Record<string, [number, number]> = Object.fromEntries(KPIM.map((m) => [m, [0, 0]]))
  for (const r of a.kpi) {
    for (const m of KPIM) {
      totals[m][0] += r.pairs[m].goal
      totals[m][1] += r.pairs[m].actual
    }
  }
  let bn: string = "LD"; let bnPct = Infinity
  for (const m of KPIM) {
    const [g, ac] = totals[m]
    const pct = g > 0 ? (ac / g) * 100 : 0
    if (pct < bnPct) { bn = m; bnPct = pct }
  }
  const worstMember = a.kpi.length > 0 ? a.kpi
    .map((r) => ({
      m: r.member,
      pct: r.pairs[bn as typeof KPIM[number]].goal > 0
        ? (r.pairs[bn as typeof KPIM[number]].actual / r.pairs[bn as typeof KPIM[number]].goal) * 100
        : 0,
    }))
    .sort((x, y) => x.pct - y.pct)[0]?.m ?? null : null

  const closing_deals = a.deals
    .filter((d) => {
      if (d.first_payment) {
        const fp = new Date(d.first_payment).getTime()
        return fp >= a.now.getTime() && fp <= a.now.getTime() + 30*86400_000
      }
      return dealProbability(d) >= 0.7
    })
    .slice(0, 12)
    .map((d) => ({ customer: d.customer_name, manager: d.manager, expected: Number(d.contract_target ?? 0), due: d.first_payment }))

  // summary_metrics
  const totalConfirmed = managers.reduce((s, m) => s + m.status, 0)
  const totalPipeline = managers.reduce((s, m) => s + m.pipeline, 0)
  const totalGoal = pacing.goal
  const sortedRegionsByRevenue = [...regions].sort((x, y) => y.revenue - x.revenue)
  const topRegion = sortedRegionsByRevenue[0] ?? null
  const sortedRegionsByProgress = [...regions].sort((x, y) => x.progress_pct - y.progress_pct)
  const worstRegion = sortedRegionsByProgress[0] ?? null
  const sortedManagers = [...managers].sort((x, y) => y.achievement_pct - x.achievement_pct)
  const bestManager = sortedManagers[0] ?? null
  const worstManagerCandidate = [...managers]
    .filter((m) => m.goal > 0)
    .sort((x, y) => x.achievement_pct - y.achievement_pct)[0] ?? null

  const summary_metrics = {
    total_goal: totalGoal,
    total_confirmed_revenue: totalConfirmed,
    total_pipeline_value: totalPipeline,
    gap_to_goal: totalGoal - totalConfirmed,
    top_region: topRegion ? { region: topRegion.region, revenue: topRegion.revenue } : null,
    worst_region: worstRegion ? { region: worstRegion.region, progress_pct: worstRegion.progress_pct } : null,
    best_manager: bestManager ? { name: bestManager.name, achievement_pct: bestManager.achievement_pct } : null,
    worst_manager: worstManagerCandidate ? { name: worstManagerCandidate.name, achievement_pct: worstManagerCandidate.achievement_pct } : null,
  }

  // deal_mix (only meaningful for ALL — for individual teams DSH doesn't split by team)
  const breakdown = a.dsh.breakdown ?? []
  const deal_mix = a.team === "ALL"
    ? {
        by_category: buildMix(breakdown, "category", a.scope, a.now),
        by_status_type: buildMix(breakdown, "status_type", a.scope, a.now),
        by_channel: buildMix(breakdown, "channel", a.scope, a.now),
      }
    : { by_category: [], by_status_type: [], by_channel: [] }

  // data_caveats
  const data_caveats: string[] = []
  if (closing_deals.length === 0) data_caveats.push("향후 30일 내 first_payment 가 잡힌 가까운 딜이 없음")
  const events30Count = a.events.filter((e) => {
    const t = new Date(e.startsAt).getTime()
    return t >= a.now.getTime() && t <= a.now.getTime() + 30*86400_000
  }).length
  if (events30Count === 0) data_caveats.push("향후 30일 예정 행사 없음")
  if (a.campaigns.length === 0) data_caveats.push("최근 30일 발송 캠페인 없음")
  if (a.deals.length === 0) data_caveats.push("REV 시트에서 가져온 딜 데이터가 없음 (sync 미실행 가능성)")
  if (a.kpi.length === 0) data_caveats.push("KPI 시트에서 가져온 활동 데이터가 없음")
  if (regions.length === 0) data_caveats.push("지역 정보가 있는 딜이 없음")

  return {
    fiscalPeriod: `FY${fy}-Q${q}`,
    team: a.team, scope: a.scope,
    team_pacing: pacing,
    summary_metrics,
    deal_mix,
    data_caveats,
    managers, regions,
    bottleneck_kpi: { name: bn, pct: bnPct === Infinity ? 0 : bnPct, worst_member: worstMember },
    closing_deals,
    events_30d: a.events
      .filter((e) => new Date(e.startsAt).getTime() >= a.now.getTime() && new Date(e.startsAt).getTime() <= a.now.getTime() + 30*86400_000)
      .slice(0, 12)
      .map((e) => ({ title: e.title, date: e.startsAt.slice(0,10), region: e.location })),
    campaigns_30d: a.campaigns
      .filter((c) => c.sentAt)
      .slice(0, 8)
      .map((c) => ({ name: c.subject, sent_at: c.sentAt!, open_pct: c.openPct })),
    hw_alerts: a.hwAlerts.slice(0, 5),
  }
}

import "server-only"
import { createHash } from "crypto"
import type { DshOutput } from "@/lib/branch/parsers/dsh"
import type { KpiRow } from "@/lib/branch/parsers/kpi"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { teamPacing, listMembersByTeam } from "@/lib/branch/computations/pacing"
import { computeHeatmap } from "@/lib/branch/computations/heatmap"
import { dealProbability } from "@/lib/branch/computations/pipeline"
import { fyOf, fiscalQuarter } from "@/lib/branch/fiscal"
import type { Period } from "@/lib/branch/computations/heatmap"

export type TeamScope = "ALL" | "BD" | "MKT" | "CSM"

export interface InsightInput {
  fiscalPeriod: string
  team: TeamScope
  scope: Period
  team_pacing: { goal: number; status: number; pacing_pct: number }
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

  const members = listMembersByTeam(a.dsh, a.team)
  const managers = members.map((m) => {
    const k = a.kpi.find((r) => r.member === m)
    const dealsOf = a.deals.filter((d) => d.manager === m)
    const confirmed = dealsOf
      .filter((d) => d.first_payment)
      .reduce((s, d) => s + Object.entries(d.monthly_payments).reduce((acc, [ym, v]) => acc + (d.monthly_red[ym] ? Number(v) : 0), 0), 0)
    const goalRow = a.dsh.rows.find((r) => r.level === "member" && r.member === m && r.kind === "goal")
    const goalVal = goalRow?.annual ?? 0
    const pipelineSum = dealsOf
      .filter((d) => !d.first_payment)
      .reduce((s, d) => s + Number(d.contract_target ?? 0) * dealProbability(d), 0)
    return {
      name: m,
      team: a.dsh.members[m] ?? null,
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

  return {
    fiscalPeriod: `FY${fy}-Q${q}`,
    team: a.team, scope: a.scope,
    team_pacing: pacing,
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

import "server-only"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import type { KpiRow } from "@/lib/branch/parsers/kpi"
import type { Period } from "@/lib/branch/computations/heatmap"
import { dealProbability } from "@/lib/branch/computations/pipeline"

export interface ManagerInsightInput {
  manager: string
  team: string | null
  scope: Period
  fiscalPeriod: string
  metrics: {
    confirmed_revenue: number
    pipeline_value: number
    deals_total: number
    deals_confirmed: number
    deals_open: number
    new_count: number
    renew_count: number
    direct_count: number
    channel_count: number
    avg_deal_size: number
    top_region: string | null
  }
  kpi_activity: Record<string, { goal: number; actual: number; pct: number }>
  weakest_kpi: { name: string; pct: number } | null
  strongest_kpi: { name: string; pct: number } | null
  closing_deals: Array<{ customer: string; expected: number; due: string | null; probability: number }>
  recent_confirmed_deals: Array<{ customer: string; first_payment: string; revenue: number }>
  region_distribution: Array<{ region: string; deals: number; revenue: number }>
  data_caveats: string[]
}

export interface BuildManagerInputArgs {
  manager: string
  team: string | null
  scope: Period
  now: Date
  fiscalPeriod: string
  deals: BranchRevDeal[]   // pre-filtered by manager
  kpiRow: KpiRow | null
}

const KPI_METRIC_ORDER = ["LD", "ACC", "OPP", "SOL", "VST"] as const

export function buildManagerInsightInput(args: BuildManagerInputArgs): ManagerInsightInput {
  const { manager, team, scope, now, fiscalPeriod, deals, kpiRow } = args
  const closing: ManagerInsightInput["closing_deals"] = []
  const recent: ManagerInsightInput["recent_confirmed_deals"] = []
  const regionMap = new Map<string, { deals: number; revenue: number }>()

  let confirmedRevenue = 0
  let pipelineValue = 0
  let dealsConfirmed = 0
  let newCount = 0
  let renewCount = 0
  let directCount = 0
  let channelCount = 0
  let totalTargetSum = 0

  for (const d of deals) {
    const target = Number(d.contract_target ?? 0)
    totalTargetSum += target
    const region = d.region ?? "미정"
    const r = regionMap.get(region) ?? { deals: 0, revenue: 0 }
    r.deals += 1

    if (d.first_payment) {
      dealsConfirmed += 1
      const hasRed = Object.keys(d.monthly_red).length > 0
      const dealRev = Object.entries(d.monthly_payments).reduce((s, [ym, v]) => {
        if (hasRed && !d.monthly_red[ym]) return s
        return s + Number(v)
      }, 0)
      confirmedRevenue += dealRev
      r.revenue += dealRev
      const fp = new Date(d.first_payment).getTime()
      if (fp >= now.getTime() && fp <= now.getTime() + 30 * 86400_000) {
        closing.push({ customer: d.customer_name, expected: target, due: d.first_payment, probability: 1 })
      } else if (fp >= now.getTime() - 60 * 86400_000) {
        recent.push({ customer: d.customer_name, first_payment: d.first_payment, revenue: dealRev })
      }
    } else {
      pipelineValue += target * dealProbability(d)
      if (dealProbability(d) >= 0.5) {
        closing.push({ customer: d.customer_name, expected: target, due: null, probability: dealProbability(d) })
      }
    }

    if (d.status === "New") newCount += 1
    else if (d.status === "Renew") renewCount += 1
    if (d.deal_type === "Direct") directCount += 1
    else if (d.deal_type === "Channel") channelCount += 1

    regionMap.set(region, r)
  }

  closing.sort((a, b) => b.expected - a.expected)
  recent.sort((a, b) => b.first_payment.localeCompare(a.first_payment))

  const regions = [...regionMap.entries()].map(([region, v]) => ({ region, deals: v.deals, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue || b.deals - a.deals)

  const kpi_activity: Record<string, { goal: number; actual: number; pct: number }> = {}
  if (kpiRow) {
    for (const m of KPI_METRIC_ORDER) {
      const pair = kpiRow.pairs[m]
      const pct = pair.goal > 0 ? (pair.actual / pair.goal) * 100 : 0
      kpi_activity[m] = { goal: pair.goal, actual: pair.actual, pct }
    }
  }

  let weakest: { name: string; pct: number } | null = null
  let strongest: { name: string; pct: number } | null = null
  for (const [name, v] of Object.entries(kpi_activity)) {
    if (v.goal === 0) continue
    if (!weakest || v.pct < weakest.pct) weakest = { name, pct: v.pct }
    if (!strongest || v.pct > strongest.pct) strongest = { name, pct: v.pct }
  }

  const caveats: string[] = []
  if (deals.length === 0) caveats.push("이 매니저에게 할당된 REV 딜이 없음")
  if (!kpiRow) caveats.push("KPI 시트에서 이 매니저 활동 데이터 누락")
  if (closing.length === 0) caveats.push("향후 30일 내 마무리 가능한 딜이 없음")
  if (recent.length === 0) caveats.push("최근 60일 확정된 거래 없음")

  return {
    manager,
    team,
    scope,
    fiscalPeriod,
    metrics: {
      confirmed_revenue: confirmedRevenue,
      pipeline_value: pipelineValue,
      deals_total: deals.length,
      deals_confirmed: dealsConfirmed,
      deals_open: deals.length - dealsConfirmed,
      new_count: newCount,
      renew_count: renewCount,
      direct_count: directCount,
      channel_count: channelCount,
      avg_deal_size: deals.length > 0 ? totalTargetSum / deals.length : 0,
      top_region: regions[0]?.region ?? null,
    },
    kpi_activity,
    weakest_kpi: weakest,
    strongest_kpi: strongest,
    closing_deals: closing.slice(0, 8),
    recent_confirmed_deals: recent.slice(0, 5),
    region_distribution: regions.slice(0, 6),
    data_caveats: caveats,
  }
}

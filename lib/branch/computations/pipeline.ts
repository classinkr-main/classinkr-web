import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import { fiscalQuarter, fyOf, ymKey } from "@/lib/branch/fiscal"

type RevenuePeriod = "M" | "Q" | "Y"

export function dealProbability(d: BranchRevDeal): number {
  if (d.first_payment) return 1.0
  if (/Negotiation/i.test(d.note ?? "")) return 0.7
  if (/Proposal/i.test(d.note ?? "")) return 0.5
  let base = d.status === "Renew" ? 0.4 : 0.2
  if (d.deal_type === "Channel") base *= 0.85
  if (d.importance === "KA") base += 0.1
  return Math.min(base, 0.6)
}

export function pipelineValue(d: BranchRevDeal): number {
  return Number(d.contract_target ?? 0) * dealProbability(d)
}

export type PipelineStage = "lead" | "proposal" | "negotiation" | "contract"
export function stageOf(d: BranchRevDeal): PipelineStage {
  if (d.first_payment) return "contract"
  if (/Negotiation/i.test(d.note ?? "")) return "negotiation"
  if (/Proposal/i.test(d.note ?? "")) return "proposal"
  return "lead"
}

export interface PipelineRow { id: string; customer: string; manager: string|null; team: string|null; region: string|null; importance: string|null; stage: PipelineStage; probability: number; target: number; confirmed_revenue: number; pipeline_value: number }
export interface RevRevenueRow {
  id: string
  customer: string
  manager: string | null
  team: string | null
  region: string | null
  revenue: number
}

function inScope(ym: string, scope: RevenuePeriod, now: Date): boolean {
  const fy = fyOf(now)
  const m = Number(ym.slice(5, 7))
  const y = Number(ym.slice(0, 4))
  const fyOfYm = m >= 4 ? y : y - 1
  if (fyOfYm !== fy) return false
  if (scope === "Y") return true
  if (scope === "M") return ym === ymKey(now)
  return fiscalQuarter(m) === fiscalQuarter(now.getUTCMonth() + 1)
}

function revenueFromRev(d: BranchRevDeal, period?: RevenuePeriod, now = new Date()): number {
  const hasRedFlags = Object.keys(d.monthly_red).length > 0
  return Object.entries(d.monthly_payments).reduce((sum, [ym, value]) => {
    if (period && !inScope(ym, period, now)) return sum
    if (hasRedFlags && !d.monthly_red[ym]) return sum
    return sum + Number(value)
  }, 0)
}

export function listPipeline(deals: BranchRevDeal[], filter?: { team?: string; manager?: string; region?: string; importance?: string; stage?: PipelineStage }): PipelineRow[] {
  const managerFilter = normalizeBranchMemberName(filter?.manager)
  return deals.filter((d) => {
    const manager = normalizeBranchMemberName(d.manager)
    if (filter?.team && filter.team !== "ALL" && d.team !== filter.team) return false
    if (managerFilter && manager !== managerFilter) return false
    if (filter?.region && d.region !== filter.region) return false
    if (filter?.importance && d.importance !== filter.importance) return false
    if (filter?.stage && stageOf(d) !== filter.stage) return false
    return true
  }).map((d) => {
    const manager = normalizeBranchMemberName(d.manager)
    const hasRedFlags = Object.keys(d.monthly_red).length > 0
    const confirmed = Object.entries(d.monthly_payments).reduce((s, [ym, v]) => {
      if (hasRedFlags && !d.monthly_red[ym]) return s
      return s + Number(v)
    }, 0)
    return {
      id: d.id, customer: d.customer_name, manager, team: d.team,
      region: d.region, importance: d.importance, stage: stageOf(d),
      probability: dealProbability(d), target: Number(d.contract_target ?? 0),
      confirmed_revenue: d.first_payment ? confirmed : 0,
      pipeline_value: pipelineValue(d),
    }
  })
}

export function listRevRevenue(
  deals: BranchRevDeal[],
  filter?: { team?: string; manager?: string; region?: string },
  scope?: { period: RevenuePeriod; now: Date },
): RevRevenueRow[] {
  const managerFilter = normalizeBranchMemberName(filter?.manager)
  return deals
    .filter((d) => {
      const manager = normalizeBranchMemberName(d.manager)
      if (filter?.team && filter.team !== "ALL" && d.team !== filter.team) return false
      if (managerFilter && manager !== managerFilter) return false
      if (filter?.region && d.region !== filter.region) return false
      return true
    })
    .map((d) => ({
      id: d.id,
      customer: d.customer_name,
      manager: normalizeBranchMemberName(d.manager),
      team: d.team,
      region: d.region,
      revenue: revenueFromRev(d, scope?.period, scope?.now),
    }))
    .sort((a, b) => b.revenue - a.revenue || a.customer.localeCompare(b.customer))
}

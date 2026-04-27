import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

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

export function listPipeline(deals: BranchRevDeal[], filter?: { team?: string; manager?: string; region?: string; importance?: string; stage?: PipelineStage }): PipelineRow[] {
  return deals.filter((d) => {
    if (filter?.team && filter.team !== "ALL" && d.team !== filter.team) return false
    if (filter?.manager && d.manager !== filter.manager) return false
    if (filter?.region && d.region !== filter.region) return false
    if (filter?.importance && d.importance !== filter.importance) return false
    if (filter?.stage && stageOf(d) !== filter.stage) return false
    return true
  }).map((d) => {
    const confirmed = Object.entries(d.monthly_payments).reduce((s, [ym, v]) => s + (d.monthly_red[ym] ? Number(v) : 0), 0)
    return {
      id: d.id, customer: d.customer_name, manager: d.manager, team: d.team,
      region: d.region, importance: d.importance, stage: stageOf(d),
      probability: dealProbability(d), target: Number(d.contract_target ?? 0),
      confirmed_revenue: d.first_payment ? confirmed : 0,
      pipeline_value: pipelineValue(d),
    }
  })
}

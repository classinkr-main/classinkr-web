export type Team = "ALL" | "BD" | "MKT" | "CSM"
export type Period = "M" | "Q" | "Y"

export const TEAMS: Team[] = ["ALL", "BD", "MKT", "CSM"]
export const PERIODS: Period[] = ["M", "Q", "Y"]

export interface BranchMonthlySeries {
  months: string[]
  goal_cum: number[]
  revenue_cum: number[]
  revenue_trend_cum: number[]
  confirmed_through_index: number
  events: { date: string; title: string }[]
  deals: { date: string; customer: string; amount: number }[]
  campaigns: { date: string; name: string }[]
}

export interface BranchCampaignRow {
  id: string | number
  subject: string
  sentAt?: string
  recipientCount: number
  openCount: number
  openPct: number
}

export interface BranchDealMixSlice {
  name: string
  goal: number
  actual: number
  pct: number
}

export interface BranchDealMix {
  by_category: BranchDealMixSlice[]
  by_status_type: BranchDealMixSlice[]
  by_channel: BranchDealMixSlice[]
  by_segment?: BranchDealMixSlice[]
}

export interface BranchSummaryResponse {
  team: Team
  period: Period
  revenue: { confirmed: number; goal: number; pacing_pct: number }
  bottleneck: { metric: string | null; pct: number; worst_member: string | null }
  closing: { count: number; total_target: number }
  events_30d: { count: number; regions: number }
  campaigns_30d: { count: number; avg_open_pct: number }
  campaigns_recent: BranchCampaignRow[]
  deal_mix: BranchDealMix | null
  monthly_series: BranchMonthlySeries
  lastSync: string | null
  lastError: string | null
  sheetModifiedAt: string | null
}

export interface BranchPipelineRow {
  id: string
  customer: string
  manager: string | null
  team: string | null
  region: string | null
  revenue: number
}

export interface BranchPipelineResponse {
  rows?: BranchPipelineRow[]
}

export interface BranchKpiTeamRow {
  team: string
  goal: number
  status: number
  pacing_pct: number
}

export interface BranchKpiMemberRow {
  member: string
  team: string | null
  goal: number
  status: number
  achievement_pct: number
  confirmed: number
  deals_total: number
  deals_confirmed: number
  new_renew: { new: number; renew: number }
  kpi: Record<string, { goal: number; actual: number }>
}

export interface BranchKpiResponse {
  teams: BranchKpiTeamRow[]
  members: BranchKpiMemberRow[]
}

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

// summary API의 dsh_breakdown 행 — lib/branch/parsers/dsh.ts DshBreakdownRow 미러.
// 팀 필터와 무관한 Team KR 전사 수치라 어느 team 쿼리에서도 동일하게 실린다.
export interface BranchDshBreakdownRow {
  kind: "goal" | "status"
  category: string // "Software" | "Hardware"
  status_type: string // "New" | "Renew"
  channel: string // "Direct" | "Channel"
  annual: number
  quarters: [number, number, number, number]
  months: Record<string, number>
}

// 서빙 소스 메타 — REV/DSH 각각 "지금 보는 수치가 어느 단계(장부 액티브 임포트/시트
// 미러/라이브 시트)에서, 언제 온 것인지"를 알린다. 2026-07-16 사고(7/3 스테일 임포트가
// 13일간 최신 시트 반영분을 가렸으나 화면은 "마지막 동기화: 방금"만 보여줬다) 재발 시
// KR Team 화면에서 즉시 드러나게 하려는 용도. REV는 kind가 "import" | "mirror"만
// 나올 수 있고(라이브 시트 폴백 없음), DSH는 "live"까지 셋 다 나올 수 있다.
export type BranchDataSourceKind = "import" | "mirror" | "live"

export interface BranchDataSourceInfo {
  kind: BranchDataSourceKind
  asOf: string | null
  runId?: string
}

export interface BranchDataSources {
  rev: BranchDataSourceInfo
  dsh: BranchDataSourceInfo
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
  dsh_breakdown?: BranchDshBreakdownRow[]
  monthly_series: BranchMonthlySeries
  lastSync: string | null
  lastError: string | null
  sheetModifiedAt: string | null
  data_sources?: BranchDataSources
}

export interface BranchPipelineRow {
  id: string
  sheetRow?: number
  customer: string
  manager: string | null
  team: string | null
  region: string | null
  status?: string | null
  dealType?: string | null
  productVersion?: string | null
  firstPayment?: string | null
  contractTarget?: number
  revenue: number
  monthlyPayments?: Record<string, number>
  monthlyConfirmed?: Record<string, number>
  monthlyHighConfidence?: Record<string, number>
  monthlyRed?: Record<string, boolean>
  weeklyPayments?: Record<string, number[]>
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

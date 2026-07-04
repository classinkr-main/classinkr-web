import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import { confirmedMonthAmountWithColor, dealHasColorData } from "@/lib/branch/computations/rev-confirmed"
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

export interface PipelineRow { id: string; sheetRow: number; customer: string; manager: string|null; team: string|null; region: string|null; importance: string|null; stage: PipelineStage; probability: number; target: number; confirmed_revenue: number; pipeline_value: number }
export interface RevRevenueRow {
  id: string
  sheetRow: number
  customer: string
  manager: string | null
  team: string | null
  region: string | null
  status: string | null
  dealType: string | null
  productVersion: string | null
  firstPayment: string | null
  contractTarget: number
  revenue: number
  monthlyPayments: Record<string, number>
  monthlyConfirmed: Record<string, number>
  monthlyHighConfidence: Record<string, number>
  monthlyRed: Record<string, boolean>
  weeklyPayments: Record<string, number[]>
}

const REV_MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
const REV_RAW_MONTHLY_START = 13
const REV_WEEK_COUNT = 5

function rawNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (value == null || value === "") return 0
  const numeric = Number(String(value).replace(/[¥₩$€£,\s]/g, ""))
  return Number.isFinite(numeric) ? numeric : 0
}

function normalizedWeeklyPayments(value: unknown): Record<string, number[]> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const weekly: Record<string, number[]> = {}
  for (const [ym, rawValues] of Object.entries(value)) {
    if (!Array.isArray(rawValues)) continue
    const values = Array.from({ length: REV_WEEK_COUNT }, (_, index) => rawNumber(rawValues[index]))
    if (values.some((amount) => amount !== 0)) weekly[ym] = values
  }
  return Object.keys(weekly).length > 0 ? weekly : null
}

// deal.raw.weeklyPayments가 정석 경로 — lib/branch/parsers/rev.ts의 parseRev가 헤더로
// 찾은 실제 주차 열(block.weekIdxs)에서 직접 읽어 raw에 실어 보낸다(항상 monthly_payments와
// 정합). 아래 고정 오프셋 재추정은 그 필드가 없는 "재동기화 전" 레거시 DB 행에 대한
// 하위호환 폴백일 뿐이다 — 모든 월 블록이 4월~3월 순서로 예외 없이 6칸(합계1+주차5)
// 연속 배치돼 있다고 가정하므로, 시트가 그 가정과 어긋나면 그 뒤 월들의 주차 값이
// 통째로 밀려 읽힌다. 재동기화하면 이 폴백은 더 이상 타지 않는다.
function weeklyPaymentsFromRaw(deal: BranchRevDeal): Record<string, number[]> {
  const importedWeekly = normalizedWeeklyPayments(deal.raw?.weeklyPayments)
  if (importedWeekly) return importedWeekly
  const row = Array.isArray(deal.raw?.row) ? deal.raw.row : []
  const weekly: Record<string, number[]> = {}
  for (const ym of Object.keys(deal.monthly_payments ?? {})) {
    const month = Number(ym.slice(5, 7))
    const monthIndex = REV_MONTH_ORDER.indexOf(month)
    if (monthIndex < 0) continue
    const firstWeekIndex = REV_RAW_MONTHLY_START + (monthIndex * (REV_WEEK_COUNT + 1)) + 1
    const values = Array.from({ length: REV_WEEK_COUNT }, (_, index) => rawNumber(row[firstWeekIndex + index]))
    if (values.some((value) => value !== 0)) weekly[ym] = values
  }
  return weekly
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
  const hasColor = dealHasColorData(d)
  return Object.entries(d.monthly_payments).reduce((sum, [ym, value]) => {
    if (period && !inScope(ym, period, now)) return sum
    return sum + confirmedMonthAmountWithColor(d, ym, Number(value), hasColor)
  }, 0)
}

export function listPipeline(deals: BranchRevDeal[], filter?: { team?: string; manager?: string; region?: string; importance?: string; stage?: PipelineStage }): PipelineRow[] {
  const managerFilter = normalizeBranchMemberName(filter?.manager)
  return deals.filter((d) => {
    if (filter?.team && filter.team !== "ALL" && d.team !== filter.team) return false
    if (managerFilter && normalizeBranchMemberName(d.manager) !== managerFilter) return false
    if (filter?.region && d.region !== filter.region) return false
    if (filter?.importance && d.importance !== filter.importance) return false
    if (filter?.stage && stageOf(d) !== filter.stage) return false
    return true
  }).map((d) => {
    const manager = normalizeBranchMemberName(d.manager)
    const hasColor = dealHasColorData(d)
    const confirmed = Object.entries(d.monthly_payments).reduce(
      (s, [ym, v]) => s + confirmedMonthAmountWithColor(d, ym, Number(v), hasColor),
      0,
    )
    return {
      id: d.id, sheetRow: d.sheet_row, customer: d.customer_name, manager, team: d.team,
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
      if (filter?.team && filter.team !== "ALL" && d.team !== filter.team) return false
      if (managerFilter && normalizeBranchMemberName(d.manager) !== managerFilter) return false
      if (filter?.region && d.region !== filter.region) return false
      return true
    })
    .map((d) => ({
      id: d.id,
      sheetRow: d.sheet_row,
      customer: d.customer_name,
      manager: normalizeBranchMemberName(d.manager),
      team: d.team,
      region: d.region,
      status: d.status,
      dealType: d.deal_type,
      productVersion: d.product_version,
      firstPayment: d.first_payment,
      contractTarget: Number(d.contract_target ?? 0),
      revenue: revenueFromRev(d, scope?.period, scope?.now),
      monthlyPayments: d.monthly_payments ?? {},
      monthlyConfirmed: d.monthly_confirmed ?? {},
      monthlyHighConfidence: d.monthly_high_conf ?? {},
      monthlyRed: d.monthly_red ?? {},
      weeklyPayments: weeklyPaymentsFromRaw(d),
    }))
    .sort((a, b) => b.revenue - a.revenue || a.customer.localeCompare(b.customer))
}

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
    const hasNumericEntry = rawValues.some((raw) => {
      if (typeof raw === "number") return Number.isFinite(raw)
      if (typeof raw !== "string") return false
      const cleaned = raw.replace(/[¥₩$€£,\s]/g, "")
      return cleaned !== "" && Number.isFinite(Number(cleaned))
    })
    if (hasNumericEntry) weekly[ym] = values
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

// 품질 감사 2026-09-10 — #1(페이로드 다이어트): /api/admin/branch/pipeline 172.6KB의 상당 비중은
// 이 함수가 만드는 4개 월별 맵(monthlyPayments/monthlyConfirmed/monthlyHighConfidence/monthlyRed)이
// 매출 없는 달까지 0/false로 채워 직렬화되는 데서 온다. 다만 확정 0은 red 전액 폴백을 막고,
// 색 맵의 키 자체도 무색상 폴백 여부를 결정한다. REV 응답은 preserveZero/False로 원본 키를
// 보존해야 서버·클라이언트 확정 산식이 같아진다. 단순 숫자 맵의 기존 sparse 기본값은 유지한다.
export function sparseNumberMap(map: Record<string, number> | null | undefined, preserveZero = false): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(map ?? {})) {
    if (value || (preserveZero && value === 0)) out[key] = value
  }
  return out
}

export function sparseBooleanMap(map: Record<string, boolean> | null | undefined, preserveFalse = false): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(map ?? {})) {
    if (value || (preserveFalse && value === false)) out[key] = value
  }
  return out
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

export function revenueFromRev(d: BranchRevDeal, period?: RevenuePeriod, now = new Date()): number {
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
      monthlyPayments: sparseNumberMap(d.monthly_payments, true),
      monthlyConfirmed: sparseNumberMap(d.monthly_confirmed, true),
      monthlyHighConfidence: sparseNumberMap(d.monthly_high_conf, true),
      monthlyRed: sparseBooleanMap(d.monthly_red, true),
      weeklyPayments: weeklyPaymentsFromRaw(d),
    }))
    .sort((a, b) => b.revenue - a.revenue || a.customer.localeCompare(b.customer))
}

import "server-only"

import {
  getKoreaTeamManagerSet,
  isKoreaScopedExternalRecord,
  isKoreaTeamLabel,
} from "@/lib/admin-crm-scope"
import {
  getExcludedXiaoshouyiOwnerIds,
  getXiaoshouyiOwnerNameMap,
  resolveOwnerName,
} from "@/lib/external-crm/owner-names"
import { confirmedMonthAmount } from "@/lib/branch/computations/rev-confirmed"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getFxRates } from "@/lib/billing/fx"

export type NeoCrmGranularity = "week" | "month" | "quarter" | "year"

export interface NeoCrmTeamRevenueRow {
  owner: string
  ownerKey: string
  amount: number
  orderCount: number
  share: number
  previousAmount: number
  delta: number
}

// 담당자별 오더(USD)·수금(CNY) 분해. 매출 byOwner와 같은 ownerKey(Xiaoshouyi ownerId)로 묶는다.
export interface NeoCrmOwnerBreakdownRow {
  ownerKey: string
  owner: string
  amount: number
  count: number
}

// REV 시트 기준 장르(HW/SW × 신규/갱신)별 목표·확정 매출. 월 키가 있는 기간(월/분기/년)만 산출.
export interface NeoCrmMixSegment {
  key: "sw_new" | "sw_renew" | "hw_new" | "hw_renew" | "other"
  label: string
  target: number
  confirmed: number
  rate: number | null
  dealCount: number
}

// REV 시트 기준 담당자별 목표 대비 확정 매출.
export interface NeoCrmManagerProgressRow {
  manager: string
  target: number
  confirmed: number
  rate: number | null
  dealCount: number
}

// REV 시트 기준 월별 목표 vs 확정 매출 추이(회계연도 전체). 선택 기간과 무관하게 항상 산출.
export interface NeoCrmMonthlyPoint {
  monthKey: string // "2026-04"
  label: string // "26.04"
  target: number
  confirmed: number
  rate: number | null
}

export interface NeoCrmOrderItem {
  key: string
  customerName: string
  ownerName: string | null
  status: string | null
  amount: number | null
  occurredAt: string | null
}

export interface NeoCrmTeamReport {
  ok: boolean
  error: string | null
  latestSyncedAt: string | null
  granularity: NeoCrmGranularity
  offset: number
  usdCnyRate: number
  period: {
    label: string
    startIso: string
    endIso: string
    canGoNext: boolean
  }
  target: {
    // REV 시트 기준 해당 기간 목표 매출. 시트는 월 단위라 month granularity에서만 산출한다.
    amount: number | null
    achievement: number
    rate: number | null
    basis: "rev_sheet_month" | "none"
  }
  // 장르 믹스·담당자별 진행은 모두 REV 시트(목표=monthly_payments, 확정=monthly_confirmed) 기준.
  mix: {
    basis: "rev_sheet_month" | "none"
    segments: NeoCrmMixSegment[]
  }
  managerProgress: NeoCrmManagerProgressRow[]
  // 회계연도 월별 목표 vs 확정 추이(REV 시트). 선택 기간과 무관하게 항상 채운다.
  monthlySeries: NeoCrmMonthlyPoint[]
  revenue: {
    teamTotal: number
    orderCount: number
    contributorCount: number
    byOwner: NeoCrmTeamRevenueRow[]
  }
  account: {
    totalCount: number
    activeInPeriodCount: number
  }
  order: {
    count: number
    amount: number
    recent: NeoCrmOrderItem[]
    byOwner: NeoCrmOwnerBreakdownRow[]
  }
  collection: {
    amount: number
    count: number
    amount30d: number
    count30d: number
    byOwner: NeoCrmOwnerBreakdownRow[]
  }
  leads: {
    totalCount: number
    periodCount: number
    previousCount: number
  }
  // 직전 동기간(주/월/분기/년) 대비 비교.
  comparison: {
    previousLabel: string
    // 진행 중인 기간(offset 0)은 직전 기간의 "같은 경과 일수"까지만 잘라 비교한다(MTD 페이스).
    // 완료된 과거 기간은 전체 대 전체 비교.
    paceAdjusted: boolean
    revenue: { previousTotal: number; delta: number; rate: number | null }
    order: { previousCount: number; previousAmount: number }
    account: { previousActiveCount: number }
    collection: { previousAmount: number }
  }
}

interface ScopedAmountRecord {
  owner_name: string | null
  payload: Record<string, unknown> | null
  amount: number | null
  occurred_at: string | null
}

interface ScopedOrderRecord extends ScopedAmountRecord {
  object_api_key: string
  external_id: string
  display_name: string | null
  status: string | null
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const SHEET_INACTIVE_PATTERN = /취소|해지|드랍|드롭|중단|보류|cancel|drop|lost/i

// 장르 분류 — app/api/admin/branch/summary/route.ts의 classifyCategory/classifyStatusType과 동일 규칙.
const HW_PATTERN = /IFP|OPS|S1|T1|카메라|모니터|hardware|HW\b/i
const SW_PATTERN = /SW\b|software|소프트웨어|구독|subscription|classin|클래스인|annual|license|라이선스/i

function classifySheetCategory(productVersion: string | null): "Hardware" | "Software" | null {
  const v = (productVersion ?? "").trim()
  if (!v) return null
  if (HW_PATTERN.test(v)) return "Hardware"
  if (SW_PATTERN.test(v)) return "Software"
  return null
}

function classifySheetStatusType(status: string | null): "New" | "Renew" | null {
  const v = (status ?? "").trim().toLowerCase()
  if (v === "new" || v === "신규") return "New"
  if (v === "renew" || v === "갱신") return "Renew"
  return null
}

function mixSegmentKey(
  category: "Hardware" | "Software" | null,
  statusType: "New" | "Renew" | null
): NeoCrmMixSegment["key"] {
  if (category === "Software" && statusType === "New") return "sw_new"
  if (category === "Software" && statusType === "Renew") return "sw_renew"
  if (category === "Hardware" && statusType === "New") return "hw_new"
  if (category === "Hardware" && statusType === "Renew") return "hw_renew"
  return "other"
}

const MIX_SEGMENT_LABEL: Record<NeoCrmMixSegment["key"], string> = {
  sw_new: "SW 신규",
  sw_renew: "SW 갱신",
  hw_new: "HW 신규",
  hw_renew: "HW 갱신",
  other: "미분류",
}
const MIX_SEGMENT_ORDER: NeoCrmMixSegment["key"][] = ["sw_new", "sw_renew", "hw_new", "hw_renew", "other"]

function groupByOwner(
  rows: ScopedAmountRecord[],
  ownerNames: Map<string, string>
): NeoCrmOwnerBreakdownRow[] {
  const map = new Map<string, { owner: string; amount: number; count: number }>()
  for (const row of rows) {
    const ownerKey = row.owner_name?.trim() || "unassigned"
    const existing = map.get(ownerKey) ?? {
      owner: resolveOwnerName(row.owner_name, ownerNames),
      amount: 0,
      count: 0,
    }
    existing.amount += Number(row.amount) || 0
    existing.count += 1
    map.set(ownerKey, existing)
  }
  return Array.from(map.entries())
    .map(([ownerKey, row]) => ({ ownerKey, ...row }))
    .sort((a, b) => b.amount - a.amount)
}
const PERIOD_SCAN_LIMIT = 5000
const RECENT_ORDER_LIMIT = 12
const TEAM_REVENUE_ROW_LIMIT = 50

function pad2(value: number) {
  return String(value).padStart(2, "0")
}

interface PeriodBounds {
  start: Date
  end: Date
  label: string
  // 기간이 덮는 월 키 목록(REV 시트 월별 목표 합산용). 주 단위는 시트 월 목표를
  // 안전하게 쪼갤 수 없으므로 null.
  monthKeys: string[] | null
}

function monthKeyFromIndex(year: number, monthIndex: number) {
  const d = new Date(Date.UTC(year, monthIndex, 1))
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
}

// Period boundaries are computed in KST (UTC+9) so a Korea team dashboard groups
// records by the local calendar day/week/quarter/year, then expressed as UTC
// instants to compare against occurred_at (stored as UTC ISO).
function resolvePeriodBounds(granularity: NeoCrmGranularity, offset: number): PeriodBounds {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS)
  const year = nowKst.getUTCFullYear()
  const month = nowKst.getUTCMonth()

  if (granularity === "month") {
    const start = new Date(Date.UTC(year, month + offset, 1) - KST_OFFSET_MS)
    const end = new Date(Date.UTC(year, month + offset + 1, 1) - KST_OFFSET_MS)
    const ld = new Date(Date.UTC(year, month + offset, 1))
    return {
      start,
      end,
      label: `${ld.getUTCFullYear()}년 ${pad2(ld.getUTCMonth() + 1)}월`,
      monthKeys: [monthKeyFromIndex(ld.getUTCFullYear(), ld.getUTCMonth())],
    }
  }

  if (granularity === "quarter") {
    const startMonth = Math.floor(month / 3) * 3 + offset * 3
    const start = new Date(Date.UTC(year, startMonth, 1) - KST_OFFSET_MS)
    const end = new Date(Date.UTC(year, startMonth + 3, 1) - KST_OFFSET_MS)
    const sd = new Date(Date.UTC(year, startMonth, 1))
    const quarter = Math.floor(sd.getUTCMonth() / 3) + 1
    const monthKeys = [0, 1, 2].map((i) => monthKeyFromIndex(sd.getUTCFullYear(), sd.getUTCMonth() + i))
    return { start, end, label: `${sd.getUTCFullYear()} ${quarter}분기`, monthKeys }
  }

  if (granularity === "year") {
    const yy = year + offset
    const start = new Date(Date.UTC(yy, 0, 1) - KST_OFFSET_MS)
    const end = new Date(Date.UTC(yy + 1, 0, 1) - KST_OFFSET_MS)
    const monthKeys = Array.from({ length: 12 }, (_, i) => monthKeyFromIndex(yy, i))
    return { start, end, label: `${yy}년`, monthKeys }
  }

  // week — ISO week, Monday start, in KST.
  const dayUtc = Date.UTC(year, month, nowKst.getUTCDate())
  const weekday = nowKst.getUTCDay() // 0=Sun..6=Sat
  const mondayDelta = weekday === 0 ? -6 : 1 - weekday
  const startKstMidnight = dayUtc + (mondayDelta + offset * 7) * 86_400_000
  const start = new Date(startKstMidnight - KST_OFFSET_MS)
  const end = new Date(startKstMidnight + 7 * 86_400_000 - KST_OFFSET_MS)
  const startLabel = new Date(startKstMidnight)
  const endLabel = new Date(startKstMidnight + 6 * 86_400_000)
  return {
    start,
    end,
    label: `${pad2(startLabel.getUTCMonth() + 1)}.${pad2(startLabel.getUTCDate())} ~ ${pad2(
      endLabel.getUTCMonth() + 1
    )}.${pad2(endLabel.getUTCDate())}`,
    monthKeys: null,
  }
}

const VALID_GRANULARITIES: NeoCrmGranularity[] = ["week", "month", "quarter", "year"]

function emptyReport(
  granularity: NeoCrmGranularity,
  offset: number,
  bounds: PeriodBounds,
  previousLabel: string,
  error: string | null
): NeoCrmTeamReport {
  return {
    ok: error === null,
    error,
    usdCnyRate: 7.3,
    latestSyncedAt: null,
    granularity,
    offset,
    period: {
      label: bounds.label,
      startIso: bounds.start.toISOString(),
      endIso: bounds.end.toISOString(),
      canGoNext: offset < 0,
    },
    target: { amount: null, achievement: 0, rate: null, basis: "none" },
    mix: { basis: "none", segments: [] },
    managerProgress: [],
    monthlySeries: [],
    revenue: { teamTotal: 0, orderCount: 0, contributorCount: 0, byOwner: [] },
    account: { totalCount: 0, activeInPeriodCount: 0 },
    order: { count: 0, amount: 0, recent: [], byOwner: [] },
    collection: { amount: 0, count: 0, amount30d: 0, count30d: 0, byOwner: [] },
    leads: { totalCount: 0, periodCount: 0, previousCount: 0 },
    comparison: {
      previousLabel,
      paceAdjusted: false,
      revenue: { previousTotal: 0, delta: 0, rate: null },
      order: { previousCount: 0, previousAmount: 0 },
      account: { previousActiveCount: 0 },
      collection: { previousAmount: 0 },
    },
  }
}

export async function getNeoCrmTeamReport(input: {
  granularity: NeoCrmGranularity
  offset: number
}): Promise<NeoCrmTeamReport> {
  const granularity = VALID_GRANULARITIES.includes(input.granularity) ? input.granularity : "month"
  const offset = Number.isFinite(input.offset) ? Math.min(0, Math.trunc(input.offset)) : 0
  const bounds = resolvePeriodBounds(granularity, offset)
  const previousBounds = resolvePeriodBounds(granularity, offset - 1)
  const startIso = bounds.start.toISOString()
  const endIso = bounds.end.toISOString()
  // 현재+직전 기간을 한 번에 읽어 같은 시기 비교(증감)를 계산한다. 두 기간은 연속이라
  // [prevStart, curEnd) 한 윈도우로 덮고, occurred_at >= curStart 여부로 분리한다.
  const windowStartIso = previousBounds.start.toISOString()

  const sb = createSupabaseAdminClient()

  const moneyWindowSelect = (objectApiKey: string) =>
    sb
      .from("external_crm_records")
      .select("owner_name, payload, amount, occurred_at, display_name, status, external_id, object_api_key")
      .eq("source_system", "xiaoshouyi")
      .eq("object_api_key", objectApiKey)
      .eq("is_stale", false)
      .gte("occurred_at", windowStartIso)
      .lt("occurred_at", endIso)
      .limit(PERIOD_SCAN_LIMIT)

  const [
    teamManagerResult,
    salesPerfResult,
    opportunityResult,
    collectionResult,
    accountTotalResult,
    accountWindowResult,
    leadsPeriodResult,
    leadsPrevResult,
    leadsTotalResult,
    latestResult,
    ownerNames,
    excludedOwnerIds,
  ] = await Promise.all([
    sb
      .from("branch_rev_deals")
      .select(
        "team, manager, status, monthly_payments, contract_target, product_version, monthly_confirmed, monthly_red, monthly_high_conf"
      )
      .limit(PERIOD_SCAN_LIMIT),
    moneyWindowSelect("SalesPerformance__c"),
    moneyWindowSelect("opportunity"),
    moneyWindowSelect("Collection__c"),
    sb
      .from("external_crm_records")
      .select("owner_name, payload")
      .eq("source_system", "xiaoshouyi")
      .eq("object_api_key", "account")
      .eq("is_stale", false)
      .limit(PERIOD_SCAN_LIMIT),
    sb
      .from("external_crm_records")
      .select("owner_name, payload, occurred_at")
      .eq("source_system", "xiaoshouyi")
      .eq("object_api_key", "account")
      .eq("is_stale", false)
      .gte("occurred_at", windowStartIso)
      .lt("occurred_at", endIso)
      .limit(PERIOD_SCAN_LIMIT),
    sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", windowStartIso)
      .lt("created_at", startIso),
    sb.from("leads").select("id", { count: "exact", head: true }),
    sb
      .from("external_crm_records")
      .select("synced_at")
      .eq("source_system", "xiaoshouyi")
      .order("synced_at", { ascending: false })
      .limit(1),
    getXiaoshouyiOwnerNameMap(sb),
    getExcludedXiaoshouyiOwnerIds(sb),
  ])

  const blockingError =
    salesPerfResult.error ?? opportunityResult.error ?? accountTotalResult.error ?? collectionResult.error
  if (blockingError) {
    const message = blockingError.message ?? "Neo CRM 스냅샷을 읽지 못했습니다."
    return emptyReport(granularity, offset, bounds, previousBounds.label, `external_crm_records: ${message}`)
  }

  const sheetRows = (teamManagerResult.error ? [] : teamManagerResult.data ?? []) as Array<{
    team: string | null
    manager: string | null
    status: string | null
    monthly_payments: Record<string, number> | null
    contract_target: number | null
    product_version: string | null
    monthly_confirmed: Record<string, number> | null
    monthly_red: Record<string, boolean> | null
    monthly_high_conf: Record<string, number> | null
  }>
  const koreaManagers = getKoreaTeamManagerSet(sheetRows)

  // Korea team scope = scoped record AND owner not on the exclusion list
  // (e.g. China team). resolves to "include all but excluded" under the
  // Korea-only flag.
  const isScoped = (row: { owner_name: string | null; payload: Record<string, unknown> | null }) =>
    isKoreaScopedExternalRecord(row, koreaManagers) && !excludedOwnerIds.has(row.owner_name?.trim() ?? "")

  const isCurrent = (occurredAt: string | null) => (occurredAt ?? "") >= startIso

  // MTD 페이스 비교: 진행 중인 기간(offset 0)은 "기간 시작 ~ 지금"까지만 찼으므로,
  // 직전 기간도 같은 경과 길이까지만 잘라 비교해야 공정하다(월초에 항상 -로 보이는 문제 제거).
  // 완료된 과거 기간(offset < 0)은 기간 전체가 차 있으므로 직전 기간도 전체 비교.
  const paceAdjusted = offset === 0
  const periodStartMs = bounds.start.getTime()
  const paceCutoffMs = paceAdjusted
    ? Math.min(Date.now(), bounds.end.getTime())
    : bounds.end.getTime()
  const elapsedMs = Math.max(0, paceCutoffMs - periodStartMs)
  const prevPaceCutoffMs = Math.min(previousBounds.start.getTime() + elapsedMs, previousBounds.end.getTime())
  const prevPaceCutoffIso = new Date(prevPaceCutoffMs).toISOString()
  // 직전 기간 윈도우: [prevStart, prevPaceCutoff). allSales 쿼리가 prevStart부터 읽으므로
  // 상한만 적용하면 된다. (prevPaceCutoffIso <= startIso 보장)
  const isPrevPace = (occurredAt: string | null) => (occurredAt ?? "") < prevPaceCutoffIso

  // REV 시트 한국팀 활성 행(취소/해지 제외). 월별 추이·목표·믹스·담당자 진행의 공통 소스.
  const koreaActiveRows = sheetRows.filter(
    (row) => isKoreaTeamLabel(row.team) && !SHEET_INACTIVE_PATTERN.test(row.status ?? "")
  )

  // 월별 목표 vs 확정 추이(회계연도 전체) — 시트에 등장하는 모든 월 키를 모아 정렬.
  // 선택 기간과 무관하게 항상 산출(스크린샷의 "수금목표-월도" 표/차트 재현).
  const monthlyAcc = new Map<string, { target: number; confirmed: number }>()
  for (const row of koreaActiveRows) {
    for (const [key, value] of Object.entries(row.monthly_payments ?? {})) {
      if (!/^\d{4}-\d{2}$/.test(key)) continue
      const monthTotal = Number(value) || 0
      const acc = monthlyAcc.get(key) ?? { target: 0, confirmed: 0 }
      acc.target += monthTotal
      acc.confirmed += confirmedMonthAmount(row as unknown as BranchRevDeal, key, monthTotal)
      monthlyAcc.set(key, acc)
    }
  }
  const monthlySeries: NeoCrmMonthlyPoint[] = Array.from(monthlyAcc.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, acc]) => ({
      monthKey,
      label: `${monthKey.slice(2, 4)}.${monthKey.slice(5, 7)}`,
      target: acc.target,
      confirmed: acc.confirmed,
      rate: acc.target > 0 ? acc.confirmed / acc.target : null,
    }))

  // 목표치: REV 시트 기준. 기간이 덮는 월(monthKeys)의 한국팀 활성 행 예정액 합계.
  // 주 단위는 시트 월 목표를 안전하게 쪼갤 수 없어 null(달성치만 표시).
  let targetAmount: number | null = null
  const mixSegments: NeoCrmMixSegment[] = []
  const managerProgress: NeoCrmManagerProgressRow[] = []
  if (bounds.monthKeys) {
    const monthKeys = bounds.monthKeys
    targetAmount = koreaActiveRows.reduce(
      (total, row) =>
        total + monthKeys.reduce((sub, key) => sub + (Number(row.monthly_payments?.[key]) || 0), 0),
      0
    )

    // 장르 믹스 + 담당자별 진행: 목표=monthly_payments, 확정=monthly_confirmed(색 규칙).
    const segmentAcc = new Map<
      NeoCrmMixSegment["key"],
      { target: number; confirmed: number; dealCount: number }
    >()
    const managerAcc = new Map<string, { target: number; confirmed: number; dealCount: number }>()
    for (const row of koreaActiveRows) {
      let rowTarget = 0
      let rowConfirmed = 0
      for (const key of monthKeys) {
        const monthTotal = Number(row.monthly_payments?.[key]) || 0
        rowTarget += monthTotal
        // confirmedMonthAmount는 monthly_confirmed/red/high_conf만 읽는다.
        rowConfirmed += confirmedMonthAmount(row as unknown as BranchRevDeal, key, monthTotal)
      }
      if (rowTarget === 0 && rowConfirmed === 0) continue

      const segKey = mixSegmentKey(classifySheetCategory(row.product_version), classifySheetStatusType(row.status))
      const seg = segmentAcc.get(segKey) ?? { target: 0, confirmed: 0, dealCount: 0 }
      seg.target += rowTarget
      seg.confirmed += rowConfirmed
      seg.dealCount += 1
      segmentAcc.set(segKey, seg)

      const managerName = normalizeBranchMemberName(row.manager) ?? "미지정"
      const mgr = managerAcc.get(managerName) ?? { target: 0, confirmed: 0, dealCount: 0 }
      mgr.target += rowTarget
      mgr.confirmed += rowConfirmed
      mgr.dealCount += 1
      managerAcc.set(managerName, mgr)
    }

    for (const key of MIX_SEGMENT_ORDER) {
      const seg = segmentAcc.get(key)
      if (!seg) continue
      mixSegments.push({
        key,
        label: MIX_SEGMENT_LABEL[key],
        target: seg.target,
        confirmed: seg.confirmed,
        rate: seg.target > 0 ? seg.confirmed / seg.target : null,
        dealCount: seg.dealCount,
      })
    }
    managerProgress.push(
      ...Array.from(managerAcc.entries())
        .map(([manager, acc]) => ({
          manager,
          target: acc.target,
          confirmed: acc.confirmed,
          rate: acc.target > 0 ? acc.confirmed / acc.target : null,
          dealCount: acc.dealCount,
        }))
        .sort((a, b) => b.target - a.target)
    )
  }

  const allSales = ((salesPerfResult.data ?? []) as ScopedOrderRecord[]).filter(isScoped)
  const salesRows = allSales.filter((row) => isCurrent(row.occurred_at))
  const prevSalesRows = allSales.filter((row) => isPrevPace(row.occurred_at))

  // owner_name은 Xiaoshouyi ownerId(숫자)다. User 객체 맵으로 이름을 붙이고,
  // 미동기화 시에는 id를 그대로 표시한다. 그룹 키는 안정적으로 ownerId를 쓴다.
  const revenueByOwner = new Map<string, { owner: string; amount: number; orderCount: number }>()
  const prevByOwner = new Map<string, number>()
  let teamTotal = 0
  let prevTeamTotal = 0
  for (const row of salesRows) {
    const amount = Number(row.amount) || 0
    teamTotal += amount
    const ownerKey = row.owner_name?.trim() || "unassigned"
    const existing = revenueByOwner.get(ownerKey) ?? {
      owner: resolveOwnerName(row.owner_name, ownerNames),
      amount: 0,
      orderCount: 0,
    }
    existing.amount += amount
    existing.orderCount += 1
    revenueByOwner.set(ownerKey, existing)
  }
  for (const row of prevSalesRows) {
    const amount = Number(row.amount) || 0
    prevTeamTotal += amount
    const ownerKey = row.owner_name?.trim() || "unassigned"
    prevByOwner.set(ownerKey, (prevByOwner.get(ownerKey) ?? 0) + amount)
  }

  const byOwner: NeoCrmTeamRevenueRow[] = Array.from(revenueByOwner.entries())
    .map(([ownerKey, row]) => {
      const previousAmount = prevByOwner.get(ownerKey) ?? 0
      return {
        owner: row.owner,
        ownerKey,
        amount: row.amount,
        orderCount: row.orderCount,
        share: teamTotal > 0 ? row.amount / teamTotal : 0,
        previousAmount,
        delta: row.amount - previousAmount,
      }
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TEAM_REVENUE_ROW_LIMIT)

  const allOrders = ((opportunityResult.data ?? []) as ScopedOrderRecord[]).filter(isScoped)
  const orderRows = allOrders.filter((row) => isCurrent(row.occurred_at))
  const prevOrderRows = allOrders.filter((row) => isPrevPace(row.occurred_at))
  const orderAmount = orderRows.reduce((total, row) => total + (Number(row.amount) || 0), 0)
  const prevOrderAmount = prevOrderRows.reduce((total, row) => total + (Number(row.amount) || 0), 0)
  const recentOrders: NeoCrmOrderItem[] = orderRows
    .slice()
    .sort((a, b) => (b.occurred_at ?? "").localeCompare(a.occurred_at ?? ""))
    .slice(0, RECENT_ORDER_LIMIT)
    .map((row) => ({
      key: `${row.object_api_key}:${row.external_id}`,
      customerName: row.display_name ?? row.external_id,
      ownerName: row.owner_name ? resolveOwnerName(row.owner_name, ownerNames) : null,
      status: row.status,
      amount: row.amount,
      occurredAt: row.occurred_at,
    }))

  const allCollections = ((collectionResult.data ?? []) as ScopedAmountRecord[]).filter(isScoped)
  const collectionRows = allCollections.filter((row) => isCurrent(row.occurred_at))
  const collectionAmount = collectionRows.reduce((total, row) => total + (Number(row.amount) || 0), 0)
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const collectionRows30d = allCollections.filter((row) => (row.occurred_at ?? "") >= thirtyDaysAgoIso)
  const collectionAmount30d = collectionRows30d.reduce((total, row) => total + (Number(row.amount) || 0), 0)
  const prevCollectionAmount = allCollections
    .filter((row) => isPrevPace(row.occurred_at))
    .reduce((total, row) => total + (Number(row.amount) || 0), 0)

  const accountTotal = (
    (accountTotalResult.data ?? []) as Array<{ owner_name: string | null; payload: Record<string, unknown> | null }>
  ).filter(isScoped).length
  const accountWindow = (
    (accountWindowResult.error ? [] : accountWindowResult.data ?? []) as Array<{
      owner_name: string | null
      payload: Record<string, unknown> | null
      occurred_at: string | null
    }>
  ).filter(isScoped)
  const accountActiveInPeriod = accountWindow.filter((row) => isCurrent(row.occurred_at)).length
  const accountActivePrevious = accountWindow.filter((row) => isPrevPace(row.occurred_at)).length

  const latestRow = latestResult.error ? null : latestResult.data?.[0]
  const fx = await getFxRates()
  const usdCnyRate = fx.usdKrw / fx.cnyKrw

  return {
    ok: true,
    error: null,
    usdCnyRate,
    latestSyncedAt: latestRow && typeof latestRow.synced_at === "string" ? latestRow.synced_at : null,
    granularity,
    offset,
    period: {
      label: bounds.label,
      startIso,
      endIso,
      canGoNext: offset < 0,
    },
    target: {
      amount: targetAmount,
      achievement: teamTotal,
      rate: targetAmount && targetAmount > 0 ? teamTotal / targetAmount : null,
      basis: targetAmount != null ? "rev_sheet_month" : "none",
    },
    mix: {
      basis: bounds.monthKeys ? "rev_sheet_month" : "none",
      segments: mixSegments,
    },
    managerProgress,
    monthlySeries,
    revenue: {
      teamTotal,
      orderCount: salesRows.length,
      contributorCount: revenueByOwner.size,
      byOwner,
    },
    account: {
      totalCount: accountTotal,
      activeInPeriodCount: accountActiveInPeriod,
    },
    order: {
      count: orderRows.length,
      amount: orderAmount,
      recent: recentOrders,
      byOwner: groupByOwner(orderRows, ownerNames),
    },
    collection: {
      amount: collectionAmount,
      count: collectionRows.length,
      amount30d: collectionAmount30d,
      count30d: collectionRows30d.length,
      byOwner: groupByOwner(collectionRows, ownerNames),
    },
    leads: {
      totalCount: leadsTotalResult.error ? 0 : leadsTotalResult.count ?? 0,
      periodCount: leadsPeriodResult.error ? 0 : leadsPeriodResult.count ?? 0,
      previousCount: leadsPrevResult.error ? 0 : leadsPrevResult.count ?? 0,
    },
    comparison: {
      previousLabel: previousBounds.label,
      paceAdjusted,
      revenue: {
        previousTotal: prevTeamTotal,
        delta: teamTotal - prevTeamTotal,
        rate: prevTeamTotal > 0 ? (teamTotal - prevTeamTotal) / prevTeamTotal : null,
      },
      order: { previousCount: prevOrderRows.length, previousAmount: prevOrderAmount },
      account: { previousActiveCount: accountActivePrevious },
      collection: { previousAmount: prevCollectionAmount },
    },
  }
}

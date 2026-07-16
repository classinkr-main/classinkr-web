import "server-only"

import { normalizedAccountKey } from "@/lib/branch/account-key"
import { isInactiveSheetStatus, isPlaceholderCrmName } from "@/lib/crm-source-linking"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// ── 하드웨어 출고 ↔ REV 매출 대사 (존재성 대사 v1) ──────────────────────────
//
// account-key.ts 주석이 예고한 조인: 출고(branch_hw_outbound.destination)와
// REV 원장(branch_rev_deals.customer_name)을 normalizedAccountKey로 묶는다.
//
// v1은 금액 비교를 하지 않는다 — 출고 revenue는 USD, REV는 CNY라(운영 캐논 통화 규범)
// 환율 없이 대조하면 가짜 불일치를 양산한다. 대신 존재성만 본다:
//   hw_only  = 출고 실적이 있는데 REV 원장에 그 계정 매출이 없음(매출 미기재 의심)
//   rev_only = REV 매출이 있는데 출고 기록이 없음(SW 매출일 수 있어 dealTypes 함께 노출)
//   both     = 양쪽 존재(정상 후보)
//
// 배송예정·물류번호없음 행은 실제 출고와 구분한다(운영 철칙): progress에 '예정'이 있거나
// outbound_date가 없으면 planned로, logistics_no 누락은 카운트로 별도 표기하고
// hw_only 판정의 "실출고" 근거에서 planned는 제외한다.

interface HwOutboundRow {
  logistics_no: string | null
  outbound_date: string | null
  product: string | null
  quantity: number | null
  revenue: number | null
  destination: string | null
  progress: string | null
  type: string | null
}

interface RevSheetRow {
  customer_name: string
  status: string | null
  deal_type: string | null
  monthly_payments: Record<string, number> | null
}

export type HwRevReconcileStatus = "both" | "hw_only" | "rev_only"

// 대사 그레인: 계정×월 존재성(2026-07-10 운영 결정). v_hardware_rev_matches 뷰
// (20260710_hw_rev_reconcile_matches.sql)가 있으면 월 단위 신호를 오버레이하고,
// 마이그레이션 미적용 환경에서는 계정 단위(account)로 자동 폴백한다.
export type HwRevReconcileGrain = "account_month" | "account"

export interface HwRevReconcileRow {
  accountKey: string
  name: string
  status: HwRevReconcileStatus
  /** 실출고 수량(planned 제외) */
  hwShippedQty: number
  /** 배송예정 수량 */
  hwPlannedQty: number
  /** 물류번호 누락 행 수 */
  hwNoLogisticsRows: number
  /** 출고 시트의 매출 합(USD — CNY와 합산·비교 금지) */
  hwRevenueUSD: number
  lastOutboundDate: string | null
  hwProducts: string[]
  /** REV 원장 매출 합(CNY) */
  revCNY: number
  revRows: number
  revDealTypes: string[]
  /** (월 그레인) 실출고는 있는데 그 달 REV HW 매출이 없는 월들 — 매출 미기재 의심의 정밀 신호 */
  hwOnlyMonths?: string[]
  /** (월 그레인) REV HW 매출은 있는데 그 달 실출고가 없는 월들 */
  revOnlyMonths?: string[]
}

export interface HwRevReconcileResult {
  rows: HwRevReconcileRow[]
  summary: {
    both: number
    hwOnly: number
    revOnly: number
    /** destination이 비어 계정 매칭이 불가능한 출고 행 수 — 대사 사각지대 */
    hwUnattributableRows: number
    grain: HwRevReconcileGrain
    /** (월 그레인) 전체 hw_only 계정×월 셀 수 */
    hwOnlyMonthCells?: number
  }
}

const PLANNED_PATTERN = /예정|planned|pending/i

function isPlannedOutbound(row: HwOutboundRow): boolean {
  if (PLANNED_PATTERN.test(row.progress ?? "")) return true
  return !row.outbound_date
}

interface MonthMatchOverlay {
  hwOnlyMonths: string[]
  revOnlyMonths: string[]
}

// v_hardware_rev_matches(계정×월 존재성 뷰)에서 월 그레인 신호를 읽는다.
// 뷰가 없으면(마이그레이션 미적용) null — 호출자는 계정 그레인으로 폴백.
async function fetchMonthMatchOverlay(
  sb: ReturnType<typeof createSupabaseAdminClient>,
): Promise<Map<string, MonthMatchOverlay> | null> {
  const res = await sb
    .from("v_hardware_rev_matches")
    .select("account_key, period_month, match_status")
    .limit(10000)
  if (res.error) return null

  const byAccount = new Map<string, MonthMatchOverlay>()
  for (const row of (res.data ?? []) as Array<{
    account_key: string | null
    period_month: string | null
    match_status: string | null
  }>) {
    const key = row.account_key ?? ""
    const month = row.period_month ?? ""
    if (!key || !month) continue
    const overlay = byAccount.get(key) ?? { hwOnlyMonths: [], revOnlyMonths: [] }
    if (row.match_status === "hw_only") overlay.hwOnlyMonths.push(month)
    else if (row.match_status === "rev_only") overlay.revOnlyMonths.push(month)
    byAccount.set(key, overlay)
  }
  for (const overlay of byAccount.values()) {
    overlay.hwOnlyMonths.sort()
    overlay.revOnlyMonths.sort()
  }
  return byAccount
}

export async function getHwRevReconcile(): Promise<HwRevReconcileResult> {
  const sb = createSupabaseAdminClient()

  const [hwRes, revRes, monthOverlay] = await Promise.all([
    sb
      .from("branch_hw_outbound")
      .select("logistics_no, outbound_date, product, quantity, revenue, destination, progress, type")
      .limit(3000),
    sb
      .from("branch_rev_deals")
      .select("customer_name, status, deal_type, monthly_payments")
      .limit(1000),
    fetchMonthMatchOverlay(sb),
  ])

  if (hwRes.error) throw hwRes.error
  if (revRes.error) throw revRes.error

  interface HwAgg {
    name: string
    shippedQty: number
    plannedQty: number
    noLogisticsRows: number
    revenueUSD: number
    lastOutboundDate: string | null
    products: Set<string>
  }
  const hwByKey = new Map<string, HwAgg>()
  let hwUnattributableRows = 0

  for (const row of (hwRes.data ?? []) as HwOutboundRow[]) {
    const destination = (row.destination ?? "").trim()
    if (!destination) {
      hwUnattributableRows += 1
      continue
    }
    const key = normalizedAccountKey(destination)
    const agg = hwByKey.get(key) ?? {
      name: destination,
      shippedQty: 0,
      plannedQty: 0,
      noLogisticsRows: 0,
      revenueUSD: 0,
      lastOutboundDate: null,
      products: new Set<string>(),
    }
    const quantity = Number(row.quantity) || 0
    if (isPlannedOutbound(row)) agg.plannedQty += quantity
    else {
      agg.shippedQty += quantity
      if (row.outbound_date && (!agg.lastOutboundDate || row.outbound_date > agg.lastOutboundDate)) {
        agg.lastOutboundDate = row.outbound_date
      }
    }
    if (!row.logistics_no) agg.noLogisticsRows += 1
    const revenue = Number(row.revenue)
    if (Number.isFinite(revenue)) agg.revenueUSD += revenue
    if (row.product) agg.products.add(row.product)
    hwByKey.set(key, agg)
  }

  interface RevAgg {
    name: string
    revCNY: number
    rows: number
    dealTypes: Set<string>
  }
  const revByKey = new Map<string, RevAgg>()
  for (const row of (revRes.data ?? []) as RevSheetRow[]) {
    if (isInactiveSheetStatus(row.status) || isPlaceholderCrmName(row.customer_name)) continue
    const key = normalizedAccountKey(row.customer_name)
    const agg = revByKey.get(key) ?? { name: row.customer_name, revCNY: 0, rows: 0, dealTypes: new Set<string>() }
    let sum = 0
    for (const value of Object.values(row.monthly_payments ?? {})) {
      const amount = Number(value)
      if (Number.isFinite(amount)) sum += amount
    }
    agg.revCNY += sum
    agg.rows += 1
    if (row.deal_type) agg.dealTypes.add(row.deal_type)
    revByKey.set(key, agg)
  }

  const rows: HwRevReconcileRow[] = []
  const allKeys = new Set([...hwByKey.keys(), ...revByKey.keys()])
  for (const key of allKeys) {
    const hw = hwByKey.get(key)
    const rev = revByKey.get(key)
    const shipped = hw?.shippedQty ?? 0
    const revCNY = rev?.revCNY ?? 0

    // 판정은 실출고(shipped)와 REV 매출 존재로만 — planned(배송예정)은 실출고가 아니므로 제외.
    // 실출고도 매출도 없는 계정(예: 배송예정만 있고 매출 0)은 대사 대상이 아니라 스킵한다.
    if (shipped === 0 && revCNY === 0) continue

    let status: HwRevReconcileStatus
    if (shipped > 0 && revCNY > 0) status = "both"
    else if (shipped > 0) status = "hw_only" // revCNY === 0 — 출고했는데 매출 미기재 의심
    else status = "rev_only" // revCNY > 0 && shipped === 0 — 매출은 있는데 실출고 없음

    // 월 그레인 오버레이(뷰 존재 시): 이 계정의 hw_only/rev_only 월 목록.
    const overlay = monthOverlay?.get(key)

    rows.push({
      accountKey: key,
      name: hw?.name ?? rev?.name ?? key,
      status,
      hwShippedQty: shipped,
      hwPlannedQty: hw?.plannedQty ?? 0,
      hwNoLogisticsRows: hw?.noLogisticsRows ?? 0,
      hwRevenueUSD: hw?.revenueUSD ?? 0,
      lastOutboundDate: hw?.lastOutboundDate ?? null,
      hwProducts: hw ? Array.from(hw.products).sort() : [],
      revCNY,
      revRows: rev?.rows ?? 0,
      revDealTypes: rev ? Array.from(rev.dealTypes).sort() : [],
      ...(overlay && overlay.hwOnlyMonths.length > 0 ? { hwOnlyMonths: overlay.hwOnlyMonths } : {}),
      ...(overlay && overlay.revOnlyMonths.length > 0 ? { revOnlyMonths: overlay.revOnlyMonths } : {}),
    })
  }

  // 불일치가 위로: hw_only(매출 미기재 의심) → rev_only → both. 각 그룹 안에서는 통화를 섞지 않고
  // (USD·CNY 합산 금지 — 파일 철칙) revCNY → hwRevenueUSD → 실출고수량 순 렉시코그래픽 정렬.
  const statusRank: Record<HwRevReconcileStatus, number> = { hw_only: 0, rev_only: 1, both: 2 }
  rows.sort(
    (a, b) =>
      statusRank[a.status] - statusRank[b.status] ||
      b.revCNY - a.revCNY ||
      b.hwRevenueUSD - a.hwRevenueUSD ||
      b.hwShippedQty - a.hwShippedQty ||
      a.name.localeCompare(b.name, "ko")
  )

  return {
    rows,
    summary: {
      both: rows.filter((r) => r.status === "both").length,
      hwOnly: rows.filter((r) => r.status === "hw_only").length,
      revOnly: rows.filter((r) => r.status === "rev_only").length,
      hwUnattributableRows,
      grain: monthOverlay ? "account_month" : "account",
      ...(monthOverlay
        ? { hwOnlyMonthCells: rows.reduce((sum, r) => sum + (r.hwOnlyMonths?.length ?? 0), 0) }
        : {}),
    },
  }
}

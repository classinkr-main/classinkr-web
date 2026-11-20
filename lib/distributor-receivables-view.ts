import type { DelimitedCell } from "@/lib/export/delimited"
import {
  DISTRIBUTOR_ISSUE_REASON_LABELS,
  DISTRIBUTOR_STATUS_LABELS,
  getOutstandingAmount,
  isSettlementOverdue,
  type DistributorReceivablePayment,
} from "@/lib/distributor-settlements"
import { kstDateKey } from "@/lib/hardware/process-alerts"
// server-only 모듈이라 타입으로만 가져온다.
import type { DistributorReceivableRow } from "@/lib/repositories/distributor-settlements"

// 총판 미수금 보드(/admin/quotes?tab=receivables)의 순수 계산 — 경과일·구간·필터·정렬·묶음·요약·월별 흐름·CSV·URL 상태.
// 서버·클라이언트 공용이다(React·Next·DB 의존 금지). 미수·기한 경과 판정은 lib/distributor-settlements.ts 를 그대로 쓴다.

/* ─── 경과 구간 ──────────────────────────────────────────── */

export const RECEIVABLE_AGE_BUCKETS = ["d0_30", "d31_60", "d61_90", "d91_plus"] as const
export type ReceivableAgeBucket = (typeof RECEIVABLE_AGE_BUCKETS)[number]

export const RECEIVABLE_AGE_BUCKET_LABELS: Record<ReceivableAgeBucket, string> = {
  d0_30: "30일 이내",
  d31_60: "31~60일",
  d61_90: "61~90일",
  d91_plus: "91일 이상",
}

const DAY_MS = 86_400_000

function utcDay(date: string): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1)
}

/** YYYY-MM-DD 두 날짜의 차(to − from, 일). UTC 자정 기준이라 DST·시간대 영향이 없다. */
export function diffDays(fromDate: string, toDate: string): number {
  return Math.round((utcDay(toDate) - utcDay(fromDate)) / DAY_MS)
}

export function ageBucketOf(ageDays: number): ReceivableAgeBucket {
  if (ageDays <= 30) return "d0_30"
  if (ageDays <= 60) return "d31_60"
  if (ageDays <= 90) return "d61_90"
  return "d91_plus"
}

/* ─── 보기 행 ────────────────────────────────────────────── */

export interface ReceivableViewRow {
  row: DistributorReceivableRow
  outstanding: number
  overdue: boolean
  issuedDate: string | null
  issuedMonth: string | null
  ageDays: number | null
  ageBucket: ReceivableAgeBucket | null
  daysUntilDue: number | null
  dueMissing: boolean
  lastPaidOn: string | null
  paymentCount: number
}

export function buildReceivableViewRows(
  rows: readonly DistributorReceivableRow[],
  payments: readonly DistributorReceivablePayment[],
  today: string
): ReceivableViewRow[] {
  const bySettlement = new Map<string, { last: string | null; count: number }>()
  for (const payment of payments) {
    const entry = bySettlement.get(payment.settlementId) ?? { last: null, count: 0 }
    entry.count += 1
    if (!entry.last || payment.paidOn > entry.last) entry.last = payment.paidOn
    bySettlement.set(payment.settlementId, entry)
  }

  return rows.map((row) => {
    const outstanding = getOutstandingAmount(row)
    const issuedDate = row.issuedAt ? kstDateKey(row.issuedAt) : null
    const ageDays = issuedDate ? Math.max(0, diffDays(issuedDate, today)) : null
    const paid = bySettlement.get(row.id)
    return {
      row,
      outstanding,
      overdue: isSettlementOverdue(row, today),
      issuedDate,
      issuedMonth: issuedDate ? issuedDate.slice(0, 7) : null,
      ageDays,
      ageBucket: outstanding > 0 && ageDays != null ? ageBucketOf(ageDays) : null,
      daysUntilDue: row.dueDate ? diffDays(today, row.dueDate) : null,
      dueMissing: outstanding > 0 && !row.dueDate,
      lastPaidOn: paid?.last ?? null,
      paymentCount: paid?.count ?? 0,
    }
  })
}

/* ─── 필터 ───────────────────────────────────────────────── */

export type ReceivableStatusFilter = "open" | "overdue" | "due_missing" | "partial" | "paid" | "all"

export const RECEIVABLE_STATUS_FILTER_LABELS: Record<ReceivableStatusFilter, string> = {
  open: "받을 건",
  overdue: "기한 경과",
  due_missing: "기한 미입력",
  partial: "일부 입금",
  paid: "입금 완료",
  all: "전체",
}

export interface ReceivableFilters {
  query: string
  status: ReceivableStatusFilter
  distributor: string | null
  bucket: ReceivableAgeBucket | null
  month: string | null
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, "")
}

function matchesStatus(view: ReceivableViewRow, status: ReceivableStatusFilter): boolean {
  switch (status) {
    case "open":
      return view.outstanding > 0
    case "overdue":
      return view.overdue
    case "due_missing":
      return view.dueMissing
    case "partial":
      return view.row.status === "partial"
    case "paid":
      return view.row.status === "paid"
    default:
      return true
  }
}

export function filterReceivableRows(rows: readonly ReceivableViewRow[], filters: ReceivableFilters): ReceivableViewRow[] {
  const query = normalizeText(filters.query)
  return rows.filter((view) => {
    if (!matchesStatus(view, filters.status)) return false
    if (filters.distributor != null && view.row.distributorName !== filters.distributor) return false
    if (filters.bucket != null && view.ageBucket !== filters.bucket) return false
    if (filters.month != null && view.issuedMonth !== filters.month) return false
    if (query) {
      const haystack = [view.row.customerName, view.row.quoteNumber, view.row.distributorName, view.row.dealTitle]
      if (!haystack.some((field) => normalizeText(field).includes(query))) return false
    }
    return true
  })
}

/* ─── 정렬 ───────────────────────────────────────────────── */

export type ReceivableSortKey = "issued" | "outstanding" | "total" | "due" | "age" | "customer"
export interface ReceivableSort {
  key: ReceivableSortKey
  dir: "asc" | "desc"
}

function issuedTime(view: ReceivableViewRow): number | null {
  if (!view.row.issuedAt) return null
  const time = Date.parse(view.row.issuedAt)
  return Number.isFinite(time) ? time : null
}

function sortValue(view: ReceivableViewRow, key: ReceivableSortKey): number | string | null {
  switch (key) {
    case "issued":
      return issuedTime(view)
    case "outstanding":
      return view.outstanding
    case "total":
      return view.row.totalAmount
    case "due":
      return view.row.dueDate || null
    case "age":
      return view.ageDays
    case "customer":
      return view.row.customerName?.trim() || null
  }
}

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "ko")
  return (a as number) - (b as number)
}

export function sortReceivableRows(rows: readonly ReceivableViewRow[], sort: ReceivableSort): ReceivableViewRow[] {
  const sign = sort.dir === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sort.key)
    const bv = sortValue(b, sort.key)
    if (av == null && bv != null) return 1
    if (av != null && bv == null) return -1
    if (av != null && bv != null) {
      const diff = compareValues(av, bv)
      if (diff !== 0) return diff * sign
    }
    // 동점: 발행 시각 내림차순(없으면 뒤) → id.
    const at = issuedTime(a)
    const bt = issuedTime(b)
    if (at !== bt) {
      if (at == null) return 1
      if (bt == null) return -1
      return bt - at
    }
    return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0
  })
}

/* ─── 묶음 ───────────────────────────────────────────────── */

export type ReceivableGroupKey = "none" | "distributor" | "issued_month" | "age_bucket"

export const RECEIVABLE_GROUP_LABELS: Record<ReceivableGroupKey, string> = {
  none: "묶지 않음",
  distributor: "총판별",
  issued_month: "발행월별",
  age_bucket: "경과 구간별",
}

export interface ReceivableGroup {
  key: string
  label: string
  rows: ReceivableViewRow[]
  count: number
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
  overdueCount: number
  overdueAmount: number
}

function makeGroup(key: string, label: string, rows: ReceivableViewRow[]): ReceivableGroup {
  const group: ReceivableGroup = {
    key,
    label,
    rows,
    count: rows.length,
    totalAmount: 0,
    paidAmount: 0,
    outstandingAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
  }
  for (const view of rows) {
    group.totalAmount += view.row.totalAmount
    group.paidAmount += view.row.paidAmount
    group.outstandingAmount += view.outstanding
    if (view.overdue) {
      group.overdueCount += 1
      group.overdueAmount += view.outstanding
    }
  }
  return group
}

export function groupReceivableRows(rows: readonly ReceivableViewRow[], groupKey: ReceivableGroupKey): ReceivableGroup[] {
  if (rows.length === 0) return []
  if (groupKey === "none") return [makeGroup("all", "전체", [...rows])]

  const buckets = new Map<string, { label: string; rows: ReceivableViewRow[] }>()
  for (const view of rows) {
    let key: string
    let label: string
    if (groupKey === "distributor") {
      key = view.row.distributorName
      label = view.row.distributorName
    } else if (groupKey === "issued_month") {
      key = view.issuedMonth ?? "none"
      label = view.issuedMonth ?? "발행일 없음"
    } else {
      key = view.ageBucket ?? "none"
      label = view.ageBucket ? RECEIVABLE_AGE_BUCKET_LABELS[view.ageBucket] : "미수 없음"
    }
    const entry = buckets.get(key)
    if (entry) entry.rows.push(view)
    else buckets.set(key, { label, rows: [view] })
  }

  const groups = [...buckets.entries()].map(([key, entry]) => makeGroup(key, entry.label, entry.rows))

  if (groupKey === "distributor") {
    return groups.sort((a, b) => b.outstandingAmount - a.outstandingAmount || a.label.localeCompare(b.label, "ko"))
  }
  if (groupKey === "issued_month") {
    return groups.sort((a, b) => {
      if (a.key === "none") return b.key === "none" ? 0 : 1
      if (b.key === "none") return -1
      return a.key < b.key ? 1 : a.key > b.key ? -1 : 0
    })
  }
  return groups.sort((a, b) => {
    if (a.key === "none") return b.key === "none" ? 0 : 1
    if (b.key === "none") return -1
    return (
      RECEIVABLE_AGE_BUCKETS.indexOf(b.key as ReceivableAgeBucket) -
      RECEIVABLE_AGE_BUCKETS.indexOf(a.key as ReceivableAgeBucket)
    )
  })
}

/* ─── 요약 ───────────────────────────────────────────────── */

export interface ReceivableSummary {
  count: number
  totalAmount: number
  paidAmount: number
  openCount: number
  openAmount: number
  overdueCount: number
  overdueAmount: number
  dueMissingCount: number
  dueMissingAmount: number
  collectionRate: number | null
  oldestAgeDays: number | null
  buckets: Array<{ bucket: ReceivableAgeBucket; label: string; count: number; amount: number }>
}

export function summarizeReceivables(rows: readonly ReceivableViewRow[]): ReceivableSummary {
  const summary: ReceivableSummary = {
    count: rows.length,
    totalAmount: 0,
    paidAmount: 0,
    openCount: 0,
    openAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    dueMissingCount: 0,
    dueMissingAmount: 0,
    collectionRate: null,
    oldestAgeDays: null,
    buckets: RECEIVABLE_AGE_BUCKETS.map((bucket) => ({
      bucket,
      label: RECEIVABLE_AGE_BUCKET_LABELS[bucket],
      count: 0,
      amount: 0,
    })),
  }
  for (const view of rows) {
    summary.totalAmount += view.row.totalAmount
    summary.paidAmount += view.row.paidAmount
    if (view.outstanding > 0) {
      summary.openCount += 1
      summary.openAmount += view.outstanding
      if (view.ageDays != null && (summary.oldestAgeDays == null || view.ageDays > summary.oldestAgeDays)) {
        summary.oldestAgeDays = view.ageDays
      }
    }
    if (view.overdue) {
      summary.overdueCount += 1
      summary.overdueAmount += view.outstanding
    }
    if (view.dueMissing) {
      summary.dueMissingCount += 1
      summary.dueMissingAmount += view.outstanding
    }
    if (view.ageBucket) {
      const bucket = summary.buckets[RECEIVABLE_AGE_BUCKETS.indexOf(view.ageBucket)]
      bucket.count += 1
      bucket.amount += view.outstanding
    }
  }
  summary.collectionRate = summary.totalAmount > 0 ? summary.paidAmount / summary.totalAmount : null
  return summary
}

/* ─── 월별 흐름 ──────────────────────────────────────────── */

export interface ReceivableMonthPoint {
  month: string
  issuedAmount: number
  collectedAmount: number
}

export function buildReceivableMonthlyFlow(
  rows: readonly ReceivableViewRow[],
  payments: readonly DistributorReceivablePayment[],
  options: { months: number; today: string }
): ReceivableMonthPoint[] {
  const count = Math.max(0, Math.floor(options.months))
  const endYear = Number(options.today.slice(0, 4))
  const endMonth = Number(options.today.slice(5, 7))
  const points = new Map<string, ReceivableMonthPoint>()
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const index = endYear * 12 + (endMonth - 1) - offset
    const year = Math.floor(index / 12)
    const month = `${year}-${String((index % 12) + 1).padStart(2, "0")}`
    points.set(month, { month, issuedAmount: 0, collectedAmount: 0 })
  }
  const known = new Set<string>()
  for (const view of rows) {
    known.add(view.row.id)
    const point = view.issuedMonth ? points.get(view.issuedMonth) : undefined
    if (point) point.issuedAmount += view.row.totalAmount
  }
  for (const payment of payments) {
    if (!known.has(payment.settlementId)) continue
    const point = points.get(payment.paidOn.slice(0, 7))
    if (point) point.collectedAmount += payment.amount
  }
  return [...points.values()]
}

/* ─── CSV ────────────────────────────────────────────────── */

export function buildReceivablesCsvRows(rows: readonly ReceivableViewRow[]): DelimitedCell[][] {
  const header: DelimitedCell[] = [
    "고객",
    "견적번호",
    "딜",
    "총판",
    "상태",
    "발행일",
    "발행 사유",
    "청구액(원)",
    "입금액(원)",
    "남은 금액(원)",
    "입금 기한",
    "기한 경과",
    "발행 후 경과일",
    "경과 구간",
    "최근 입금일",
    "입금 횟수",
  ]
  const body = rows.map<DelimitedCell[]>((view) => [
    view.row.customerName ?? "",
    view.row.quoteNumber ?? "",
    view.row.dealTitle ?? "",
    view.row.distributorName,
    DISTRIBUTOR_STATUS_LABELS[view.row.status] ?? view.row.status,
    view.issuedDate ?? "",
    view.row.issueReason ? DISTRIBUTOR_ISSUE_REASON_LABELS[view.row.issueReason] ?? "" : "",
    view.row.totalAmount,
    view.row.paidAmount,
    view.outstanding,
    view.row.dueDate ?? "",
    view.overdue ? "Y" : "",
    view.ageDays ?? "",
    view.ageBucket ? RECEIVABLE_AGE_BUCKET_LABELS[view.ageBucket] : "",
    view.lastPaidOn ?? "",
    view.paymentCount,
  ])
  return [header, ...body]
}

/* ─── URL 상태 ───────────────────────────────────────────── */

export interface ReceivableViewState {
  filters: ReceivableFilters
  sort: ReceivableSort
  group: ReceivableGroupKey
}

export const DEFAULT_RECEIVABLE_VIEW_STATE: ReceivableViewState = {
  filters: { query: "", status: "open", distributor: null, bucket: null, month: null },
  sort: { key: "issued", dir: "desc" },
  group: "none",
}

const STATUS_VALUES = Object.keys(RECEIVABLE_STATUS_FILTER_LABELS) as ReceivableStatusFilter[]
const SORT_KEYS: ReceivableSortKey[] = ["issued", "outstanding", "total", "due", "age", "customer"]
const GROUP_VALUES = Object.keys(RECEIVABLE_GROUP_LABELS) as ReceivableGroupKey[]
const MONTH_RE = /^\d{4}-\d{2}$/
const QUERY_MAX = 100

export function parseReceivableViewState(params: URLSearchParams): ReceivableViewState {
  const defaults = DEFAULT_RECEIVABLE_VIEW_STATE
  const status = params.get("rst")
  const bucket = params.get("rage")
  const month = params.get("rmonth")
  const distributor = params.get("rdist")
  const group = params.get("rgroup")
  const [sortKey, sortDir] = (params.get("rsort") ?? "").split(".")
  const validSort = SORT_KEYS.includes(sortKey as ReceivableSortKey) && (sortDir === "asc" || sortDir === "desc")

  return {
    filters: {
      query: (params.get("rq") ?? "").trim().slice(0, QUERY_MAX),
      status: STATUS_VALUES.includes(status as ReceivableStatusFilter)
        ? (status as ReceivableStatusFilter)
        : defaults.filters.status,
      distributor: distributor ? distributor : null,
      bucket: RECEIVABLE_AGE_BUCKETS.includes(bucket as ReceivableAgeBucket) ? (bucket as ReceivableAgeBucket) : null,
      month: month && MONTH_RE.test(month) ? month : null,
    },
    sort: validSort ? { key: sortKey as ReceivableSortKey, dir: sortDir as "asc" | "desc" } : { ...defaults.sort },
    group: GROUP_VALUES.includes(group as ReceivableGroupKey) ? (group as ReceivableGroupKey) : defaults.group,
  }
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null) {
  if (value == null || value === "") params.delete(key)
  else params.set(key, value)
}

export function writeReceivableViewState(params: URLSearchParams, state: ReceivableViewState): void {
  const defaults = DEFAULT_RECEIVABLE_VIEW_STATE
  const { filters, sort } = state
  setOrDelete(params, "rq", filters.query.trim().slice(0, QUERY_MAX) || null)
  setOrDelete(params, "rst", filters.status === defaults.filters.status ? null : filters.status)
  setOrDelete(params, "rdist", filters.distributor)
  setOrDelete(params, "rage", filters.bucket)
  setOrDelete(params, "rmonth", filters.month)
  setOrDelete(
    params,
    "rsort",
    sort.key === defaults.sort.key && sort.dir === defaults.sort.dir ? null : `${sort.key}.${sort.dir}`
  )
  setOrDelete(params, "rgroup", state.group === defaults.group ? null : state.group)
}

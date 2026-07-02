"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowDownNarrowWide,
  ArrowDownRight,
  ArrowUpNarrowWide,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Gauge,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Table2,
  Target,
  TrendingUp,
  Trash2,
  Users,
  X,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { adminFetchJson, clearBranchRequestCache, useBranchJson } from "./client-api"
import { classifySalesLedgerProductCategory } from "@/lib/branch/product-category"
import {
  PERIODS,
  TEAMS,
  type BranchKpiMemberRow,
  type BranchKpiResponse,
  type BranchPipelineResponse,
  type BranchPipelineRow,
  type BranchSummaryResponse,
  type Period,
  type Team,
} from "./types"

type LedgerLens = "dsh" | "rev" | "kpi"
type RailView = "detail" | "input" | "queue"
type DraftKind = "new-row" | "edit-row"
type DraftStatus = "draft" | "checked" | "applied" | "cancelled"
type DraftStatusFilter = DraftStatus | "open" | "all"
type DraftQueueMode = "server" | "local"
type RevSortKey = "customer" | "product" | "manager" | "team" | "region" | "month" | "revenue" | "origin"
type RevSortDirection = "asc" | "desc"
type RevProductCategory = "all" | "software" | "hardware" | "unknown"
type RevOriginFilter = "all" | "sheet" | "draft"
type RevForecastFilter = "all" | "has-week" | "month-only" | "confirmed" | "open"
type DraftOperation = "forecast-add" | "period-shift" | "quantity-change" | "amount-change"
type RevWeeklySource = "explicit" | "inferred" | "month-only" | "empty"

interface DealDetail {
  id: string
  sheet_row?: number
  customer_name: string
  branch_contact: string | null
  manager: string | null
  team: string | null
  region: string | null
  status: string | null
  note: string | null
  deal_type: string | null
  product_version: string | null
  contract_target: number | null
  first_payment: string | null
  monthly_payments: Record<string, number>
  monthly_confirmed?: Record<string, number>
  monthly_high_conf?: Record<string, number>
  monthly_red?: Record<string, boolean>
}

interface DealDetailResponse {
  deal?: DealDetail
  error?: string
}

interface LedgerDraft {
  id: string
  kind: DraftKind
  status: DraftStatus
  sourceDealId?: string
  sourceSheetRow?: number | null
  sourceSnapshot?: Record<string, unknown>
  customer: string
  manager: string
  team: string
  month: string
  amount: number
  currency?: string
  note: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface LedgerEntry {
  id: string
  draftId?: string
  entryType: "manual-new" | "manual-edit"
  entryStatus: "active" | "reversed"
  sourceDealId?: string
  sourceSheetRow: number | null
  sourceSnapshot?: Record<string, unknown>
  customer: string
  manager: string
  team: string
  month: string
  amount: number
  currency?: string
  note: string
  appliedBy: string | null
  appliedAt: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface LedgerDraftInput {
  kind: DraftKind
  sourceDealId?: string
  sourceSheetRow?: number | null
  sourceSnapshot?: Record<string, unknown>
  customer: string
  manager: string
  team: string
  month: string
  amount: number
  note: string
  metadata?: Record<string, unknown>
}

type LedgerRevenueRow = BranchPipelineRow & {
  ledgerOrigin: "sheet" | "draft"
  draftId?: string
  draftKind?: DraftKind
  draftMonth?: string
  draftNote?: string
  draftMetadata?: Record<string, unknown>
  sourceDealId?: string
}

interface LedgerDraftsResponse {
  health?: { ok: boolean; message: string | null }
  ledgerHealth?: { ok: boolean; message: string | null }
  drafts?: LedgerDraft[]
  entries?: LedgerEntry[]
  error?: string
}

interface LedgerDraftResponse {
  draft?: LedgerDraft
  error?: string
}

interface DraftForm {
  operation: DraftOperation
  customer: string
  manager: string
  team: string
  productCategory: Exclude<RevProductCategory, "all">
  month: string
  fromMonth: string
  week: string
  amount: string
  quantity: string
  note: string
}

interface KpiMetricView {
  metric: string
  goal: number
  actual: number
  pct: number
}

interface RevWeekPoint {
  week: string
  confirmed: number
  highConfidence: number
  open: number
  inferred: number
  monthlyOnly: number
  total: number
  rows: number
}

interface RevWeeklySplit {
  source: RevWeeklySource
  weeks: number[]
  total: number
}

interface RevManagerSummary {
  manager: string
  total: number
  confirmed: number
  highConfidence: number
  open: number
  rows: number
}

interface RevProductSummary {
  category: Exclude<RevProductCategory, "all">
  total: number
  confirmed: number
  highConfidence: number
  open: number
  rows: number
}

interface KpiMemberView {
  row: BranchKpiMemberRow
  metrics: KpiMetricView[]
  activityGoal: number
  activityActual: number
  activityPct: number
}

const DRAFT_STORAGE_KEY = "classin:sales-ledger-drafts:v1"
const FISCAL_MONTH_LABELS = ["4", "5", "6", "7", "8", "9", "10", "11", "12", "1", "2", "3"]
const REV_PAGE_SIZES = [25, 50, 100] as const
type RevPageSize = (typeof REV_PAGE_SIZES)[number]
const REV_SORT_LABELS: Record<RevSortKey, string> = {
  customer: "고객",
  product: "상품",
  manager: "담당자",
  team: "팀",
  region: "지역",
  month: "선택월",
  revenue: "실적",
  origin: "상태",
}
const REV_PRODUCT_FILTERS: Array<{ id: RevProductCategory; label: string }> = [
  { id: "all", label: "상품 전체" },
  { id: "software", label: "SW" },
  { id: "hardware", label: "HW" },
  { id: "unknown", label: "미분류" },
]
const REV_ORIGIN_FILTERS: Array<{ id: RevOriginFilter; label: string }> = [
  { id: "all", label: "원천 전체" },
  { id: "sheet", label: "시트 원본" },
  { id: "draft", label: "장부 입력" },
]
const REV_FORECAST_FILTERS: Array<{ id: RevForecastFilter; label: string }> = [
  { id: "all", label: "예상 전체" },
  { id: "has-week", label: "주차 입력 있음" },
  { id: "month-only", label: "월합계만 있음" },
  { id: "confirmed", label: "확정 포함" },
  { id: "open", label: "예정/고확도 남음" },
]
const DRAFT_OPERATIONS: Array<{ id: DraftOperation; label: string; description: string }> = [
  { id: "forecast-add", label: "예상 매출 추가", description: "새 고객 또는 기존 고객의 예상 금액을 큐에 올립니다." },
  { id: "period-shift", label: "기간 이동", description: "예상 매출이 다른 월/주차로 밀릴 때 사용합니다." },
  { id: "quantity-change", label: "예상 수량 변경", description: "라이선스/장비 수량 변화와 금액 변경을 함께 남깁니다." },
  { id: "amount-change", label: "금액 수정", description: "기존 REV 행의 금액 보정 초안을 만듭니다." },
]
const KPI_METRIC_ORDER = ["LD", "Lead", "ACC", "Acc.", "Acc", "OPP", "opp.", "Opp", "SOL", "Sol.", "Sol", "VST", "Visit"]
const LENSES: Array<{ id: LedgerLens; label: string; description: string }> = [
  { id: "dsh", label: "DSH", description: "누적 흐름·주차 차트·월별 수치" },
  { id: "rev", label: "REV", description: "주차·목표 수치 검수와 행 상세" },
  { id: "kpi", label: "KPI", description: "활동 병목과 담당자" },
]
const DRAFT_STATUS_FILTERS: Array<{ id: DraftStatusFilter; label: string }> = [
  { id: "open", label: "대기" },
  { id: "draft", label: "검토" },
  { id: "checked", label: "체크" },
  { id: "applied", label: "적용" },
  { id: "all", label: "전체" },
]

function canRunAdminOperationsFromSession(): boolean {
  if (typeof window === "undefined") return false
  const role = sessionStorage.getItem("admin_role")?.trim().toUpperCase()
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

function ymKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function fiscalYearOf(date: Date): number {
  const month = date.getUTCMonth() + 1
  return month >= 4 ? date.getUTCFullYear() : date.getUTCFullYear() - 1
}

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-")
  return `${year}.${Number(month)}`
}

function buildFiscalMonthOptions(now: Date) {
  const fy = fiscalYearOf(now)
  const current = ymKeyUtc(now)
  return FISCAL_MONTH_LABELS.map((rawMonth) => {
    const month = Number(rawMonth)
    const value = `${month >= 4 ? fy : fy + 1}-${String(month).padStart(2, "0")}`
    return { value, label: `${rawMonth}월`, current: value === current }
  })
}

function formatMoney(value: number | null | undefined) {
  const numeric = Number(value ?? 0)
  if (Math.abs(numeric) >= 10_000) {
    return `¥${(numeric / 10_000).toLocaleString("ko-KR", {
      maximumFractionDigits: 1,
    })}만`
  }
  return `¥${numeric.toLocaleString("ko-KR")}`
}

function formatPercent(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "미확인"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return String(a ?? "").localeCompare(String(b ?? ""), "ko", { numeric: true, sensitivity: "base" })
}

function customerGroupKey(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s()[\]{}._\-|/]+/g, "")
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function metadataNumberString(metadata: Record<string, unknown> | null | undefined, key: string): string {
  const value = metadata?.[key]
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string") return value
  return ""
}

function isDraftOperation(value: unknown): value is DraftOperation {
  return DRAFT_OPERATIONS.some((item) => item.id === value)
}

function isStoredProductCategory(value: unknown): value is Exclude<RevProductCategory, "all"> {
  return value === "software" || value === "hardware" || value === "unknown"
}

function productCategoryMeta(category: RevProductCategory) {
  if (category === "software") {
    return {
      label: "SW 추정",
      shortLabel: "SW",
      className: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
      color: "#084734",
    }
  }
  if (category === "hardware") {
    return {
      label: "HW 추정",
      shortLabel: "HW",
      className: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
      color: "#A8741A",
    }
  }
  if (category === "unknown") {
    return {
      label: "미분류",
      shortLabel: "미분류",
      className: "border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] text-[#615D59]",
      color: "#A39E98",
    }
  }
  return {
    label: "전체",
    shortLabel: "전체",
    className: "border-[rgba(0,0,0,0.08)] bg-white text-[#615D59]",
    color: "#615D59",
  }
}

function productCategoryFromText(...values: Array<string | null | undefined>): Exclude<RevProductCategory, "all"> {
  if (values.length >= 0) return classifySalesLedgerProductCategory({ rawText: values })
  const haystack = values.filter(Boolean).join(" ").toLowerCase()
  if (!haystack) return "unknown"
  if (/(^|\s)(hw|hardware)(\s|$)|하드웨어|전자칠판|칠판|보드|board|device|display|camera|terminal|tablet|장비|기기|패드/.test(haystack)) {
    return "hardware"
  }
  if (/(^|\s)(sw|software|saas)(\s|$)|소프트웨어|라이선스|license|licence|subscription|classin|online|cloud|platform|프로그램|서비스/.test(haystack)) {
    return "software"
  }
  return "unknown"
}

function rowProductCategory(row: Pick<LedgerRevenueRow, "customer" | "productVersion" | "draftMetadata">): Exclude<RevProductCategory, "all"> {
  const stored = metadataString(row.draftMetadata, "productCategory")
  if (isStoredProductCategory(stored)) return stored
  return classifySalesLedgerProductCategory({
    product: row.productVersion,
    account: row.customer,
    rawText: row.draftMetadata,
  })
}

function ProductCategoryPill({ category, compact = false }: { category: RevProductCategory; compact?: boolean }) {
  const meta = productCategoryMeta(category)
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>
      {compact ? meta.shortLabel : meta.label}
    </span>
  )
}

function orderedKpiMetrics(kpi: BranchKpiMemberRow["kpi"]): KpiMetricView[] {
  return Object.entries(kpi)
    .map(([metric, pair]) => ({
      metric,
      goal: pair.goal,
      actual: pair.actual,
      pct: pair.goal > 0 ? (pair.actual / pair.goal) * 100 : 0,
    }))
    .sort((a, b) => {
      const aIndex = KPI_METRIC_ORDER.indexOf(a.metric)
      const bIndex = KPI_METRIC_ORDER.indexOf(b.metric)
      const safeA = aIndex === -1 ? KPI_METRIC_ORDER.length : aIndex
      const safeB = bIndex === -1 ? KPI_METRIC_ORDER.length : bIndex
      return safeA - safeB || compareText(a.metric, b.metric)
    })
}

function kpiStatusTone(pct: number) {
  if (pct >= 100) return { label: "초과", className: "bg-[#ECFDF5] text-[#084734]" }
  if (pct >= 75) return { label: "순항", className: "bg-[#F6F5F4] text-[#615D59]" }
  return { label: "주의", className: "bg-[#FBF1E0] text-[#7A520F]" }
}

function safeAmount(value: string) {
  const normalized = value.replace(/[^\d.-]/g, "")
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : 0
}

function fiscalQuarterOfMonth(month: number) {
  if (month >= 4 && month <= 6) return 1
  if (month >= 7 && month <= 9) return 2
  if (month >= 10 && month <= 12) return 3
  return 4
}

function monthMatchesPeriod(monthKey: string, period: Period, selectedMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey) || !/^\d{4}-\d{2}$/.test(selectedMonth)) return false
  if (period === "M") return monthKey === selectedMonth

  const [rawYear, rawMonth] = monthKey.split("-").map(Number)
  const [selectedRawYear, selectedRawMonth] = selectedMonth.split("-").map(Number)
  const monthDate = new Date(Date.UTC(rawYear, rawMonth - 1, 1))
  const selectedDate = new Date(Date.UTC(selectedRawYear, selectedRawMonth - 1, 1))
  if (fiscalYearOf(monthDate) !== fiscalYearOf(selectedDate)) return false
  if (period === "Y") return true
  return fiscalQuarterOfMonth(rawMonth) === fiscalQuarterOfMonth(selectedRawMonth)
}

function mapNumberValue(map: Record<string, number> | null | undefined, key: string) {
  const value = Number(map?.[key] ?? 0)
  return Number.isFinite(value) ? value : 0
}

function rowMonthAmount(row: LedgerRevenueRow, month: string) {
  const mapped = mapNumberValue(row.monthlyPayments, month)
  if (mapped > 0) return mapped
  if (row.ledgerOrigin === "draft" && row.draftMonth === month) return row.revenue
  return 0
}

function rowMonthConfirmed(row: LedgerRevenueRow, month: string) {
  const amount = rowMonthAmount(row, month)
  if (amount <= 0) return 0
  const confirmed = mapNumberValue(row.monthlyConfirmed, month)
  if (confirmed > 0) return Math.min(amount, confirmed)
  if (row.monthlyRed?.[month]) return amount
  if (row.ledgerOrigin === "draft" && row.draftMonth === month) return amount
  return 0
}

function rowMonthHighConfidence(row: LedgerRevenueRow, month: string) {
  const amount = rowMonthAmount(row, month)
  if (amount <= 0) return 0
  const confirmed = rowMonthConfirmed(row, month)
  const highConfidence = mapNumberValue(row.monthlyHighConfidence, month)
  return Math.min(Math.max(amount - confirmed, 0), highConfidence)
}

function rowMonthOpen(row: LedgerRevenueRow, month: string) {
  return Math.max(rowMonthAmount(row, month) - rowMonthConfirmed(row, month) - rowMonthHighConfidence(row, month), 0)
}

function firstPaymentWeekIndex(firstPayment: string | null | undefined, month: string) {
  if (!firstPayment?.startsWith(month)) return null
  const day = Number(firstPayment.slice(8, 10))
  if (!Number.isFinite(day) || day <= 0) return null
  return Math.min(4, Math.max(0, Math.ceil(day / 7) - 1))
}

function rowWeeklySplit(row: LedgerRevenueRow, month: string): RevWeeklySplit {
  const raw = row.weeklyPayments?.[month]
  if (Array.isArray(raw) && raw.some((value) => Number(value) > 0)) {
    const weeks = raw.slice(0, 5).map((value) => Number(value) || 0)
    return { source: "explicit", weeks, total: weeks.reduce((sum, value) => sum + value, 0) }
  }
  const amount = rowMonthAmount(row, month)
  const firstPaymentIndex = firstPaymentWeekIndex(row.firstPayment, month)
  if (amount > 0 && firstPaymentIndex != null) {
    const weeks = Array.from({ length: 5 }, (_, index) => (index === firstPaymentIndex ? amount : 0))
    return { source: "inferred", weeks, total: amount }
  }
  return {
    source: amount > 0 ? "month-only" : "empty",
    weeks: Array.from({ length: 5 }, () => 0),
    total: amount,
  }
}

function buildRevWeekProjection(rows: LedgerRevenueRow[], month: string): RevWeekPoint[] {
  const weeks = Array.from({ length: 5 }, (_, index) => ({
    week: `W${index + 1}`,
    confirmed: 0,
    highConfidence: 0,
    open: 0,
    inferred: 0,
    monthlyOnly: 0,
    total: 0,
    rows: 0,
  }))

  for (const row of rows) {
    const amount = rowMonthAmount(row, month)
    if (amount <= 0) continue
    const weeklySplit = rowWeeklySplit(row, month)
    if (weeklySplit.source === "month-only" || weeklySplit.source === "empty") {
      weeks[4].monthlyOnly += amount
      weeks[4].total += amount
      weeks[4].rows += 1
      continue
    }

    if (weeklySplit.source === "inferred") {
      weeklySplit.weeks.forEach((value, index) => {
        if (value <= 0) return
        weeks[index].inferred += value
        weeks[index].total += value
        weeks[index].rows += 1
      })
      continue
    }

    const confirmedRatio = Math.min(rowMonthConfirmed(row, month) / amount, 1)
    const highRatio = Math.min(rowMonthHighConfidence(row, month) / amount, Math.max(1 - confirmedRatio, 0))
    weeklySplit.weeks.forEach((value, index) => {
      if (value <= 0) return
      const confirmed = value * confirmedRatio
      const highConfidence = value * highRatio
      const open = Math.max(value - confirmed - highConfidence, 0)
      weeks[index].confirmed += confirmed
      weeks[index].highConfidence += highConfidence
      weeks[index].open += open
      weeks[index].total += value
      weeks[index].rows += 1
    })
  }

  return weeks
}

function rowHasWeeklyInput(row: LedgerRevenueRow, month: string) {
  return rowWeeklySplit(row, month).source === "explicit"
}

function rowMatchesForecastFilter(row: LedgerRevenueRow, month: string, filter: RevForecastFilter) {
  if (filter === "all") return true
  const amount = rowMonthAmount(row, month)
  if (filter === "has-week") return amount > 0 && rowHasWeeklyInput(row, month)
  if (filter === "month-only") return amount > 0 && rowWeeklySplit(row, month).source === "month-only"
  if (filter === "confirmed") return rowMonthConfirmed(row, month) > 0
  if (filter === "open") return rowMonthHighConfidence(row, month) + rowMonthOpen(row, month) > 0
  return true
}

function WeeklySourceBadge({ source }: { source: RevWeeklySource }) {
  const meta: Record<RevWeeklySource, { label: string; className: string }> = {
    explicit: { label: "주차 입력", className: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]" },
    inferred: { label: "일자 추정", className: "border-[#D9D6D0] bg-[#F6F5F4] text-[#615D59]" },
    "month-only": { label: "월합계만", className: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]" },
    empty: { label: "금액 없음", className: "border-[rgba(0,0,0,0.08)] bg-white text-[#615D59]" },
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta[source].className}`}>
      {meta[source].label}
    </span>
  )
}

function MiniWeekBars({ split }: { split: RevWeeklySplit }) {
  const max = Math.max(...split.weeks, 1)
  return (
    <div className="grid grid-cols-5 gap-1" aria-label={`REV ${split.source} weekly distribution`}>
      {split.weeks.map((value, index) => {
        const height = value > 0 ? Math.max(18, Math.round((value / max) * 34)) : 8
        return (
          <div key={index} className="flex h-10 flex-col justify-end gap-1">
            <div
              className={`rounded-sm ${split.source === "explicit" ? "bg-[#084734]" : "bg-[#A39E98]"}`}
              style={{ height }}
              title={`W${index + 1} ${formatMoney(value)}`}
            />
          </div>
        )
      })}
    </div>
  )
}

function buildRevProductSummary(rows: LedgerRevenueRow[], month: string): RevProductSummary[] {
  const summaries = new Map<Exclude<RevProductCategory, "all">, RevProductSummary>([
    ["software", { category: "software", total: 0, confirmed: 0, highConfidence: 0, open: 0, rows: 0 }],
    ["hardware", { category: "hardware", total: 0, confirmed: 0, highConfidence: 0, open: 0, rows: 0 }],
    ["unknown", { category: "unknown", total: 0, confirmed: 0, highConfidence: 0, open: 0, rows: 0 }],
  ])

  for (const row of rows) {
    const total = rowMonthAmount(row, month)
    if (total <= 0) continue
    const category = rowProductCategory(row)
    const current = summaries.get(category)!
    current.total += total
    current.confirmed += rowMonthConfirmed(row, month)
    current.highConfidence += rowMonthHighConfidence(row, month)
    current.open += rowMonthOpen(row, month)
    current.rows += 1
  }

  return Array.from(summaries.values()).filter((item) => item.rows > 0)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function snapshotField(snapshot: Record<string, unknown> | undefined, key: string): unknown {
  if (!snapshot) return undefined
  const direct = snapshot[key]
  if (direct != null) return direct
  const detail = isRecord(snapshot.detail) ? snapshot.detail[key] : undefined
  if (detail != null) return detail
  const row = isRecord(snapshot.row) ? snapshot.row[key] : undefined
  return row
}

function snapshotText(snapshot: Record<string, unknown> | undefined, key: string): string | null {
  const value = snapshotField(snapshot, key)
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function isLedgerDraft(value: unknown): value is LedgerDraft {
  if (!value || typeof value !== "object") return false
  const draft = value as Partial<LedgerDraft>
  return typeof draft.id === "string" && typeof draft.customer === "string" && typeof draft.month === "string"
}

function readLocalDrafts() {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isLedgerDraft) : []
  } catch {
    return []
  }
}

function writeLocalDrafts(drafts: LedgerDraft[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts.slice(0, 50)))
}

function makeLocalDraft(input: LedgerDraftInput): LedgerDraft {
  const now = new Date().toISOString()
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...input,
    currency: "CNY",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  }
}

function applyDraftInput(draft: LedgerDraft, input: LedgerDraftInput): LedgerDraft {
  return {
    ...draft,
    ...input,
    currency: draft.currency ?? "CNY",
    updatedAt: new Date().toISOString(),
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function useLedgerDraftQueue() {
  const [drafts, setDrafts] = useState<LedgerDraft[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [ledgerHealth, setLedgerHealth] = useState<{ ok: boolean; message: string | null } | null>(null)
  const [queueMode, setQueueMode] = useState<DraftQueueMode>("server")
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState<string | null>(null)

  const updateLocalDrafts = useCallback((updater: (current: LedgerDraft[]) => LedgerDraft[]) => {
    setDrafts((current) => {
      const next = updater(current).slice(0, 50)
      writeLocalDrafts(next)
      return next
    })
  }, [])

  const loadDrafts = useCallback(async () => {
    setQueueLoading(true)
    try {
      const data = await adminFetchJson<LedgerDraftsResponse>("/api/admin/branch/ledger-drafts?status=all&limit=50", {
        cache: "no-cache",
      })
      if (data.health?.ok === false) {
        setDrafts(readLocalDrafts())
        setLedgerEntries([])
        setLedgerHealth(data.ledgerHealth ?? null)
        setQueueMode("local")
        setQueueError(data.health.message ?? "서버 입력 큐가 아직 준비되지 않았습니다.")
        return
      }
      setDrafts(data.drafts ?? [])
      setLedgerEntries(data.entries ?? [])
      setLedgerHealth(data.ledgerHealth ?? null)
      setQueueMode("server")
      setQueueError(null)
    } catch (error) {
      setDrafts(readLocalDrafts())
      setLedgerEntries([])
      setLedgerHealth(null)
      setQueueMode("local")
      setQueueError(`서버 입력 큐를 불러오지 못해 로컬 큐로 전환했습니다. ${errorMessage(error)}`)
    } finally {
      setQueueLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDrafts()
  }, [loadDrafts])

  const createDraft = useCallback(async (input: LedgerDraftInput) => {
    if (queueMode === "server") {
      try {
        const data = await adminFetchJson<LedgerDraftResponse>("/api/admin/branch/ledger-drafts", {
          method: "POST",
          body: JSON.stringify(input),
        })
        if (!data.draft) throw new Error(data.error ?? "초안 저장 응답이 비어 있습니다.")
        setDrafts((current) => [data.draft!, ...current.filter((draft) => draft.id !== data.draft!.id)].slice(0, 50))
        setQueueError(null)
        return data.draft
      } catch (error) {
        const localDraft = makeLocalDraft(input)
        setQueueMode("local")
        setQueueError(`서버 저장에 실패해 로컬 큐에 임시 저장했습니다. ${errorMessage(error)}`)
        updateLocalDrafts((current) => [localDraft, ...current])
        return localDraft
      }
    }

    const localDraft = makeLocalDraft(input)
    updateLocalDrafts((current) => [localDraft, ...current])
    return localDraft
  }, [queueMode, updateLocalDrafts])

  const updateDraft = useCallback(async (id: string, input: LedgerDraftInput) => {
    if (queueMode === "server" && !id.startsWith("local-")) {
      try {
        const data = await adminFetchJson<LedgerDraftResponse>(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        })
        if (!data.draft) throw new Error(data.error ?? "초안 수정 응답이 비어 있습니다.")
        setDrafts((items) => items.map((draft) => (draft.id === id ? data.draft! : draft)))
        setQueueError(null)
        return data.draft
      } catch (error) {
        setQueueMode("local")
        setQueueError(`서버 초안 수정에 실패해 로컬 큐로 전환했습니다. ${errorMessage(error)}`)
      }
    }

    let updated: LedgerDraft | null = null
    updateLocalDrafts((items) => items.map((draft) => {
      if (draft.id !== id) return draft
      updated = applyDraftInput(draft, input)
      return updated
    }))
    return updated
  }, [queueMode, updateLocalDrafts])

  const toggleDraft = useCallback(async (id: string) => {
    const current = drafts.find((draft) => draft.id === id)
    if (!current) return
    const status: DraftStatus = current.status === "checked" ? "draft" : "checked"

    if (queueMode === "server" && !id.startsWith("local-")) {
      try {
        const data = await adminFetchJson<LedgerDraftResponse>(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
        if (!data.draft) throw new Error(data.error ?? "초안 수정 응답이 비어 있습니다.")
        setDrafts((items) => items.map((draft) => (draft.id === id ? data.draft! : draft)))
        setQueueError(null)
        return
      } catch (error) {
        setQueueMode("local")
        setQueueError(`서버 체크 상태 변경에 실패해 로컬 큐로 전환했습니다. ${errorMessage(error)}`)
      }
    }

    updateLocalDrafts((items) => items.map((draft) =>
      draft.id === id ? { ...draft, status, updatedAt: new Date().toISOString() } : draft,
    ))
  }, [drafts, queueMode, updateLocalDrafts])

  const applyDraft = useCallback(async (id: string) => {
    const current = drafts.find((draft) => draft.id === id)
    if (!current || current.status !== "checked") return
    if (queueMode !== "server" || id.startsWith("local-")) {
      setQueueError("로컬 임시 초안은 DB 장부에 적용할 수 없습니다. 서버 큐가 복구된 뒤 다시 저장/적용하세요.")
      return
    }

    if (queueMode === "server" && !id.startsWith("local-")) {
      try {
        const data = await adminFetchJson<LedgerDraftResponse>(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "apply" }),
        })
        if (!data.draft) throw new Error(data.error ?? "초안 적용 응답이 비어 있습니다.")
        setDrafts((items) => items.map((draft) => (draft.id === id ? data.draft! : draft)))
        await loadDrafts()
        setQueueError(null)
        return
      } catch (error) {
        setQueueError(`DB 장부 반영에 실패했습니다. 로컬 임시 적용으로 대체하지 않습니다. ${errorMessage(error)}`)
        return
      }
    }

  }, [drafts, loadDrafts, queueMode])

  const deleteDraft = useCallback(async (id: string) => {
    if (queueMode === "server" && !id.startsWith("local-")) {
      try {
        await adminFetchJson(`/api/admin/branch/ledger-drafts/${encodeURIComponent(id)}`, { method: "DELETE" })
        setDrafts((items) => items.filter((draft) => draft.id !== id))
        setQueueError(null)
        return
      } catch (error) {
        setQueueMode("local")
        setQueueError(`서버 삭제에 실패해 로컬 큐로 전환했습니다. ${errorMessage(error)}`)
      }
    }

    updateLocalDrafts((items) => items.filter((draft) => draft.id !== id))
  }, [queueMode, updateLocalDrafts])

  return {
    drafts,
    ledgerEntries,
    ledgerHealth,
    queueMode,
    queueLoading,
    queueError,
    createDraft,
    updateDraft,
    toggleDraft,
    applyDraft,
    deleteDraft,
    reloadDrafts: loadDrafts,
  }
}

function MetricTile({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string
  value: string
  hint: string
  tone?: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-[#615D59]">
        {icon}
        <p className="text-[11px] font-bold uppercase tracking-[0.08em]">{label}</p>
      </div>
      <p className={`mt-2 text-[22px] font-bold leading-none tracking-[-0.03em] ${tone ?? "text-[#111110]"}`}>
        {value}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#615D59]">{hint}</p>
    </div>
  )
}

function DonutGauge({
  label,
  pct,
  value,
  goal,
  color = "#084734",
  size = 92,
}: {
  label: string
  pct: number
  value?: string
  goal?: string
  color?: string
  size?: number
}) {
  const stroke = Math.max(8, Math.round(size * 0.095))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const cappedPct = Math.max(0, Math.min(pct, 100))
  const dashOffset = circumference - (cappedPct / 100) * circumference
  const overGoal = pct > 100

  return (
    <div className="flex min-w-[116px] items-center gap-3 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2">
      <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`${label} ${formatPercent(pct)}`}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(0,0,0,0.055)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={overGoal ? "#F59E0B" : color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-[17px] font-bold leading-none ${overGoal ? "text-[#A8741A]" : "text-[#111110]"}`}>
            {Math.round(pct)}<span className="text-[10px] text-[#615D59]">%</span>
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-bold text-[#111110]">{label}</p>
        {value && <p className="mt-1 text-[11px] font-semibold text-[#615D59]">{value}</p>}
        {goal && <p className="mt-0.5 text-[10.5px] text-[#A39E98]">{goal}</p>}
      </div>
    </div>
  )
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-[rgba(0,0,0,0.08)] bg-white text-[13px] font-semibold text-[#615D59]">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[13px] font-semibold text-[#8F2C2C]">
      {message}
    </div>
  )
}

function RevSortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string
  sortKey: RevSortKey
  activeKey: RevSortKey
  direction: RevSortDirection
  onSort: (key: RevSortKey) => void
  align?: "left" | "right"
}) {
  const active = activeKey === sortKey
  const Icon = active && direction === "asc" ? ArrowUpNarrowWide : ArrowDownNarrowWide
  const directionLabel = active ? (direction === "asc" ? "오름차순" : "내림차순") : "정렬"

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-pressed={active}
      aria-label={`${label} ${directionLabel}`}
      className={`inline-flex w-full items-center gap-1.5 font-bold transition hover:text-[#084734] ${
        align === "right" ? "justify-end" : "justify-start"
      } ${active ? "text-[#084734]" : "text-[#615D59]"}`}
    >
      <span>{label}</span>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )
}

function PacingChart({ summary }: { summary: BranchSummaryResponse | null }) {
  const data = useMemo(() => {
    const months = summary?.monthly_series?.months ?? []
    const goals = summary?.monthly_series?.goal_cum ?? []
    const actuals = summary?.monthly_series?.revenue_cum ?? []
    const trends = summary?.monthly_series?.revenue_trend_cum ?? []
    return months.map((month, index) => ({
      month: `${Number(month.slice(5, 7))}월`,
      goal: goals[index] ?? 0,
      actual: actuals[index] ?? 0,
      trend: trends[index] ?? 0,
    }))
  }, [summary])

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] text-[#615D59]">
        월별 누적 데이터가 아직 없습니다.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={238}>
      <AreaChart data={data} margin={{ top: 10, right: 18, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="ledgerActual" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#084734" stopOpacity={0.22} />
            <stop offset="95%" stopColor="#084734" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="ledgerTrend" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#A8741A" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#A8741A" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(Number(v))} width={58} />
        <Tooltip
          formatter={(value) => formatMoney(Number(value))}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Area type="monotone" dataKey="goal" name="목표" stroke="#A39E98" strokeWidth={2} fill="transparent" strokeDasharray="4 4" />
        <Area type="monotone" dataKey="trend" name="예상 포함" stroke="#A8741A" strokeWidth={2} fill="url(#ledgerTrend)" />
        <Area type="monotone" dataKey="actual" name="실적" stroke="#084734" strokeWidth={2.4} fill="url(#ledgerActual)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function MemberBarChart({ rows }: { rows: BranchKpiMemberRow[] }) {
  const data = rows
    .slice()
    .sort((a, b) => b.goal - a.goal)
    .slice(0, 8)
    .map((row) => ({
      name: row.member,
      목표: row.goal,
      실적: row.status,
    }))

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 31)}>
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 18, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="name" type="category" width={72} tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value) => formatMoney(Number(value))}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="목표" fill="#D9D6D0" radius={[0, 4, 4, 0]} barSize={8} />
        <Bar dataKey="실적" fill="#084734" radius={[0, 4, 4, 0]} barSize={8} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ChartLegend({ items }: { items: Array<{ label: string; color: string; dashed?: boolean }> }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-[#615D59]">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className={`h-2.5 w-5 rounded-full ${item.dashed ? "border-t-2 border-dashed bg-transparent" : ""}`}
            style={item.dashed ? { borderColor: item.color } : { backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}

const WEEK_SERIES: Array<{
  key: "confirmed" | "highConfidence" | "open" | "inferred" | "monthlyOnly"
  label: string
  color: string
}> = [
  { key: "confirmed", label: "확정", color: "#084734" },
  { key: "highConfidence", label: "고확도", color: "#1E5DA8" },
  { key: "open", label: "예정", color: "#A8741A" },
  { key: "inferred", label: "일자 추정", color: "#6B7280" },
  { key: "monthlyOnly", label: "월합계만", color: "#D9D6D0" },
]

function RevWeekChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ payload?: RevWeekPoint }>
  label?: string | number
}) {
  const point = payload?.[0]?.payload
  if (!active || !point || point.total <= 0) return null
  return (
    <div className="min-w-[196px] rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5 text-[11px] shadow-[0_12px_32px_rgba(17,17,16,0.14)]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-[#111110]">{label} 합계</span>
        <span className="font-bold tabular-nums text-[#111110]">{formatMoney(point.total)}</span>
      </div>
      <div className="mt-2 space-y-1">
        {WEEK_SERIES.map((series) => {
          const value = point[series.key]
          if (value <= 0) return null
          return (
            <div key={series.key} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#615D59]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
                {series.label}
              </span>
              <span className="font-bold tabular-nums text-[#111110]">
                {formatMoney(value)}
                <span className="ml-1 font-semibold text-[#A39E98]">{formatPercent((value / point.total) * 100)}</span>
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-2 border-t border-[#F0F0EC] pt-1.5 text-[10px] font-semibold text-[#A39E98]">입력 행 {point.rows}건</p>
    </div>
  )
}

function renderWeekTotalLabel(props: { x?: unknown; y?: unknown; value?: unknown }) {
  const value = Number(props.value ?? 0)
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return <g />
  return (
    <text x={x} y={y - 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#111110">
      {formatMoney(value)}
    </text>
  )
}

function RevWeekForecastChart({ data, monthGoal }: { data: RevWeekPoint[]; monthGoal?: number | null }) {
  const hasData = data.some((item) => item.total > 0)
  if (!hasData) {
    return (
      <div className="flex min-h-[238px] items-center justify-center rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] leading-relaxed text-[#615D59]">
        선택 월에 표시할 주차별 REV 금액이 없습니다.
      </div>
    )
  }

  const seriesTotals = WEEK_SERIES.map((series) => ({
    ...series,
    total: data.reduce((sum, item) => sum + item[series.key], 0),
  }))
  const monthTotal = data.reduce((sum, item) => sum + item.total, 0)
  const confirmedTotal = seriesTotals.find((series) => series.key === "confirmed")?.total ?? 0
  const coveredTotal = confirmedTotal + (seriesTotals.find((series) => series.key === "highConfidence")?.total ?? 0)

  return (
    <div>
      <ResponsiveContainer width="100%" height={252}>
        <ComposedChart data={data} margin={{ top: 24, right: 14, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(Number(v))} width={58} />
          <Tooltip content={<RevWeekChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.035)" }} />
          <Bar dataKey="confirmed" name="확정" stackId="week" fill="#084734" radius={[0, 0, 3, 3]} maxBarSize={44} />
          <Bar dataKey="highConfidence" name="고확도" stackId="week" fill="#1E5DA8" maxBarSize={44} />
          <Bar dataKey="open" name="예정" stackId="week" fill="#A8741A" maxBarSize={44} />
          <Bar dataKey="inferred" name="일자 추정" stackId="week" fill="#6B7280" maxBarSize={44} />
          <Bar dataKey="monthlyOnly" name="월합계만" stackId="week" fill="#D9D6D0" radius={[3, 3, 0, 0]} maxBarSize={44} />
          <Line
            type="monotone"
            dataKey="total"
            stroke="transparent"
            strokeWidth={0}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            label={renderWeekTotalLabel}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-semibold text-[#615D59]">
        {seriesTotals.filter((series) => series.total > 0).map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} />
            {series.label}
            <span className="font-bold tabular-nums text-[#111110]">{formatMoney(series.total)}</span>
          </span>
        ))}
      </div>
      {monthGoal != null && monthGoal > 0 && (
        <div className="mt-3 space-y-2.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
          <CompactProgress
            label="확정 / 월 목표"
            value={confirmedTotal}
            max={monthGoal}
            meta={`${formatMoney(confirmedTotal)} · ${formatPercent((confirmedTotal / monthGoal) * 100)}`}
          />
          <CompactProgress
            label="확정+고확도 / 월 목표"
            value={coveredTotal}
            max={monthGoal}
            color="#1E5DA8"
            meta={`${formatMoney(coveredTotal)} · ${formatPercent((coveredTotal / monthGoal) * 100)}`}
          />
          <p className="text-[10.5px] font-semibold text-[#A39E98]">
            월 목표 {formatMoney(monthGoal)} · 월 합계 {formatMoney(monthTotal)}
          </p>
        </div>
      )}
    </div>
  )
}

function CompactProgress({
  label,
  value,
  max,
  color = "#084734",
  meta,
}: {
  label: string
  value: number
  max: number
  color?: string
  meta?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-bold text-[#111110]">{label}</span>
        <span className="font-semibold text-[#615D59]">{meta ?? formatMoney(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#F0F0EC]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

interface BreakdownNumbersRow {
  id: string
  label: React.ReactNode
  confirmed: number
  highConfidence: number
  open: number
  total: number
  count: number
}

function numberCell(value: number, tone = "text-[#111110]") {
  if (value <= 0) return <span className="font-semibold text-[#C9C5BF]">–</span>
  return <span className={`font-bold ${tone}`}>{formatMoney(value)}</span>
}

function BreakdownNumbersTable({ rows, emptyLabel }: { rows: BreakdownNumbersRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-3 text-[11px] leading-relaxed text-[#615D59]">
        {emptyLabel}
      </div>
    )
  }
  const totals = rows.reduce(
    (acc, row) => ({
      confirmed: acc.confirmed + row.confirmed,
      highConfidence: acc.highConfidence + row.highConfidence,
      open: acc.open + row.open,
      total: acc.total + row.total,
      count: acc.count + row.count,
    }),
    { confirmed: 0, highConfidence: 0, open: 0, total: 0, count: 0 },
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[430px] text-right text-[11.5px] tabular-nums">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.08em] text-[#615D59]">
            <th className="py-1.5 pr-2 text-left font-bold">구분</th>
            <th className="px-2 py-1.5 font-bold">확정</th>
            <th className="px-2 py-1.5 font-bold">고확도</th>
            <th className="px-2 py-1.5 font-bold">예정</th>
            <th className="px-2 py-1.5 font-bold">합계</th>
            <th className="py-1.5 pl-2 font-bold">건</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[#F0F0EC]">
              <td className="max-w-[160px] truncate py-2 pr-2 text-left font-bold text-[#111110]">{row.label}</td>
              <td className="px-2 py-2">{numberCell(row.confirmed, "text-[#084734]")}</td>
              <td className="px-2 py-2">{numberCell(row.highConfidence, "text-[#1E5DA8]")}</td>
              <td className="px-2 py-2">{numberCell(row.open, "text-[#7A520F]")}</td>
              <td className="px-2 py-2">{numberCell(row.total)}</td>
              <td className="py-2 pl-2 font-semibold text-[#615D59]">{row.count}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] text-[12px]">
            <td className="py-2 pr-2 text-left font-bold text-[#111110]">합계</td>
            <td className="px-2 py-2">{numberCell(totals.confirmed, "text-[#084734]")}</td>
            <td className="px-2 py-2">{numberCell(totals.highConfidence, "text-[#1E5DA8]")}</td>
            <td className="px-2 py-2">{numberCell(totals.open, "text-[#7A520F]")}</td>
            <td className="px-2 py-2">{numberCell(totals.total)}</td>
            <td className="py-2 pl-2 font-bold text-[#111110]">{totals.count}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function RevWeekNumbersTable({
  data,
  monthGoal,
  monthRowCount,
}: {
  data: RevWeekPoint[]
  monthGoal: number | null
  monthRowCount: number
}) {
  const monthTotal = data.reduce((sum, week) => sum + week.total, 0)
  if (monthTotal <= 0) {
    return (
      <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] leading-relaxed text-[#615D59]">
        선택 월에 표시할 주차별 REV 금액이 없습니다.
      </div>
    )
  }
  const peakIndex = data.reduce((best, week, index) => (week.total > data[best].total ? index : best), 0)
  const cumulative = data.map((_, index) =>
    data.slice(0, index + 1).reduce((sum, week) => sum + week.total, 0),
  )
  const seriesRows = [
    { key: "confirmed" as const, label: "확정", tone: "text-[#084734]" },
    { key: "highConfidence" as const, label: "고확도", tone: "text-[#1E5DA8]" },
    { key: "open" as const, label: "예정", tone: "text-[#7A520F]" },
    { key: "inferred" as const, label: "일자 추정", tone: "text-[#615D59]" },
    { key: "monthlyOnly" as const, label: "월합계만", tone: "text-[#615D59]" },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[660px] text-right text-[12px] tabular-nums">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.08em] text-[#615D59]">
            <th className="py-2 pr-2 text-left font-bold">구분</th>
            {data.map((week, index) => (
              <th key={week.week} className={`px-2 py-2 font-bold ${index === peakIndex ? "text-[#084734]" : ""}`}>
                {week.week}
                {index === peakIndex && (
                  <span className="ml-1 rounded-full bg-[#ECFDF5] px-1.5 py-0.5 text-[9px] text-[#084734]">피크</span>
                )}
              </th>
            ))}
            <th className="py-2 pl-2 font-bold text-[#111110]">월 합계</th>
          </tr>
        </thead>
        <tbody>
          {seriesRows.map((series) => {
            const seriesTotal = data.reduce((sum, week) => sum + week[series.key], 0)
            return (
              <tr key={series.key} className="border-t border-[#F0F0EC]">
                <td className="py-2 pr-2 text-left font-bold text-[#615D59]">{series.label}</td>
                {data.map((week, index) => (
                  <td key={`${series.key}-${week.week}`} className={`px-2 py-2 ${index === peakIndex ? "bg-[#FAFAF8]" : ""}`}>
                    {numberCell(week[series.key], series.tone)}
                  </td>
                ))}
                <td className="py-2 pl-2">{numberCell(seriesTotal, series.tone)}</td>
              </tr>
            )
          })}
          <tr className="border-t-2 border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] text-[13px]">
            <td className="py-2.5 pr-2 text-left font-bold text-[#111110]">주간 합계</td>
            {data.map((week, index) => (
              <td key={`total-${week.week}`} className={`px-2 py-2.5 font-bold ${index === peakIndex ? "text-[#084734]" : "text-[#111110]"}`}>
                {week.total > 0 ? formatMoney(week.total) : <span className="font-semibold text-[#C9C5BF]">–</span>}
              </td>
            ))}
            <td className="py-2.5 pl-2 font-bold text-[#111110]">{formatMoney(monthTotal)}</td>
          </tr>
          <tr className="border-t border-[#F0F0EC]">
            <td className="py-2 pr-2 text-left font-bold text-[#615D59]">누적{monthGoal != null && monthGoal > 0 ? " · 달성률" : ""}</td>
            {data.map((week, index) => (
              <td key={`cum-${week.week}`} className="px-2 py-2">
                <p className="font-bold text-[#111110]">{formatMoney(cumulative[index])}</p>
                {monthGoal != null && monthGoal > 0 && (
                  <p className="mt-0.5 text-[9.5px] font-semibold text-[#A39E98]">{formatPercent((cumulative[index] / monthGoal) * 100)}</p>
                )}
              </td>
            ))}
            <td className="py-2 pl-2">
              <p className="font-bold text-[#111110]">{formatMoney(monthTotal)}</p>
              {monthGoal != null && monthGoal > 0 && (
                <p className="mt-0.5 text-[9.5px] font-semibold text-[#A39E98]">{formatPercent((monthTotal / monthGoal) * 100)}</p>
              )}
            </td>
          </tr>
          <tr className="border-t border-[#F0F0EC] text-[11px]">
            <td className="py-2 pr-2 text-left font-bold text-[#615D59]">입력 행</td>
            {data.map((week) => (
              <td key={`rows-${week.week}`} className="px-2 py-2 font-semibold text-[#615D59]">
                {week.rows > 0 ? `${week.rows}건` : <span className="text-[#C9C5BF]">–</span>}
              </td>
            ))}
            <td className="py-2 pl-2 font-semibold text-[#615D59]">{monthRowCount}건</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

interface MonthlyPlanRow {
  month: string
  goal: number
  actual: number
  trend: number
  goalCum: number
  actualCum: number
  trendCum: number
  confirmed: boolean
}

function DshMonthlyNumbersTable({ rows, selectedMonth }: { rows: MonthlyPlanRow[]; selectedMonth: string }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] text-[#615D59]">
        월별 누적 데이터가 아직 없습니다.
      </div>
    )
  }
  const last = rows[rows.length - 1]
  const totalPct = last.goalCum > 0 ? (last.actualCum / last.goalCum) * 100 : 0
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-right text-[11.5px] tabular-nums">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.08em] text-[#615D59]">
            <th className="py-2 pr-2 text-left font-bold">월</th>
            <th className="px-2 py-2 font-bold">목표</th>
            <th className="px-2 py-2 font-bold">실적</th>
            <th className="px-2 py-2 font-bold">예상 포함</th>
            <th className="px-2 py-2 font-bold">달성률</th>
            <th className="py-2 pl-2 font-bold">누적 달성률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.month === selectedMonth
            const pct = row.goal > 0 ? (row.actual / row.goal) * 100 : 0
            const cumPct = row.goalCum > 0 ? (row.actualCum / row.goalCum) * 100 : 0
            const pctTone = !row.confirmed
              ? "text-[#A39E98]"
              : pct >= 100
                ? "text-[#084734]"
                : pct >= 75
                  ? "text-[#111110]"
                  : "text-[#A8741A]"
            return (
              <tr key={row.month} className={`border-t border-[#F0F0EC] ${selected ? "bg-[#ECFDF5]" : ""}`}>
                <td className="py-2 pr-2 text-left">
                  <span className="font-bold text-[#111110]">{formatMonthLabel(row.month)}</span>
                  {selected && <span className="ml-1.5 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold text-[#084734]">선택</span>}
                  {!row.confirmed && <span className="ml-1.5 text-[9.5px] font-semibold text-[#A39E98]">예상 구간</span>}
                </td>
                <td className="px-2 py-2">{numberCell(row.goal)}</td>
                <td className="px-2 py-2">
                  {row.confirmed || row.actual > 0 ? numberCell(row.actual, "text-[#084734]") : <span className="font-semibold text-[#C9C5BF]">–</span>}
                </td>
                <td className="px-2 py-2">{numberCell(row.trend, "text-[#7A520F]")}</td>
                <td className={`px-2 py-2 font-bold ${pctTone}`}>{row.goal > 0 ? formatPercent(pct) : "–"}</td>
                <td className="py-2 pl-2 font-semibold text-[#615D59]">{row.goalCum > 0 ? formatPercent(cumPct) : "–"}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] text-[12px]">
            <td className="py-2.5 pr-2 text-left font-bold text-[#111110]">FY 합계</td>
            <td className="px-2 py-2.5 font-bold text-[#111110]">{formatMoney(last.goalCum)}</td>
            <td className="px-2 py-2.5 font-bold text-[#084734]">{formatMoney(last.actualCum)}</td>
            <td className="px-2 py-2.5 font-bold text-[#7A520F]">{formatMoney(last.trendCum)}</td>
            <td className="px-2 py-2.5 font-bold text-[#111110]">{formatPercent(totalPct)}</td>
            <td className="py-2.5 pl-2 font-bold text-[#111110]">{formatPercent(totalPct)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function KpiTeamChart({ rows }: { rows: Array<{ team: string; goal: number; status: number; pacing_pct: number }> }) {
  const data = rows.map((row) => ({
    team: row.team,
    목표: row.goal,
    실적: row.status,
    달성률: row.pacing_pct,
  }))
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="team" type="category" width={48} tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value, name) => name === "달성률" ? formatPercent(Number(value)) : formatMoney(Number(value))}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="목표" fill="#D9D6D0" radius={[0, 4, 4, 0]} barSize={9} />
        <Bar dataKey="실적" fill="#084734" radius={[0, 4, 4, 0]} barSize={9} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function KpiActivityChart({ rows }: { rows: KpiMetricView[] }) {
  const data = rows.map((row) => ({
    metric: row.metric,
    목표: row.goal,
    실적: row.actual,
    달성률: row.pct,
  }))
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={Math.max(190, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="metric" type="category" width={58} tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value, name) => name === "달성률" ? formatPercent(Number(value)) : Number(value).toLocaleString("ko-KR")}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="목표" fill="#D9D6D0" radius={[0, 4, 4, 0]} barSize={8} />
        <Bar dataKey="실적" fill="#1E5DA8" radius={[0, 4, 4, 0]} barSize={8} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function KpiGapChart({ rows }: { rows: KpiMemberView[] }) {
  const data = rows
    .map((item) => ({
      member: item.row.member,
      gap: item.row.status - item.row.goal,
      status: item.row.status,
      goal: item.row.goal,
    }))
    .sort((a, b) => a.gap - b.gap || compareText(a.member, b.member))
    .slice(0, 8)

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(190, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(Number(v))} />
        <YAxis dataKey="member" type="category" width={72} tick={{ fontSize: 11, fill: "#615D59" }} axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke="#A39E98" />
        <Tooltip
          formatter={(value, name) => name === "gap" ? formatMoney(Number(value)) : formatMoney(Number(value))}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="gap" name="Gap" radius={[0, 4, 4, 0]} barSize={10}>
          {data.map((item) => (
            <Cell key={item.member} fill={item.gap >= 0 ? "#084734" : "#B43E3E"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function KpiRevenueActivityScatter({ rows }: { rows: KpiMemberView[] }) {
  const data = rows.map((item) => ({
    member: item.row.member,
    activityPct: item.activityPct,
    revenuePct: item.row.achievement_pct,
    revenue: item.row.status,
    deals: item.row.deals_total,
  }))

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={252}>
      <ScatterChart margin={{ top: 10, right: 18, bottom: 10, left: -6 }}>
        <CartesianGrid stroke="#E8E8E4" strokeDasharray="3 5" />
        <XAxis
          dataKey="activityPct"
          name="활동 달성률"
          unit="%"
          type="number"
          tick={{ fontSize: 11, fill: "#615D59" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="revenuePct"
          name="매출 달성률"
          unit="%"
          type="number"
          tick={{ fontSize: 11, fill: "#615D59" }}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine x={75} stroke="#ECD29C" strokeDasharray="4 4" />
        <ReferenceLine y={75} stroke="#ECD29C" strokeDasharray="4 4" />
        <Tooltip
          formatter={(value, name) => {
            if (name === "activityPct") return [formatPercent(Number(value)), "활동 달성률"]
            if (name === "revenuePct") return [formatPercent(Number(value)), "매출 달성률"]
            if (name === "revenue") return [formatMoney(Number(value)), "매출"]
            return [Number(value).toLocaleString("ko-KR"), String(name)]
          }}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.member ?? "담당자"}
          contentStyle={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 12 }}
        />
        <Scatter name="담당자" data={data} fill="#084734" />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

function KpiBottleneckMatrix({
  rows,
  onMemberClick,
}: {
  rows: KpiMemberView[]
  onMemberClick: (member: string) => void
}) {
  const visible = rows.slice(0, 8)
  const metricNames = Array.from(new Set(rows.flatMap((item) => item.metrics.map((metric) => metric.metric)))).slice(0, 5)
  if (visible.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[620px] w-full text-left text-[11px]">
        <thead className="text-[#615D59]">
          <tr>
            <th className="pb-2 pr-3 font-bold">담당자</th>
            {metricNames.map((metric) => (
              <th key={metric} className="pb-2 px-1 text-center font-bold">{metric}</th>
            ))}
            <th className="pb-2 pl-3 text-right font-bold">활동</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(({ row, metrics, activityPct }) => {
            const metricMap = new Map(metrics.map((metric) => [metric.metric, metric]))
            return (
              <tr key={row.member} className="border-t border-[#F0F0EC]">
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => onMemberClick(row.member)}
                    className="font-bold text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                  >
                    {row.member}
                  </button>
                </td>
                {metricNames.map((metricName) => {
                  const metric = metricMap.get(metricName)
                  const pct = metric?.pct ?? 0
                  const tone = kpiStatusTone(pct)
                  return (
                    <td key={`${row.member}-${metricName}`} className="px-1 py-2 text-center">
                      <span className={`inline-flex min-w-[54px] justify-center rounded-md px-2 py-1 font-bold ${tone.className}`}>
                        {formatPercent(pct)}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-[#A39E98]">
                        {metric ? `${metric.actual}/${metric.goal}` : "0/0"}
                      </span>
                    </td>
                  )
                })}
                <td className="py-2 pl-3 text-right font-bold text-[#111110]">{formatPercent(activityPct)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SelectedWeekBars({ weeks }: { weeks: RevWeekPoint[] }) {
  const max = Math.max(...weeks.map((week) => week.total), 1)
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {weeks.map((week) => (
        <div key={week.week} className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 py-2">
          <p className="text-[10px] font-bold text-[#615D59]">{week.week}</p>
          <div className="mt-2 flex h-14 items-end rounded bg-[#FAFAF8] px-1">
            <div
              className="w-full rounded-t bg-[#084734]"
              style={{ height: `${week.total > 0 ? Math.max(8, (week.total / max) * 100) : 0}%` }}
            />
          </div>
          <p className="mt-1 truncate text-[10px] font-bold text-[#111110]">{formatMoney(week.total)}</p>
        </div>
      ))}
    </div>
  )
}

function draftStatusMeta(status: DraftStatus) {
  if (status === "checked") {
    return { label: "체크 완료", className: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]" }
  }
  if (status === "applied") {
    return { label: "적용됨", className: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]" }
  }
  if (status === "cancelled") {
    return { label: "취소됨", className: "border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] text-[#615D59]" }
  }
  return { label: "검토 필요", className: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]" }
}

function draftMatchesFilter(draft: LedgerDraft, filter: DraftStatusFilter) {
  if (filter === "all") return true
  if (filter === "open") return draft.status === "draft" || draft.status === "checked"
  return draft.status === filter
}

function draftMatchesQuery(draft: LedgerDraft, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [
    draft.customer,
    draft.manager,
    draft.team,
    draft.month,
    draft.note,
    draft.sourceDealId,
    draft.sourceSheetRow ? String(draft.sourceSheetRow) : "",
  ].some((value) => String(value ?? "").toLowerCase().includes(needle))
}

function DraftQueue({
  drafts,
  mode,
  loading,
  error,
  onReload,
  onEdit,
  onToggle,
  onApply,
  onDelete,
}: {
  drafts: LedgerDraft[]
  mode: DraftQueueMode
  loading: boolean
  error: string | null
  onReload: () => void
  onEdit: (draft: LedgerDraft) => void
  onToggle: (id: string) => void | Promise<void>
  onApply: (id: string) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}) {
  const modeLabel = mode === "server" ? "서버 큐" : "로컬 fallback"
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<DraftStatusFilter>("open")
  const visibleDrafts = useMemo(() => {
    return drafts.filter((draft) => draftMatchesFilter(draft, statusFilter)).filter((draft) => draftMatchesQuery(draft, query))
  }, [drafts, query, statusFilter])

  if (loading && drafts.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[12px] font-semibold text-[#615D59]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        입력 큐를 불러오는 중
      </div>
    )
  }

  if (drafts.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 py-0.5 text-[10px] font-bold text-[#615D59]">
            {modeLabel}
          </span>
          <button
            type="button"
            onClick={onReload}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] px-2 text-[10px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4]"
          >
            <RefreshCw className="h-3 w-3" />
            새로고침
          </button>
        </div>
        {error && (
          <div className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] p-3 text-[11px] leading-relaxed text-[#7A520F]">
            {error}
          </div>
        )}
        <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-4 text-[12px] leading-relaxed text-[#615D59]">
          아직 저장된 입력/수정 초안이 없습니다. REV 행을 선택하거나 아래 입력 폼으로 새 장부 초안을 만들 수 있습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
          mode === "server" ? "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]" : "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"
        }`}>
          {modeLabel}
        </span>
        <button
          type="button"
          onClick={onReload}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] px-2 text-[10px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4]"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>
      {error && (
        <div className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] p-3 text-[11px] leading-relaxed text-[#7A520F]">
          {error}
        </div>
      )}
      <div className="space-y-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-2">
        <label className="relative block">
          <span className="sr-only">체크 큐 검색</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="고객, 담당자, 메모 검색"
            className="h-8 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white pl-8 pr-2 text-[11px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {DRAFT_STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`rounded-md px-2 py-1 text-[10px] font-bold transition ${
                statusFilter === item.id
                  ? "bg-[#111110] text-white"
                  : "border border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:text-[#111110]"
              }`}
            >
              {item.label}
            </button>
          ))}
          <span className="ml-auto px-1 py-1 text-[10px] font-bold text-[#615D59]">
            {visibleDrafts.length}/{drafts.length}건
          </span>
        </div>
      </div>
      {visibleDrafts.length === 0 && (
        <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-4 text-[12px] leading-relaxed text-[#615D59]">
          현재 검색/상태 조건에 맞는 초안이 없습니다.
        </div>
      )}
      {visibleDrafts.map((draft) => (
        <div key={draft.id} className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${draftStatusMeta(draft.status).className}`}>
                  {draftStatusMeta(draft.status).label}
                </span>
                <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 py-0.5 text-[10px] font-bold text-[#615D59]">
                  {draft.kind === "edit-row" ? "수정" : "신규 입력"}
                </span>
                {draft.sourceSheetRow ? (
                  <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 py-0.5 text-[10px] font-bold text-[#615D59]">
                    REV row {draft.sourceSheetRow}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 truncate text-[13px] font-bold text-[#111110]">{draft.customer || "고객명 미입력"}</p>
              <p className="mt-1 text-[11px] text-[#615D59]">
                {formatMonthLabel(draft.month)} · {draft.manager || "-"} · {draft.team || "-"} · {formatMoney(draft.amount)}
              </p>
              {draft.note && <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-[#615D59]">{draft.note}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(draft)}
                disabled={draft.status === "checked" || draft.status === "applied" || draft.status === "cancelled"}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={`${draft.customer || "초안"} 편집`}
                title="초안 편집"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void onToggle(draft.id)}
                disabled={draft.status === "applied" || draft.status === "cancelled"}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#084734] transition hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="초안 체크 상태 변경"
                title="초안 체크 상태 변경"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void onApply(draft.id)}
                disabled={draft.status !== "checked" || mode !== "server" || draft.id.startsWith("local-")}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#BDEFD8] text-[#084734] transition hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={`${draft.customer || "초안"} 적용`}
                title="체크 완료 초안 적용"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void onDelete(draft.id)}
                disabled={draft.status === "checked" || draft.status === "applied" || draft.status === "cancelled"}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#B43E3E] transition hover:bg-[#FCE9E9] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="초안 삭제"
                title="초안 삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SalesLedgerWorkbench() {
  const [team, setTeam] = useState<Team>("ALL")
  const [period, setPeriod] = useState<Period>("Q")
  const [selectedMonth, setSelectedMonth] = useState(() => ymKeyUtc(new Date()))
  const [lens, setLens] = useState<LedgerLens>("rev")
  const lensPanelRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState("")
  const [managerFilter, setManagerFilter] = useState("ALL")
  const [regionFilter, setRegionFilter] = useState("ALL")
  const [productFilter, setProductFilter] = useState<RevProductCategory>("all")
  const [revStatusFilter, setRevStatusFilter] = useState("ALL")
  const [revDealTypeFilter, setRevDealTypeFilter] = useState("ALL")
  const [revOriginFilter, setRevOriginFilter] = useState<RevOriginFilter>("all")
  const [revForecastFilter, setRevForecastFilter] = useState<RevForecastFilter>("all")
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
  const [revSortKey, setRevSortKey] = useState<RevSortKey>("revenue")
  const [revSortDirection, setRevSortDirection] = useState<RevSortDirection>("desc")
  const [revPageSize, setRevPageSize] = useState<RevPageSize>(50)
  const [revPage, setRevPage] = useState(1)
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(true)
  const [railView, setRailView] = useState<RailView>("detail")
  const [railSwitcherOpen, setRailSwitcherOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState<LedgerRevenueRow | null>(null)
  const [detail, setDetail] = useState<DealDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [canRunAdminOperations, setCanRunAdminOperations] = useState(false)
  const [draftSaving, setDraftSaving] = useState(false)
  const {
    drafts,
    ledgerEntries,
    ledgerHealth,
    queueMode,
    queueLoading,
    queueError,
    createDraft,
    updateDraft,
    toggleDraft,
    applyDraft,
    deleteDraft,
    reloadDrafts,
  } = useLedgerDraftQueue()
  const monthOptions = useMemo(() => buildFiscalMonthOptions(new Date()), [])

  const defaultDraftForm = useMemo<DraftForm>(() => ({
    operation: "forecast-add",
    customer: "",
    manager: "",
    team: team === "ALL" ? "BD" : team,
    productCategory: "unknown",
    month: selectedMonth,
    fromMonth: selectedMonth,
    week: "month",
    amount: "",
    quantity: "",
    note: "",
  }), [selectedMonth, team])
  const [draftForm, setDraftForm] = useState<DraftForm>(defaultDraftForm)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)

  useEffect(() => {
    setCanRunAdminOperations(canRunAdminOperationsFromSession())
  }, [])

  useEffect(() => {
    setRailSwitcherOpen(false)
  }, [lens, railView, sidePanelCollapsed])

  useEffect(() => {
    setDraftForm((current) => ({
      ...current,
      operation: current.operation || "forecast-add",
      month: current.month || selectedMonth,
      fromMonth: current.fromMonth || selectedMonth,
      week: current.week || "month",
      team: current.team || (team === "ALL" ? "BD" : team),
    }))
  }, [selectedMonth, team])

  const selectLens = useCallback((nextLens: LedgerLens) => {
    setLens(nextLens)

    if (typeof window === "undefined") return

    window.requestAnimationFrame(() => {
      lensPanelRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      })
    })
  }, [])

  const onRevSort = useCallback((nextKey: RevSortKey) => {
    setRevSortDirection((currentDirection) => {
      if (revSortKey === nextKey) return currentDirection === "asc" ? "desc" : "asc"
      return nextKey === "revenue" || nextKey === "month" ? "desc" : "asc"
    })
    setRevSortKey(nextKey)
    setRevPage(1)
  }, [revSortKey])

  const resetRevFilters = useCallback(() => {
    setQuery("")
    setManagerFilter("ALL")
    setRegionFilter("ALL")
    setProductFilter("all")
    setRevStatusFilter("ALL")
    setRevDealTypeFilter("ALL")
    setRevOriginFilter("all")
    setRevForecastFilter("all")
    setAdvancedFiltersOpen(false)
    setRevSortKey("revenue")
    setRevSortDirection("desc")
    setRevPageSize(50)
    setRevPage(1)
  }, [])

  useEffect(() => {
    setRevPage(1)
  }, [
    managerFilter,
    period,
    productFilter,
    query,
    regionFilter,
    revDealTypeFilter,
    revForecastFilter,
    revOriginFilter,
    revPageSize,
    revSortDirection,
    revSortKey,
    revStatusFilter,
    selectedMonth,
    team,
  ])

  const editingDraft = useMemo(() => {
    if (!editingDraftId) return null
    return drafts.find((draft) => draft.id === editingDraftId) ?? null
  }, [drafts, editingDraftId])

  useEffect(() => {
    if (editingDraftId && !editingDraft) setEditingDraftId(null)
  }, [editingDraft, editingDraftId])

  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  const summary = useBranchJson<BranchSummaryResponse>(`/api/admin/branch/summary?team=${team}&period=${period}${monthQuery}`, refreshKey)
  const kpi = useBranchJson<BranchKpiResponse>(`/api/admin/branch/kpi?team=${team}&period=${period}${monthQuery}`, refreshKey)
  const pipeline = useBranchJson<BranchPipelineResponse>(`/api/admin/branch/pipeline?team=${team}&period=${period}${monthQuery}`, refreshKey)

  const sheetRows = useMemo<LedgerRevenueRow[]>(() => {
    return (pipeline.data?.rows ?? []).map((row) => ({
      ...row,
      ledgerOrigin: "sheet" as const,
    }))
  }, [pipeline.data?.rows])
  const members = useMemo(() => kpi.data?.members ?? [], [kpi.data?.members])
  const kpiTeamRows = useMemo(() => kpi.data?.teams ?? [], [kpi.data?.teams])
  const ledgerEntryRows = useMemo<LedgerRevenueRow[]>(() => {
    return ledgerEntries
      .filter((entry) => entry.entryStatus === "active")
      .filter((entry) => monthMatchesPeriod(entry.month, period, selectedMonth))
      .filter((entry) => team === "ALL" || entry.team === team)
      .map((entry) => ({
        id: `ledger-${entry.id}`,
        sheetRow: entry.sourceSheetRow ?? undefined,
        customer: entry.customer || "고객명 미입력",
        manager: entry.manager || null,
        team: entry.team || null,
        region: snapshotText(entry.sourceSnapshot, "region"),
        revenue: entry.amount,
        status: snapshotText(entry.sourceSnapshot, "status"),
        dealType: snapshotText(entry.sourceSnapshot, "dealType"),
        productVersion: snapshotText(entry.sourceSnapshot, "productVersion"),
        firstPayment: snapshotText(entry.sourceSnapshot, "firstPayment"),
        contractTarget: Number(snapshotField(entry.sourceSnapshot, "contractTarget") ?? 0),
        monthlyPayments: { [entry.month]: entry.amount },
        monthlyConfirmed: { [entry.month]: entry.amount },
        monthlyHighConfidence: {},
        monthlyRed: { [entry.month]: true },
        weeklyPayments: {},
        ledgerOrigin: "draft" as const,
        draftId: entry.draftId,
        draftKind: entry.entryType === "manual-edit" ? "edit-row" : "new-row",
        draftMonth: entry.month,
        draftNote: entry.note,
        draftMetadata: entry.metadata,
        sourceDealId: entry.sourceDealId,
      }))
  }, [ledgerEntries, period, selectedMonth, team])
  const appliedDraftFallbackRows = useMemo<LedgerRevenueRow[]>(() => {
    return drafts
      .filter((draft) => draft.status === "applied")
      .filter((draft) => !draft.id.startsWith("local-"))
      .filter((draft) => monthMatchesPeriod(draft.month, period, selectedMonth))
      .filter((draft) => team === "ALL" || draft.team === team)
      .map((draft) => ({
        id: `draft-${draft.id}`,
        sheetRow: draft.sourceSheetRow ?? undefined,
        customer: draft.customer || "고객명 미입력",
        manager: draft.manager || null,
        team: draft.team || null,
        region: snapshotText(draft.sourceSnapshot, "region"),
        revenue: draft.amount,
        status: snapshotText(draft.sourceSnapshot, "status"),
        dealType: snapshotText(draft.sourceSnapshot, "dealType"),
        productVersion: snapshotText(draft.sourceSnapshot, "productVersion"),
        firstPayment: snapshotText(draft.sourceSnapshot, "firstPayment"),
        contractTarget: Number(snapshotField(draft.sourceSnapshot, "contractTarget") ?? 0),
        monthlyPayments: { [draft.month]: draft.amount },
        monthlyConfirmed: { [draft.month]: draft.amount },
        monthlyHighConfidence: {},
        monthlyRed: { [draft.month]: true },
        weeklyPayments: {},
        ledgerOrigin: "draft" as const,
        draftId: draft.id,
        draftKind: draft.kind,
        draftMonth: draft.month,
        draftNote: draft.note,
        draftMetadata: draft.metadata,
        sourceDealId: draft.sourceDealId,
      }))
  }, [drafts, period, selectedMonth, team])
  const appliedDraftRows = useMemo<LedgerRevenueRow[]>(() => {
    if (ledgerEntryRows.length === 0) return appliedDraftFallbackRows

    const entryDraftIds = new Set(ledgerEntryRows.map((row) => row.draftId).filter(Boolean))
    return [
      ...ledgerEntryRows,
      ...appliedDraftFallbackRows.filter((row) => !row.draftId || !entryDraftIds.has(row.draftId)),
    ]
  }, [appliedDraftFallbackRows, ledgerEntryRows])
  const additiveAppliedDraftRows = useMemo(() => {
    return appliedDraftRows.filter((row) => row.draftKind !== "edit-row" && !row.draftId?.startsWith("local-"))
  }, [appliedDraftRows])
  const replacementAppliedDraftRows = useMemo(() => {
    return appliedDraftRows.filter((row) => row.draftKind === "edit-row")
  }, [appliedDraftRows])
  const rows = useMemo(() => [...appliedDraftRows, ...sheetRows], [appliedDraftRows, sheetRows])

  const managerOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.manager).filter((value): value is string => Boolean(value))))
      .sort((a, b) => a.localeCompare(b, "ko"))
  }, [rows])

  const regionOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.region).filter((value): value is string => Boolean(value))))
      .sort((a, b) => a.localeCompare(b, "ko"))
  }, [rows])

  const revStatusOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.status).filter((value): value is string => Boolean(value))))
      .sort((a, b) => a.localeCompare(b, "ko"))
  }, [rows])

  const revDealTypeOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.dealType).filter((value): value is string => Boolean(value))))
      .sort((a, b) => a.localeCompare(b, "ko"))
  }, [rows])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows
      .filter((row) => managerFilter === "ALL" || row.manager === managerFilter)
      .filter((row) => regionFilter === "ALL" || row.region === regionFilter)
      .filter((row) => productFilter === "all" || rowProductCategory(row) === productFilter)
      .filter((row) => revStatusFilter === "ALL" || row.status === revStatusFilter)
      .filter((row) => revDealTypeFilter === "ALL" || row.dealType === revDealTypeFilter)
      .filter((row) => revOriginFilter === "all" || row.ledgerOrigin === revOriginFilter)
      .filter((row) => rowMatchesForecastFilter(row, selectedMonth, revForecastFilter))
      .filter((row) => {
        if (!needle) return true
        const originLabel = row.ledgerOrigin === "draft" ? "장부 입력 applied draft 신규 수정" : "시트 원본 sheet"
        const productMeta = productCategoryMeta(rowProductCategory(row))
        return [row.customer, row.manager, row.team, row.region, row.status, row.dealType, row.productVersion, productMeta.label, productMeta.shortLabel, originLabel, row.draftKind, row.draftNote, row.draftMonth, row.sourceDealId].some((value) =>
          String(value ?? "").toLowerCase().includes(needle),
        )
      })
      .sort((a, b) => {
        const direction = revSortDirection === "asc" ? 1 : -1
        let result = 0

        if (revSortKey === "revenue") result = a.revenue - b.revenue
        if (revSortKey === "month") result = rowMonthAmount(a, selectedMonth) - rowMonthAmount(b, selectedMonth)
        if (revSortKey === "customer") result = compareText(a.customer, b.customer)
        if (revSortKey === "product") result = compareText(productCategoryMeta(rowProductCategory(a)).label, productCategoryMeta(rowProductCategory(b)).label)
        if (revSortKey === "manager") result = compareText(a.manager, b.manager)
        if (revSortKey === "team") result = compareText(a.team, b.team)
        if (revSortKey === "region") result = compareText(a.region, b.region)
        if (revSortKey === "origin") {
          const aRank = a.ledgerOrigin === "draft" ? 0 : 1
          const bRank = b.ledgerOrigin === "draft" ? 0 : 1
          result = aRank - bRank
        }

        const primary = result * direction
        if (primary !== 0) return primary
        return compareText(a.customer, b.customer) || compareText(a.manager, b.manager)
      })
  }, [
    managerFilter,
    productFilter,
    query,
    regionFilter,
    revDealTypeFilter,
    revForecastFilter,
    revOriginFilter,
    revSortDirection,
    revSortKey,
    revStatusFilter,
    rows,
    selectedMonth,
  ])

  const revWeekProjection = useMemo(() => buildRevWeekProjection(filteredRows, selectedMonth), [filteredRows, selectedMonth])
  const revMonthTotal = revWeekProjection.reduce((sum, item) => sum + item.total, 0)
  const revMonthConfirmed = revWeekProjection.reduce((sum, item) => sum + item.confirmed, 0)
  const revMonthHighConfidence = revWeekProjection.reduce((sum, item) => sum + item.highConfidence, 0)
  const revMonthMonthlyOnly = revWeekProjection.reduce((sum, item) => sum + item.monthlyOnly, 0)
  const revMonthOpen = Math.max(revMonthTotal - revMonthConfirmed - revMonthHighConfidence - revMonthMonthlyOnly, 0)
  const revPeakWeek = revWeekProjection.slice().sort((a, b) => b.total - a.total)[0]
  const revTopManagers = useMemo<RevManagerSummary[]>(() => {
    const managers = new Map<string, RevManagerSummary>()
    for (const row of filteredRows) {
      const total = rowMonthAmount(row, selectedMonth)
      if (total <= 0) continue
      const manager = row.manager ?? "미지정"
      const current = managers.get(manager) ?? {
        manager,
        total: 0,
        confirmed: 0,
        highConfidence: 0,
        open: 0,
        rows: 0,
      }
      current.total += total
      current.confirmed += rowMonthConfirmed(row, selectedMonth)
      current.highConfidence += rowMonthHighConfidence(row, selectedMonth)
      current.open += rowMonthOpen(row, selectedMonth)
      current.rows += 1
      managers.set(manager, current)
    }
    return Array.from(managers.values()).sort((a, b) => b.total - a.total).slice(0, 6)
  }, [filteredRows, selectedMonth])
  const revProductSummary = useMemo(() => buildRevProductSummary(filteredRows, selectedMonth), [filteredRows, selectedMonth])
  const monthlySeriesRows = useMemo<MonthlyPlanRow[]>(() => {
    const series = summary.data?.monthly_series
    if (!series) return []
    const months = series.months ?? []
    const goals = series.goal_cum ?? []
    const actuals = series.revenue_cum ?? []
    const trends = series.revenue_trend_cum ?? []
    const confirmedThrough = series.confirmed_through_index ?? -1
    return months.map((month, index) => {
      const prevGoal = index > 0 ? goals[index - 1] ?? 0 : 0
      const prevActual = index > 0 ? actuals[index - 1] ?? 0 : 0
      const prevTrend = index > 0 ? trends[index - 1] ?? 0 : 0
      return {
        month,
        goal: (goals[index] ?? 0) - prevGoal,
        actual: (actuals[index] ?? 0) - prevActual,
        trend: (trends[index] ?? 0) - prevTrend,
        goalCum: goals[index] ?? 0,
        actualCum: actuals[index] ?? 0,
        trendCum: trends[index] ?? 0,
        confirmed: index <= confirmedThrough,
      }
    })
  }, [summary.data?.monthly_series])
  const selectedMonthPlan = useMemo(
    () => monthlySeriesRows.find((row) => row.month === selectedMonth) ?? null,
    [monthlySeriesRows, selectedMonth],
  )
  const revMonthGoal = selectedMonthPlan && selectedMonthPlan.goal > 0 ? selectedMonthPlan.goal : null
  const revMonthPlanned = revMonthOpen + revMonthMonthlyOnly
  const revMonthCovered = revMonthConfirmed + revMonthHighConfidence
  const revMonthRemaining = revMonthGoal !== null ? revMonthGoal - revMonthConfirmed : null
  const revMonthScale = Math.max(revMonthGoal ?? 0, revMonthTotal, 1)
  const revMonthRowCount = useMemo(
    () => filteredRows.filter((row) => rowMonthAmount(row, selectedMonth) > 0).length,
    [filteredRows, selectedMonth],
  )
  const dshWeekProjection = useMemo(() => buildRevWeekProjection(rows, selectedMonth), [rows, selectedMonth])
  const dshPeakWeek = useMemo(
    () => dshWeekProjection.slice().sort((a, b) => b.total - a.total)[0],
    [dshWeekProjection],
  )
  const revManagerTableRows = useMemo<BreakdownNumbersRow[]>(() => {
    return revTopManagers.map((row) => ({
      id: row.manager,
      label: row.manager,
      confirmed: row.confirmed,
      highConfidence: row.highConfidence,
      open: row.open,
      total: row.total,
      count: row.rows,
    }))
  }, [revTopManagers])
  const revProductTableRows = useMemo<BreakdownNumbersRow[]>(() => {
    return revProductSummary.map((row) => ({
      id: row.category,
      label: <ProductCategoryPill category={row.category} />,
      confirmed: row.confirmed,
      highConfidence: row.highConfidence,
      open: row.open,
      total: row.total,
      count: row.rows,
    }))
  }, [revProductSummary])

  const revTotalPages = Math.max(1, Math.ceil(filteredRows.length / revPageSize))
  const clampedRevPage = Math.min(revPage, revTotalPages)
  const revPageStartIndex = (clampedRevPage - 1) * revPageSize
  const visibleRows = useMemo(() => {
    return filteredRows.slice(revPageStartIndex, revPageStartIndex + revPageSize)
  }, [filteredRows, revPageSize, revPageStartIndex])
  const visibleGroupStats = useMemo(() => {
    const stats = new Map<string, { rows: number; total: number; software: number; hardware: number; unknown: number }>()
    for (const row of visibleRows) {
      const key = customerGroupKey(row.customer)
      const current = stats.get(key) ?? { rows: 0, total: 0, software: 0, hardware: 0, unknown: 0 }
      const category = rowProductCategory(row)
      current.rows += 1
      current.total += rowMonthAmount(row, selectedMonth)
      current[category] += rowMonthAmount(row, selectedMonth)
      stats.set(key, current)
    }
    return stats
  }, [selectedMonth, visibleRows])
  const revRangeStart = filteredRows.length === 0 ? 0 : revPageStartIndex + 1
  const revRangeEnd = Math.min(filteredRows.length, revPageStartIndex + visibleRows.length)
  const revControlsDirty = Boolean(query.trim()) ||
    managerFilter !== "ALL" ||
    regionFilter !== "ALL" ||
    productFilter !== "all" ||
    revStatusFilter !== "ALL" ||
    revDealTypeFilter !== "ALL" ||
    revOriginFilter !== "all" ||
    revForecastFilter !== "all" ||
    revSortKey !== "revenue" ||
    revSortDirection !== "desc" ||
    revPageSize !== 50

  useEffect(() => {
    if (revPage > revTotalPages) setRevPage(revTotalPages)
  }, [revPage, revTotalPages])

  const selectedMember = useMemo(() => {
    if (!selectedRow?.manager) return null
    return members.find((row) => row.member === selectedRow.manager) ?? null
  }, [members, selectedRow])

  const kpiMemberRows = useMemo(() => {
    return members
      .map((row) => {
        const metrics = orderedKpiMetrics(row.kpi)
        const activityGoal = metrics.reduce((sum, item) => sum + item.goal, 0)
        const activityActual = metrics.reduce((sum, item) => sum + item.actual, 0)
        const activityPct = activityGoal > 0 ? (activityActual / activityGoal) * 100 : 0
        return {
          row,
          metrics,
          activityGoal,
          activityActual,
          activityPct,
        }
      })
      .sort((a, b) => a.activityPct - b.activityPct || a.row.achievement_pct - b.row.achievement_pct || compareText(a.row.member, b.row.member))
  }, [members])

  const kpiActivityRows = useMemo<KpiMetricView[]>(() => {
    const metricMap = new Map<string, { goal: number; actual: number }>()
    for (const member of members) {
      for (const metric of orderedKpiMetrics(member.kpi)) {
        const current = metricMap.get(metric.metric) ?? { goal: 0, actual: 0 }
        current.goal += metric.goal
        current.actual += metric.actual
        metricMap.set(metric.metric, current)
      }
    }
    return Array.from(metricMap.entries())
      .map(([metric, value]) => ({
        metric,
        goal: value.goal,
        actual: value.actual,
        pct: value.goal > 0 ? (value.actual / value.goal) * 100 : 0,
      }))
      .sort((a, b) => {
        const aIndex = KPI_METRIC_ORDER.indexOf(a.metric)
        const bIndex = KPI_METRIC_ORDER.indexOf(b.metric)
        const safeA = aIndex === -1 ? KPI_METRIC_ORDER.length : aIndex
        const safeB = bIndex === -1 ? KPI_METRIC_ORDER.length : bIndex
        return safeA - safeB || compareText(a.metric, b.metric)
      })
  }, [members])

  const kpiActivityGoal = kpiActivityRows.reduce((sum, metric) => sum + metric.goal, 0)
  const kpiActivityActual = kpiActivityRows.reduce((sum, metric) => sum + metric.actual, 0)
  const kpiActivityPct = kpiActivityGoal > 0 ? (kpiActivityActual / kpiActivityGoal) * 100 : 0
  const kpiTeamGaugeRows = useMemo(() => {
    return kpiTeamRows.map((row) => ({
      id: row.team,
      label: row.team,
      pct: row.goal > 0 ? (row.status / row.goal) * 100 : row.pacing_pct,
      value: formatMoney(row.status),
      goal: `목표 ${formatMoney(row.goal)}`,
    }))
  }, [kpiTeamRows])
  const kpiMemberGaugeRows = useMemo(() => {
    return kpiMemberRows.map((item) => ({
      id: item.row.member,
      label: item.row.member,
      pct: item.activityPct,
      value: `${item.activityActual}/${item.activityGoal}`,
      goal: item.row.team ?? "KR",
    }))
  }, [kpiMemberRows])

  const selectedMonthAmounts = useMemo(() => {
    if (!detail && selectedRow) {
      return monthOptions.map((month) => ({
        ...month,
        amount: rowMonthAmount(selectedRow, month.value),
        confirmed: rowMonthConfirmed(selectedRow, month.value),
        highConfidence: rowMonthHighConfidence(selectedRow, month.value),
        red: Boolean(selectedRow.monthlyRed?.[month.value]),
      }))
    }
    if (!detail) return []
    return monthOptions.map((month) => {
      const amount = Number(detail.monthly_payments?.[month.value] ?? 0)
      const confirmed = Number(detail.monthly_confirmed?.[month.value] ?? 0)
      const highConfidence = Number(detail.monthly_high_conf?.[month.value] ?? 0)
      const red = Boolean(detail.monthly_red?.[month.value])
      return {
        ...month,
        amount,
        confirmed,
        highConfidence,
        red,
      }
    })
  }, [detail, monthOptions, selectedRow])

  const selectedRowWeekProjection = useMemo(() => {
    if (!selectedRow) return []
    return buildRevWeekProjection([selectedRow], draftForm.month || selectedMonth)
  }, [draftForm.month, selectedMonth, selectedRow])

  const selectedRowMonthTotal = selectedRow ? rowMonthAmount(selectedRow, draftForm.month || selectedMonth) : 0
  const selectedRowMonthConfirmed = selectedRow ? rowMonthConfirmed(selectedRow, draftForm.month || selectedMonth) : 0
  const selectedRowMonthHighConfidence = selectedRow ? rowMonthHighConfidence(selectedRow, draftForm.month || selectedMonth) : 0
  const selectedRowMonthOpen = selectedRow ? rowMonthOpen(selectedRow, draftForm.month || selectedMonth) : 0
  const selectedCustomerProductSummary = useMemo(() => {
    if (!selectedRow) return []
    const month = draftForm.month || selectedMonth
    return buildRevProductSummary(rows.filter((row) => row.customer === selectedRow.customer), month)
  }, [draftForm.month, rows, selectedMonth, selectedRow])

  const loadDealDetail = useCallback(async (row: LedgerRevenueRow) => {
    setSelectedRow(row)
    setSidePanelCollapsed(false)
    setRailView("detail")
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    setDraftForm({
      operation: row.ledgerOrigin === "draft" && isDraftOperation(metadataString(row.draftMetadata, "operation"))
        ? metadataString(row.draftMetadata, "operation") as DraftOperation
        : "amount-change",
      customer: row.customer,
      manager: row.manager ?? "",
      team: row.team ?? (team === "ALL" ? "BD" : team),
      productCategory: rowProductCategory(row),
      month: row.draftMonth ?? selectedMonth,
      fromMonth: metadataString(row.draftMetadata, "fromMonth") ?? row.draftMonth ?? selectedMonth,
      week: metadataString(row.draftMetadata, "week") ?? "month",
      amount: row.revenue ? String(Math.round(row.revenue)) : "",
      quantity: metadataNumberString(row.draftMetadata, "quantity"),
      note: row.draftNote ?? "",
    })
    const detailId = row.ledgerOrigin === "draft" ? row.sourceDealId : row.id
    if (!detailId) {
      setDetailLoading(false)
      return
    }
    try {
      const data = await adminFetchJson<DealDetailResponse>(`/api/admin/branch/deals/${encodeURIComponent(detailId)}`)
      if (data.error) throw new Error(data.error)
      setDetail(data.deal ?? null)
      if (data.deal) {
        const monthAmount = Number(data.deal.monthly_payments?.[selectedMonth] ?? row.revenue ?? 0)
        setDraftForm((current) => ({
          ...current,
          customer: data.deal?.customer_name ?? row.customer,
          manager: data.deal?.manager ?? row.manager ?? "",
          team: data.deal?.team ?? row.team ?? current.team,
          productCategory: productCategoryFromText(data.deal?.product_version, data.deal?.customer_name, row.customer),
          amount: monthAmount ? String(Math.round(monthAmount)) : current.amount,
          note: data.deal?.note ?? "",
        }))
      }
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : String(error))
    } finally {
      setDetailLoading(false)
    }
  }, [selectedMonth, team])

  const onRefresh = useCallback(async () => {
    setSyncError(null)
    setRefreshing(true)
    try {
      if (canRunAdminOperations) {
        await adminFetchJson("/api/admin/branch/sync", {
          method: "POST",
          body: JSON.stringify({ sources: ["rev"] }),
        })
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error))
    } finally {
      clearBranchRequestCache()
      setRefreshKey((value) => value + 1)
      setRefreshing(false)
    }
  }, [canRunAdminOperations])

  const buildDraftInput = useCallback((kind: DraftKind, base?: LedgerDraft | null): LedgerDraftInput => {
    const sourceSnapshot = kind === "edit-row" && selectedRow ? {
      capturedAt: new Date().toISOString(),
      selectedMonth,
      row: selectedRow,
      detail: detail ? {
        id: detail.id,
        sheetRow: detail.sheet_row,
        customerName: detail.customer_name,
        manager: detail.manager,
        team: detail.team,
        region: detail.region,
        status: detail.status,
        dealType: detail.deal_type,
        productVersion: detail.product_version,
        productCategory: draftForm.productCategory,
        contractTarget: detail.contract_target,
        firstPayment: detail.first_payment,
        monthAmount: Number(detail.monthly_payments?.[draftForm.month] ?? 0),
      } : null,
    } : base?.sourceSnapshot

    return {
      kind,
      sourceDealId: kind === "edit-row" ? (selectedRow?.sourceDealId ?? selectedRow?.id ?? base?.sourceDealId) : undefined,
      sourceSheetRow: kind === "edit-row" ? (selectedRow?.sheetRow ?? detail?.sheet_row ?? base?.sourceSheetRow ?? null) : null,
      sourceSnapshot,
      customer: draftForm.customer.trim(),
      manager: draftForm.manager.trim(),
      team: draftForm.team.trim(),
      month: draftForm.month,
      amount: safeAmount(draftForm.amount),
      note: draftForm.note.trim(),
      metadata: {
        ...(base?.metadata ?? {}),
        source: "sales-ledger-workbench",
        lens,
        period,
        team,
        operation: draftForm.operation,
        productCategory: draftForm.productCategory,
        fromMonth: draftForm.fromMonth,
        week: draftForm.week,
        quantity: draftForm.quantity.trim() ? safeAmount(draftForm.quantity) : null,
      },
    }
  }, [detail, draftForm, lens, period, selectedMonth, selectedRow, team])

  const saveDraft = useCallback(async (kind: DraftKind) => {
    setDraftSaving(true)
    try {
      await createDraft(buildDraftInput(kind))
      if (kind === "new-row") {
        setDraftForm(defaultDraftForm)
      }
    } finally {
      setDraftSaving(false)
    }
  }, [buildDraftInput, createDraft, defaultDraftForm])

  const editDraft = useCallback((draft: LedgerDraft) => {
    setEditingDraftId(draft.id)
    setSidePanelCollapsed(false)
    setRailView("input")
    setDraftForm({
      operation: isDraftOperation(draft.metadata?.operation) ? draft.metadata.operation : "forecast-add",
      customer: draft.customer,
      manager: draft.manager,
      team: draft.team || (team === "ALL" ? "BD" : team),
      productCategory: isStoredProductCategory(draft.metadata?.productCategory) ? draft.metadata.productCategory : "unknown",
      month: draft.month,
      fromMonth: metadataString(draft.metadata, "fromMonth") ?? draft.month,
      week: metadataString(draft.metadata, "week") ?? "month",
      amount: draft.amount ? String(Math.round(draft.amount)) : "",
      quantity: metadataNumberString(draft.metadata, "quantity"),
      note: draft.note,
    })
  }, [team])

  const cancelDraftEdit = useCallback(() => {
    setEditingDraftId(null)
    setDraftForm(defaultDraftForm)
  }, [defaultDraftForm])

  const saveEditedDraft = useCallback(async () => {
    if (!editingDraft) return
    setDraftSaving(true)
    try {
      await updateDraft(editingDraft.id, buildDraftInput(editingDraft.kind, editingDraft))
      setEditingDraftId(null)
      setDraftForm(defaultDraftForm)
    } finally {
      setDraftSaving(false)
    }
  }, [buildDraftInput, defaultDraftForm, editingDraft, updateDraft])

  const revenue = summary.data?.revenue
  const gap = (revenue?.confirmed ?? 0) - (revenue?.goal ?? 0)
  const openDrafts = drafts.filter((draft) => draft.status === "draft" || draft.status === "checked")
  const railViewItems = useMemo(() => [
    {
      id: "detail" as const,
      label: "상세",
      shortLabel: "상세",
      title: "행 상세",
      description: selectedRow ? selectedRow.customer : "REV 행을 선택하면 상세가 열립니다.",
      badge: selectedRow ? "선택됨" : "대기",
      icon: ListChecks,
    },
    {
      id: "input" as const,
      label: "입력 / 수정",
      shortLabel: "입력",
      title: "빠른 입력",
      description: "예상 추가, 업셀, 주차 이동, 확정 전환을 빠르게 남깁니다.",
      badge: queueMode === "server" ? "서버 큐" : "로컬",
      icon: Pencil,
    },
    {
      id: "queue" as const,
      label: "체크 큐",
      shortLabel: "큐",
      title: "검토 대기",
      description: `${openDrafts.length}건의 초안/체크 항목을 확인합니다.`,
      badge: `${openDrafts.length}건`,
      icon: AlertTriangle,
    },
  ], [openDrafts.length, queueMode, selectedRow])
  const currentRailView = railViewItems.find((item) => item.id === railView) ?? railViewItems[0]
  const CurrentRailIcon = currentRailView.icon
  const selectRailView = useCallback((nextView: RailView) => {
    setRailView(nextView)
    setSidePanelCollapsed(false)
    setRailSwitcherOpen(false)
  }, [])
  const draftTotal = openDrafts.reduce((sum, draft) => sum + draft.amount, 0)
  const appliedDraftTotal = additiveAppliedDraftRows.reduce((sum, row) => sum + row.revenue, 0)
  const ledgerConfirmed = (revenue?.confirmed ?? 0) + appliedDraftTotal
  const ledgerGap = ledgerConfirmed - (revenue?.goal ?? 0)
  const periodLabel = period === "M" ? formatMonthLabel(selectedMonth) : period === "Q" ? "현재 분기" : "FY26-27"
  const canCreateEditDraft = Boolean(selectedRow && (selectedRow.ledgerOrigin === "sheet" || selectedRow.sourceDealId))
  const draftAmountValue = safeAmount(draftForm.amount)
  const draftAmountInvalid = !draftForm.amount.trim() || draftAmountValue <= 0
  const draftQuantityInvalid = draftForm.operation === "quantity-change" && draftForm.quantity.trim() !== "" && safeAmount(draftForm.quantity) <= 0
  const draftFormInvalid = !draftForm.customer.trim() || draftAmountInvalid || draftQuantityInvalid
  const selectedProductCategory = selectedRow ? rowProductCategory(selectedRow) : "unknown"
  const selectedDraftOperation = DRAFT_OPERATIONS.find((item) => item.id === draftForm.operation) ?? DRAFT_OPERATIONS[0]
  const prepareDraftOperation = useCallback((operation: DraftOperation) => {
    const operationLabel = DRAFT_OPERATIONS.find((item) => item.id === operation)?.label ?? "입력"
    setSidePanelCollapsed(false)
    setRailView("input")
    setDraftForm((current) => ({
      ...current,
      operation,
      productCategory: selectedRow ? rowProductCategory(selectedRow) : current.productCategory,
      fromMonth: current.fromMonth || current.month || selectedMonth,
      week: current.week || "month",
      note: current.note || operationLabel,
    }))
  }, [selectedMonth, selectedRow])

  return (
    <div className="min-h-screen bg-[#FAFAF8] pb-24 text-[#111110]">
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-5 sm:px-6 lg:px-9">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#615D59]">
              <span>KR Team</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>FY26-27</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>Sales Ledger</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em] text-[#111110] sm:text-[32px]">
              매출 장부
            </h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[#615D59]">
              1. DSH 흐름 시각화, 2. REV 주차·목표 수치 검수, 3. KPI 활동 지표를 하나의 운영 화면으로 묶어 같은 필터와 선택 상태로 확인합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]">
              {TEAMS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTeam(value)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition ${
                    team === value ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59] hover:text-[#111110]"
                  }`}
                >
                  {value === "ALL" ? "KR 전체" : value}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]">
              {PERIODS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition ${
                    period === value ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59] hover:text-[#111110]"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            {period === "M" && (
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="h-9 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#111110] outline-none"
                aria-label="월 선택"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}{option.current ? " · 현재" : ""}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              동기화
            </button>
          </div>
        </div>

        {(syncError || summary.error || kpi.error || pipeline.error) && (
          <div className="mt-4 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[12px] font-semibold text-[#8F2C2C]">
            {syncError ?? summary.error ?? kpi.error ?? pipeline.error}
          </div>
        )}
      </header>

      <main className="grid gap-5 px-4 pt-5 sm:px-6 lg:grid-cols-[188px_minmax(0,1fr)] lg:px-9">
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-2" role="tablist" aria-label="Sales ledger views">
            {LENSES.map((item) => (
              <button
                key={item.id}
                type="button"
                id={`sales-ledger-lens-${item.id}`}
                role="tab"
                aria-selected={lens === item.id}
                aria-controls="sales-ledger-lens-panel"
                onClick={() => selectLens(item.id)}
                className={`mb-1 flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition last:mb-0 ${
                  lens === item.id ? "bg-[#111110] text-white" : "text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#111110]"
                }`}
              >
                <span className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-md ${
                  lens === item.id ? "bg-white/12" : "bg-[#ECFDF5] text-[#084734]"
                }`}>
                  {item.id === "dsh" ? <Gauge className="h-3.5 w-3.5" /> : item.id === "rev" ? <Table2 className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                </span>
                <span>
                  <span className="block text-[13px] font-bold">{item.label}</span>
                  <span className={`mt-0.5 block text-[11px] leading-relaxed ${lens === item.id ? "text-white/62" : "text-[#615D59]"}`}>
                    {item.description}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
            <p className="flex items-center gap-2 text-[12px] font-bold text-[#111110]">
              <Database className="h-3.5 w-3.5 text-[#084734]" />
              Source 상태
            </p>
            <div className="mt-3 space-y-2 text-[11px] text-[#615D59]">
              <div className="flex items-center justify-between gap-2">
                <span>마지막 sync</span>
                <span className="font-semibold text-[#111110]">{formatDateTime(summary.data?.lastSync)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>시트 수정</span>
                <span className="font-semibold text-[#111110]">{formatDateTime(summary.data?.sheetModifiedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>입력 큐</span>
                <span className="font-semibold text-[#111110]">
                  {queueMode === "server" ? "서버" : "로컬"} · {openDrafts.length}건
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>내부 원장</span>
                <span className="font-semibold text-[#111110]">
                  {ledgerHealth?.ok === false ? "준비 필요" : `${ledgerEntries.length}건`}
                </span>
              </div>
              {queueError && (
                <div className="rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-2 py-1.5 text-[10.5px] leading-relaxed text-[#7A520F]">
                  {queueError}
                </div>
              )}
              {ledgerHealth?.ok === false && (
                <div className="rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-2 py-1.5 text-[10.5px] leading-relaxed text-[#7A520F]">
                  {ledgerHealth.message ?? "내부 원장 마이그레이션이 아직 준비되지 않았습니다."}
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricTile
              label="목표"
              value={formatMoney(revenue?.goal)}
              hint={`${periodLabel} 목표 매출`}
              icon={<Target className="h-3.5 w-3.5" />}
            />
            <MetricTile
              label="실적"
              value={formatMoney(revenue?.confirmed)}
              hint={`시트 원천 · 달성률 ${formatPercent(revenue?.pacing_pct)}`}
              tone="text-[#084734]"
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            />
            <MetricTile
              label="장부 반영"
              value={formatMoney(ledgerConfirmed)}
              hint={`DB 신규 ${additiveAppliedDraftRows.length}건 · 수정 ${replacementAppliedDraftRows.length}건 별도 · Gap ${formatMoney(ledgerGap)}`}
              tone={ledgerGap >= 0 ? "text-[#084734]" : "text-[#A8741A]"}
              icon={<Send className="h-3.5 w-3.5" />}
            />
            <MetricTile
              label="Gap"
              value={formatMoney(gap)}
              hint={gap >= 0 ? "시트 기준 목표 초과" : "시트 기준 목표 대비 부족"}
              tone={gap >= 0 ? "text-[#084734]" : "text-[#B43E3E]"}
              icon={gap >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            />
            <MetricTile
              label="입력 큐"
              value={formatMoney(draftTotal)}
              hint={`${openDrafts.length}건 ${queueMode === "server" ? "서버 큐" : "로컬 fallback"} 검토 대기`}
              tone="text-[#A8741A]"
              icon={<Pencil className="h-3.5 w-3.5" />}
            />
          </div>

          <div
            ref={lensPanelRef}
            id="sales-ledger-lens-panel"
            role="tabpanel"
            aria-labelledby={`sales-ledger-lens-${lens}`}
            tabIndex={-1}
            className="scroll-mt-24 space-y-5 focus:outline-none"
          >
            {lens === "dsh" && (
              <div className="space-y-5">
                <div className="grid gap-5 xl:grid-cols-2">
                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-bold text-[#111110]">DSH 누적 흐름</p>
                        <p className="mt-0.5 text-[11px] text-[#615D59]">
                          목표 <span className="font-bold text-[#111110]">{formatMoney(revenue?.goal)}</span>
                          {" · "}실적 <span className="font-bold text-[#084734]">{formatMoney(revenue?.confirmed)}</span>
                          {" · "}달성률 <span className="font-bold text-[#111110]">{formatPercent(revenue?.pacing_pct)}</span>
                        </p>
                      </div>
                      <span className="rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#084734]">
                        {periodLabel}
                      </span>
                    </div>
                    {summary.loading && !summary.data ? <LoadingPanel label="DSH 데이터를 불러오는 중" /> : <PacingChart summary={summary.data} />}
                  </section>

                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                          <CalendarDays className="h-4 w-4 text-[#084734]" />
                          {formatMonthLabel(selectedMonth)} 주차별 확정·고확도·예정
                        </p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[#615D59]">
                          REV w1-w5 입력 기준 · 검색/필터와 무관한 전체 행 집계
                        </p>
                      </div>
                      <span className="rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#084734]">
                        피크 {dshPeakWeek?.week ?? "-"} · {formatMoney(dshPeakWeek?.total)}
                      </span>
                    </div>
                    {pipeline.loading && !pipeline.data ? (
                      <LoadingPanel label="REV 주차 데이터를 불러오는 중" />
                    ) : (
                      <RevWeekForecastChart data={dshWeekProjection} monthGoal={revMonthGoal} />
                    )}
                  </section>
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                          <TrendingUp className="h-4 w-4 text-[#A8741A]" />
                          월별 목표·실적 수치
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#615D59]">누적 시리즈를 월별 수치로 분해 · 선택 월 강조</p>
                      </div>
                      <span className="text-[11px] font-bold text-[#615D59]">{monthlySeriesRows.length}개월</span>
                    </div>
                    {summary.loading && !summary.data ? (
                      <LoadingPanel label="월별 수치를 불러오는 중" />
                    ) : (
                      <DshMonthlyNumbersTable rows={monthlySeriesRows} selectedMonth={selectedMonth} />
                    )}
                  </section>

                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-bold text-[#111110]">담당자 목표/실적</p>
                        <p className="mt-0.5 text-[11px] text-[#615D59]">KPI 행과 REV 매출을 함께 보는 요약</p>
                      </div>
                      <span className="text-[11px] font-bold text-[#615D59]">{members.length}명</span>
                    </div>
                    {kpi.loading && !kpi.data ? <LoadingPanel label="KPI 데이터를 불러오는 중" /> : <MemberBarChart rows={members} />}
                  </section>
                </div>
              </div>
            )}

            {lens === "rev" && (
              <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
            <div className="border-b border-[rgba(0,0,0,0.08)] p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                    <FileSpreadsheet className="h-4 w-4 text-[#084734]" />
                    REV 매출 행
                  </p>
                  <p className="mt-1 text-[11px] text-[#615D59]">
                    검색 결과 {filteredRows.length.toLocaleString("ko-KR")}건 · {revRangeStart.toLocaleString("ko-KR")}-{revRangeEnd.toLocaleString("ko-KR")} 표시 · DB 신규 반영 {additiveAppliedDraftRows.length.toLocaleString("ko-KR")}건 포함
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" aria-label="상품군 필터">
                    {REV_PRODUCT_FILTERS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setProductFilter(item.id)}
                        className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold transition ${
                          productFilter === item.id ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59] hover:text-[#111110]"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <label className="relative min-w-[220px] flex-1 xl:w-[310px] xl:flex-none">
                    <span className="sr-only">REV 매출 행 검색</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="고객, 담당자, 팀, 지역, 상태, 메모 검색"
                      className="h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] pl-9 pr-3 text-[12px] font-medium outline-none transition focus:border-[#084734]"
                    />
                  </label>
                  <select
                    value={managerFilter}
                    onChange={(event) => setManagerFilter(event.target.value)}
                    className="h-9 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-semibold text-[#111110]"
                    aria-label="담당자 필터"
                  >
                    <option value="ALL">담당자 전체</option>
                    {managerOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                  <select
                    value={regionFilter}
                    onChange={(event) => setRegionFilter(event.target.value)}
                    className="h-9 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-semibold text-[#111110]"
                    aria-label="지역 필터"
                  >
                    <option value="ALL">지역 전체</option>
                    {regionOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setAdvancedFiltersOpen((value) => !value)}
                    aria-expanded={advancedFiltersOpen}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] font-bold transition ${
                      advancedFiltersOpen || revStatusFilter !== "ALL" || revDealTypeFilter !== "ALL" || revOriginFilter !== "all" || revForecastFilter !== "all"
                        ? "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
                        : "border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#111110]"
                    }`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    고급
                  </button>
                  <select
                    value={revPageSize}
                    onChange={(event) => setRevPageSize(Number(event.target.value) as RevPageSize)}
                    className="h-9 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-semibold text-[#111110]"
                    aria-label="REV 표시 개수"
                  >
                    {REV_PAGE_SIZES.map((value) => <option key={value} value={value}>{value}개</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={resetRevFilters}
                    disabled={!revControlsDirty}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="REV 검색, 필터, 정렬 초기화"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    초기화
                  </button>
                </div>
              </div>
              {advancedFiltersOpen && (
                <div className="mt-3 grid gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="block text-[10.5px] font-bold text-[#615D59]">
                    상태
                    <select
                      value={revStatusFilter}
                      onChange={(event) => setRevStatusFilter(event.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                    >
                      <option value="ALL">상태 전체</option>
                      {revStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10.5px] font-bold text-[#615D59]">
                    유형
                    <select
                      value={revDealTypeFilter}
                      onChange={(event) => setRevDealTypeFilter(event.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                    >
                      <option value="ALL">유형 전체</option>
                      {revDealTypeOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10.5px] font-bold text-[#615D59]">
                    원천
                    <select
                      value={revOriginFilter}
                      onChange={(event) => setRevOriginFilter(event.target.value as RevOriginFilter)}
                      className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                    >
                      {REV_ORIGIN_FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10.5px] font-bold text-[#615D59]">
                    주차/확도
                    <select
                      value={revForecastFilter}
                      onChange={(event) => setRevForecastFilter(event.target.value as RevForecastFilter)}
                      className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                    >
                      {REV_FORECAST_FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </label>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#615D59]">
                <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1">
                  정렬 {REV_SORT_LABELS[revSortKey]} {revSortDirection === "asc" ? "오름차순" : "내림차순"}
                </span>
                {query.trim() && (
                  <span className="inline-block max-w-[260px] truncate rounded-full bg-[#F6F5F4] px-2.5 py-1">검색 {query.trim()}</span>
                )}
                {managerFilter !== "ALL" && (
                  <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1">담당자 {managerFilter}</span>
                )}
                {regionFilter !== "ALL" && (
                  <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1">지역 {regionFilter}</span>
                )}
                {productFilter !== "all" && (
                  <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1">상품 {productCategoryMeta(productFilter).label}</span>
                )}
                {revStatusFilter !== "ALL" && (
                  <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1">상태 {revStatusFilter}</span>
                )}
                {revDealTypeFilter !== "ALL" && (
                  <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1">유형 {revDealTypeFilter}</span>
                )}
                {revOriginFilter !== "all" && (
                  <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1">{REV_ORIGIN_FILTERS.find((item) => item.id === revOriginFilter)?.label}</span>
                )}
                {revForecastFilter !== "all" && (
                  <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1">{REV_FORECAST_FILTERS.find((item) => item.id === revForecastFilter)?.label}</span>
                )}
              </div>
            </div>

            {pipeline.loading && !pipeline.data ? (
              <div className="p-4"><LoadingPanel label="REV 행을 불러오는 중" /></div>
            ) : (
              <>
                <div className="space-y-4 border-b border-[rgba(0,0,0,0.08)] p-4">
                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                          <Target className="h-4 w-4 text-[#084734]" />
                          {formatMonthLabel(selectedMonth)} 목표 대비 수치
                        </p>
                        <p className="mt-1 text-[11px] text-[#615D59]">
                          현재 검색/필터가 반영된 REV 집계 · 월 목표는 DSH 시리즈 기준
                        </p>
                      </div>
                      {revMonthGoal === null && (
                        <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2.5 py-1 text-[10.5px] font-bold text-[#7A520F]">
                          선택 월 목표 없음
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                      <div className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5">
                        <p className="text-[10.5px] font-bold text-[#615D59]">월 목표</p>
                        <p className="mt-1 text-[17px] font-bold tabular-nums text-[#111110]">
                          {revMonthGoal !== null ? formatMoney(revMonthGoal) : "–"}
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">DSH 월간 목표</p>
                      </div>
                      <div className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5">
                        <p className="text-[10.5px] font-bold text-[#615D59]">확정</p>
                        <p className="mt-1 text-[17px] font-bold tabular-nums text-[#084734]">{formatMoney(revMonthConfirmed)}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">
                          {revMonthGoal !== null ? `달성률 ${formatPercent((revMonthConfirmed / revMonthGoal) * 100)}` : "월 목표 미설정"}
                        </p>
                      </div>
                      <div className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5">
                        <p className="text-[10.5px] font-bold text-[#615D59]">고확도</p>
                        <p className="mt-1 text-[17px] font-bold tabular-nums text-[#1E5DA8]">{formatMoney(revMonthHighConfidence)}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">
                          {revMonthGoal !== null
                            ? `확정+고확도 ${formatPercent((revMonthCovered / revMonthGoal) * 100)}`
                            : `확정+고확도 ${formatMoney(revMonthCovered)}`}
                        </p>
                      </div>
                      <div className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5">
                        <p className="text-[10.5px] font-bold text-[#615D59]">예정·월합계만</p>
                        <p className="mt-1 text-[17px] font-bold tabular-nums text-[#A8741A]">{formatMoney(revMonthPlanned)}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">월합계만 {formatMoney(revMonthMonthlyOnly)}</p>
                      </div>
                      <div className="rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5">
                        <p className="text-[10.5px] font-bold text-[#615D59]">목표까지</p>
                        {revMonthRemaining === null ? (
                          <>
                            <p className="mt-1 text-[17px] font-bold tabular-nums text-[#111110]">–</p>
                            <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">월 목표 미설정</p>
                          </>
                        ) : revMonthRemaining > 0 ? (
                          <>
                            <p className="mt-1 text-[17px] font-bold tabular-nums text-[#B43E3E]">{formatMoney(revMonthRemaining)}</p>
                            <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">확정 기준 부족</p>
                          </>
                        ) : (
                          <>
                            <p className="mt-1 text-[17px] font-bold tabular-nums text-[#084734]">+{formatMoney(Math.abs(revMonthRemaining))}</p>
                            <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">목표 초과 달성</p>
                          </>
                        )}
                      </div>
                    </div>
                    {revMonthGoal !== null && (
                      <div className="mt-3">
                        <div className="relative h-2.5 overflow-hidden rounded-full bg-[#F0F0EC]">
                          <div className="absolute inset-y-0 left-0 flex w-full">
                            <span className="h-full bg-[#084734]" style={{ width: `${(revMonthConfirmed / revMonthScale) * 100}%` }} />
                            <span className="h-full bg-[#1E5DA8]" style={{ width: `${(revMonthHighConfidence / revMonthScale) * 100}%` }} />
                            <span className="h-full bg-[#A8741A]" style={{ width: `${(revMonthOpen / revMonthScale) * 100}%` }} />
                            <span className="h-full bg-[#D9D6D0]" style={{ width: `${(revMonthMonthlyOnly / revMonthScale) * 100}%` }} />
                          </div>
                          <span
                            className="absolute inset-y-0 w-[2px] bg-[#111110]"
                            style={{ left: `calc(${Math.min((revMonthGoal / revMonthScale) * 100, 100)}% - 1px)` }}
                            aria-label={`월 목표 ${formatMoney(revMonthGoal)} 위치`}
                          />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-[#615D59]">
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#084734]" />확정</span>
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#1E5DA8]" />고확도</span>
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#A8741A]" />예정</span>
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#D9D6D0]" />월합계만</span>
                          <span className="inline-flex items-center gap-1"><span className="h-3 w-[2px] bg-[#111110]" />월 목표 {formatMoney(revMonthGoal)}</span>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                          <CalendarDays className="h-4 w-4 text-[#084734]" />
                          {formatMonthLabel(selectedMonth)} 주차별 수치 (W1–W5)
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
                          REV w1-w5 입력 기준 · 월합계만 입력된 행은 W5 열에 합산 · 주차 흐름 차트는 DSH 탭
                        </p>
                      </div>
                      <span className="rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#084734]">
                        피크 {revPeakWeek?.week ?? "-"} · {formatMoney(revPeakWeek?.total)}
                      </span>
                    </div>
                    <RevWeekNumbersTable data={revWeekProjection} monthGoal={revMonthGoal} monthRowCount={revMonthRowCount} />
                  </section>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-[12px] font-bold text-[#111110]">
                          <TrendingUp className="h-3.5 w-3.5 text-[#A8741A]" />
                          담당자별 월 수치
                        </p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">상위 {revManagerTableRows.length}명</span>
                      </div>
                      <BreakdownNumbersTable rows={revManagerTableRows} emptyLabel="선택 월에 담당자별 REV 금액이 없습니다." />
                    </section>
                    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">상품군 추정 수치</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">검수 보조</span>
                      </div>
                      <BreakdownNumbersTable rows={revProductTableRows} emptyLabel="선택 월에 상품군을 추정할 수 있는 REV 금액이 없습니다." />
                    </section>
                  </div>
                </div>

                <div className="space-y-3 p-3 md:hidden">
                  {filteredRows.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] text-[#615D59]">
                      조건에 맞는 REV 행이 없습니다.
                    </div>
                  )}
                  {visibleRows.map((row) => {
                    const active = selectedRow?.id === row.id
                    const draftRow = row.ledgerOrigin === "draft"
                    const productCategory = rowProductCategory(row)
                    const weeklySplit = rowWeeklySplit(row, selectedMonth)
                    const groupStats = visibleGroupStats.get(customerGroupKey(row.customer))
                    return (
                      <article
                        key={row.id}
                        className={`rounded-lg border p-3 transition ${
                          active ? "border-[#BDEFD8] bg-[#ECFDF5]" : draftRow ? "border-[#ECD29C] bg-[#FFFCF5]" : "border-[rgba(0,0,0,0.08)] bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => void loadDealDetail(row)}
                              className="min-h-10 max-w-full text-left text-[13px] font-bold text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
                              aria-label={`${row.customer} 상세 열기`}
                            >
                              {row.customer}
                            </button>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <ProductCategoryPill category={productCategory} compact />
                              <WeeklySourceBadge source={weeklySplit.source} />
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                draftRow ? "bg-[#FBF1E0] text-[#7A520F]" : "bg-[#F6F5F4] text-[#615D59]"
                              }`}>
                                {draftRow ? "장부 입력" : "시트 원본"}
                              </span>
                            </div>
                          </div>
                          <p className="shrink-0 text-right text-[15px] font-bold text-[#111110]">
                            {formatMoney(rowMonthAmount(row, selectedMonth) || row.revenue)}
                          </p>
                        </div>
                        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_104px] gap-3">
                          <div className="min-w-0 rounded-md bg-[#FAFAF8] p-2">
                            <p className="truncate text-[11px] font-semibold text-[#615D59]">
                              {[row.manager, row.team, row.region].filter(Boolean).join(" · ") || "-"}
                            </p>
                            <p className="mt-1 truncate text-[11px] font-semibold text-[#615D59]">
                              {[row.status, row.dealType, row.productVersion].filter(Boolean).join(" · ") || "상세 분류 없음"}
                            </p>
                            {groupStats && groupStats.rows > 1 && (
                              <p className="mt-2 text-[10.5px] font-bold text-[#615D59]">
                                같은 고객 {groupStats.rows}건 · SW {formatMoney(groupStats.software)} · HW {formatMoney(groupStats.hardware)}
                              </p>
                            )}
                          </div>
                          <MiniWeekBars split={weeklySplit} />
                        </div>
                        <div className="mt-3 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => void loadDealDetail(row)}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
                            aria-label={`${row.customer} 상세 열기`}
                          >
                            상세
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-[1080px] w-full text-left text-[12px]">
                    <thead className="bg-[#FAFAF8] text-[11px] uppercase tracking-[0.08em] text-[#615D59]">
                      <tr>
                        <th className="px-4 py-3">
                          <RevSortHeader label="고객/계정" sortKey="customer" activeKey={revSortKey} direction={revSortDirection} onSort={onRevSort} />
                        </th>
                        <th className="px-3 py-3">
                          <RevSortHeader label="상품" sortKey="product" activeKey={revSortKey} direction={revSortDirection} onSort={onRevSort} />
                        </th>
                        <th className="px-3 py-3">
                          <RevSortHeader label="담당자" sortKey="manager" activeKey={revSortKey} direction={revSortDirection} onSort={onRevSort} />
                        </th>
                        <th className="px-3 py-3">
                          <RevSortHeader label="팀" sortKey="team" activeKey={revSortKey} direction={revSortDirection} onSort={onRevSort} />
                        </th>
                        <th className="px-3 py-3">
                          <RevSortHeader label="지역" sortKey="region" activeKey={revSortKey} direction={revSortDirection} onSort={onRevSort} />
                        </th>
                        <th className="px-4 py-3 text-right">
                          <RevSortHeader label={`${formatMonthLabel(selectedMonth)} 금액`} sortKey="month" activeKey={revSortKey} direction={revSortDirection} onSort={onRevSort} align="right" />
                        </th>
                        <th className="px-4 py-3 text-right">
                          <RevSortHeader label="실적" sortKey="revenue" activeKey={revSortKey} direction={revSortDirection} onSort={onRevSort} align="right" />
                        </th>
                        <th className="px-4 py-3 text-right">
                          <RevSortHeader label="상태" sortKey="origin" activeKey={revSortKey} direction={revSortDirection} onSort={onRevSort} align="right" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-[#615D59]">
                            조건에 맞는 REV 행이 없습니다.
                          </td>
                        </tr>
                      )}
                      {visibleRows.map((row) => {
                        const active = selectedRow?.id === row.id
                        const draftRow = row.ledgerOrigin === "draft"
                        const productCategory = rowProductCategory(row)
                        const weeklySplit = rowWeeklySplit(row, selectedMonth)
                        const monthAmount = rowMonthAmount(row, selectedMonth)
                        const monthConfirmedAmount = rowMonthConfirmed(row, selectedMonth)
                        return (
                          <tr
                            key={row.id}
                            className={`border-t border-[#F0F0EC] transition ${
                              active ? "bg-[#ECFDF5]" : draftRow ? "bg-[#FFFCF5] hover:bg-[#FBF1E0]" : "hover:bg-[#FAFAF8]"
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex max-w-[340px] items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void loadDealDetail(row)}
                                  className="min-h-10 min-w-0 truncate text-left font-bold text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
                                  aria-label={`${row.customer} 상세 열기`}
                                >
                                  {row.customer}
                                </button>
                                <ProductCategoryPill category={productCategory} compact />
                                {draftRow && (
                                  <span className="shrink-0 rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[10px] font-bold text-[#7A520F]">
                                    장부 입력
                                  </span>
                                )}
                              </div>
                              {draftRow && (
                                <p className="mt-1 max-w-[300px] truncate text-[10.5px] font-semibold text-[#7A520F]">
                                  {row.draftKind === "edit-row" ? "수정 적용" : "신규 적용"} · {formatMonthLabel(row.draftMonth ?? selectedMonth)}
                                  {row.draftNote ? ` · ${row.draftNote}` : ""}
                                </p>
                              )}
                              {!draftRow && (row.status || row.dealType || row.productVersion) && (
                                <p className="mt-1 max-w-[320px] truncate text-[10.5px] font-semibold text-[#615D59]">
                                  {[row.status, row.dealType].filter(Boolean).join(" · ")}
                                </p>
                              )}
                              <div className="mt-1">
                                <WeeklySourceBadge source={weeklySplit.source} />
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <ProductCategoryPill category={productCategory} />
                              <p className="mt-1 max-w-[150px] truncate text-[10.5px] font-semibold text-[#615D59]">
                                {row.productVersion || metadataString(row.draftMetadata, "productCategory") || "-"}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-[#615D59]">{row.manager ?? "-"}</td>
                            <td className="px-3 py-3">
                              <span className="rounded-full bg-[#F6F5F4] px-2 py-1 text-[11px] font-bold text-[#615D59]">{row.team ?? "-"}</span>
                            </td>
                            <td className="px-3 py-3 text-[#615D59]">{row.region ?? "-"}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {monthAmount > 0 ? (
                                <>
                                  <p className="font-bold text-[#111110]">{formatMoney(monthAmount)}</p>
                                  {monthConfirmedAmount > 0 ? (
                                    <p className="mt-0.5 text-[10px] font-semibold text-[#084734]">확정 {formatMoney(monthConfirmedAmount)}</p>
                                  ) : (
                                    <p className="mt-0.5 text-[10px] font-semibold text-[#A39E98]">미확정</p>
                                  )}
                                </>
                              ) : (
                                <span className="font-semibold text-[#C9C5BF]">–</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-[#111110]">{formatMoney(row.revenue)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                  draftRow ? "bg-[#FBF1E0] text-[#7A520F]" : "bg-[#F6F5F4] text-[#615D59]"
                                }`}>
                                  {draftRow ? "장부 입력" : "시트 원본"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void loadDealDetail(row)}
                                  className="inline-flex min-h-10 items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] px-2.5 py-1 text-[11px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
                                  aria-label={`${row.customer} 상세 열기`}
                                >
                                  열기
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col gap-3 border-t border-[rgba(0,0,0,0.08)] px-4 py-3 text-[12px] text-[#615D59] sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold">
                    {revRangeStart.toLocaleString("ko-KR")}-{revRangeEnd.toLocaleString("ko-KR")} / {filteredRows.length.toLocaleString("ko-KR")}건
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRevPage((page) => Math.max(1, page - 1))}
                      disabled={clampedRevPage <= 1}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      이전
                    </button>
                    <span className="min-w-[72px] text-center font-bold text-[#111110]">
                      {clampedRevPage} / {revTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRevPage((page) => Math.min(revTotalPages, page + 1))}
                      disabled={clampedRevPage >= revTotalPages}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      다음
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}
              </section>
            )}

            {lens === "kpi" && (
              <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-[#084734]" />
                    <h2 className="text-[13px] font-bold text-[#111110]">KPI 병목과 담당자 상세</h2>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
                    활동 목표/실적, 매출 달성, 딜 수를 담당자별로 비교하고 REV 매출 행으로 바로 좁혀봅니다.
                  </p>
                </div>
                <span className="rounded-full bg-[#F6F5F4] px-2.5 py-1 text-[11px] font-bold text-[#615D59]">
                  {kpiMemberRows.length}명
                </span>
              </div>

              {kpi.loading && !kpi.data ? (
                <LoadingPanel label="KPI 데이터를 불러오는 중" />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["팀", `${kpiTeamRows.length}개`, "목표/실적 집계", "text-[#111110]"],
                      ["활동 KPI", formatPercent(kpiActivityPct), `${kpiActivityActual}/${kpiActivityGoal}`, "text-[#1E5DA8]"],
                    ].map(([label, value, hint, tone]) => (
                      <div key={String(label)} className="rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-3">
                        <p className="text-[10.5px] font-bold uppercase text-[#615D59]">{label}</p>
                        <p className={`mt-1 text-[18px] font-bold leading-none ${tone}`}>{value}</p>
                        <p className="mt-1.5 text-[11px] font-semibold text-[#615D59]">{hint}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
                    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">KPI 달성률</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">LD 우선</span>
                      </div>
                      <DonutGauge
                        label="활동 KPI"
                        pct={kpiActivityPct}
                        value={`${kpiActivityActual}/${kpiActivityGoal}`}
                        goal="LD · ACC · OPP · SOL · VST"
                        color="#1E5DA8"
                        size={112}
                      />
                    </section>

                    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">팀별 달성률</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">{kpiTeamGaugeRows.length}팀</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                        {kpiTeamGaugeRows.map((row) => (
                          <DonutGauge
                            key={row.id}
                            label={row.label}
                            pct={row.pct}
                            value={row.value}
                            goal={row.goal}
                            color="#084734"
                            size={82}
                          />
                        ))}
                      </div>
                    </section>

                    <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">개인별 KPI 달성률</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">{kpiMemberGaugeRows.length}명</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                        {kpiMemberGaugeRows.map((row) => (
                          <DonutGauge
                            key={row.id}
                            label={row.label}
                            pct={row.pct}
                            value={row.value}
                            goal={row.goal}
                            color="#084734"
                            size={76}
                          />
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">팀별 목표/실적</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">overview 연동</span>
                      </div>
                      <KpiTeamChart rows={kpiTeamRows} />
                      <ChartLegend items={[{ label: "목표", color: "#D9D6D0" }, { label: "실적", color: "#084734" }]} />
                    </div>

                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">활동 KPI 합산</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">{formatPercent(kpiActivityPct)}</span>
                      </div>
                      <KpiActivityChart rows={kpiActivityRows} />
                      <ChartLegend items={[{ label: "목표", color: "#D9D6D0" }, { label: "실적", color: "#1E5DA8" }]} />
                    </div>

                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">개인별 매출 Gap</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">부족 큰 순</span>
                      </div>
                      <KpiGapChart rows={kpiMemberRows} />
                      <ChartLegend items={[{ label: "초과", color: "#084734" }, { label: "부족", color: "#B43E3E" }]} />
                    </div>

                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">활동 × 매출 사분면</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">75% 기준선</span>
                      </div>
                      <KpiRevenueActivityScatter rows={kpiMemberRows} />
                    </div>

                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">개인별 목표/실적</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">KR Team</span>
                      </div>
                      <MemberBarChart rows={members} />
                    </div>

                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#111110]">개인별 활동 병목</p>
                        <span className="text-[10.5px] font-bold text-[#615D59]">낮은 순</span>
                      </div>
                      <KpiBottleneckMatrix
                        rows={kpiMemberRows}
                        onMemberClick={(member) => {
                          setQuery("")
                          setManagerFilter(member)
                          setRegionFilter("ALL")
                          setRevPage(1)
                          selectLens("rev")
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[940px] w-full text-left text-[12px]">
                  <thead className="bg-[#FAFAF8] text-[11px] uppercase tracking-[0.08em] text-[#615D59]">
                    <tr>
                      <th className="px-3 py-3 font-bold">담당자</th>
                      <th className="px-3 py-3 font-bold">팀</th>
                      <th className="px-3 py-3 text-right font-bold">매출</th>
                      <th className="px-3 py-3 text-right font-bold">딜</th>
                      <th className="px-3 py-3 font-bold">활동 KPI</th>
                      <th className="px-3 py-3 text-right font-bold">연동</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiMemberRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-[#615D59]">
                          KPI 담당자 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : kpiMemberRows.map(({ row, metrics, activityActual, activityGoal, activityPct }) => {
                      const activityTone = kpiStatusTone(activityPct)
                      const revenueTone = kpiStatusTone(row.achievement_pct)
                      return (
                        <tr key={row.member} className="border-t border-[#F0F0EC] transition hover:bg-[#FAFAF8]">
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                setQuery("")
                                setManagerFilter(row.member)
                                setRegionFilter("ALL")
                                setRevPage(1)
                                selectLens("rev")
                              }}
                              className="cursor-pointer font-bold text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                              aria-label={`${row.member} REV 행 보기`}
                            >
                              {row.member}
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <span className="rounded-full bg-[#F6F5F4] px-2 py-1 text-[11px] font-bold text-[#615D59]">
                              {row.team ?? "-"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <p className="font-bold text-[#111110]">{formatMoney(row.status)}</p>
                            <p className="mt-0.5 text-[10.5px] text-[#615D59]">목표 {formatMoney(row.goal)}</p>
                            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${revenueTone.className}`}>
                              {formatPercent(row.achievement_pct)} {revenueTone.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <p className="font-bold text-[#111110]">{row.deals_confirmed}/{row.deals_total}</p>
                            <p className="mt-0.5 text-[10.5px] text-[#615D59]">신규 {row.new_renew.new} · 갱신 {row.new_renew.renew}</p>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {metrics.map((metric) => (
                                <span
                                  key={`${row.member}-${metric.metric}`}
                                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${kpiStatusTone(metric.pct).className}`}
                                  title={`${metric.metric} ${metric.actual}/${metric.goal}`}
                                >
                                  {metric.metric} {metric.actual}/{metric.goal}
                                </span>
                              ))}
                            </div>
                            <p className="mt-1.5 text-[10.5px] font-semibold text-[#615D59]">
                              활동 합계 {activityActual}/{activityGoal} · {formatPercent(activityPct)}
                            </p>
                            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${activityTone.className}`}>
                              활동 {activityTone.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setQuery("")
                                setManagerFilter(row.member)
                                setRegionFilter("ALL")
                                setRevPage(1)
                                selectLens("rev")
                              }}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#BDEFD8] px-2.5 py-1.5 text-[11px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                            >
                              REV 보기
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </section>
            )}
          </div>
        </section>

        {lens !== "kpi" && sidePanelCollapsed && (
          <button
            type="button"
            onClick={() => setSidePanelCollapsed(false)}
            className="fixed bottom-4 right-4 z-40 inline-flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-[rgba(0,0,0,0.08)] bg-[#111110] px-4 py-3 text-left text-white shadow-[0_18px_48px_rgba(17,17,16,0.24)] transition hover:bg-[#084734] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] sm:bottom-5 sm:right-5"
            aria-label="빠른 작업 패널 열기"
            title="빠른 작업 패널 열기"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12">
              <CurrentRailIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-bold text-white/60">빠른 작업</span>
              <span className="block truncate text-[12px] font-bold">{currentRailView.label}</span>
            </span>
            {openDrafts.length > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#FBF1E0] px-1.5 text-[10px] font-bold text-[#7A520F]">
                {openDrafts.length}
              </span>
            )}
          </button>
        )}

        {lens !== "kpi" && !sidePanelCollapsed && (
        <aside className="fixed inset-x-3 bottom-3 top-auto z-50 max-h-[86dvh] overflow-y-auto rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-2 shadow-[0_24px_70px_rgba(17,17,16,0.22)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:w-[min(420px,calc(100vw-2rem))] sm:max-h-[calc(100dvh-2rem)]">
          <>
          <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-2">
            <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setRailSwitcherOpen((value) => !value)}
                  aria-haspopup="menu"
                  aria-expanded={railSwitcherOpen}
                  className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2 text-left transition hover:bg-[#F6F5F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#ECFDF5] text-[#084734]">
                      <CurrentRailIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold text-[#615D59]">빠른 작업</span>
                      <span className="block truncate text-[12px] font-bold text-[#111110]">{currentRailView.label}</span>
                    </span>
                  </span>
                  <ChevronRight className={`h-4 w-4 shrink-0 text-[#615D59] transition ${railSwitcherOpen ? "rotate-90" : ""}`} />
                </button>
                {railSwitcherOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+8px)] z-30 w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-2 shadow-[0_16px_40px_rgba(17,17,16,0.14)]"
                  >
                    {railViewItems.map((item) => {
                      const Icon = item.icon
                      const active = railView === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          onClick={() => selectRailView(item.id)}
                          className={`mb-1 flex min-h-12 w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition last:mb-0 ${
                            active ? "bg-[#ECFDF5] text-[#084734]" : "text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#111110]"
                          }`}
                        >
                          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                            active ? "bg-white text-[#084734]" : "bg-[#FAFAF8] text-[#615D59]"
                          }`}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-[12px] font-bold">{item.label}</span>
                              <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-bold">{item.badge}</span>
                            </span>
                            <span className="mt-0.5 block text-[10.5px] leading-snug text-[#615D59]">{item.description}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSidePanelCollapsed(true)}
                className="flex h-9 w-10 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                aria-label="빠른 작업 패널 닫기"
                title="빠른 작업 패널 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {railView === "detail" && (
          <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
            <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
              <p className="text-[13px] font-bold text-[#111110]">행 상세</p>
              <p className="mt-1 text-[11px] text-[#615D59]">REV 행 선택 시 월별 금액과 수정 초안 입력</p>
            </div>
            <div className="p-4">
              {!selectedRow ? (
                <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-4 text-[12px] leading-relaxed text-[#615D59]">
                  왼쪽 REV 행을 선택하면 상세 데이터, 월별 금액, 담당자 KPI와 수정 입력 폼이 열립니다.
                </div>
              ) : detailLoading ? (
                <LoadingPanel label="행 상세를 불러오는 중" />
              ) : detailError ? (
                <ErrorPanel message={detailError} />
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
                      {detail?.customer_name ?? selectedRow.customer}
                    </p>
                    <ProductCategoryPill category={selectedProductCategory} />
                  </div>
                  {selectedRow.ledgerOrigin === "draft" && (
                    <div className="mt-3 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] p-3 text-[11.5px] leading-relaxed text-[#7A520F]">
                      {selectedRow.draftKind === "edit-row"
                        ? "수정 적용 엔트리입니다. replacement/delta 계약이 확정되기 전까지 확정 매출 합계에는 더하지 않습니다."
                        : "DB 장부 신규 입력입니다. 시트 원천 갱신 전까지 이 화면에서 별도 합산해 확인합니다."}
                    </div>
                  )}
                  {selectedCustomerProductSummary.length > 0 && (
                    <div className="mt-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11.5px] font-bold text-[#111110]">고객별 SW/HW 추정</p>
                        <span className="text-[10px] font-bold text-[#615D59]">현재 선택 월</span>
                      </div>
                      <div className="space-y-2">
                        {selectedCustomerProductSummary.map((item) => (
                          <div key={item.category} className="flex items-center justify-between gap-2 text-[11px]">
                            <ProductCategoryPill category={item.category} compact />
                            <span className="font-bold text-[#111110]">{formatMoney(item.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#111110]">
                        <CalendarDays className="h-3.5 w-3.5 text-[#084734]" />
                        {formatMonthLabel(draftForm.month || selectedMonth)} 분해
                      </p>
                      <span className="text-[10.5px] font-bold text-[#615D59]">선택 월</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["합계", selectedRowMonthTotal, "text-[#111110]"],
                        ["확정", selectedRowMonthConfirmed, "text-[#084734]"],
                        ["고확도", selectedRowMonthHighConfidence, "text-[#1E5DA8]"],
                        ["예정", selectedRowMonthOpen, "text-[#A8741A]"],
                      ].map(([label, value, tone]) => (
                        <div key={String(label)} className="rounded-md bg-white px-2.5 py-2">
                          <p className="text-[10px] font-bold text-[#A39E98]">{label}</p>
                          <p className={`mt-0.5 text-[12px] font-bold ${tone}`}>{formatMoney(Number(value))}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-[#615D59]">
                        <ListChecks className="h-3.5 w-3.5" />
                        주차별 입력
                      </p>
                      <SelectedWeekBars weeks={selectedRowWeekProjection} />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => selectLens("kpi")}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 text-[11px] font-bold text-[#084734] transition hover:bg-[#D1FAE5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                    >
                      <Users className="h-3.5 w-3.5" />
                      KPI 보기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("")
                        setManagerFilter(selectedRow.manager ?? "ALL")
                        setRegionFilter("ALL")
                        setRevPage(1)
                      }}
                      disabled={!selectedRow.manager}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Table2 className="h-3.5 w-3.5" />
                      담당 REV
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {DRAFT_OPERATIONS.slice(0, 4).map((operation) => (
                      <button
                        key={operation.id}
                        type="button"
                        onClick={() => prepareDraftOperation(operation.id)}
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                      >
                        {operation.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    {[
                      ["담당자", detail?.manager ?? selectedRow.manager ?? "-"],
                      ["팀", detail?.team ?? selectedRow.team ?? "-"],
                      ["지역", detail?.region ?? selectedRow.region ?? "-"],
                      ["유형", detail?.status ?? selectedRow.status ?? "-"],
                      ["채널", detail?.deal_type ?? selectedRow.dealType ?? "-"],
                      ["제품", detail?.product_version ?? selectedRow.productVersion ?? "-"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md bg-[#FAFAF8] px-2.5 py-2">
                        <p className="text-[#A39E98]">{label}</p>
                        <p className="mt-1 truncate font-bold text-[#111110]">{value}</p>
                      </div>
                    ))}
                  </div>

                  {selectedMember && (
                    <div className="mt-3 rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] p-3">
                      <p className="text-[12px] font-bold text-[#084734]">{selectedMember.member} KPI</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#084734]">
                        <span>달성률 {formatPercent(selectedMember.achievement_pct)}</span>
                        <span>딜 {selectedMember.deals_confirmed}/{selectedMember.deals_total}</span>
                        <span>신규 {selectedMember.new_renew.new}</span>
                        <span>갱신 {selectedMember.new_renew.renew}</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <p className="mb-2 text-[12px] font-bold text-[#111110]">월별 금액</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {selectedMonthAmounts.map((month) => (
                        <button
                          key={month.value}
                          type="button"
                          onClick={() => setDraftForm((current) => ({
                            ...current,
                            month: month.value,
                            amount: month.amount ? String(Math.round(month.amount)) : current.amount,
                          }))}
                          className={`rounded-md border px-2 py-2 text-left transition ${
                            draftForm.month === month.value
                              ? "border-[#084734] bg-[#ECFDF5]"
                              : month.amount > 0
                                ? "border-[rgba(0,0,0,0.08)] bg-white hover:bg-[#FAFAF8]"
                                : "border-[rgba(0,0,0,0.05)] bg-[#FAFAF8] text-[#A39E98]"
                          }`}
                        >
                          <p className="text-[10px] font-bold text-[#615D59]">{month.label}</p>
                          <p className="mt-1 text-[11px] font-bold text-[#111110]">{formatMoney(month.amount)}</p>
                          {month.amount > 0 && (
                            <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-[#F0F0EC]" aria-label={`${month.label} 금액 분해`}>
                              <span
                                className="bg-[#084734]"
                                style={{ width: `${Math.min(100, (month.confirmed / month.amount) * 100)}%` }}
                              />
                              <span
                                className="bg-[#1E5DA8]"
                                style={{ width: `${Math.min(100, (month.highConfidence / month.amount) * 100)}%` }}
                              />
                              <span className="flex-1 bg-[#A8741A]" />
                            </span>
                          )}
                          {(month.confirmed > 0 || month.highConfidence > 0 || month.red) && (
                            <p className="mt-1 text-[9px] font-bold text-[#084734]">
                              {month.red ? "확정" : month.highConfidence > 0 ? "고확도" : "확인"}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
          )}

          {railView === "input" && (
          <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
            <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-bold text-[#111110]">입력 / 수정</p>
                  <p className="mt-1 text-[11px] text-[#615D59]">
                    {editingDraft
                      ? `${editingDraft.customer || "초안"} 항목을 다시 수정하는 중입니다.`
                      : `${queueMode === "server" ? "서버 큐" : "로컬 fallback"}에 검토 초안으로 저장됩니다.`}
                  </p>
                </div>
                {editingDraft && (
                  <span className="shrink-0 rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[10px] font-bold text-[#7A520F]">
                    편집 중
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-2">
                <p className="mb-2 text-[11px] font-bold text-[#615D59]">작업 유형</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {DRAFT_OPERATIONS.map((operation) => (
                    <button
                      key={operation.id}
                      type="button"
                      onClick={() => setDraftForm((current) => ({ ...current, operation: operation.id }))}
                      className={`min-h-9 rounded-md px-2 py-1.5 text-left text-[11px] font-bold transition ${
                        draftForm.operation === operation.id
                          ? "bg-[#111110] text-white"
                          : "border border-[rgba(0,0,0,0.08)] bg-white text-[#615D59] hover:text-[#111110]"
                      }`}
                    >
                      {operation.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-[#615D59]">{selectedDraftOperation.description}</p>
              </div>
              <label className="block text-[11px] font-bold text-[#615D59]">
                고객/계정
                <input
                  value={draftForm.customer}
                  onChange={(event) => setDraftForm((current) => ({ ...current, customer: event.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] font-bold text-[#615D59]">
                  담당자
                  <input
                    value={draftForm.manager}
                    onChange={(event) => setDraftForm((current) => ({ ...current, manager: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
                  />
                </label>
                <label className="block text-[11px] font-bold text-[#615D59]">
                  팀
                  <select
                    value={draftForm.team}
                    onChange={(event) => setDraftForm((current) => ({ ...current, team: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    {TEAMS.filter((value) => value !== "ALL").map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] font-bold text-[#615D59]">
                  상품군
                  <select
                    value={draftForm.productCategory}
                    onChange={(event) => setDraftForm((current) => ({
                      ...current,
                      productCategory: event.target.value as Exclude<RevProductCategory, "all">,
                    }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    {REV_PRODUCT_FILTERS.filter((item) => item.id !== "all").map((item) => (
                      <option key={item.id} value={item.id}>{productCategoryMeta(item.id).label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] font-bold text-[#615D59]">
                  주차
                  <select
                    value={draftForm.week}
                    onChange={(event) => setDraftForm((current) => ({ ...current, week: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    <option value="month">월합계</option>
                    {[1, 2, 3, 4, 5].map((week) => <option key={week} value={`w${week}`}>W{week}</option>)}
                  </select>
                </label>
              </div>
              {draftForm.operation === "period-shift" && (
                <label className="block text-[11px] font-bold text-[#615D59]">
                  기존 월
                  <select
                    value={draftForm.fromMonth}
                    onChange={(event) => setDraftForm((current) => ({ ...current, fromMonth: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] font-bold text-[#615D59]">
                  {draftForm.operation === "period-shift" ? "이동 월" : "월"}
                  <select
                    value={draftForm.month}
                    onChange={(event) => setDraftForm((current) => ({ ...current, month: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[12px] font-semibold text-[#111110] outline-none"
                  >
                    {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="block text-[11px] font-bold text-[#615D59]">
                  금액
                  <input
                    value={draftForm.amount}
                    onChange={(event) => setDraftForm((current) => ({ ...current, amount: event.target.value }))}
                    inputMode="numeric"
                    aria-invalid={draftAmountInvalid}
                    className={`mt-1 h-9 w-full rounded-md border bg-[#FAFAF8] px-3 text-right text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734] ${
                      draftAmountInvalid ? "border-[#DC2626]" : "border-[rgba(0,0,0,0.08)]"
                    }`}
                  />
                </label>
              </div>
              {draftForm.operation === "quantity-change" && (
                <label className="block text-[11px] font-bold text-[#615D59]">
                  예상 수량
                  <input
                    value={draftForm.quantity}
                    onChange={(event) => setDraftForm((current) => ({ ...current, quantity: event.target.value }))}
                    inputMode="numeric"
                    aria-invalid={draftQuantityInvalid}
                    className={`mt-1 h-9 w-full rounded-md border bg-[#FAFAF8] px-3 text-right text-[12px] font-semibold text-[#111110] outline-none focus:border-[#084734] ${
                      draftQuantityInvalid ? "border-[#DC2626]" : "border-[rgba(0,0,0,0.08)]"
                    }`}
                  />
                </label>
              )}
              {(draftForm.operation === "period-shift" || draftForm.operation === "quantity-change") && (
                <div className="rounded-lg border border-[#ECD29C] bg-[#FBF1E0] p-3 text-[11.5px] leading-relaxed text-[#7A520F]">
                  {draftForm.operation === "period-shift"
                    ? `${formatMonthLabel(draftForm.fromMonth || selectedMonth)} -${formatMoney(safeAmount(draftForm.amount))} → ${formatMonthLabel(draftForm.month || selectedMonth)} +${formatMoney(safeAmount(draftForm.amount))}`
                    : `${productCategoryMeta(draftForm.productCategory).label} · 수량 ${draftForm.quantity || "-"} · 금액 ${formatMoney(safeAmount(draftForm.amount))}`}
                </div>
              )}
              <label className="block text-[11px] font-bold text-[#615D59]">
                메모 / 체크
                <textarea
                  value={draftForm.note}
                  onChange={(event) => setDraftForm((current) => ({ ...current, note: event.target.value }))}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3 py-2 text-[12px] leading-relaxed text-[#111110] outline-none focus:border-[#084734]"
                />
              </label>
              {draftFormInvalid && (
                <p className="rounded-md border border-[#F5C2C2] bg-[#FFF5F5] px-3 py-2 text-[11px] font-semibold text-[#B42318]" role="alert">
                  고객명과 0보다 큰 금액을 입력해야 저장할 수 있습니다.
                </p>
              )}
              {editingDraft ? (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => void saveEditedDraft()}
                    disabled={draftSaving || draftFormInvalid}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    초안 업데이트
                  </button>
                  <button
                    type="button"
                    onClick={cancelDraftEdit}
                    disabled={draftSaving}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="초안 편집 취소"
                    title="초안 편집 취소"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void saveDraft("edit-row")}
                    disabled={draftSaving || !canCreateEditDraft || draftFormInvalid}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 text-[12px] font-bold text-[#084734] transition hover:bg-[#D1FAE5] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    수정 초안
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveDraft("new-row")}
                    disabled={draftSaving || draftFormInvalid}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    신규 입력
                  </button>
                </div>
              )}
            </div>
          </section>
          )}

          {railView === "queue" && (
          <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
            <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                <AlertTriangle className="h-4 w-4 text-[#A8741A]" />
                체크 큐
              </p>
            </div>
            <div className="p-4">
              <DraftQueue
                drafts={drafts}
                mode={queueMode}
                loading={queueLoading}
                error={queueError}
                onReload={() => void reloadDrafts()}
                onEdit={editDraft}
                onToggle={toggleDraft}
                onApply={applyDraft}
                onDelete={deleteDraft}
              />
            </div>
          </section>
          )}
          </>
        </aside>
        )}
      </main>
    </div>
  )
}

"use client"

// SalesLedgerWorkbench(부모)와 ledger/* 자식 섹션이 함께 쓰는 공유 심볼(타입·상수·헬퍼·프레젠테이션 컴포넌트).
// 자식 섹션이 부모 파일을 역import하던 부모↔자식 순환 참조를 없애기 위해 부모에서 물리 이동했다.
// 주의: 이 파일은 ../SalesLedgerWorkbench를 import하지 않는다 — 사이클 금지.

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { ledgerMonthConfirmed, ledgerMonthSplit } from "@/lib/branch/computations/revenue-core"
import { formatMoney, formatPercent } from "@/lib/branch/ledger-format"
import type { BranchKpiMemberRow, BranchPipelineRow } from "../types"

// 포매터 SSOT는 lib/branch/ledger-format — 섹션 파일들이 shared를 단일 진입점으로 쓰도록 재수출한다.
export { formatMoney, formatPercent } from "@/lib/branch/ledger-format"

export type DraftKind = "new-row" | "edit-row"
export type DraftStatus = "draft" | "checked" | "applied" | "cancelled"

export type DraftQueueMode = "server" | "local"

export type RevProductCategory = "all" | "software" | "hardware" | "unknown"

export type DraftOperation = "forecast-add" | "period-shift" | "quantity-change" | "amount-change"
export type RevWeeklySource = "explicit" | "inferred" | "month-only" | "empty"

export interface LedgerDraft {
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

export type LedgerRevenueRow = BranchPipelineRow & {
  ledgerOrigin: "sheet" | "draft"
  draftId?: string
  draftKind?: DraftKind
  draftMonth?: string
  draftNote?: string
  draftMetadata?: Record<string, unknown>
  sourceDealId?: string
  /** 수정초안 오버라이드로 색 맵을 로컬 삭제한 파생 행이 원본의 색 보유 여부를 보존하는 힌트
      (lib/branch/computations/revenue-core.ts 캐논 무색상 폴백 판정용). */
  confidenceColorHint?: boolean
}

export type DraftConfidence = "expected" | "high-confidence" | "confirmed"

export interface DraftForm {
  operation: DraftOperation
  customer: string
  manager: string
  team: string
  productCategory: Exclude<RevProductCategory, "all">
  month: string
  fromMonth: string
  week: string
  confidence: DraftConfidence
  amount: string
  quantity: string
  note: string
}

export const DRAFT_CONFIDENCE_OPTIONS: Array<{ id: DraftConfidence; label: string }> = [
  { id: "expected", label: "예정" },
  { id: "high-confidence", label: "고확도" },
  { id: "confirmed", label: "확정" },
]

export interface KpiMetricView {
  metric: string
  goal: number
  actual: number
  pct: number
}

export interface RevWeekPoint {
  week: string
  confirmed: number
  highConfidence: number
  open: number
  inferred: number
  monthlyOnly: number
  total: number
  rows: number
}

export interface RevWeeklySplit {
  source: RevWeeklySource
  weeks: number[]
  total: number
}

// 다중월 매트릭스 셀 1칸의 확도 분해. total = confirmed + high + open (불변식).
export interface RevMonthlyBucket {
  total: number
  confirmed: number
  high: number
  open: number
}

// 모바일 카드·데스크톱 테이블이 공유하는 행 단위 파생값. 두 렌더가 각자 계산하던
// draftRow/productCategory/weeklySplit/monthAmount/mismatch를 한 번만 계산해 재사용한다.
export interface RevRowView {
  row: LedgerRevenueRow
  draftRow: boolean
  productCategory: Exclude<RevProductCategory, "all">
  weeklySplit: RevWeeklySplit
  monthAmount: number
  monthConfirmedAmount: number
  mismatch: { weekly: number; monthly: number; diff: number } | null
  // 다중월 매트릭스용: 회계연도 12개월 각 셀 버킷 + 행 연간 합계(행 1패스 캐시).
  monthlyByMonth: Record<string, RevMonthlyBucket>
  annual: RevMonthlyBucket
}

// 같은 고객(normalizedAccountKey — lib/branch/account-key.ts SSOT)의 HW/SW/미분류 행 묶음.
// REV 테이블은 이 그룹 단위로 페이지네이션·아코디언을 돌리고, 하위 행은 그룹을 펼쳤을 때 노출된다.
export interface RevCustomerGroup {
  key: string
  customer: string
  rows: LedgerRevenueRow[]
  monthTotal: number
  monthConfirmed: number
  revenueTotal: number
  weeks: number[]
  hasExplicitWeeks: boolean
  monthOnlyAmount: number
  categoryTotals: Record<Exclude<RevProductCategory, "all">, number>
  categories: Array<Exclude<RevProductCategory, "all">>
  // 고객 펼침 시 카테고리(HW/SW)별 합산 1행을 그리기 위한 12개월 소계 + 연간 소계(카테고리 존재시만).
  categoryMonthly: Partial<Record<Exclude<RevProductCategory, "all">, Record<string, RevMonthlyBucket>>>
  categoryAnnual: Partial<Record<Exclude<RevProductCategory, "all">, RevMonthlyBucket>>
  managers: string[]
  teams: string[]
  regions: string[]
  hasDraft: boolean
  // 검수 배지: selectedMonth가 아니라 표시 열(12개월) 전체에서 주차↔월 불일치가 있는
  // 딜 행 수. mismatchMonths는 불일치가 발견된 달들(회계연도 순 정렬) — 가장 이른 문제월 표시용.
  mismatchCount: number
  mismatchMonths: string[]
  // 다중월 매트릭스: 회계연도 12개월 각각의 확도 분해 + 연간 합계(그룹 1패스 계산).
  monthlyTotals: Record<string, RevMonthlyBucket>
  annualTotal: RevMonthlyBucket
}

export interface KpiMemberView {
  row: BranchKpiMemberRow
  metrics: KpiMetricView[]
  activityGoal: number
  activityActual: number
  activityPct: number
}

export const REV_PRODUCT_FILTERS: Array<{ id: RevProductCategory; label: string }> = [
  { id: "all", label: "상품 전체" },
  { id: "software", label: "SW" },
  { id: "hardware", label: "HW" },
]

export const DRAFT_OPERATIONS: Array<{ id: DraftOperation; label: string; description: string }> = [
  { id: "forecast-add", label: "예상 매출 추가", description: "새 고객 또는 기존 고객의 예상 금액을 큐에 올립니다." },
  { id: "period-shift", label: "기간 이동", description: "예상 매출이 다른 월/주차로 밀릴 때 사용합니다." },
  { id: "quantity-change", label: "예상 수량 변경", description: "라이선스/장비 수량 변화와 금액 변경을 함께 남깁니다." },
  { id: "amount-change", label: "금액 수정", description: "기존 REV 행의 금액 보정 초안을 만듭니다." },
]

export function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-")
  return `${year}.${Number(month)}`
}

export function formatDateTime(value: string | null | undefined) {
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

export function productCategoryMeta(category: RevProductCategory) {
  if (category === "software") {
    return {
      label: "SW",
      shortLabel: "SW",
      className: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
      color: "#084734",
    }
  }
  if (category === "hardware") {
    return {
      label: "HW",
      shortLabel: "HW",
      className: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
      color: "#A8741A",
    }
  }
  if (category === "unknown") {
    // 과거 저장 데이터 호환용 — 신규 분류는 HW 아니면 전부 SW.
    return {
      label: "SW",
      shortLabel: "SW",
      className: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
      color: "#084734",
    }
  }
  return {
    label: "전체",
    shortLabel: "전체",
    className: "border-[rgba(0,0,0,0.08)] bg-white text-[#615D59]",
    color: "#615D59",
  }
}

export function ProductCategoryPill({ category, compact = false }: { category: RevProductCategory; compact?: boolean }) {
  const meta = productCategoryMeta(category)
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>
      {compact ? meta.shortLabel : meta.label}
    </span>
  )
}

export function kpiStatusTone(pct: number) {
  if (pct >= 100) return { label: "초과", className: "bg-[#ECFDF5] text-[#084734]" }
  if (pct >= 75) return { label: "순항", className: "bg-[#F6F5F4] text-[#615D59]" }
  return { label: "주의", className: "bg-[#FBF1E0] text-[#7A520F]" }
}

export function safeAmount(value: string) {
  const normalized = value.replace(/[^\d.-]/g, "")
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : 0
}

// ── REV 행 단위 파생 헬퍼 (워크벤치에서 물리 이동, 2026-07-16 역할 재배분) ──
// buildRevWeekProjection을 KR Team 개요(sections/RevenueFlowSection)가 함께 소비하게 되면서
// 부모(SalesLedgerWorkbench) 역import 없이 공유하도록 의존 클로저째로 이 파일에 둔다.

export function mapNumberValue(map: Record<string, number> | null | undefined, key: string) {
  const value = Number(map?.[key] ?? 0)
  return Number.isFinite(value) ? value : 0
}

export function rowMonthAmount(row: LedgerRevenueRow, month: string) {
  const mapped = mapNumberValue(row.monthlyPayments, month)
  if (mapped > 0) return mapped
  if (row.ledgerOrigin === "draft" && row.draftMonth === month) return row.revenue
  return 0
}

// '확정'의 산식은 rev-confirmed.ts 캐논 단일 정의를 revenue-core 경유로 소비한다(마스터플랜 C2).
// 시트행은 캐논 전체 규칙(확정맵→red→무색상 과거월 폴백 — 직접 맵 합산의 과소집계 방지),
// 적용 초안행(ledgerOrigin==="draft")은 확도 맵(appliedDraftConfidenceMaps)이 정본이라
// 무색상 폴백이 꺼진다 — 예정 입력이 적용 즉시 확정으로 인플레되지 않는다.
export function rowMonthConfirmed(row: LedgerRevenueRow, month: string) {
  return ledgerMonthConfirmed(row, month, rowMonthAmount(row, month))
}

export function rowMonthHighConfidence(row: LedgerRevenueRow, month: string) {
  return ledgerMonthSplit(row, month, rowMonthAmount(row, month)).highConfidence
}

function firstPaymentWeekIndex(firstPayment: string | null | undefined, month: string) {
  if (!firstPayment?.startsWith(month)) return null
  const day = Number(firstPayment.slice(8, 10))
  if (!Number.isFinite(day) || day <= 0) return null
  return Math.min(4, Math.max(0, Math.ceil(day / 7) - 1))
}

export function rowWeeklySplit(row: LedgerRevenueRow, month: string): RevWeeklySplit {
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

export function buildRevWeekProjection(rows: LedgerRevenueRow[], month: string): RevWeekPoint[] {
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

export function WeeklySourceBadge({ source }: { source: RevWeeklySource }) {
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

// 주차 셀용 축약 숫자 — 시트처럼 원시 수치를 그대로 읽을 수 있게 ¥ 기호 없이 표기.
// 1만 미만은 콤마 정수, 이상은 "N.N만"(10만 이상은 소수 생략)으로 칸 폭을 지킨다.
export function formatWeekAmount(value: number) {
  if (value >= 100_000) return `${(value / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만`
  if (value >= 10_000) return `${(value / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만`
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })
}

// W1~W5 실수치 5칸. explicit=진한 숫자, inferred(일자 추정)=회색 숫자,
// month-only=월합계만 배지+금액, empty=점 5개. 시트 검수용이라 막대 대신 숫자를 그대로 노출한다.
export function WeekNumbersCell({
  weeks,
  inferred = false,
  monthOnlyAmount = 0,
}: {
  weeks: number[]
  inferred?: boolean
  monthOnlyAmount?: number
}) {
  const hasWeeks = weeks.some((value) => value > 0)
  if (!hasWeeks && monthOnlyAmount > 0) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className="rounded bg-[#FBF1E0] px-1.5 py-0.5 text-[9.5px] font-bold text-[#7A520F]">월합계만</span>
        <span className="text-[11px] font-bold tabular-nums text-[#7A520F]">{formatWeekAmount(monthOnlyAmount)}</span>
      </div>
    )
  }
  if (!hasWeeks) {
    return (
      <div className="grid grid-cols-5 gap-1 text-right text-[10.5px] tabular-nums text-[#DDD9D3]">
        {weeks.map((_, index) => (
          <span key={index}>·</span>
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-5 items-center gap-1 text-right tabular-nums">
      {weeks.map((value, index) => (
        <span
          key={index}
          title={`W${index + 1} ${formatMoney(value)}`}
          className={`text-[10.5px] leading-tight ${
            value > 0 ? (inferred ? "font-semibold text-[#615D59]" : "font-bold text-[#111110]") : "text-[#DDD9D3]"
          }`}
        >
          {value > 0 ? formatWeekAmount(value) : "·"}
        </span>
      ))}
    </div>
  )
}

export function DonutGauge({
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
        {goal && <p className="mt-0.5 text-[10.5px] text-[#615D59]">{goal}</p>}
      </div>
    </div>
  )
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-[rgba(0,0,0,0.08)] bg-white text-[13px] font-semibold text-[#615D59]">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}

// recharts 사용 차트 7종은 별도 모듈로 분리해 기본 렌즈(REV)의 초기 번들에서 recharts를 제거한다.
// DSH/KPI 렌즈에서만 실제로 렌더되므로 지연 로드해도 체감 지연이 없다.
export const PacingChart = dynamic(() => import("../SalesLedgerCharts").then((m) => m.PacingChart), {
  ssr: false,
  loading: () => <LoadingPanel label="차트를 불러오는 중" />,
})

export const MemberBarChart = dynamic(() => import("../SalesLedgerCharts").then((m) => m.MemberBarChart), {
  ssr: false,
  loading: () => <LoadingPanel label="차트를 불러오는 중" />,
})

export const RevWeekForecastChart = dynamic(() => import("../SalesLedgerCharts").then((m) => m.RevWeekForecastChart), {
  ssr: false,
  loading: () => <LoadingPanel label="주차별 차트를 불러오는 중" />,
})

export const KpiTeamChart = dynamic(() => import("../SalesLedgerCharts").then((m) => m.KpiTeamChart), {
  ssr: false,
  loading: () => <LoadingPanel label="팀 차트를 불러오는 중" />,
})

export const KpiActivityChart = dynamic(() => import("../SalesLedgerCharts").then((m) => m.KpiActivityChart), {
  ssr: false,
  loading: () => <LoadingPanel label="활동 차트를 불러오는 중" />,
})

export const KpiGapChart = dynamic(() => import("../SalesLedgerCharts").then((m) => m.KpiGapChart), {
  ssr: false,
  loading: () => <LoadingPanel label="갭 차트를 불러오는 중" />,
})

export const KpiRevenueActivityScatter = dynamic(() => import("../SalesLedgerCharts").then((m) => m.KpiRevenueActivityScatter), {
  ssr: false,
  loading: () => <LoadingPanel label="산점도를 불러오는 중" />,
})

export function ChartLegend({ items }: { items: Array<{ label: string; color: string; dashed?: boolean }> }) {
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

export interface BreakdownNumbersRow {
  id: string
  label: React.ReactNode
  confirmed: number
  highConfidence: number
  open: number
  total: number
  count: number
  // 상위 행의 분해(예: SW 하위 유형)라 합계 행에서 다시 더하면 이중 계산되는 행.
  excludeFromTotals?: boolean
}

export function numberCell(value: number, tone = "text-[#111110]") {
  if (value <= 0) return <span className="font-semibold text-[#C9C5BF]">–</span>
  return <span className={`font-bold ${tone}`}>{formatMoney(value)}</span>
}

export function BreakdownNumbersTable({ rows, emptyLabel }: { rows: BreakdownNumbersRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-3 text-[11px] leading-relaxed text-[#615D59]">
        {emptyLabel}
      </div>
    )
  }
  const totals = rows.filter((row) => !row.excludeFromTotals).reduce(
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
              <td className="px-2 py-2">{numberCell(row.confirmed, CONFIDENCE_TOKENS.confirmed.textClass)}</td>
              <td className="px-2 py-2">{numberCell(row.highConfidence, CONFIDENCE_TOKENS["high-confidence"].textClass)}</td>
              <td className="px-2 py-2">{numberCell(row.open, CONFIDENCE_TOKENS.expected.textStrongClass)}</td>
              <td className="px-2 py-2">{numberCell(row.total)}</td>
              <td className="py-2 pl-2 font-semibold text-[#615D59]">{row.count}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] text-[12px]">
            <td className="py-2 pr-2 text-left font-bold text-[#111110]">합계</td>
            <td className="px-2 py-2">{numberCell(totals.confirmed, CONFIDENCE_TOKENS.confirmed.textClass)}</td>
            <td className="px-2 py-2">{numberCell(totals.highConfidence, CONFIDENCE_TOKENS["high-confidence"].textClass)}</td>
            <td className="px-2 py-2">{numberCell(totals.open, CONFIDENCE_TOKENS.expected.textStrongClass)}</td>
            <td className="px-2 py-2">{numberCell(totals.total)}</td>
            <td className="py-2 pl-2 font-bold text-[#111110]">{totals.count}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export function RevWeekNumbersTable({
  data,
  month,
  monthGoal,
  monthRowCount,
}: {
  data: RevWeekPoint[]
  month: string
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
  // 월 목표를 일수 비중으로 주차에 분배한 누적 목표선(pace).
  // W1=1~7일 … W5=29일~말일. 누적 달성률이 pace보다 뒤지면 경고 톤.
  const [paceYear, paceMonth] = month.split("-").map(Number)
  const daysInMonth = Number.isFinite(paceYear) && Number.isFinite(paceMonth)
    ? new Date(Date.UTC(paceYear, paceMonth, 0)).getUTCDate()
    : 30
  const paceRatios = data.map((_, index) => Math.min((index + 1) * 7, daysInMonth) / daysInMonth)
  const paceAmounts = monthGoal != null && monthGoal > 0 ? paceRatios.map((ratio) => monthGoal * ratio) : null
  const seriesRows = [
    // 확도 3단은 CONFIDENCE_TOKENS SSOT 소비(밀도 표라 예정은 강조 변형) — 일자 추정·월합계만은 확도가 아니라 중립 유지.
    { key: "confirmed" as const, label: CONFIDENCE_TOKENS.confirmed.label, tone: CONFIDENCE_TOKENS.confirmed.textClass },
    { key: "highConfidence" as const, label: CONFIDENCE_TOKENS["high-confidence"].label, tone: CONFIDENCE_TOKENS["high-confidence"].textClass },
    { key: "open" as const, label: CONFIDENCE_TOKENS.expected.label, tone: CONFIDENCE_TOKENS.expected.textStrongClass },
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
          {paceAmounts && (
            <tr className="border-t border-[#F0F0EC] text-[11px]">
              <td className="py-2 pr-2 text-left font-bold text-[#615D59]">누적 목표(pace)</td>
              {data.map((week, index) => (
                <td key={`pace-${week.week}`} className="px-2 py-2">
                  <p className="font-semibold text-[#615D59]">{formatMoney(paceAmounts[index])}</p>
                  <p className="mt-0.5 text-[9.5px] font-semibold text-[#615D59]">{formatPercent(paceRatios[index] * 100)}</p>
                </td>
              ))}
              <td className="py-2 pl-2 font-semibold text-[#615D59]">{formatMoney(monthGoal ?? 0)}</td>
            </tr>
          )}
          <tr className="border-t border-[#F0F0EC]">
            <td className="py-2 pr-2 text-left font-bold text-[#615D59]">누적{monthGoal != null && monthGoal > 0 ? " · 달성률" : ""}</td>
            {data.map((week, index) => {
              const behindPace = paceAmounts ? cumulative[index] < paceAmounts[index] : false
              return (
                <td key={`cum-${week.week}`} className="px-2 py-2">
                  <p className="font-bold text-[#111110]">{formatMoney(cumulative[index])}</p>
                  {monthGoal != null && monthGoal > 0 && (
                    <p className={`mt-0.5 text-[9.5px] font-bold ${behindPace ? "text-[#B43E3E]" : "text-[#084734]"}`}>
                      {formatPercent((cumulative[index] / monthGoal) * 100)}
                    </p>
                  )}
                </td>
              )
            })}
            <td className="py-2 pl-2">
              <p className="font-bold text-[#111110]">{formatMoney(monthTotal)}</p>
              {monthGoal != null && monthGoal > 0 && (
                <p className={`mt-0.5 text-[9.5px] font-bold ${monthTotal < monthGoal ? "text-[#B43E3E]" : "text-[#084734]"}`}>
                  {formatPercent((monthTotal / monthGoal) * 100)}
                </p>
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

export interface MonthlyPlanRow {
  month: string
  goal: number
  actual: number
  trend: number
  goalCum: number
  actualCum: number
  trendCum: number
  confirmed: boolean
}

export interface WeeklyCloseRunView {
  id: string
  startedAt: string
  sourceName: string
  rowCounts: Record<string, number>
  dataSource: string
}

export type WeeklyCloseBucketId = "new" | "increased" | "decreased" | "dropped" | "unchanged"

export interface WeeklyCloseBucketView {
  count: number
  baseAmount: number
  headAmount: number
  delta: number
}

export interface WeeklyCloseDiffView {
  month: string
  baseTotal: number
  headTotal: number
  delta: number
  buckets: Record<WeeklyCloseBucketId, WeeklyCloseBucketView>
  confirmedDelta: number
  highConfidenceDelta: number
  movers: Array<{
    key: string
    account: string
    team: string | null
    manager: string | null
    baseAmount: number
    headAmount: number
    delta: number
    bucket: WeeklyCloseBucketId
  }>
}

export const WEEKLY_CLOSE_BUCKET_META: Array<{ id: WeeklyCloseBucketId; label: string; tone: string }> = [
  { id: "new", label: "신규", tone: "text-[#084734]" },
  { id: "increased", label: "증액", tone: "text-[#1E5DA8]" },
  { id: "decreased", label: "감액", tone: "text-[#A8741A]" },
  { id: "dropped", label: "소멸", tone: "text-[#B43E3E]" },
  { id: "unchanged", label: "유지", tone: "text-[#615D59]" },
]

export function formatSignedMoney(value: number) {
  if (value === 0) return "±0"
  const sign = value > 0 ? "+" : "-"
  return `${sign}${formatMoney(Math.abs(value))}`
}

export function DshMonthlyNumbersTable({ rows, selectedMonth }: { rows: MonthlyPlanRow[]; selectedMonth: string }) {
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
              ? "text-[#615D59]"
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
                  {!row.confirmed && <span className="ml-1.5 text-[9.5px] font-semibold text-[#615D59]">예상 구간</span>}
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

export function KpiBottleneckMatrix({
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
                      <span className="mt-0.5 block text-[10px] text-[#615D59]">
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

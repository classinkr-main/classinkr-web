"use client"

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowDownNarrowWide,
  ArrowDownRight,
  ArrowUpNarrowWide,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Gauge,
  ListChecks,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Table2,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { adminFetchJson, clearBranchRequestCache, useBranchJson } from "./client-api"
import { normalizedAccountKey } from "@/lib/branch/account-key"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { ledgerMonthSplit, ledgerRowHasColor } from "@/lib/branch/computations/revenue-core"
import { dealHasColorData, splitMonthConfidence } from "@/lib/branch/computations/rev-confirmed"
import { formatMoney, formatPercent } from "@/lib/branch/ledger-format"
// ledger/ 섹션 파일들이 워크벤치를 단일 진입점으로 import — 포매터 SSOT는 lib/branch/ledger-format
export { formatMoney, formatPercent } from "@/lib/branch/ledger-format"
import {
  classifySalesLedgerProductCategory,
  classifySalesLedgerSoftwareSubtype,
  type SalesLedgerSoftwareSubtype,
} from "@/lib/branch/product-category"
import {
  PERIODS,
  TEAMS,
  type BranchKpiResponse,
  type BranchPipelineResponse,
  type BranchSummaryResponse,
  type Period,
  type Team,
} from "./types"
import { DshNumericGrid, type DshGridView } from "./ledger/DshNumericGrid"
import { WeeklyCloseSection } from "./ledger/WeeklyCloseSection"
import { RevAuxAnalysisSection } from "./ledger/RevAuxAnalysisSection"
import { RevMobileList } from "./ledger/RevMobileList"
import IntegrityStrip from "./IntegrityStrip"
import { InputRailSection } from "./ledger/InputRailSection"
import {
  buildRevWeekProjection,
  DRAFT_CONFIDENCE_OPTIONS,
  DRAFT_OPERATIONS,
  formatDateTime,
  formatMonthLabel,
  formatWeekAmount,
  LoadingPanel,
  mapNumberValue,
  productCategoryMeta,
  ProductCategoryPill,
  REV_PRODUCT_FILTERS,
  rowMonthAmount,
  rowMonthConfirmed,
  rowMonthHighConfidence,
  rowWeeklySplit,
  safeAmount,
  WeekNumbersCell,
  type BreakdownNumbersRow,
  type DraftConfidence,
  type DraftForm,
  type DraftKind,
  type DraftOperation,
  type DraftQueueMode,
  type DraftStatus,
  type LedgerDraft,
  type LedgerRevenueRow,
  type MonthlyPlanRow,
  type RevCustomerGroup,
  type RevMonthlyBucket,
  type RevProductCategory,
  type RevRowView,
  type RevWeekPoint,
  type WeeklyCloseDiffView,
  type WeeklyCloseRunView,
} from "./ledger/shared"
// 공유 심볼은 ./ledger/shared로 물리 이동 — 기존 소비자의 import 표면 유지를 위한 재수출.
export {
  BreakdownNumbersTable,
  ChartLegend,
  DonutGauge,
  DRAFT_CONFIDENCE_OPTIONS,
  DRAFT_OPERATIONS,
  DshMonthlyNumbersTable,
  formatDateTime,
  formatMonthLabel,
  formatSignedMoney,
  formatWeekAmount,
  KpiActivityChart,
  KpiBottleneckMatrix,
  KpiGapChart,
  KpiRevenueActivityScatter,
  KpiTeamChart,
  kpiStatusTone,
  LoadingPanel,
  MemberBarChart,
  numberCell,
  PacingChart,
  ProductCategoryPill,
  productCategoryMeta,
  REV_PRODUCT_FILTERS,
  RevWeekForecastChart,
  RevWeekNumbersTable,
  safeAmount,
  WEEKLY_CLOSE_BUCKET_META,
  WeeklySourceBadge,
  WeekNumbersCell,
} from "./ledger/shared"
export type {
  BreakdownNumbersRow,
  DraftForm,
  DraftKind,
  DraftOperation,
  DraftQueueMode,
  KpiMemberView,
  KpiMetricView,
  LedgerDraft,
  LedgerRevenueRow,
  MonthlyPlanRow,
  RevCustomerGroup,
  RevProductCategory,
  RevRowView,
  RevWeekPoint,
  WeeklyCloseDiffView,
  WeeklyCloseRunView,
} from "./ledger/shared"

type LedgerLens = "dsh" | "rev"
type RailView = "detail" | "input" | "queue"
type DraftStatusFilter = DraftStatus | "open" | "all"
type RevSortKey = "customer" | "product" | "manager" | "team" | "region" | "month" | "revenue" | "annual" | "origin"
type RevSortDirection = "asc" | "desc"
type RevOriginFilter = "all" | "sheet" | "draft"
type RevForecastFilter = "all" | "has-week" | "month-only" | "confirmed" | "open" | "week-mismatch"

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

function isDraftConfidence(value: unknown): value is DraftConfidence {
  return value === "expected" || value === "high-confidence" || value === "confirmed"
}

function draftConfidenceFromMetadata(metadata: Record<string, unknown> | null | undefined): DraftConfidence {
  const raw = metadataString(metadata, "confidence")?.replace("_", "-")
  return isDraftConfidence(raw) ? raw : "expected"
}

// 적용된 초안(장부 엔트리)의 확도를 행 확도 맵으로 변환. 확도와 무관하게 전액
// monthlyConfirmed+red로 만들면 '예정' 입력도 적용 즉시 확정으로 집계된다(확정·달성률 인플레).
function appliedDraftConfidenceMaps(
  month: string,
  amount: number,
  metadata: Record<string, unknown> | null | undefined,
): Pick<LedgerRevenueRow, "monthlyConfirmed" | "monthlyHighConfidence" | "monthlyRed"> {
  const confidence = draftConfidenceFromMetadata(metadata)
  return {
    monthlyConfirmed: confidence === "confirmed" ? { [month]: amount } : {},
    monthlyHighConfidence: confidence === "high-confidence" ? { [month]: amount } : {},
    monthlyRed: confidence === "confirmed" ? { [month]: true } : {},
  }
}

// 매트릭스 1개 열(회계월) = 필터 반영 그랜드토탈 + 해당 월 목표(DSH 시리즈, 없으면 null).
interface RevMatrixColumn extends RevMonthlyBucket {
  month: string
  label: string
  current: boolean
  goal: number | null
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
  annual: "연간합계",
  origin: "상태",
}
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
  { id: "week-mismatch", label: "주차·월 합계 불일치" },
]
// 다중월 밀도 매트릭스 열 폭(px). 요약 셀 12칸×64 + 고객 200 + 상품 56 + 연간 96 ≈ 1120.
const MATRIX_CUSTOMER_W = 200
const MATRIX_PRODUCT_W = 56
const MATRIX_MONTH_W = 64
const MATRIX_WEEK_W = 52 // 월 확장(상세시트) 시 w1~w5 각 칸 — 금액 가독성 위해 넓게(가로 스크롤 허용)
const MATRIX_ANNUAL_W = 96
// 매트릭스 행 밀도(표시만 — 셀 폭·편집 로직 불변). localStorage에 저장해 재방문 시 복원.
type MatrixDensity = "condensed" | "regular" | "relaxed"
const MATRIX_DENSITY_STORAGE_KEY = "classin:rev-matrix-density"
const MATRIX_DENSITY_OPTIONS: Array<{ id: MatrixDensity; label: string; title: string }> = [
  { id: "condensed", label: "좁게", title: "행 높이를 좁혀 더 많은 행을 한 화면에 봅니다" },
  { id: "regular", label: "보통", title: "기본 행 높이" },
  { id: "relaxed", label: "넓게", title: "행 높이를 넓혀 여유 있게 봅니다" },
]
// 그룹 소계행(기본 h-8)·딜행(기본 h-7) 높이 클래스. 셀 내부 폰트 크기·패딩·sticky 배경은 그대로 둔다.
const MATRIX_GROUP_ROW_HEIGHT: Record<MatrixDensity, string> = {
  condensed: "h-6",
  regular: "h-8",
  relaxed: "h-9",
}
const MATRIX_DEAL_ROW_HEIGHT: Record<MatrixDensity, string> = {
  condensed: "h-6",
  regular: "h-7",
  relaxed: "h-9",
}
function isMatrixDensity(value: unknown): value is MatrixDensity {
  return value === "condensed" || value === "regular" || value === "relaxed"
}
// 확도 = 글자색(배경 아님). 셀 배경은 흰색 고정, 확정/고확도/불일치는 bold.
// 확도 3색은 CONFIDENCE_TOKENS SSOT 소비 — 리터럴 재정의 금지(불일치·빈 셀은 확도 아님).
const MATRIX_TONE = {
  confirmed: `font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`,
  high: `font-bold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`,
  open: `font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`,
  mixed: `font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`,
  mismatch: "font-bold text-[#B43E3E]",
  empty: "text-[#DDD9D3]",
} as const

// 셀 단일 금액의 지배 확도로 글자색을 고른다. 혼재(여러 확도 합산)면 예정 톤(월합계 요약 성격).
function matrixBucketTone(bucket: RevMonthlyBucket): keyof typeof MATRIX_TONE {
  if (bucket.total <= 0) return "empty"
  if (bucket.confirmed === bucket.total) return "confirmed"
  if (bucket.confirmed === 0 && bucket.high === bucket.total) return "high"
  if (bucket.confirmed === 0 && bucket.high === 0) return "open"
  return "mixed"
}

// 매트릭스 확도 색 레전드. 셀 글자색(MATRIX_TONE)과 1:1 대응 — 값 자체는 바꾸지 않는다.
const MATRIX_TONE_LEGEND_ITEMS: Array<{ label: string; color: string }> = [
  { label: CONFIDENCE_TOKENS.confirmed.label, color: CONFIDENCE_TOKENS.confirmed.color },
  { label: CONFIDENCE_TOKENS["high-confidence"].label, color: CONFIDENCE_TOKENS["high-confidence"].color },
  { label: CONFIDENCE_TOKENS.expected.label, color: CONFIDENCE_TOKENS.expected.color },
  { label: "불일치", color: "#B43E3E" },
]
function MatrixToneLegend() {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#615D59]">
      {MATRIX_TONE_LEGEND_ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
      <span>· 잠금=시트확정/장부반영</span>
      <span className="hidden lg:inline">· 합산 셀 주황=확도 혼합 포함</span>
      {/* 13인치(lg~xl) 랩탑에서도 단축키 힌트가 보이도록 xl→lg 하향. 편집 진입 시엔 팝오버가 셀 인근 힌트를 재노출한다. */}
      <span className="hidden text-[#A39E98] lg:inline">· Enter 편집 · Tab 이동 · Ctrl+D 아래 복사 · Ctrl+V 엑셀 붙여넣기 · Esc 취소</span>
    </span>
  )
}

const LENSES: Array<{ id: LedgerLens; label: string; description: string }> = [
  { id: "dsh", label: "DSH", description: "수치 상세 · 목표/실적 그리드" },
  { id: "rev", label: "REV", description: "주차·목표 수치 검수와 행 상세" },
]
const DRAFT_STATUS_FILTERS: Array<{ id: DraftStatusFilter; label: string }> = [
  { id: "open", label: "대기" },
  { id: "draft", label: "검토" },
  { id: "checked", label: "체크" },
  { id: "applied", label: "적용" },
  { id: "all", label: "전체" },
]

// role="tablist" 롤빙 tabIndex 키보드 내비 — BranchDashboardClient.tsx의 onTabKeyDown과
// 동일 패턴(ArrowLeft/Right/Home/End)을 두 탭리스트(렌즈, 빠른 작업 보기)가 공유하도록 일반화.
function handleRovingTabKeyDown<T>(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  index: number,
  items: T[],
  refs: MutableRefObject<Array<HTMLButtonElement | null>>,
  onSelect: (item: T, index: number) => void,
) {
  const lastIndex = items.length - 1
  let nextIndex: number | null = null

  if (event.key === "ArrowRight") nextIndex = index === lastIndex ? 0 : index + 1
  if (event.key === "ArrowLeft") nextIndex = index === 0 ? lastIndex : index - 1
  if (event.key === "Home") nextIndex = 0
  if (event.key === "End") nextIndex = lastIndex

  if (nextIndex == null) return
  event.preventDefault()
  onSelect(items[nextIndex], nextIndex)
  refs.current[nextIndex]?.focus()
}

function canRunAdminOperationsFromSession(): boolean {
  if (typeof window === "undefined") return false
  const role = sessionStorage.getItem("admin_role")?.trim().toUpperCase()
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

// REV DB-native 재동기화(POST /api/admin/branch/ledger/db-import) 응답 — RevDbImportResult 미러.
interface RevDbImportResponse {
  runId: string
  fiscalYear: number
  lineCount: number
  entryCount: number
  activated: boolean
  capturedAt: string
  deduped: boolean
}

interface RevDbImportInfo {
  runId: string
  capturedAt: string
}

// GET db-import 응답 — 서버 원장(sales_ledger_active_sources) 기준 액티브 REV 소스.
interface ActiveRevImportStatusResponse {
  active: boolean
  fiscalYear: number
  runId: string | null
  capturedAt: string | null
}

// 액티브 소스 판별의 1차 근거는 서버(GET db-import)다. localStorage는 서버 확인 전/실패 시의
// 폴백 캐시일 뿐 — 이 값만 믿고 재캡처를 체인하면 시트 모드로 되돌린 배포를 조용히 DB-native로
// 재전환할 수 있다. 서버가 비활성이라고 답하면 지운다.
const REV_DB_IMPORT_STORAGE_KEY = "classin:sales-ledger-rev-db-import:v1"

function loadStoredRevDbImport(): RevDbImportInfo | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(REV_DB_IMPORT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RevDbImportInfo> | null
    if (parsed && typeof parsed.runId === "string" && typeof parsed.capturedAt === "string") {
      return { runId: parsed.runId, capturedAt: parsed.capturedAt }
    }
  } catch {
    // 손상된 저장값은 무시 — 다음 재동기화가 다시 채운다.
  }
  return null
}

function storeRevDbImport(info: RevDbImportInfo) {
  try {
    window.localStorage.setItem(REV_DB_IMPORT_STORAGE_KEY, JSON.stringify(info))
  } catch {
    // 저장 실패(사파리 프라이빗 모드 등)해도 세션 내 상태로는 동작한다.
  }
}

function clearStoredRevDbImport() {
  try {
    window.localStorage.removeItem(REV_DB_IMPORT_STORAGE_KEY)
  } catch {
    // 폴백 캐시 정리 실패는 치명적이지 않다 — 다음 서버 확인이 다시 덮어쓴다.
  }
}

function ymKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function fiscalYearOf(date: Date): number {
  const month = date.getUTCMonth() + 1
  return month >= 4 ? date.getUTCFullYear() : date.getUTCFullYear() - 1
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

// "YYYY-MM" 문자열에 개월수를 더하고 뺀다. monthOptions(현재 회계연도 12개월)와 달리
// 연도 경계를 자유롭게 넘나든다 — REV 탭 전월/익월 스테퍼는 회계연도에 갇히면 안 된다.
function shiftMonth(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return String(a ?? "").localeCompare(String(b ?? ""), "ko", { numeric: true, sensitivity: "base" })
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
  if (stored === "hardware") return "hardware"
  // 저장값이 software든 legacy unknown이든 HW가 아니면 전부 SW로 본다.
  if (isStoredProductCategory(stored)) return "software"
  return classifySalesLedgerProductCategory({
    product: row.productVersion,
    account: row.customer,
    rawText: row.draftMetadata,
  })
}

// 고객 펼침 정렬·섹션 순서: HW 먼저, 그다음 SW, 마지막 미분류. 같은 고객 안에서
// HW/SW 품목을 묶어 보여주기 위한 랭크(안정 정렬이라 카테고리 내부 순서는 유지).
function categoryRank(category: Exclude<RevProductCategory, "all">): number {
  return category === "hardware" ? 0 : category === "software" ? 1 : 2
}

// 활성 필터 라벨링-태그. 클릭하면 그 필터만 해제된다(담당자/지역/상품/상태/유형/원천/검색 공통).
function FilterTag({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      title={`${label} 필터 해제`}
      className="inline-flex items-center gap-1 rounded-full border border-[#D8D5D0] bg-[#F6F5F4] px-2.5 py-1 font-semibold text-[#615D59] transition hover:border-[#B43E3E]/40 hover:bg-[#FCE9E9] hover:text-[#B43E3E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#084734]"
    >
      <span className="max-w-[220px] truncate">{label}</span>
      <X className="h-3 w-3 shrink-0 opacity-60" />
    </button>
  )
}

function rowMonthOpen(row: LedgerRevenueRow, month: string) {
  return ledgerMonthSplit(row, month, rowMonthAmount(row, month)).expected
}

// 매트릭스 1행×1월 파생값을 한 번에. rowMonthAmount를 4번 부르던 것을 1번으로 줄여
// 12개월×수백행 반복(그룹 소계·그랜드토탈)에서 재계산을 억제한다. total=confirmed+high+open 불변식
// (캐논 splitMonthConfidence가 클램프로 보장).
function rowMonthBucket(row: LedgerRevenueRow, month: string): RevMonthlyBucket {
  const total = rowMonthAmount(row, month)
  if (total <= 0) return { total: 0, confirmed: 0, high: 0, open: 0 }
  const split = ledgerMonthSplit(row, month, total)
  return { total, confirmed: split.confirmed, high: split.highConfidence, open: split.expected }
}

function emptyMonthlyBucket(): RevMonthlyBucket {
  return { total: 0, confirmed: 0, high: 0, open: 0 }
}

function addMonthlyBucket(target: RevMonthlyBucket, source: RevMonthlyBucket) {
  target.total += source.total
  target.confirmed += source.confirmed
  target.high += source.high
  target.open += source.open
}

function rowHasWeeklyInput(row: LedgerRevenueRow, month: string) {
  return rowWeeklySplit(row, month).source === "explicit"
}

// 주차 입력(explicit) 합계와 월 금액이 어긋난 검수 대상 행. 반올림 오차 ¥1 이내는 정상으로 본다.
// 시트에서 주차 셀만 고치고 월 합계를 안 고친(또는 반대) 케이스를 잡는 용도.
function rowWeeklyMismatch(row: LedgerRevenueRow, month: string): { weekly: number; monthly: number; diff: number } | null {
  const split = rowWeeklySplit(row, month)
  if (split.source !== "explicit") return null
  const monthly = rowMonthAmount(row, month)
  const diff = split.total - monthly
  if (Math.abs(diff) <= 1) return null
  return { weekly: split.total, monthly, diff }
}

function rowMatchesForecastFilter(row: LedgerRevenueRow, month: string, filter: RevForecastFilter) {
  if (filter === "all") return true
  const amount = rowMonthAmount(row, month)
  if (filter === "has-week") return amount > 0 && rowHasWeeklyInput(row, month)
  if (filter === "month-only") return amount > 0 && rowWeeklySplit(row, month).source === "month-only"
  if (filter === "confirmed") return rowMonthConfirmed(row, month) > 0
  if (filter === "open") return rowMonthHighConfidence(row, month) + rowMonthOpen(row, month) > 0
  if (filter === "week-mismatch") return rowWeeklyMismatch(row, month) !== null
  return true
}

// 인박스/예측 필터를 표시 열(회계연도 12개월) 전체에 적용한다. 어느 한 달이라도 조건에
// 맞으면 그 행을 통과시킨다 — selectedMonth 1개월만 검사하던 검수 사각(나머지 11개월 누락)을 없앤다.
function rowMatchesForecastFilterInMonths(row: LedgerRevenueRow, months: string[], filter: RevForecastFilter) {
  if (filter === "all") return true
  return months.some((month) => rowMatchesForecastFilter(row, month, filter))
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
    // (미사용) — DB CHECK 제약(20260630_branch_sales_ledger_drafts.sql)엔 유효 상태지만
    // 이 워크벤치 어느 동작도 초안을 cancelled로 전이시키지 않는다(직접 DB 조작 등으로만 도달).
    // 배지는 그런 행이 조회될 가능성에 대비한 방어적 렌더 — DraftStatus 타입은 DB 계약과 맞춰 유지.
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
  // "적용"은 큐에서 유일하게 비가역인 동작(DB 장부에 실제로 기록) — 확인 다이얼로그를 거친다.
  const [confirmApplyDraft, setConfirmApplyDraft] = useState<LedgerDraft | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const confirmAndApply = async (id: string) => {
    setApplyingId(id)
    try {
      await onApply(id)
    } finally {
      setApplyingId(null)
      setConfirmApplyDraft(null)
    }
  }
  // 체크토글·삭제 in-flight 표시 — InputRailSection의 draftSaving+Loader2 패턴 재사용.
  // 한 초안에 동시에 한 동작만(토글 중 삭제 클릭 등 이중 요청 방지) 진행되게 버튼도 함께 잠근다.
  const [rowActionBusy, setRowActionBusy] = useState<{ id: string; action: "toggle" | "delete" } | null>(null)
  const isRowBusy = (id: string) => rowActionBusy?.id === id || applyingId === id
  const runToggle = async (id: string) => {
    setRowActionBusy({ id, action: "toggle" })
    try {
      await onToggle(id)
    } finally {
      setRowActionBusy(null)
    }
  }
  const runDelete = async (id: string) => {
    setRowActionBusy({ id, action: "delete" })
    try {
      await onDelete(id)
    } finally {
      setRowActionBusy(null)
    }
  }

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
    <>
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
              {/* 주차 셀 초안 고지: 병합(metadata.weekly 보존) vs 레거시 단일값(월 전체 대체) 구분 */}
              {draft.kind === "edit-row" &&
                /^w[1-5]$/.test(metadataString(draft.metadata, "week") ?? "") &&
                draft.status !== "applied" &&
                draft.status !== "cancelled" &&
                (mergedWeeklyFromMetadata(draft.metadata) ? (
                  <p className="mt-1.5 rounded border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 py-1 text-[10.5px] font-semibold leading-relaxed text-[#615D59]">
                    주차 병합 초안 — 적용 시 {formatMonthLabel(draft.month)} 금액이 주차 합계 {formatMoney(draft.amount)}로 재기재됩니다 (기존 주차 보존)
                  </p>
                ) : (
                  <p className="mt-1.5 rounded border border-[#ECD29C] bg-[#FBF1E0] px-2 py-1 text-[10.5px] font-bold leading-relaxed text-[#7A520F]">
                    주차 셀 초안 — 적용 시 {formatMonthLabel(draft.month)} 금액 전체가 이 값으로 대체됩니다 (다른 주차 값 소멸)
                  </p>
                ))}
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
                onClick={() => void runToggle(draft.id)}
                disabled={draft.status === "applied" || draft.status === "cancelled" || isRowBusy(draft.id)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#084734] transition hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="초안 체크 상태 변경"
                title="초안 체크 상태 변경"
              >
                {rowActionBusy?.id === draft.id && rowActionBusy.action === "toggle" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setConfirmApplyDraft(draft)}
                disabled={draft.status !== "checked" || mode !== "server" || draft.id.startsWith("local-") || isRowBusy(draft.id)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#BDEFD8] text-[#084734] transition hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={`${draft.customer || "초안"} 적용`}
                title="체크 완료 초안 적용"
              >
                {applyingId === draft.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => void runDelete(draft.id)}
                disabled={draft.status === "checked" || draft.status === "applied" || draft.status === "cancelled" || isRowBusy(draft.id)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] text-[#B43E3E] transition hover:bg-[#FCE9E9] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="초안 삭제"
                title="초안 삭제"
              >
                {rowActionBusy?.id === draft.id && rowActionBusy.action === "delete" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
    {/* 적용 확인 다이얼로그 — TSV 붙여넣기 미리보기(RevMatrixPasteDialog)와 동일 셸 스타일 재사용. */}
    {confirmApplyDraft && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="초안 적용 확인"
        className="fixed inset-0 z-[60] flex items-end justify-center bg-[#111110]/40 p-4 sm:items-center"
        onKeyDown={(event) => {
          if (event.key === "Escape" && applyingId !== confirmApplyDraft.id) {
            event.stopPropagation()
            setConfirmApplyDraft(null)
          }
        }}
      >
        <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_24px_70px_rgba(17,17,16,0.22)]">
          <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
            <p className="text-[13px] font-bold text-[#111110]">초안 적용 확인</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
              {confirmApplyDraft.customer || "초안"} · {formatMonthLabel(confirmApplyDraft.month)} · {formatMoney(confirmApplyDraft.amount)}
            </p>
          </div>
          <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#FBF1E0] px-4 py-3 text-[11.5px] font-semibold leading-relaxed text-[#7A520F]">
            적용하면 장부 원장에 기록됩니다 — 초안 1건. 이 작업은 되돌릴 수 없습니다.
          </div>
          <div className="flex items-center justify-end gap-2 bg-[#FAFAF8] px-4 py-3">
            <button
              type="button"
              onClick={() => setConfirmApplyDraft(null)}
              disabled={applyingId === confirmApplyDraft.id}
              className="inline-flex h-9 items-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-45"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void confirmAndApply(confirmApplyDraft.id)}
              disabled={applyingId === confirmApplyDraft.id}
              autoFocus
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {applyingId === confirmApplyDraft.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              적용
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 다중월 밀도 매트릭스 (REV Phase 1 읽기 전용 → Phase 2 딜행 월 셀 인라인 편집)
// 열: [고객 200 sticky-left] [상품 56] [월 12칸×64 요약 / 확장 시 5×34] [연간 96 sticky-right]
// sticky 3방향(좌·우·하단 합계행) — 각 상태별 불투명 배경으로 비침 방지.
// ─────────────────────────────────────────────────────────────────────────

// ── Phase 2: 인라인 편집 인프라 ─────────────────────────────────────────────
// 편집은 "딜행(sourceDealId 보유) × 비확정 월" 셀만. 그룹 소계·주차 확장 칸·시트 확정 셀은 잠금.
// 커밋 1건 = createDraft 1건(새 저장경로 없음). 낙관적 표시는 drafts 배열에서 파생.

// 셀 좌표 = 행 id + 회계월. 편집가능 셀 순회(방향키/Tab)의 단위.
interface MatrixCellCoord {
  rowId: string
  month: string
  week?: number // 0~4 = 확장된 월의 w1~w5 주차 칸. 없으면 월 요약 셀.
}

// 셀 좌표 → 안정 키. 월 셀은 `rowId::month`(Phase 2와 동일), 주차 셀은 `rowId::month::wN`.
// 월 셀 키를 그대로 유지해 기존 순회/pending 매칭 회귀를 막는다.
function matrixCoordKey(coord: MatrixCellCoord): string {
  return coord.week == null ? `${coord.rowId}::${coord.month}` : `${coord.rowId}::${coord.month}::w${coord.week + 1}`
}

// 두 좌표가 같은 세로 열(같은 월·같은 주차)인지 — 아래/위 이동·fill-down 소스 판정용.
function matrixSameColumn(a: MatrixCellCoord, b: MatrixCellCoord): boolean {
  return a.month === b.month && (a.week ?? -1) === (b.week ?? -1)
}

// metadata.week 문자열("w1".."w5") → 0~4 인덱스. "month"/그 외/누락이면 null.
function weekIndexFromToken(token: string | null | undefined): number | null {
  if (!token) return null
  const match = /^w([1-5])$/.exec(token)
  return match ? Number(match[1]) - 1 : null
}

// 적용된 초안행의 weeklyPayments 구성. draft metadata.week가 wN이면 그 주차에 금액을 얹어
// { [month]: [.., amount, ..] }를 만든다(주차 합==월합이라 rowWeeklyMismatch 오탐 없음).
// week가 "month"/누락이면 주차 정보 없음 → {} (기존 동작 유지, month-only로 렌더).
function weeklyPaymentsFromWeekToken(month: string, amount: number, weekToken: string | null | undefined): Record<string, number[]> {
  const weekIdx = weekIndexFromToken(weekToken)
  if (weekIdx == null) return {}
  const weeks = Array.from({ length: 5 }, (_, index) => (index === weekIdx ? amount : 0))
  return { [month]: weeks }
}

// 주차 병합 초안의 metadata.weekly(5칸 배열) 검증·정규화. 유효하지 않으면 null.
function mergedWeeklyFromMetadata(metadata: Record<string, unknown> | null | undefined): number[] | null {
  const weekly = metadata?.weekly
  if (!Array.isArray(weekly) || weekly.length !== 5) return null
  if (!weekly.every((value) => typeof value === "number" && Number.isFinite(value))) return null
  const weeks = weekly.map((value) => Math.max(value, 0))
  return weeks.some((value) => value > 0) ? weeks : null
}

// 적용된 초안행의 weeklyPayments 복원: 주차 병합 초안(metadata.weekly)이 있으면 그 배열을
// 그대로(단일 주차 토큰보다 우선) 쓴다 — explicit 주차 행의 주차 셀 편집이 나머지 주차를
// 보존(월 금액=주차 합 재기재)하기 위한 경로. 없으면 기존 단일 주차 토큰 규약으로 폴백.
function weeklyPaymentsFromDraftMetadata(
  month: string,
  amount: number,
  metadata: Record<string, unknown> | null | undefined,
): Record<string, number[]> {
  const merged = mergedWeeklyFromMetadata(metadata)
  if (merged) return { [month]: merged }
  return weeklyPaymentsFromWeekToken(month, amount, metadataString(metadata, "week"))
}

// 셀에 걸린 미검수(draft|checked) 초안 요약. 낙관적 앰버 표시·툴팁용.
interface MatrixPendingDraft {
  amount: number
  confidence: DraftConfidence
}

// 편집 input이 받는 문자열 → 원 단위 정수. rail의 safeAmount와 동일 규칙(¥·콤마·공백 제거).
// 만 단위 입력은 지원하지 않는다(rail이 원 단위 String을 쓰므로 저장 정합을 위해 원 단위 고정).
function parseMatrixAmount(value: string): number {
  const normalized = value.replace(/[^\d.-]/g, "")
  if (!normalized) return 0
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? Math.max(Math.round(numeric), 0) : 0
}

// 딜행 × 월 셀이 확정 잠금(편집 불가)인지. monthlyRed 플래그 또는 확정액이 그 달 금액을 덮으면 잠금.
// 적용된 초안(ledgerOrigin==="draft")은 확도와 무관하게 잠금 — 셀 편집이 만드는 새 초안은 sourceDealId
// 기준이라 장부 반영분과 겹치면 이중계상이 되므로, 적용분 수정·취소는 입력 큐에서만 한다.
function isMatrixCellLocked(row: LedgerRevenueRow, month: string): boolean {
  const amount = rowMonthAmount(row, month)
  if (amount <= 0) return false // 미입력 = 편집 가능(예정 추가)
  if (row.ledgerOrigin === "draft" && row.draftMonth === month) return true
  if (row.monthlyRed?.[month]) return true
  const confirmed = mapNumberValue(row.monthlyConfirmed, month)
  return confirmed > 0 && confirmed >= amount
}

// 딜행 셀이 편집 가능한지 — 딜행(그룹 소계 제외)이면서 잠금 아님. 미래월 제한은 두지 않는다.
function isMatrixCellEditable(row: LedgerRevenueRow, month: string): boolean {
  return !isMatrixCellLocked(row, month)
}

// ── SL-2: 엑셀 클립보드 TSV 붙여넣기 → 초안 큐 벌크 라우팅 ──────────────────────
// 선택된 월 셀을 앵커로 TSV 그리드를 (행: 보이는 딜행 순서 아래로, 열: 회계월 순서 오른쪽으로)
// 투영해 "무엇이 어떤 셀로 가는지" 프리뷰 계획을 만든다. 커밋은 셀 편집과 완전히 같은
// onCommitCell → createDraft(초안 2단 게이트: draft → checked → apply) 경로만 사용한다 —
// 새 저장 경로 없음. 잠금 셀(시트확정/장부반영)은 계획 단계에서 제외되고, 주차 칸은 대상이
// 아니므로 B1 주차 병합 규약과 셀 상태기계는 문자 단위로 불변이다.

interface MatrixPasteCellPlan {
  rowId: string
  customer: string
  productCategory: Exclude<RevProductCategory, "all">
  month: string
  current: number
  next: number
  status: "apply" | "locked" | "unchanged"
}

interface MatrixPastePlan {
  anchorCustomer: string
  cells: MatrixPasteCellPlan[]
  applyCount: number
  lockedCount: number
  unchangedCount: number
  nonNumericCount: number
  outOfRangeCount: number
}

// 오조작(전체 시트 복사 등) 방어 상한 — 12개월 × 50행. 넘치는 칸은 범위 밖으로 집계만 한다.
const MATRIX_PASTE_MAX_CELLS = 600

function parseTsvGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop()
  return lines.map((line) => line.split("\t"))
}

function buildMatrixPastePlan(
  text: string,
  anchor: MatrixCellCoord,
  dealRows: LedgerRevenueRow[],
  months: string[],
): MatrixPastePlan | null {
  const grid = parseTsvGrid(text)
  if (grid.length === 0) return null
  const rowStart = dealRows.findIndex((row) => row.id === anchor.rowId)
  const colStart = months.indexOf(anchor.month)
  if (rowStart < 0 || colStart < 0) return null

  const plan: MatrixPastePlan = {
    anchorCustomer: dealRows[rowStart].customer,
    cells: [],
    applyCount: 0,
    lockedCount: 0,
    unchangedCount: 0,
    nonNumericCount: 0,
    outOfRangeCount: 0,
  }
  let cellBudget = MATRIX_PASTE_MAX_CELLS
  for (let r = 0; r < grid.length; r += 1) {
    const row = dealRows[rowStart + r]
    for (let c = 0; c < grid[r].length; c += 1) {
      const raw = grid[r][c].trim()
      if (raw === "") continue // 빈 칸은 건드리지 않는다(엑셀 부분 범위 복사 관용)
      // 전체가 숫자형(통화기호·콤마·공백·부호 허용)일 때만 금액으로 인정 —
      // "Q4 2026"·"2026-04" 같은 숫자 섞인 라벨을 금액으로 오독(42026·0 덮어쓰기)하지 않는다.
      if (!/^[\s¥₩$,.\-+]*\d[\d\s¥₩$,.\-+]*$/.test(raw) || !Number.isFinite(Number(raw.replace(/[^\d.-]/g, "")))) {
        plan.nonNumericCount += 1 // 헤더/라벨 텍스트 등 — 값으로 오독하지 않고 집계만
        continue
      }
      const month = months[colStart + c]
      if (!row || !month) {
        plan.outOfRangeCount += 1
        continue
      }
      if (cellBudget <= 0) {
        plan.outOfRangeCount += 1
        continue
      }
      cellBudget -= 1
      const next = parseMatrixAmount(raw)
      const current = rowMonthAmount(row, month)
      const locked = isMatrixCellLocked(row, month)
      // 동일 금액은 초안을 만들지 않는다(commitBuffer의 중복 커밋 가드와 같은 취지).
      const status: MatrixPasteCellPlan["status"] =
        locked ? "locked" : next === current || (next <= 0 && current <= 0) ? "unchanged" : "apply"
      plan.cells.push({
        rowId: row.id,
        customer: row.customer,
        productCategory: rowProductCategory(row),
        month,
        current,
        next,
        status,
      })
      if (status === "apply") plan.applyCount += 1
      else if (status === "locked") plan.lockedCount += 1
      else plan.unchangedCount += 1
    }
  }
  if (plan.cells.length === 0 && plan.nonNumericCount === 0 && plan.outOfRangeCount === 0) return null
  return plan
}

// 셀의 우세 확도 → 편집 팝오버 기본 선택값. 확정>고확도>예정 순, 없으면 예정.
function dominantCellConfidence(bucket: RevMonthlyBucket): DraftConfidence {
  if (bucket.total <= 0) return "expected"
  if (bucket.confirmed >= bucket.high && bucket.confirmed >= bucket.open) return "confirmed"
  if (bucket.high >= bucket.open) return "high-confidence"
  return "expected"
}

// SL-6: 마지막으로 "명시 선택"한 확도 기억(localStorage). 빈 셀 편집 진입의 기본값으로만 쓰여
// 확정 수납액이 기본 '예정' 버킷으로 새는 과소집계를 막는다. 값이 있는 셀은 기존 우세 확도 유지,
// 커밋·집계(A1 확도 분배) 경로는 문자 단위 불변 — 기본 선택값만 바뀐다(팝오버에 항상 노출됨).
const MATRIX_LAST_CONFIDENCE_STORAGE_KEY = "classin:rev-matrix-last-confidence:v1"

function loadStoredMatrixConfidence(): DraftConfidence | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(MATRIX_LAST_CONFIDENCE_STORAGE_KEY)
    return isDraftConfidence(raw) ? raw : null
  } catch {
    return null
  }
}

function storeMatrixConfidence(value: DraftConfidence) {
  try {
    window.localStorage.setItem(MATRIX_LAST_CONFIDENCE_STORAGE_KEY, value)
  } catch {
    // 저장 실패(프라이빗 모드 등)는 무해 — 다음 명시 선택이 다시 시도한다.
  }
}

// 셀 아래 붙는 3버튼 확도 팝오버 + 커밋/취소. input은 부모 셀이 렌더(포커스 관리), 여기는 확도만.
// warning: 주차 셀 편집처럼 커밋 결과가 파괴적일 때 팝오버 안에 한 줄 경고를 붙인다.
const RevMatrixEditPopover = memo(function RevMatrixEditPopover({
  confidence,
  onPickConfidence,
  warning,
}: {
  confidence: DraftConfidence
  onPickConfidence: (next: DraftConfidence) => void
  warning?: string
}) {
  return (
    <div
      className="absolute left-0 top-full z-40 mt-0.5 flex flex-col gap-0.5 rounded-md border border-[rgba(0,0,0,0.12)] bg-white p-0.5 shadow-lg"
      onMouseDown={(event) => event.preventDefault()} // input 포커스 유지(blur 커밋 방지)
    >
      <div className="flex items-center gap-0.5">
        {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
          const activeColor = CONFIDENCE_TOKENS[option.id].color
          const active = option.id === confidence
          return (
            <button
              key={option.id}
              type="button"
              title={`확도: ${option.label}`}
              onClick={() => onPickConfidence(option.id)}
              className="rounded px-1.5 py-0.5 text-[10px] font-bold leading-none transition"
              style={
                active
                  ? { backgroundColor: activeColor, color: "#FFFFFF" }
                  : { color: activeColor, backgroundColor: "transparent" }
              }
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {/* 편집 진입 시 셀 인근 단축키 힌트 — 치트시트가 안 보이는 좁은 화면에서도 조작법이 손끝에 남게. */}
      <p className="px-1 pb-0.5 text-left text-[9px] font-semibold leading-none text-[#A39E98]">
        Enter 저장 · Tab 다음 칸 · Esc 취소
      </p>
      {warning && (
        <p className="max-w-[168px] whitespace-normal rounded bg-[#FBF1E0] px-1.5 py-1 text-left text-[9px] font-bold leading-snug text-[#7A520F]">
          {warning}
        </p>
      )}
    </div>
  )
})

// 매트릭스 셀 편집 상태기계. 셀렉트/편집버퍼/키보드/fill-down/편집가능 셀 순회.
// 커밋은 부모가 주입한 onCommitCell(rowId, month, amount, confidence) 호출 — 저장 로직은 부모 소유.
function useMatrixEditor({
  editableCells,
  cellValue,
  cellConfidence,
  onCommitCell,
}: {
  editableCells: MatrixCellCoord[] // 렌더 순서(행 위→아래, 월 좌→우, 확장월은 w1→w5)로 정렬된 편집가능 셀
  cellValue: (coord: MatrixCellCoord) => number // 커밋 기준값(원 단위) — fill-down 소스
  cellConfidence: (coord: MatrixCellCoord) => DraftConfidence // 셀 우세 확도(팝오버 기본값)
  onCommitCell: (rowId: string, month: string, amount: number, confidence: DraftConfidence, week?: number) => void
}) {
  const [selected, setSelected] = useState<MatrixCellCoord | null>(null)
  const [editing, setEditing] = useState<MatrixCellCoord | null>(null)
  const [buffer, setBuffer] = useState("")
  const [editConfidence, setEditConfidence] = useState<DraftConfidence>("expected")

  // 편집 버퍼·확도의 최신값 미러(latest-ref). commitBuffer/onEditingKeyDown가 이 값을 클로저 대신
  // 여기서 읽어 콜백 identity를 buffer/editConfidence 변화와 무관하게 고정한다 — actions 객체가
  // 매 키입력마다 새로 만들어져 수백 셀 memo를 깨는 문제를 없애기 위함(편집 셀만 리렌더).
  // 두 ref는 커밋 후 effect에서 갱신한다(렌더 중 ref 쓰기 금지 규칙). 읽는 쪽(commitBuffer/
  // onEditingKeyDown)은 전부 사용자 이벤트 핸들러라, 직전 렌더의 effect가 이미 반영된 뒤 실행돼 stale 없음.
  const bufferRef = useRef(buffer)
  const editConfidenceRef = useRef(editConfidence)
  useEffect(() => {
    bufferRef.current = buffer
    editConfidenceRef.current = editConfidence
  }, [buffer, editConfidence])

  // 편집가능 셀 순번 조회 O(1) — 방향키/Tab 이동에 사용. 주차 셀은 `::wN`까지 포함한 키.
  const indexByKey = useMemo(() => {
    const map = new Map<string, number>()
    editableCells.forEach((coord, index) => map.set(matrixCoordKey(coord), index))
    return map
  }, [editableCells])

  const selectCell = useCallback((rowId: string, month: string, week?: number) => {
    setEditing(null)
    setSelected({ rowId, month, week })
  }, [])

  const beginEdit = useCallback(
    (rowId: string, month: string, seed?: string, week?: number) => {
      const coord: MatrixCellCoord = { rowId, month, week }
      setSelected(coord)
      // 기본 확도: 값이 있거나(우세 확도) 미검수 초안이 확도를 남긴 셀은 그대로, 완전 빈 셀만
      // 마지막 명시 선택 확도(localStorage)로 시작한다 — SL-6, A1 확도-분배 로직 회귀 없음.
      const current = cellValue(coord)
      const base = cellConfidence(coord)
      setEditConfidence(current <= 0 && base === "expected" ? (loadStoredMatrixConfidence() ?? base) : base)
      // seed(타이핑 첫 글자)면 그 값으로, 아니면 기존 커밋값(0은 빈칸)으로 시작.
      if (seed != null) {
        setBuffer(seed.replace(/[^\d]/g, ""))
      } else {
        setBuffer(current > 0 ? String(current) : "")
      }
      setEditing(coord)
    },
    [cellConfidence, cellValue],
  )

  const cancelEdit = useCallback(() => {
    setEditing(null)
    setBuffer("")
  }, [])

  // 확도 팝오버의 "명시 선택"만 기억한다 — 기본값으로 흘러간 확도는 기록하지 않아
  // 한 번의 확정 선택이 이후 빈 셀 입력의 기본값이 된다(SL-6 세션 기억).
  const pickEditConfidence = useCallback((next: DraftConfidence) => {
    storeMatrixConfidence(next)
    setEditConfidence(next)
  }, [])

  // 현재 편집 버퍼를 커밋(부모 onCommitCell). 값이 이전과 같으면 스킵(중복 draft 방지).
  // buffer는 latest-ref(bufferRef)로 읽어 콜백 identity를 고정한다(actions 안정화).
  const commitBuffer = useCallback(
    (coord: MatrixCellCoord, confidence: DraftConfidence): boolean => {
      const amount = parseMatrixAmount(bufferRef.current)
      const previous = cellValue(coord)
      const previousConfidence = cellConfidence(coord)
      // 금액·확도 둘 다 그대로면 저장하지 않는다. (주차 셀도 cellValue/cellConfidence가 주차 기준이라 동일 가드 적용)
      if (amount === previous && confidence === previousConfidence) return false
      if (amount <= 0 && previous <= 0) return false
      onCommitCell(coord.rowId, coord.month, amount, confidence, coord.week)
      return true
    },
    [cellConfidence, cellValue, onCommitCell],
  )

  const moveSelection = useCallback(
    (from: MatrixCellCoord, delta: number) => {
      const index = indexByKey.get(matrixCoordKey(from))
      if (index == null) return
      const nextIndex = index + delta
      if (nextIndex < 0 || nextIndex >= editableCells.length) return
      setEditing(null)
      setSelected(editableCells[nextIndex])
    },
    [editableCells, indexByKey],
  )

  // 같은 행에서 다음 셀(오른쪽 우선). Tab/Shift+Tab·Enter(아래) 커밋 후 이동에 공유.
  const moveWithinRowOrNext = useCallback(
    (from: MatrixCellCoord, direction: "right" | "left" | "down") => {
      const index = indexByKey.get(matrixCoordKey(from))
      if (index == null) return
      if (direction === "down") {
        // 아래 = 같은 세로 열(같은 월·같은 주차)에서 index 뒤쪽 첫 번째 셀.
        for (let i = index + 1; i < editableCells.length; i += 1) {
          if (matrixSameColumn(editableCells[i], from)) {
            setSelected(editableCells[i])
            return
          }
        }
        return
      }
      const delta = direction === "right" ? 1 : -1
      const nextIndex = index + delta
      if (nextIndex < 0 || nextIndex >= editableCells.length) return
      setSelected(editableCells[nextIndex])
    },
    [editableCells, indexByKey],
  )

  // 편집 중 input keydown. Enter=커밋+아래, Tab=커밋+오른쪽, Shift+Tab=커밋+왼쪽, Esc=취소.
  // 방향키는 캐럿 이동(기본 동작) — stopPropagation 없이 통과시킨다.
  const onEditingKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>, coord: MatrixCellCoord) => {
      if (event.key === "Enter") {
        event.preventDefault()
        commitBuffer(coord, editConfidenceRef.current)
        setEditing(null)
        moveWithinRowOrNext(coord, "down")
        return
      }
      if (event.key === "Tab") {
        event.preventDefault()
        commitBuffer(coord, editConfidenceRef.current)
        setEditing(null)
        moveWithinRowOrNext(coord, event.shiftKey ? "left" : "right")
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        cancelEdit()
      }
    },
    [cancelEdit, commitBuffer, moveWithinRowOrNext],
  )

  // 셀렉트(비편집) keydown. 방향키=이동, Enter/F2/숫자=편집 진입, Ctrl/Cmd+D=위 값 채우기.
  const onSelectedKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTableCellElement>, coord: MatrixCellCoord) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "d" || event.key === "D")) {
        event.preventDefault()
        // 위 셀 = 같은 세로 열(같은 월·같은 주차)에서 index 앞쪽 첫 번째 셀의 커밋값.
        const index = indexByKey.get(matrixCoordKey(coord))
        if (index == null) return
        for (let i = index - 1; i >= 0; i -= 1) {
          if (matrixSameColumn(editableCells[i], coord)) {
            const value = cellValue(editableCells[i])
            if (value > 0) onCommitCell(coord.rowId, coord.month, value, cellConfidence(coord), coord.week)
            return
          }
        }
        return
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        moveSelection(coord, 1)
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        moveSelection(coord, -1)
        return
      }
      if (event.key === "ArrowDown") {
        event.preventDefault()
        moveWithinRowOrNext(coord, "down")
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        const index = indexByKey.get(matrixCoordKey(coord))
        if (index == null) return
        for (let i = index - 1; i >= 0; i -= 1) {
          if (matrixSameColumn(editableCells[i], coord)) {
            setSelected(editableCells[i])
            return
          }
        }
        return
      }
      if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault()
        beginEdit(coord.rowId, coord.month, undefined, coord.week)
        return
      }
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault()
        beginEdit(coord.rowId, coord.month, event.key, coord.week)
      }
    },
    [beginEdit, cellConfidence, cellValue, editableCells, indexByKey, moveSelection, moveWithinRowOrNext, onCommitCell],
  )

  // 셀 핸들러가 호출하는 액션들 — 전부 identity 안정(콜백 deps가 데이터/펼침에만 반응).
  // selected/editing/buffer/editConfidence 같은 잦은 상태는 여기 넣지 않고 별도 경로로 내려,
  // 이 객체를 prop으로 받는 memo 셀들이 선택·타이핑마다 얕은비교가 깨지지 않게 한다.
  const actions = useMemo(
    () => ({
      setBuffer,
      // 팝오버 선택 = 명시 선택 → localStorage 기억까지 수행(pickEditConfidence). 액션 키 이름은
      // 기존 셀 콜사이트 호환을 위해 유지한다.
      setEditConfidence: pickEditConfidence,
      selectCell,
      beginEdit,
      cancelEdit,
      commitBuffer,
      onEditingKeyDown,
      onSelectedKeyDown,
    }),
    [setBuffer, pickEditConfidence, selectCell, beginEdit, cancelEdit, commitBuffer, onEditingKeyDown, onSelectedKeyDown],
  )

  return {
    selected,
    editing,
    buffer,
    editConfidence,
    actions,
  }
}

type MatrixEditor = ReturnType<typeof useMatrixEditor>
type MatrixEditorActions = MatrixEditor["actions"]

// 매트릭스 셀 본문 숫자. ¥ 없이 축약(formatWeekAmount) — 밀도 우선, 툴팁에 정확 금액.
// Phase 2: edit* props가 오면 딜행 편집 셀(잠금/미검수/셀렉트/편집 4상태). 없으면(그룹 소계) 읽기전용.
const RevMatrixMonthCell = memo(function RevMatrixMonthCell({
  bucket,
  mismatch = false,
  bgClass,
  month,
  rowId,
  editable = false,
  locked = false,
  lockLabel = "시트 확정",
  pending = null,
  actions = null,
  // 선택/편집/버퍼는 부모(스트립)가 이 셀 기준으로 계산해 원시값으로 내린다 — memo가 셀 단위로
  // 얕은비교되도록. 비편집·비선택 셀은 아래 값들이 상수라 선택·타이핑 리렌더에서 스킵된다.
  selected = false,
  isEditingCell = false,
  editBuffer = "",
  editConfidence = "expected",
}: {
  bucket: RevMonthlyBucket
  mismatch?: boolean
  bgClass: string
  month?: string
  rowId?: string
  editable?: boolean
  locked?: boolean
  lockLabel?: string
  pending?: MatrixPendingDraft | null
  actions?: MatrixEditorActions | null
  selected?: boolean
  isEditingCell?: boolean
  editBuffer?: string
  editConfidence?: DraftConfidence
}) {
  const tone = mismatch ? "mismatch" : matrixBucketTone(bucket)
  const interactive = Boolean(actions && month && rowId)
  // 방향키 이동은 selected 상태만 바꾸므로 DOM 포커스를 직접 옮겨야 다음 keydown이 새 셀에서 잡힌다.
  // (클릭은 native focus가 되지만 키보드 이동은 안 됨.) 편집 중이 아닐 때만 셀 자체에 포커스.
  const cellRef = useRef<HTMLTableCellElement | null>(null)
  useEffect(() => {
    if (interactive && editable && selected && !isEditingCell) {
      cellRef.current?.focus()
    }
  }, [interactive, editable, selected, isEditingCell])
  const confidenceLabel = (value: DraftConfidence) =>
    DRAFT_CONFIDENCE_OPTIONS.find((option) => option.id === value)?.label ?? value
  const baseTitle =
    bucket.total > 0
      ? `합계 ${formatMoney(bucket.total)} · 확정 ${formatMoney(bucket.confirmed)} · 고확도 ${formatMoney(bucket.high)} · 예정 ${formatMoney(bucket.open)}${mismatch ? " · 주차·월 불일치(허용오차 ±¥1)" : ""}`
      : "미입력"
  const title = locked
    ? `${baseTitle} · 🔒 ${lockLabel} 값이라 잠금(실수 방지) — 수정은 우측 패널에서 정정 초안으로`
    : pending
      ? `${baseTitle} · 미검수 초안 ${formatMoney(pending.amount)} (${confidenceLabel(pending.confidence)})`
      : editable
        ? `${baseTitle} · 클릭·Enter로 편집`
        : baseTitle

  // 편집 진입 셀: input + 확도 팝오버.
  if (isEditingCell && interactive) {
    return (
      <td
        className={`relative px-0.5 text-right align-middle ${mismatch ? "bg-[#FCE9E9]" : bgClass} ring-2 ring-inset ring-[#084734]/40`}
        style={{ width: MATRIX_MONTH_W, minWidth: MATRIX_MONTH_W, maxWidth: MATRIX_MONTH_W }}
      >
        <input
          autoFocus
          inputMode="numeric"
          value={editBuffer}
          onChange={(event) => actions!.setBuffer(event.target.value)}
          onKeyDown={(event) => actions!.onEditingKeyDown(event, { rowId: rowId!, month: month! })}
          onBlur={() => {
            actions!.commitBuffer({ rowId: rowId!, month: month! }, editConfidence)
            actions!.cancelEdit()
          }}
          aria-label={`${formatMonthLabel(month!)} 금액(원 단위)`}
          className="h-6 w-full bg-transparent px-1 text-right text-[11px] font-bold tabular-nums text-[#111110] outline-none"
        />
        <RevMatrixEditPopover confidence={editConfidence} onPickConfidence={actions!.setEditConfidence} />
      </td>
    )
  }

  const bg = mismatch ? "bg-[#FCE9E9]" : bgClass
  const cellClassName = `relative px-1.5 text-right align-middle tabular-nums ${
    mismatch ? "border-l-2 border-l-[#B43E3E]" : "border-l border-[#F2F1EE]"
  } ${bg} ${interactive && editable ? "cursor-cell" : ""} ${selected ? "ring-2 ring-inset ring-[#084734]/40" : ""} ${
    pending ? "shadow-[inset_0_-2px_0_0_#D4A017]" : ""
  } focus-visible:outline-none`

  const interactiveHandlers = interactive
    ? {
        tabIndex: editable ? 0 : -1,
        role: "gridcell" as const,
        onClick: () => {
          if (editable) actions!.selectCell(rowId!, month!)
        },
        onDoubleClick: () => {
          if (editable) actions!.beginEdit(rowId!, month!)
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLTableCellElement>) => {
          if (!editable) return
          if (!selected) {
            // Tab 포커스만 된 셀도 Enter/F2로 선택 진입 — 마우스 클릭 없이 키보드만으로 편집 가능.
            if (event.key === "Enter" || event.key === "F2") {
              event.preventDefault()
              actions!.selectCell(rowId!, month!)
            }
            return
          }
          actions!.onSelectedKeyDown(event, { rowId: rowId!, month: month! })
        },
      }
    : {}

  return (
    <td
      ref={cellRef}
      title={title}
      className={cellClassName}
      style={{ width: MATRIX_MONTH_W, minWidth: MATRIX_MONTH_W, maxWidth: MATRIX_MONTH_W }}
      {...interactiveHandlers}
    >
      {pending && (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[#D4A017]"
        />
      )}
      {bucket.total > 0 ? (
        <span
          className={`inline-flex items-center justify-end gap-0.5 leading-none ${
            bucket.total < 10000 ? "text-[10px] opacity-75" : "text-[11px]"
          } ${pending ? "font-bold text-[#7A520F]" : MATRIX_TONE[tone]}`}
        >
          {locked && <Lock className="h-2.5 w-2.5 shrink-0 text-[#A39E98]" aria-label={lockLabel} />}
          {mismatch && !locked && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
          {formatWeekAmount(bucket.total)}
        </span>
      ) : (
        <span className={`text-[11px] leading-none ${editable ? "text-[#C9C5BF]" : MATRIX_TONE.empty}`}>·</span>
      )}
    </td>
  )
})

// 확장된 월의 주차(W1~W5) 칸 1개. 34px. editor가 오면(딜행·비잠금) 월 셀과 동일한
// 잠금/미검수/셀렉트/편집 4상태 + 키보드 순회를 지원한다. 없으면(그룹 소계·잠금) 읽기전용.
// display 규약은 기존 읽기전용 버전 계승: explicit=진한 숫자, inferred=회색, month-only는 W5에 금액.
const RevMatrixWeekCell = memo(function RevMatrixWeekCell({
  display,
  isMonthOnly,
  inferred,
  weekIndex,
  bgClass,
  month,
  rowId,
  editable = false,
  locked = false,
  lockLabel = "시트 확정",
  editWarning,
  pending = null,
  actions = null,
  // 월 셀과 동일: 선택/편집/버퍼는 부모(스트립)가 이 칸 기준으로 계산해 원시값으로 내린다.
  selected = false,
  isEditingCell = false,
  editBuffer = "",
  editConfidence = "expected",
}: {
  display: number
  isMonthOnly: boolean
  inferred: boolean
  weekIndex: number
  bgClass: string
  month?: string
  rowId?: string
  editable?: boolean
  locked?: boolean
  lockLabel?: string
  editWarning?: string
  pending?: MatrixPendingDraft | null
  actions?: MatrixEditorActions | null
  selected?: boolean
  isEditingCell?: boolean
  editBuffer?: string
  editConfidence?: DraftConfidence
}) {
  const interactive = Boolean(actions && month && rowId)
  const cellRef = useRef<HTMLTableCellElement | null>(null)
  useEffect(() => {
    if (interactive && editable && selected && !isEditingCell) cellRef.current?.focus()
  }, [interactive, editable, selected, isEditingCell])

  const confidenceLabel = (v: DraftConfidence) => DRAFT_CONFIDENCE_OPTIONS.find((option) => option.id === v)?.label ?? v
  const baseTitle = display > 0 ? `W${weekIndex + 1} ${formatMoney(display)}${isMonthOnly ? " · 월합계만" : ""}` : `W${weekIndex + 1} 미입력`
  const title = locked
    ? `${baseTitle} · 🔒 ${lockLabel} 값이라 잠금(실수 방지) — 수정은 우측 패널에서 정정 초안으로`
    : pending
      ? `${baseTitle} · 미검수 초안 ${formatMoney(pending.amount)} (${confidenceLabel(pending.confidence)})`
      : editable
        ? `${baseTitle} · 클릭·Enter로 편집`
        : baseTitle

  // 편집 진입: input + 확도 팝오버. 폭 34px라 px 여백 없이 칸을 꽉 채운다.
  if (isEditingCell && interactive) {
    return (
      <td
        className={`relative px-0 text-right align-middle ${bgClass} ring-2 ring-inset ring-[#084734]/40`}
        style={{ width: MATRIX_WEEK_W, minWidth: MATRIX_WEEK_W, maxWidth: MATRIX_WEEK_W }}
      >
        <input
          autoFocus
          inputMode="numeric"
          value={editBuffer}
          onChange={(event) => actions!.setBuffer(event.target.value)}
          onKeyDown={(event) => actions!.onEditingKeyDown(event, { rowId: rowId!, month: month!, week: weekIndex })}
          onBlur={() => {
            actions!.commitBuffer({ rowId: rowId!, month: month!, week: weekIndex }, editConfidence)
            actions!.cancelEdit()
          }}
          aria-label={`${formatMonthLabel(month!)} W${weekIndex + 1} 금액(원 단위)`}
          className="h-6 w-full bg-transparent px-1 text-right text-[11.5px] font-bold tabular-nums text-[#111110] outline-none"
        />
        <RevMatrixEditPopover
          confidence={editConfidence}
          onPickConfidence={actions!.setEditConfidence}
          warning={editWarning}
        />
      </td>
    )
  }

  const cellClassName = `relative border-l border-[#F2F1EE] px-1.5 text-right align-middle tabular-nums ${bgClass} ${
    interactive && editable ? "cursor-cell" : ""
  } ${selected ? "ring-2 ring-inset ring-[#084734]/40" : ""} ${pending ? "shadow-[inset_0_-2px_0_0_#D4A017]" : ""} focus-visible:outline-none`

  const interactiveHandlers = interactive
    ? {
        tabIndex: editable ? 0 : -1,
        role: "gridcell" as const,
        onClick: () => {
          if (editable) actions!.selectCell(rowId!, month!, weekIndex)
        },
        onDoubleClick: () => {
          if (editable) actions!.beginEdit(rowId!, month!, undefined, weekIndex)
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLTableCellElement>) => {
          if (!editable) return
          if (!selected) {
            // Tab 포커스만 된 칸도 Enter/F2로 선택 진입 — 마우스 클릭 없이 키보드만으로 편집 가능.
            if (event.key === "Enter" || event.key === "F2") {
              event.preventDefault()
              actions!.selectCell(rowId!, month!, weekIndex)
            }
            return
          }
          actions!.onSelectedKeyDown(event, { rowId: rowId!, month: month!, week: weekIndex })
        },
      }
    : {}

  return (
    <td
      ref={cellRef}
      title={title}
      className={cellClassName}
      style={{ width: MATRIX_WEEK_W, minWidth: MATRIX_WEEK_W, maxWidth: MATRIX_WEEK_W }}
      {...interactiveHandlers}
    >
      {pending && <span aria-hidden className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[#D4A017]" />}
      {/* 1만 미만(원시 위안) 값은 저대비·소형으로 강등 — 월 셀(RevMatrixMonthCell)과 동일 규약(SL-7). */}
      <span
        className={`inline-flex items-center gap-0.5 leading-none tabular-nums ${
          display > 0 && display < 10000 ? "text-[10px] opacity-75" : "text-[11.5px]"
        } ${
          pending
            ? "font-bold text-[#7A520F]"
            : display > 0
              ? isMonthOnly
                ? "font-semibold text-[#7A520F]"
                : inferred
                  ? "font-semibold text-[#A39E98]"
                  : "font-bold text-[#111110]"
              : editable
                ? "text-[#C9C5BF]"
                : "text-[#DDD9D3]"
        }`}
      >
        {locked && display > 0 && <Lock className="h-2.5 w-2.5 shrink-0 text-[#A39E98]" aria-label={lockLabel} />}
        {display > 0 ? formatWeekAmount(display) : "·"}
      </span>
    </td>
  )
})

// 확장된 월의 w1~w5 5칸. editContext가 오면(딜행·비잠금월) 각 칸이 편집 셀이 된다.
// month-only 행은 W5에 월합계를 얹어 시트 검수 감각을 유지(기존 읽기전용 규약 계승).
function RevMatrixWeekCells({
  weeks,
  inferred,
  monthOnlyAmount,
  bgClass,
  month,
  editContext = null,
}: {
  weeks: number[]
  inferred: boolean
  monthOnlyAmount: number
  bgClass: string
  month?: string
  editContext?: RevMatrixEditContext | null
}) {
  const anyExplicit = weeks.some((w) => w > 0)
  const cells: React.ReactNode[] = []
  for (let index = 0; index < 5; index += 1) {
    const value = weeks[index] ?? 0
    // 월합계만 있는 행은 마지막(W5) 칸에 금액을 얹어 시트 검수 감각을 유지한다.
    const display = value > 0 ? value : index === 4 && monthOnlyAmount > 0 && !anyExplicit ? monthOnlyAmount : 0
    const isMonthOnly = display > 0 && value === 0
    // 편집 가능 여부: 딜행 + 월 편집 허용(editContext.editableOf) + 그 칸이 시트 확정 잠금이 아닐 때.
    // month-only 파생 표시(W5의 monthOnlyAmount)는 실제 주차 입력이 아니므로 편집 시작값은 value(0)로 둔다.
    const weekLocked = editContext ? editContext.weekLockedOf(month ?? "", index) : true
    const weekEditable = Boolean(editContext) && !weekLocked && Boolean(editContext?.editableOf(month ?? ""))
    // 선택/편집은 이 칸 기준으로 계산해 원시값으로 내린다 — 비선택·비편집 칸은 memo 스킵.
    const weekSelected = Boolean(editContext) && editContext!.isSelectedCell(month ?? "", index)
    const weekEditing = Boolean(editContext) && editContext!.isEditingCell(month ?? "", index)
    cells.push(
      <RevMatrixWeekCell
        key={index}
        display={display}
        isMonthOnly={isMonthOnly}
        inferred={inferred}
        weekIndex={index}
        bgClass={bgClass}
        month={editContext ? month : undefined}
        rowId={editContext?.rowId}
        editable={weekEditable}
        locked={editContext ? weekLocked && display > 0 : false}
        lockLabel={editContext?.lockLabel}
        editWarning={editContext ? editContext.weekEditNotice(month ?? "") : undefined}
        pending={editContext ? editContext.weekPendingOf(month ?? "", index) : null}
        actions={editContext?.actions ?? null}
        selected={weekSelected}
        isEditingCell={weekEditing}
        editBuffer={weekEditing ? editContext!.editBuffer : ""}
        editConfidence={weekEditing ? editContext!.editConfidence : "expected"}
      />,
    )
  }
  return <>{cells}</>
}

// 딜행 스트립에만 주입되는 편집 컨텍스트. 그룹 소계행은 이 값을 넘기지 않아 읽기전용 유지.
// 선택/편집 상태는 이 행 스코프로 좁혀(selected/editing 좌표가 이 행일 때만 non-null) 내려온다 —
// 각 셀의 선택·편집 여부는 스트립이 여기서 계산해 memo 셀에 원시 boolean으로 전달한다.
interface RevMatrixEditContext {
  rowId: string
  actions: MatrixEditorActions // identity 안정 — 셀 핸들러(선택/편집 시작/커밋/버퍼)용
  isSelectedCell: (month: string, week?: number) => boolean // 이 행 기준 셀 선택 판정
  isEditingCell: (month: string, week?: number) => boolean // 이 행 기준 셀 편집 판정
  editBuffer: string // 편집 중 버퍼 값(편집 셀에만 의미)
  editConfidence: DraftConfidence // 편집 중 확도(편집 셀에만 의미)
  lockLabel: string // 잠금 아이콘·툴팁 라벨 — 시트 원천은 "시트 확정", 적용 초안은 "장부 반영"
  editableOf: (month: string) => boolean
  lockedOf: (month: string) => boolean
  pendingOf: (month: string) => MatrixPendingDraft | null
  // 주차(확장월) 칸용. 잠금은 월 잠금 규칙을 그대로 승계(시트 확정 월이면 주차 칸도 잠금).
  weekLockedOf: (month: string, week: number) => boolean
  weekPendingOf: (month: string, week: number) => MatrixPendingDraft | null
  // 주차 셀 편집 팝오버 고지문 — explicit 행(주차 병합 보존) vs 그 외(월 전체 대체) 구분.
  weekEditNotice: (month: string) => string
}

// 12개월(요약/확장 혼재)에 걸친 월 셀 스트립 — 그룹행·딜행이 공유한다.
// editContext가 오면(딜행) 비확장 월 셀이 편집 셀이 된다. 확장(주차) 칸은 Phase 3 전까지 읽기전용.
function RevMatrixMonthStrip({
  monthlyByRowOrGroup,
  weeklyByMonth,
  months,
  expandedMonths,
  bgClass,
  editContext = null,
}: {
  monthlyByRowOrGroup: Record<string, RevMonthlyBucket>
  weeklyByMonth: (month: string) => { weeks: number[]; inferred: boolean; monthOnlyAmount: number; mismatch: boolean } | null
  months: string[]
  expandedMonths: Set<string>
  bgClass: string
  editContext?: RevMatrixEditContext | null
}) {
  return (
    <>
      {months.map((month) => {
        const bucket = monthlyByRowOrGroup[month] ?? EMPTY_BUCKET
        if (expandedMonths.has(month)) {
          const weekly = weeklyByMonth(month)
          return (
            <Fragment key={month}>
              <RevMatrixWeekCells
                weeks={weekly?.weeks ?? [0, 0, 0, 0, 0]}
                inferred={weekly?.inferred ?? false}
                monthOnlyAmount={weekly?.monthOnlyAmount ?? 0}
                bgClass={bgClass}
                month={month}
                editContext={editContext}
              />
              {/* 확장 중에도 그 달 총액을 잃지 않도록 주차 5칸 뒤에 읽기전용 월계 셀을 유지한다 */}
              <RevMatrixMonthCell bucket={bucket} mismatch={weekly?.mismatch ?? false} bgClass={bgClass} />
            </Fragment>
          )
        }
        const monthSelected = Boolean(editContext) && editContext!.isSelectedCell(month)
        const monthEditing = Boolean(editContext) && editContext!.isEditingCell(month)
        return (
          <RevMatrixMonthCell
            key={month}
            bucket={bucket}
            mismatch={weeklyByMonth(month)?.mismatch ?? false}
            bgClass={bgClass}
            month={editContext ? month : undefined}
            rowId={editContext?.rowId}
            editable={editContext ? editContext.editableOf(month) : false}
            locked={editContext ? editContext.lockedOf(month) : false}
            lockLabel={editContext?.lockLabel}
            pending={editContext ? editContext.pendingOf(month) : null}
            actions={editContext?.actions ?? null}
            selected={monthSelected}
            isEditingCell={monthEditing}
            editBuffer={monthEditing ? editContext!.editBuffer : ""}
            editConfidence={monthEditing ? editContext!.editConfidence : "expected"}
          />
        )
      })}
    </>
  )
}

const EMPTY_BUCKET: RevMonthlyBucket = { total: 0, confirmed: 0, high: 0, open: 0 }

// SL-4: 미연결(needs link) 행 전용 매칭 인박스 딥링크 — /admin/crm/matching?name= 프리필로 착지.
// 링크 확정은 매칭 인박스에서만 한다(장부=분석·검수, 매칭=링크 확정 역할 분리). account-master의
// unmatched 판정과 1:1이라 연결됨/드리프트 행에는 렌더되지 않는다(확정 링크 오표기 회귀 방지).
function NeedsLinkBadge({ customer, long = false }: { customer: string; long?: boolean }) {
  return (
    <Link
      href={`/admin/crm/matching?name=${encodeURIComponent(customer)}`}
      onClick={(event) => event.stopPropagation()}
      title={`${customer} — CRM 미연결(needs link) · 매칭 인박스에서 연결`}
      className="inline-flex shrink-0 items-center rounded-full border border-[#ECD29C] bg-[#FFFCF5] px-1.5 text-[9px] font-bold leading-4 text-[#7A520F] underline-offset-2 transition hover:bg-[#FBF1E0] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
    >
      {long ? "매칭에서 연결 ↗" : "연결 ↗"}
    </Link>
  )
}

// SL-2: 붙여넣기 프리뷰 다이얼로그 — 셀 매핑(고객·상품군·월·현재→새 값)과 일괄 확도를 확인한 뒤에만
// 초안을 만든다. 여기서 만드는 것은 어디까지나 "검토 초안"이며 장부 반영은 체크 큐(2단 게이트)에서만.
const MATRIX_PASTE_PREVIEW_LIMIT = 40

function RevMatrixPasteDialog({
  plan,
  confidence,
  onPickConfidence,
  onCancel,
  onConfirm,
}: {
  plan: MatrixPastePlan
  confidence: DraftConfidence
  onPickConfidence: (next: DraftConfidence) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const shown = plan.cells.slice(0, MATRIX_PASTE_PREVIEW_LIMIT)
  const hidden = plan.cells.length - shown.length
  const statusMeta: Record<MatrixPasteCellPlan["status"], { label: string; className: string }> = {
    apply: { label: "초안 생성", className: "text-[#084734]" },
    locked: { label: "잠금 제외", className: "text-[#A39E98]" },
    unchanged: { label: "동일 값", className: "text-[#A39E98]" },
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="엑셀 붙여넣기 미리보기"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#111110]/40 p-4 sm:items-center"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_24px_70px_rgba(17,17,16,0.22)]">
        <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
          <p className="text-[13px] font-bold text-[#111110]">엑셀 붙여넣기 미리보기</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">
            {plan.anchorCustomer} 선택 셀 기준 아래·오른쪽으로 매핑됩니다. 확인 시{" "}
            <span className="font-bold text-[#7A520F]">검토 초안 {plan.applyCount.toLocaleString("ko-KR")}건</span>이 생성되고,
            장부 반영은 체크 큐에서 체크 → 적용을 거쳐야만 이뤄집니다.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
            <span className="rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2 py-0.5 text-[#084734]">
              생성 {plan.applyCount.toLocaleString("ko-KR")}
            </span>
            {plan.lockedCount > 0 && (
              <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-0.5 text-[#615D59]">
                잠금 제외 {plan.lockedCount.toLocaleString("ko-KR")}
              </span>
            )}
            {plan.unchangedCount > 0 && (
              <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-0.5 text-[#615D59]">
                동일 값 {plan.unchangedCount.toLocaleString("ko-KR")}
              </span>
            )}
            {plan.outOfRangeCount > 0 && (
              <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[#7A520F]">
                범위 밖 {plan.outOfRangeCount.toLocaleString("ko-KR")}
              </span>
            )}
            {plan.nonNumericCount > 0 && (
              <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[#7A520F]">
                비숫자 제외 {plan.nonNumericCount.toLocaleString("ko-KR")}
              </span>
            )}
          </div>
        </div>
        {/* 일괄 확도 — 커밋 전 3버튼 필수 노출(SL-6과 같은 규약). 붙여넣기 전체에 하나의 확도가 기록된다. */}
        <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-[#615D59]">확도(전체 적용)</span>
            <div className="flex items-center gap-1">
              {DRAFT_CONFIDENCE_OPTIONS.map((option) => {
                const activeColor = CONFIDENCE_TOKENS[option.id].color
                const active = option.id === confidence
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onPickConfidence(option.id)}
                    className="rounded-md px-2.5 py-1 text-[11px] font-bold transition"
                    style={
                      active
                        ? { backgroundColor: activeColor, color: "#FFFFFF" }
                        : { color: activeColor, backgroundColor: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)" }
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            <span className="text-[10px] font-semibold text-[#A39E98]">확도별로 나눠 넣으려면 범위를 나눠 붙여넣으세요</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="text-[9.5px] uppercase tracking-[0.06em] text-[#A39E98]">
              <tr className="border-b border-[rgba(0,0,0,0.08)]">
                <th className="py-1.5 pr-2 font-bold">고객</th>
                <th className="py-1.5 pr-2 font-bold">상품군</th>
                <th className="py-1.5 pr-2 font-bold">월</th>
                <th className="py-1.5 pr-2 text-right font-bold">현재 → 새 값</th>
                <th className="py-1.5 text-right font-bold">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F1EE]">
              {shown.map((cell, index) => (
                <tr key={`${cell.rowId}-${cell.month}-${index}`} className={cell.status === "apply" ? "" : "opacity-60"}>
                  <td className="max-w-[180px] truncate py-1.5 pr-2 font-semibold text-[#111110]">{cell.customer}</td>
                  <td className="py-1.5 pr-2 text-[#615D59]">{productCategoryMeta(cell.productCategory).shortLabel}</td>
                  <td className="py-1.5 pr-2 font-semibold text-[#615D59]">{formatMonthLabel(cell.month)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    <span className="text-[#A39E98]">{cell.current > 0 ? formatMoney(cell.current) : "·"}</span>
                    <span className="mx-1 text-[#A39E98]">→</span>
                    <span className="font-bold text-[#111110]">{formatMoney(cell.next)}</span>
                  </td>
                  <td className={`py-1.5 text-right text-[10px] font-bold ${statusMeta[cell.status].className}`}>
                    {cell.status === "locked" && <Lock className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" aria-hidden />}
                    {statusMeta[cell.status].label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hidden > 0 && (
            <p className="py-2 text-center text-[10.5px] font-semibold text-[#A39E98]">외 {hidden.toLocaleString("ko-KR")}칸 — 전체가 동일 규칙으로 처리됩니다</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            // applyCount=0이면 확인 버튼이 disabled라 autoFocus가 무시되고 포커스가 모달 뒤
            // 그리드 셀에 남아 숫자 키가 편집을 시작한다 — 그 경우 취소 버튼이 포커스를 받는다.
            autoFocus={plan.applyCount === 0}
            className="inline-flex h-9 items-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={plan.applyCount === 0}
            autoFocus={plan.applyCount > 0}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#084734] px-3 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-45"
          >
            검토 초안 {plan.applyCount.toLocaleString("ko-KR")}건 생성
          </button>
        </div>
      </div>
    </div>
  )
}

// 고객 그룹 소계행(접힘 기본). ▸ 토글은 기존 UX 계승(ChevronRight rotate-90).
const RevMatrixGroupRow = memo(function RevMatrixGroupRow({
  group,
  months,
  expandedMonths,
  expanded,
  selected,
  needsLink = false,
  onSelect,
  onToggle,
  density = "regular",
}: {
  group: RevCustomerGroup
  months: string[]
  expandedMonths: Set<string>
  expanded: boolean
  selected: boolean
  needsLink?: boolean // account-master unmatched 판정 — 미연결 고객만 '연결 ↗' 딥링크(SL-4)
  onSelect: (key: string) => void
  onToggle: (key: string) => void
  density?: MatrixDensity
}) {
  const rowBg = selected ? "bg-[#ECFDF5]" : "bg-white group-hover:bg-[#FAFAF8]"
  const annual = group.annualTotal
  const annualTone = matrixBucketTone(annual)
  const weeklyByMonth = (month: string) => {
    // 그룹 소계는 주차 상세를 다시 합산하지 않는다(성능). 확장 시 그룹행은 요약만, 하위 딜행에서 주차 노출.
    void month
    return null
  }
  const monthlyByGroup = group.monthlyTotals
  return (
    <tr
      onClick={() => onSelect(group.key)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect(group.key)
        }
      }}
      tabIndex={0}
      title="클릭: 우측 요약 · ▸ 펼치기: 하위 딜행"
      aria-label={`${group.customer} ${group.rows.length}건 — 우측 요약 열기`}
      className={`group ${MATRIX_GROUP_ROW_HEIGHT[density]} cursor-pointer border-t border-[#EDECE8] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 ${
        selected ? "bg-[#ECFDF5]" : "hover:bg-[#FAFAF8]"
      }`}
    >
      <td
        className={`sticky left-0 z-10 border-r border-[rgba(0,0,0,0.08)] px-2 ${rowBg}`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggle(group.key)
            }}
            aria-expanded={expanded}
            aria-label={`${group.customer} 하위 ${group.rows.length}건 ${expanded ? "접기" : "펼치기"}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#615D59] transition hover:bg-[#F0F0EC] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="min-w-0 truncate text-[12px] font-bold text-[#111110]">{group.customer}</span>
              <span className="shrink-0 rounded-full bg-[#ECFDF5] px-1 text-[9px] font-bold text-[#084734]">{group.rows.length}</span>
              {group.hasDraft && (
                <span className="shrink-0 rounded-full bg-[#FBF1E0] px-1 text-[9px] font-bold text-[#7A520F]">장부</span>
              )}
              {group.mismatchCount > 0 && (
                <span
                  title={`주차 합계 ≠ 월 금액 ${group.mismatchCount}행${group.mismatchMonths.length ? ` · 가장 이른 ${formatMonthLabel([...group.mismatchMonths].sort()[0])}` : ""}`}
                  className="inline-flex shrink-0"
                >
                  <AlertTriangle className="h-3 w-3 text-[#B43E3E]" aria-label={`불일치 ${group.mismatchCount}건`} />
                </span>
              )}
              {needsLink && <NeedsLinkBadge customer={group.customer} />}
            </div>
            {(group.managers.length > 0 || group.regions.length > 0) && (
              <span
                title={[group.managers.join(", "), group.teams.join(", "), group.regions.join(", ")].filter(Boolean).join(" · ")}
                className="block truncate text-[9.5px] font-semibold text-[#A39E98]"
              >
                {[group.managers.join("·"), group.regions.join("·")].filter(Boolean).join(" · ") || "-"}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="border-l border-[#F2F1EE] px-1.5 text-right" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        <div className="flex flex-wrap items-center justify-end gap-x-1">
          {/* 접힌 고객 헤더에는 링크를 걸지 않는다 — ▸로 펼친 뒤 카테고리/품목 행에서 하드웨어로 이동. */}
          {group.categories.map((category) => (
            <span
              key={category}
              title={`${productCategoryMeta(category).label} ${formatMoney(group.categoryTotals[category])}`}
              className={`text-[10px] font-semibold ${category === "hardware" ? "text-[#7A520F]" : "text-[#615D59]"}`}
            >
              {productCategoryMeta(category).shortLabel}
            </span>
          ))}
        </div>
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByGroup}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] px-2 text-right align-middle tabular-nums ${rowBg}`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total > 0 ? (
          <>
            <span className={`block text-[11.5px] leading-tight ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
            {annual.confirmed > 0 && (
              <span className="block text-[9px] font-semibold leading-tight text-[#084734]">확정 {formatWeekAmount(annual.confirmed)}</span>
            )}
          </>
        ) : (
          <span className="text-[11px] font-semibold text-[#C9C5BF]">–</span>
        )}
      </td>
    </tr>
  )
})

// 개별 딜행. 고객명 아래 서브라인에 담당자/팀/지역 이관. 확장된 달만 주차 5칸.
const RevMatrixDealRow = memo(function RevMatrixDealRow({
  view,
  grouped,
  nested = false,
  hardwareLinked = false,
  needsLink = false,
  months,
  expandedMonths,
  active,
  selectedMonth,
  onOpen,
  actions = null,
  // 선택/편집 좌표는 이 행 스코프로 좁혀서 온다(다른 행 선택이면 null) — 부모가 행별로 계산.
  // 덕분에 memo가 이 행이 선택/편집에 관여할 때만 리렌더되고, 나머지 행은 스킵된다.
  selectedCoord = null,
  editingCoord = null,
  editBuffer = "",
  editConfidence = "expected",
  pendingByCell = null,
  density = "regular",
  sourceLabel,
}: {
  view: RevRowView
  grouped: boolean
  nested?: boolean // 카테고리(HW/SW) 합산행 아래 품목 잎 행 — 한 단계 더 들여쓰기
  hardwareLinked?: boolean // 하드웨어 원장에 출고 이력이 있어 역링크를 걸어도 되는 고객인지
  needsLink?: boolean // account-master unmatched 판정 — 단독 딜행(비그룹)에만 '연결 ↗' 딥링크(SL-4)
  months: string[]
  expandedMonths: Set<string>
  active: boolean
  selectedMonth: string
  onOpen: (row: LedgerRevenueRow) => void
  actions?: MatrixEditorActions | null
  selectedCoord?: MatrixCellCoord | null
  editingCoord?: MatrixCellCoord | null
  editBuffer?: string
  editConfidence?: DraftConfidence
  pendingByCell?: Map<string, MatrixPendingDraft> | null
  density?: MatrixDensity
  // 셀 계보 툴팁(2026-07-17 사용성 디벨롭 항목 2) — "시트 미러 vs 장부 임포트"는 부모가
  // 이미 가진 Source 스트립 신호(dbImportInfo/dbSourceServerState)에서 계산해 내려준다.
  // 이 행은 신규 fetch 없이 문자열만 소비한다.
  sourceLabel?: string
}) {
  const { row, draftRow, productCategory, monthlyByMonth } = view
  const rowBg = active
    ? "bg-[#ECFDF5]"
    : draftRow
      ? "bg-[#FFFCF5] group-hover:bg-[#FBF1E0]"
      : grouped
        ? "bg-[#FBFBFA] group-hover:bg-[#FAFAF8]"
        : "bg-white group-hover:bg-[#FAFAF8]"
  const subLine = draftRow
    ? `${row.draftKind === "edit-row" ? "수정" : "신규"} · ${formatMonthLabel(row.draftMonth ?? selectedMonth)}${row.draftNote ? ` · ${row.draftNote}` : ""}`
    : [row.manager, row.team, row.region].filter(Boolean).join(" · ")
  const annual = view.annual
  const annualTone = matrixBucketTone(annual)
  const weeklyByMonth = (month: string) => {
    const split = rowWeeklySplit(row, month)
    if (split.source === "empty") return null
    return {
      weeks: split.source === "explicit" || split.source === "inferred" ? split.weeks : [0, 0, 0, 0, 0],
      inferred: split.source === "inferred",
      monthOnlyAmount: split.source === "month-only" ? split.total : 0,
      mismatch: rowWeeklyMismatch(row, month) !== null,
    }
  }
  // 편집 컨텍스트는 actions가 주입될 때만(딜행) — 그룹 소계행에는 이 컴포넌트를 쓰지 않으므로 항상 딜행.
  // isSelectedCell/isEditingCell는 행 스코프 좌표(selectedCoord/editingCoord)와 month·week를 비교한다 —
  // 원 isSelected/isEditing 규약과 동일(행 rowId 일치는 좌표가 이미 이 행일 때만 non-null이라 내포).
  const editContext: RevMatrixEditContext | null = actions
    ? {
        rowId: row.id,
        actions,
        isSelectedCell: (month, week) =>
          selectedCoord != null && selectedCoord.month === month && (selectedCoord.week ?? -1) === (week ?? -1),
        isEditingCell: (month, week) =>
          editingCoord != null && editingCoord.month === month && (editingCoord.week ?? -1) === (week ?? -1),
        editBuffer,
        editConfidence,
        lockLabel: row.ledgerOrigin === "draft" ? "장부 반영" : "시트 확정",
        editableOf: (month) => isMatrixCellEditable(row, month),
        lockedOf: (month) => isMatrixCellLocked(row, month),
        pendingOf: (month) => pendingByCell?.get(`${row.id}::${month}`) ?? null,
        // 주차 잠금 = 그 달 시트 확정 여부(월 잠금 규칙 승계). 주차 pending = `rowId::month::wN` 키.
        weekLockedOf: (month) => isMatrixCellLocked(row, month),
        weekPendingOf: (month, week) => pendingByCell?.get(`${row.id}::${month}::w${week + 1}`) ?? null,
        weekEditNotice: (month) =>
          rowWeeklySplit(row, month).source === "explicit"
            ? "커밋 시 이 달 금액이 주차 합계로 재기재됩니다 (기존 주차 병합 보존)"
            : "적용 시 이 달 전체가 이 값으로 대체됩니다 (주차 분해 없음)",
      }
    : null
  return (
    <tr className={`group ${MATRIX_DEAL_ROW_HEIGHT[density]} border-t border-[#F2F1EE] transition ${active ? "bg-[#ECFDF5]" : draftRow ? "bg-[#FFFCF5] hover:bg-[#FBF1E0]" : grouped ? "bg-[#FBFBFA] hover:bg-[#FAFAF8]" : "hover:bg-[#FAFAF8]"}`}>
      <td
        className={`sticky left-0 z-10 border-r border-[rgba(0,0,0,0.08)] pr-2 ${nested ? "border-l-2 border-l-[#CBD9D2] pl-12" : grouped ? "border-l-2 border-l-[#DDE7E2] pl-7" : "pl-2"} ${rowBg}`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => void onOpen(row)}
              title={`${row.customer} 상세 열기`}
              className="block max-w-full truncate text-left text-[11.5px] font-bold text-[#111110] underline-offset-2 hover:text-[#084734] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
              aria-label={`${row.customer} 상세 열기`}
            >
              {grouped ? row.productVersion || row.customer : row.customer}
            </button>
            {subLine && (
              <span title={subLine} className={`block truncate text-[9.5px] font-semibold ${draftRow ? "text-[#7A520F]" : "text-[#A39E98]"}`}>
                {subLine}
              </span>
            )}
          </div>
          {row.sheetRow != null && (
            <span
              tabIndex={0}
              title={`시트 '2. REV' ${row.sheetRow}행 · 원천 ${sourceLabel ?? "미확인"}`}
              className="shrink-0 cursor-help text-[10px] font-semibold text-[#A39E98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
              aria-label={`계보: 시트 '2. REV' ${row.sheetRow}행, 원천 ${sourceLabel ?? "미확인"}`}
            >
              ⓘ
            </span>
          )}
          {/* 그룹 고객은 그룹 소계행이 배지를 가진다 — 단독 딜행에만 미연결 딥링크(중복 노출 방지). */}
          {!grouped && needsLink && <NeedsLinkBadge customer={row.customer} />}
          {productCategory === "hardware" && !nested && hardwareLinked ? (
            // 단일 품목 HW 행 + 하드웨어 원장에 출고 이력 있는 고객만 역링크. 중첩 품목행은 위 카테고리 행이 링크를 가진다.
            <Link
              href={`/admin/hardware?customer=${encodeURIComponent(row.customer)}`}
              title={`${row.customer} 하드웨어 거래이력 열기`}
              className="shrink-0 text-[10px] font-semibold text-[#7A520F] underline-offset-2 transition hover:text-[#A8741A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
            >
              HW ↗
            </Link>
          ) : (
            <span className={`shrink-0 text-[10px] font-semibold ${productCategory === "hardware" ? "text-[#7A520F]" : "text-[#A39E98]"}`}>{productCategoryMeta(productCategory).shortLabel}</span>
          )}
        </div>
      </td>
      <td className="border-l border-[#F2F1EE] px-1.5 text-right align-middle" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        <span className={`text-[10px] font-semibold ${draftRow ? "text-[#A8741A]" : "text-[#A39E98]"}`}>
          {draftRow ? "장부" : "시트"}
        </span>
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByMonth}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
        editContext={editContext}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] px-2 text-right align-middle tabular-nums ${rowBg}`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total > 0 ? (
          <span className={`block text-[11px] leading-tight ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
        ) : (
          <span className="text-[11px] font-semibold text-[#C9C5BF]">–</span>
        )}
      </td>
    </tr>
  )
})

// 고객 펼침 시 카테고리(HW/SW) 합산 1행. 그 카테고리 품목들의 12개월 소계를 한 줄로 보여준다.
// 개별 품목행 대신 "HW 쭉 하나로, SW 하나로" 구조 — 품목명은 서브라인에, 상세/편집은 우측 rail에서.
const RevMatrixCategoryRow = memo(function RevMatrixCategoryRow({
  category,
  customer,
  products,
  monthlyByMonth,
  annual,
  rows,
  months,
  expandedMonths,
  expanded,
  editable,
  hardwareLinked,
  onToggle,
  onOpen,
  density = "regular",
}: {
  category: Exclude<RevProductCategory, "all">
  customer: string
  products: string[]
  monthlyByMonth: Record<string, RevMonthlyBucket>
  annual: RevMonthlyBucket
  rows: LedgerRevenueRow[]
  months: string[]
  expandedMonths: Set<string>
  expanded: boolean
  editable: boolean // 이 카테고리에 편집 가능한 품목이 있는지(전부 잠금이면 ▸ 대신 잠금 표시)
  hardwareLinked: boolean // 하드웨어 원장에 출고 이력이 있어 역링크 걸어도 되는 고객인지
  onToggle: () => void
  onOpen: () => void
  density?: MatrixDensity
}) {
  const rowBg = category === "hardware" ? "bg-[#FFFCF5] group-hover:bg-[#FBF6EC]" : "bg-[#FBFBFA] group-hover:bg-[#FAFAF8]"
  const annualTone = matrixBucketTone(annual)
  const subLine = products.slice(0, 3).join(" · ") + (products.length > 3 ? ` +${products.length - 3}` : "")
  // 확장월 주차 5칸: 이 카테고리 품목들의 주차 분해를 합산한다.
  const weeklyByMonth = (month: string) => {
    const weeks = [0, 0, 0, 0, 0]
    let hasExplicit = false
    let hasInferred = false
    let monthOnlyAmount = 0
    for (const row of rows) {
      const split = rowWeeklySplit(row, month)
      if (split.source === "explicit" || split.source === "inferred") {
        split.weeks.forEach((value, index) => { weeks[index] += value })
        if (split.source === "explicit") hasExplicit = true
        else hasInferred = true
      } else if (split.source === "month-only") {
        monthOnlyAmount += split.total
      }
    }
    if (!weeks.some((value) => value > 0) && monthOnlyAmount === 0) return null
    return { weeks, inferred: !hasExplicit && hasInferred, monthOnlyAmount, mismatch: false }
  }
  return (
    <tr className={`group ${MATRIX_DEAL_ROW_HEIGHT[density]} border-t border-[#F2F1EE] transition ${
      category === "hardware" ? "bg-[#FFFCF5] hover:bg-[#FBF6EC]" : "bg-[#FBFBFA] hover:bg-[#FAFAF8]"
    }`}>
      <td
        className={`sticky left-0 z-10 border-l-2 border-l-[#DDE7E2] border-r border-[rgba(0,0,0,0.08)] pl-5 pr-2 ${rowBg}`}
        style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            title={expanded ? "품목 접기" : editable ? "품목 펼쳐 엑셀식 편집" : "품목 보기 (전부 확정·잠금)"}
            aria-label={`${productCategoryMeta(category).label} 품목 ${expanded ? "접기" : "펼치기"}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#615D59] transition hover:bg-[#F0F0EC] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onOpen}
            title={`${productCategoryMeta(category).label} 합산 · ${products.join(", ") || "-"} · 상세 열기`}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/30"
          >
            <ProductCategoryPill category={category} compact />
            <span className="min-w-0 truncate text-[11px] font-semibold text-[#615D59]">{subLine || productCategoryMeta(category).label}</span>
          </button>
        </div>
      </td>
      <td className="border-l border-[#F2F1EE] px-1.5 text-right align-middle" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}>
        {category === "hardware" && hardwareLinked ? (
          // 펼친 뒤 나오는 HW 합산행 → 하드웨어 원장 역링크(연결된 고객만).
          <Link
            href={`/admin/hardware?customer=${encodeURIComponent(customer)}`}
            title={`${customer} 하드웨어 거래이력 열기`}
            className="text-[10px] font-semibold text-[#7A520F] underline-offset-2 transition hover:text-[#A8741A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30"
          >
            HW ↗
          </Link>
        ) : (
          <span className="text-[10px] font-semibold text-[#A39E98]">합산</span>
        )}
      </td>
      <RevMatrixMonthStrip
        monthlyByRowOrGroup={monthlyByMonth}
        weeklyByMonth={weeklyByMonth}
        months={months}
        expandedMonths={expandedMonths}
        bgClass={rowBg}
      />
      <td
        className={`sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] px-2 text-right align-middle tabular-nums ${rowBg}`}
        style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
      >
        {annual.total > 0 ? (
          <span className={`block text-[11px] leading-tight ${MATRIX_TONE[annualTone]}`}>{formatWeekAmount(annual.total)}</span>
        ) : (
          <span className="text-[11px] font-semibold text-[#C9C5BF]">–</span>
        )}
      </td>
    </tr>
  )
})

// 하단 sticky 합계행: 월별 확정/고확도/예정 스택 + 월 목표 대비 %.
const RevMatrixFooter = memo(function RevMatrixFooter({
  columns,
  grand,
  months,
  expandedMonths,
}: {
  columns: RevMatrixColumn[]
  grand: RevMonthlyBucket
  months: string[]
  expandedMonths: Set<string>
}) {
  const columnByMonth = new Map(columns.map((column) => [column.month, column]))
  const hasAnyGoal = columns.some((column) => column.goal !== null)
  return (
    <tfoot className="sticky bottom-0 z-20">
      {/* 월별 확정/고확도/예정 스택 */}
      <tr className="h-9 border-t-2 border-[#111110]/15 bg-[#F6F5F4]">
        <td
          className="sticky left-0 z-10 border-r border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[#615D59]"
          style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
        >
          월 합계 (확정·고확도·예정)
        </td>
        <td className="border-l border-[#E7E5E1] bg-[#F6F5F4]" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }} />
        {months.map((month) => {
          const column = columnByMonth.get(month) ?? null
          const bucket = column ?? EMPTY_BUCKET
          const span = expandedMonths.has(month) ? 6 : 1
          const width = span === 6 ? MATRIX_WEEK_W * 5 + MATRIX_MONTH_W : MATRIX_MONTH_W
          return (
            <td
              key={month}
              colSpan={span}
              title={column ? `${formatMonthLabel(month)} 합계 ${formatMoney(bucket.total)} · 확정 ${formatMoney(bucket.confirmed)} · 고확도 ${formatMoney(bucket.high)} · 예정 ${formatMoney(bucket.open)}` : undefined}
              className="border-l border-[#E7E5E1] bg-[#F6F5F4] px-1.5 py-1 text-right align-middle tabular-nums"
              style={{ width, minWidth: width }}
            >
              {bucket.total > 0 ? (
                <span className="flex flex-col items-end leading-none">
                  <span className={`text-[10.5px] font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`}>{formatWeekAmount(bucket.confirmed)}</span>
                  <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatWeekAmount(bucket.high)}</span>
                  <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`}>{formatWeekAmount(bucket.open)}</span>
                </span>
              ) : (
                <span className="text-[11px] text-[#DDD9D3]">·</span>
              )}
            </td>
          )
        })}
        <td
          className="sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-1 text-right align-middle tabular-nums"
          style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
        >
          <span className="flex flex-col items-end leading-none">
            <span className={`text-[11px] font-bold ${CONFIDENCE_TOKENS.confirmed.textClass}`}>{formatWeekAmount(grand.confirmed)}</span>
            <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS["high-confidence"].textClass}`}>{formatWeekAmount(grand.high)}</span>
            <span className={`text-[9px] font-semibold ${CONFIDENCE_TOKENS.expected.textClass}`}>{formatWeekAmount(grand.open)}</span>
          </span>
        </td>
      </tr>
      {/* 월 목표 대비 % (DSH 월 목표 시리즈가 있을 때만) */}
      {hasAnyGoal && (
        <tr className="h-7 border-t border-[#E7E5E1] bg-[#FAFAF8]">
          <td
            className="sticky left-0 z-10 border-r border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[#615D59]"
            style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
          >
            월 목표 대비 (확정)
          </td>
          <td className="border-l border-[#E7E5E1] bg-[#FAFAF8]" style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }} />
          {months.map((month) => {
            const column = columnByMonth.get(month) ?? null
            const span = expandedMonths.has(month) ? 6 : 1
            const width = span === 6 ? MATRIX_WEEK_W * 5 + MATRIX_MONTH_W : MATRIX_MONTH_W
            const pct = column && column.goal ? (column.confirmed / column.goal) * 100 : null
            const tone = pct === null ? "text-[#C9C5BF]" : pct >= 100 ? "text-[#084734]" : pct >= 60 ? "text-[#A8741A]" : "text-[#B43E3E]"
            return (
              <td
                key={month}
                colSpan={span}
                title={column && column.goal ? `${formatMonthLabel(month)} 목표 ${formatMoney(column.goal)} · 확정 ${formatMoney(column.confirmed)}` : "월 목표 미설정"}
                className="border-l border-[#E7E5E1] bg-[#FAFAF8] px-1.5 text-right align-middle tabular-nums"
                style={{ width, minWidth: width }}
              >
                <span className={`text-[10px] font-bold ${tone}`}>{pct === null ? "·" : `${Math.round(pct)}%`}</span>
              </td>
            )
          })}
          <td
            className="sticky right-0 z-10 border-l border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-right align-middle tabular-nums"
            style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
          >
            {(() => {
              const goalSum = columns.reduce((sum, column) => sum + (column.goal ?? 0), 0)
              const goalMonths = columns.filter((column) => column.goal !== null).length
              const pct = goalSum > 0 ? (grand.confirmed / goalSum) * 100 : null
              const tone = pct === null ? "text-[#C9C5BF]" : pct >= 100 ? "text-[#084734]" : pct >= 60 ? "text-[#A8741A]" : "text-[#B43E3E]"
              // 분모는 '목표가 설정된 달'만 — 부분 목표일 때 연간 순항으로 오독하지 않게 표기한다.
              return (
                <span
                  title={pct === null ? undefined : `목표 설정 ${goalMonths}/${columns.length}개월 합계 대비 확정${goalMonths < columns.length ? " — 부분 목표 기준" : ""}`}
                  className={`text-[10.5px] font-bold ${tone}`}
                >
                  {pct === null ? "·" : `${Math.round(pct)}%${goalMonths < columns.length ? "*" : ""}`}
                </span>
              )
            })()}
          </td>
        </tr>
      )}
    </tfoot>
  )
})

export default function SalesLedgerWorkbench() {
  const router = useRouter()
  const [team, setTeam] = useState<Team>("ALL")
  const [period, setPeriod] = useState<Period>("Q")
  const [selectedMonth, setSelectedMonth] = useState(() => ymKeyUtc(new Date()))
  const [lens, setLens] = useState<LedgerLens>("rev")
  // DSH 수치 그리드의 Goal/Status/Gap 토글 — 렌즈 로컬 상태.
  const [dshGridView, setDshGridView] = useState<DshGridView>("goal")
  const lensPanelRef = useRef<HTMLDivElement | null>(null)
  // 두 tablist(렌즈 전환, 빠른 작업 보기 전환)의 롤빙 tabIndex 포커스 대상.
  const lensTabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const railTabRefs = useRef<Array<HTMLButtonElement | null>>([])
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
  const [revPageSize, setRevPageSize] = useState<RevPageSize>(100)
  const [revPage, setRevPage] = useState(1)
  const [expandedRevGroups, setExpandedRevGroups] = useState<Set<string>>(() => new Set())
  // 카테고리(HW/SW) 합산행 펼침 상태. 키=`${groupKey}::${category}`. 펼치면 그 카테고리 품목행(편집 가능) 노출.
  const [expandedRevCategories, setExpandedRevCategories] = useState<Set<string>>(() => new Set())
  // 매트릭스: 월 헤더 클릭 시 그 달만 w1~w5 5칸으로 확장(기본은 전부 요약 1칸).
  const [expandedRevMonths, setExpandedRevMonths] = useState<Set<string>>(() => new Set())
  // 매트릭스 행 밀도(좁게/보통/넓게). SSR 하이드레이션 안전을 위해 기본값으로 시작하고 마운트 후 복원.
  const [matrixDensity, setMatrixDensity] = useState<MatrixDensity>("regular")
  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem(MATRIX_DENSITY_STORAGE_KEY)
    if (isMatrixDensity(saved)) setMatrixDensity(saved)
  }, [])
  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(MATRIX_DENSITY_STORAGE_KEY, matrixDensity)
  }, [matrixDensity])
  // 기존 목표대비/주차별/담당자·상품군 패널은 접이식 보조 패널로 강등(기본 접힘). 1차 뷰는 매트릭스.
  const [revAuxOpen, setRevAuxOpen] = useState(false)
  // 매트릭스 셀 커밋 실패(로컬 폴백) 등 편집 지점 인근 알림 토스트 — 상단 Source 바만으로는
  // 편집 중 시야 밖이라 침묵 실패가 되던 문제 대응. 7초 뒤 자동 소멸.
  const [matrixToast, setMatrixToast] = useState<{ kind: "error" | "info"; text: string } | null>(null)
  // 단일 슬롯이라 에러 표시 도중 뒤이은 info 토스트가 그걸 덮어써 실패 알림을 놓칠 수 있었다
  // — 에러가 떠 있는 동안은 info로 덮어쓰지 않는다(에러 자체는 항상 최신 것으로 갱신).
  const pushMatrixToast = useCallback((next: { kind: "error" | "info"; text: string }) => {
    setMatrixToast((current) => (current?.kind === "error" && next.kind !== "error" ? current : next))
  }, [])
  useEffect(() => {
    if (!matrixToast) return
    const timer = window.setTimeout(() => setMatrixToast(null), 7000)
    return () => window.clearTimeout(timer)
  }, [matrixToast])
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(true)
  const [railView, setRailView] = useState<RailView>("detail")
  const [selectedRow, setSelectedRow] = useState<LedgerRevenueRow | null>(null)
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
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
  // 매트릭스 12개 열의 회계월 값(4→3 순서). monthOptions와 동일 순서·동일 배열이나 값만 뽑아
  // 그룹/행 파생값 루프와 컬럼 memo가 공유한다.
  const matrixMonths = useMemo(() => monthOptions.map((option) => option.value), [monthOptions])

  // 주간 마감(Weekly Close): 스냅샷 run 목록 + 두 run의 선택 월 diff.
  const [wcRuns, setWcRuns] = useState<WeeklyCloseRunView[]>([])
  const [wcBase, setWcBase] = useState("")
  const [wcHead, setWcHead] = useState("")
  const [wcDiff, setWcDiff] = useState<WeeklyCloseDiffView | null>(null)
  const [wcLoading, setWcLoading] = useState(false)
  const [wcError, setWcError] = useState<string | null>(null)
  const [wcSnapshotting, setWcSnapshotting] = useState(false)
  const [wcNotice, setWcNotice] = useState<string | null>(null)

  const loadWeeklyCloseRuns = useCallback(async () => {
    setWcError(null)
    try {
      const data = await adminFetchJson<{ runs?: WeeklyCloseRunView[] }>(
        "/api/admin/branch/ledger/weekly-close",
        { cache: "no-cache" },
      )
      const runs = data.runs ?? []
      setWcRuns(runs)
      setWcHead((current) => (current && runs.some((run) => run.id === current) ? current : runs[0]?.id ?? ""))
      setWcBase((current) => (current && runs.some((run) => run.id === current) ? current : runs[1]?.id ?? ""))
    } catch (error) {
      setWcError(errorMessage(error))
    }
  }, [])

  useEffect(() => {
    if (lens === "dsh") void loadWeeklyCloseRuns()
  }, [lens, loadWeeklyCloseRuns])

  useEffect(() => {
    if (lens !== "dsh" || !wcBase || !wcHead || wcBase === wcHead) {
      setWcDiff(null)
      return
    }
    let active = true
    setWcLoading(true)
    adminFetchJson<{ diff?: WeeklyCloseDiffView }>(
      `/api/admin/branch/ledger/weekly-close?base=${encodeURIComponent(wcBase)}&head=${encodeURIComponent(wcHead)}&month=${encodeURIComponent(selectedMonth)}`,
      { cache: "no-cache" },
    )
      .then((data) => {
        if (!active) return
        setWcDiff(data.diff ?? null)
        setWcError(null)
      })
      .catch((error) => {
        if (active) setWcError(errorMessage(error))
      })
      .finally(() => {
        if (active) setWcLoading(false)
      })
    return () => {
      active = false
    }
  }, [lens, selectedMonth, wcBase, wcHead])

  const captureWeeklySnapshot = useCallback(async () => {
    setWcSnapshotting(true)
    setWcNotice(null)
    setWcError(null)
    try {
      const result = await adminFetchJson<{ run: WeeklyCloseRunView; unchanged: boolean }>(
        "/api/admin/branch/ledger/weekly-close",
        { method: "POST" },
      )
      setWcNotice(
        result.unchanged
          ? "직전 스냅샷과 동일한 상태라 새로 기록하지 않았습니다."
          : `스냅샷 기록 완료 · 행 ${(result.run.rowCounts?.rev_lines ?? 0).toLocaleString("ko-KR")}건`,
      )
      await loadWeeklyCloseRuns()
      if (!result.unchanged) {
        setWcBase((current) => (current === result.run.id ? "" : current) || wcHead)
        setWcHead(result.run.id)
      }
    } catch (error) {
      setWcError(errorMessage(error))
    } finally {
      setWcSnapshotting(false)
    }
  }, [loadWeeklyCloseRuns, wcHead])

  // REV DB-native 소스 상태. dbImportInfo가 있으면 액티브 소스가 DB 임포트 run이라는 뜻이고,
  // 그때는 시트 동기화만으로는 화면이 안 바뀐다(요약/REV/KPI가 고정 run을 읽음) — 재캡처 필요.
  // SSR 하이드레이션 안전을 위해 null로 시작하고, 마운트 후 localStorage로 선복원한 뒤
  // 서버(GET db-import)로 확정한다. 서버 응답이 도착하면 그 값이 항상 이긴다.
  const [dbImportInfo, setDbImportInfo] = useState<RevDbImportInfo | null>(null)
  const [dbSourceServerState, setDbSourceServerState] = useState<"unknown" | "active" | "inactive">("unknown")
  const [dbImportBusy, setDbImportBusy] = useState(false)
  const [dbImportNotice, setDbImportNotice] = useState<string | null>(null)
  const [dbImportError, setDbImportError] = useState<string | null>(null)
  // captureDbImport(deps [])에서 직전 액티브 run을 비교하기 위한 미러 — dedupe 응답이
  // "기존 run 재활성화"(다른 run으로 전환)인지 "완전 동일"인지 구분하는 데 쓴다.
  const dbImportRunIdRef = useRef<string | null>(null)
  useEffect(() => {
    dbImportRunIdRef.current = dbImportInfo?.runId ?? null
  }, [dbImportInfo])
  useEffect(() => {
    setDbImportInfo(loadStoredRevDbImport())
    let cancelled = false
    void (async () => {
      try {
        const status = await adminFetchJson<ActiveRevImportStatusResponse>("/api/admin/branch/ledger/db-import")
        if (cancelled) return
        if (status.active && status.runId) {
          const info = { runId: status.runId, capturedAt: status.capturedAt ?? "" }
          setDbImportInfo(info)
          setDbSourceServerState("active")
          storeRevDbImport(info)
        } else {
          setDbImportInfo(null)
          setDbSourceServerState("inactive")
          clearStoredRevDbImport()
        }
      } catch {
        // 서버 확인 실패(권한/네트워크) — localStorage 폴백을 유지하고 unknown으로 둔다.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  // 서버가 확정한 상태가 항상 이긴다. unknown일 때만 로컬 폴백(localStorage 복원값)과
  // 보조 신호(최신 주간 마감 스냅샷의 dataSource)로 판별한다 — 이 폴백이 시트 모드 배포를
  // DB-native로 뒤집을 수 있으므로, 서버 GET이 inactive를 확인하면 즉시 꺼진다.
  const dbNativeActive =
    dbSourceServerState === "active"
      ? true
      : dbSourceServerState === "inactive"
        ? false
        : Boolean(dbImportInfo) || wcRuns[0]?.dataSource === "db-import"

  // REV 매트릭스 행의 계보 툴팁(항목 2)에서 재사용할 원천 라벨 — Source 스트립(위 4725행대)과
  // 동일한 신호를 그대로 문구화한다. 신규 fetch 없음.
  const revRowSourceLabel = dbImportInfo
    ? `장부 임포트 · ${formatDateTime(dbImportInfo.capturedAt)}`
    : dbSourceServerState === "inactive"
      ? "시트 미러"
      : "미확인"

  // DB 재동기화: 시트 미러(branch_rev_deals)를 버전드 임포트로 재캡처하고 그 run을 활성화한다.
  // 서버가 checksum dedupe를 하므로 변경이 없으면 기존 run을 돌려준다(deduped=true) —
  // 단, dedupe여도 매치된 run이 직전 액티브 run과 다르면 액티브 소스가 전환된 것이므로
  // runChanged=true로 알려 호출부가 refetch하게 한다(과거 상태로 되돌린 시트 재캡처 케이스).
  // 에러는 던지지 않고 Source 바 인라인(dbImportError)으로만 표면화한다 — 시트 동기화 성공을
  // 가리지 않기 위해서다.
  const captureDbImport = useCallback(async (): Promise<(RevDbImportResponse & { runChanged: boolean }) | null> => {
    setDbImportBusy(true)
    setDbImportNotice(null)
    setDbImportError(null)
    try {
      const result = await adminFetchJson<RevDbImportResponse>("/api/admin/branch/ledger/db-import", {
        method: "POST",
      })
      const prevRunId = dbImportRunIdRef.current
      const runSwitched = prevRunId != null && prevRunId !== result.runId
      const runChanged = prevRunId == null || runSwitched
      const info = { runId: result.runId, capturedAt: result.capturedAt }
      setDbImportInfo(info)
      setDbSourceServerState("active")
      storeRevDbImport(info)
      setDbImportNotice(
        !result.deduped
          ? `새 run 캡처됨 · 행 ${result.lineCount.toLocaleString("ko-KR")}건`
          : runSwitched
            ? "재동기화 완료 — 기존 run 재활성화(데이터 전환)"
            : "재동기화 완료 — 변경 없음(run 유지)",
      )
      return { ...result, runChanged }
    } catch (error) {
      setDbImportError(errorMessage(error))
      return null
    } finally {
      setDbImportBusy(false)
    }
  }, [])

  // 필터 상태 URL 동기화 — 새로고침/링크 공유 시 렌즈·월·검색·필터·정렬이 유지된다.
  // 마운트 시 한 번 읽고(urlReady 전에는 쓰지 않음), 이후 변경마다 replaceState로 반영(히스토리 오염 없음).
  const defaultMonthRef = useRef(ymKeyUtc(new Date()))
  const [urlReady, setUrlReady] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const lensParam = params.get("lens")
    // KPI 렌즈는 KR Team 파이프라인 탭으로 흡수됐다 — 옛 링크(?lens=kpi)는 그리로 리다이렉트.
    if (lensParam === "kpi") {
      router.replace("/admin/branch?tab=pipeline")
      return
    }
    if (lensParam === "dsh" || lensParam === "rev") setLens(lensParam)
    const monthParam = params.get("month")
    if (monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) setSelectedMonth(monthParam)
    const periodParam = params.get("period")
    if (periodParam && (PERIODS as string[]).includes(periodParam)) setPeriod(periodParam as Period)
    const teamParam = params.get("team")
    if (teamParam && (TEAMS as string[]).includes(teamParam)) setTeam(teamParam as Team)
    const q = params.get("q")
    if (q) setQuery(q)
    const mgr = params.get("mgr")
    if (mgr) setManagerFilter(mgr)
    const region = params.get("region")
    if (region) setRegionFilter(region)
    const prod = params.get("prod")
    if (prod === "software" || prod === "hardware" || prod === "unknown") setProductFilter(prod)
    const status = params.get("status")
    if (status) setRevStatusFilter(status)
    const dealType = params.get("type")
    if (dealType) setRevDealTypeFilter(dealType)
    const origin = params.get("origin")
    if (origin === "sheet" || origin === "draft") setRevOriginFilter(origin)
    const fc = params.get("fc")
    if (fc && REV_FORECAST_FILTERS.some((item) => item.id === fc)) setRevForecastFilter(fc as RevForecastFilter)
    const sort = params.get("sort")
    if (sort && sort in REV_SORT_LABELS) setRevSortKey(sort as RevSortKey)
    const dir = params.get("dir")
    if (dir === "asc" || dir === "desc") setRevSortDirection(dir)
    const ps = Number(params.get("ps"))
    if ((REV_PAGE_SIZES as readonly number[]).includes(ps)) setRevPageSize(ps as RevPageSize)
    const pageParam = Number(params.get("p"))
    if (Number.isInteger(pageParam) && pageParam > 1) setRevPage(pageParam)
    setUrlReady(true)
  }, [router])

  useEffect(() => {
    if (!urlReady) return
    const params = new URLSearchParams()
    if (lens !== "rev") params.set("lens", lens)
    if (selectedMonth !== defaultMonthRef.current) params.set("month", selectedMonth)
    if (period !== "Q") params.set("period", period)
    if (team !== "ALL") params.set("team", team)
    if (query.trim()) params.set("q", query.trim())
    if (managerFilter !== "ALL") params.set("mgr", managerFilter)
    if (regionFilter !== "ALL") params.set("region", regionFilter)
    if (productFilter !== "all") params.set("prod", productFilter)
    if (revStatusFilter !== "ALL") params.set("status", revStatusFilter)
    if (revDealTypeFilter !== "ALL") params.set("type", revDealTypeFilter)
    if (revOriginFilter !== "all") params.set("origin", revOriginFilter)
    if (revForecastFilter !== "all") params.set("fc", revForecastFilter)
    if (revSortKey !== "revenue") params.set("sort", revSortKey)
    if (revSortDirection !== "desc") params.set("dir", revSortDirection)
    if (revPageSize !== 100) params.set("ps", String(revPageSize))
    // 페이지 번호도 보존 — 3페이지 검수 중 새로고침하면 1페이지로 튕기던 맥락 소실 방지.
    if (revPage > 1) params.set("p", String(revPage))
    const search = params.toString()
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (nextUrl !== currentUrl) window.history.replaceState(null, "", nextUrl)
  }, [
    urlReady,
    lens,
    selectedMonth,
    period,
    team,
    query,
    managerFilter,
    regionFilter,
    productFilter,
    revStatusFilter,
    revDealTypeFilter,
    revOriginFilter,
    revForecastFilter,
    revSortKey,
    revSortDirection,
    revPageSize,
    revPage,
  ])

  const defaultDraftForm = useMemo<DraftForm>(() => ({
    operation: "forecast-add",
    customer: "",
    manager: "",
    team: team === "ALL" ? "BD" : team,
    productCategory: "software",
    month: selectedMonth,
    fromMonth: selectedMonth,
    week: "month",
    confidence: "expected",
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
    setRevPageSize(100)
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

  // 하드웨어 콘솔 역링크 게이팅: 하드웨어 원장에 실제 출고 이력이 있는 고객사만 링크로 건다.
  // 출고 목적지(to_location)가 창고/샘플/고객(generic) 등이 아닌 실제 고객사명인 것만 수집.
  const hardware = useBranchJson<{ movements?: Array<{ movement_type: string; to_location: string | null }> }>(`/api/admin/hardware`, refreshKey)
  const hardwareCustomerKeys = useMemo(() => {
    const set = new Set<string>()
    const generic = new Set(["창고", "샘플", "고객", "수리", "사무실", "본사", "office", "외부/고객", "외부", "재고"])
    for (const movement of hardware.data?.movements ?? []) {
      if (movement.movement_type !== "outbound") continue
      const location = movement.to_location?.trim()
      if (!location || generic.has(location)) continue
      const key = normalizedAccountKey(location)
      if (key) set.add(key)
    }
    return set
  }, [hardware.data?.movements])
  // 데이터 로드 전엔 링크 유지(로딩 중 유효 링크가 사라지는 깜빡임 방지), 로드 후엔 연결된 고객만.
  const isHardwareLinked = useCallback(
    (customer: string) => !hardware.data || hardwareCustomerKeys.has(normalizedAccountKey(customer)),
    [hardware.data, hardwareCustomerKeys],
  )

  // SL-4: account-master의 'needs link'(미연결 REV 계정) 판정을 행에 매핑한다. 판정은 서버
  // (lib/repositories/account-master.ts getAccountMaster)의 unmatched 산출을 그대로 소비 —
  // "확정 branch_rev_sheet 링크는 target 종류(딜 포함) 무관 연결됨" 규칙이 리포지토리에 봉인돼
  // 있으므로 클라이언트에서 재판정하지 않는다(확정 링크를 미연결로 오표기하는 회귀 차단).
  // hardwareLinked와 반대로 로딩/실패 중엔 링크를 아예 걸지 않는다(기본 false = 오표기 없음).
  const accountMaster = useBranchJson<{ unmatched?: Array<{ accountKey: string; name: string }> }>(
    "/api/admin/crm/account-master",
    refreshKey,
  )
  const needsLinkKeys = useMemo(() => {
    const set = new Set<string>()
    for (const entry of accountMaster.data?.unmatched ?? []) {
      if (entry.accountKey) set.add(entry.accountKey)
    }
    return set
  }, [accountMaster.data?.unmatched])
  const isNeedsLink = useCallback(
    (customer: string) => needsLinkKeys.size > 0 && needsLinkKeys.has(normalizedAccountKey(customer)),
    [needsLinkKeys],
  )

  const sheetRows = useMemo<LedgerRevenueRow[]>(() => {
    return (pipeline.data?.rows ?? []).map((row) => ({
      ...row,
      ledgerOrigin: "sheet" as const,
    }))
  }, [pipeline.data?.rows])
  const members = useMemo(() => kpi.data?.members ?? [], [kpi.data?.members])
  const ledgerEntryRows = useMemo<LedgerRevenueRow[]>(() => {
    return ledgerEntries
      .filter((entry) => entry.entryStatus === "active")
      // REV 매트릭스는 M/Q 토글과 무관하게 회계연도 12개월 전체를 보여준다. 시트행은 period로
      // 안 거르는데 적용초안만 걸러 분기 밖 입력이 행째 사라지던 버그 → 표시 열(matrixMonths)로 스코프.
      .filter((entry) => matrixMonths.includes(entry.month))
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
        ...appliedDraftConfidenceMaps(entry.month, entry.amount, entry.metadata),
        // 주차 초안: 병합 배열(metadata.weekly) 우선, 없으면 단일 주차 토큰(metadata.week). 주차합==월합 유지.
        weeklyPayments: weeklyPaymentsFromDraftMetadata(entry.month, entry.amount, entry.metadata),
        ledgerOrigin: "draft" as const,
        draftId: entry.draftId,
        draftKind: entry.entryType === "manual-edit" ? "edit-row" : "new-row",
        draftMonth: entry.month,
        draftNote: entry.note,
        draftMetadata: entry.metadata,
        sourceDealId: entry.sourceDealId,
      }))
  }, [ledgerEntries, matrixMonths, team])
  const appliedDraftFallbackRows = useMemo<LedgerRevenueRow[]>(() => {
    return drafts
      .filter((draft) => draft.status === "applied")
      .filter((draft) => !draft.id.startsWith("local-"))
      // 버그 #3과 동일: 적용초안은 M/Q가 아니라 표시 열(matrixMonths) 스코프. 분기 밖 적용분 증발 방지.
      .filter((draft) => matrixMonths.includes(draft.month))
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
        ...appliedDraftConfidenceMaps(draft.month, draft.amount, draft.metadata),
        // 주차 초안: 병합 배열(metadata.weekly) 우선, 없으면 단일 주차 토큰(metadata.week). 주차합==월합 유지.
        weeklyPayments: weeklyPaymentsFromDraftMetadata(draft.month, draft.amount, draft.metadata),
        ledgerOrigin: "draft" as const,
        draftId: draft.id,
        draftKind: draft.kind,
        draftMonth: draft.month,
        draftNote: draft.note,
        draftMetadata: draft.metadata,
        sourceDealId: draft.sourceDealId,
      }))
  }, [drafts, matrixMonths, team])
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
  // 적용된 수정(edit-row) 초안은 원본 시트행의 "그 달"을 대체한다(신규 추가가 아니라 정정).
  // sourceDealId===시트행 id, draftMonth===대상 월. (dealId→월집합)으로 모아둔다.
  const editRowOverrideMonths = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const row of replacementAppliedDraftRows) {
      const dealId = row.sourceDealId
      const month = row.draftMonth
      if (!dealId || !month) continue
      const months = map.get(dealId) ?? new Set<string>()
      months.add(month)
      map.set(dealId, months)
    }
    return map
  }, [replacementAppliedDraftRows])
  // 원본 시트행 + 적용초안행을 합치되, 수정초안이 가리키는 (딜, 월) 셀은 원본에서 제거한다.
  // 안 그러면 원본 금액 + 정정 금액이 그 달의 월·연간·그룹·합계행에 이중 계상된다
  // (amount-change=대체, forecast-add=원본 0이라 무영향 — 둘 다 안전).
  const rows = useMemo(() => {
    if (editRowOverrideMonths.size === 0) return [...appliedDraftRows, ...sheetRows]
    const adjustedSheetRows = sheetRows.map((row) => {
      const overrides = editRowOverrideMonths.get(row.id)
      if (!overrides || overrides.size === 0) return row
      const monthlyPayments = { ...(row.monthlyPayments ?? {}) }
      const monthlyConfirmed = { ...(row.monthlyConfirmed ?? {}) }
      const monthlyHighConfidence = { ...(row.monthlyHighConfidence ?? {}) }
      const monthlyRed = { ...(row.monthlyRed ?? {}) }
      const weeklyPayments = { ...(row.weeklyPayments ?? {}) }
      for (const month of overrides) {
        delete monthlyPayments[month]
        delete monthlyConfirmed[month]
        delete monthlyHighConfidence[month]
        delete monthlyRed[month]
        delete weeklyPayments[month]
      }
      return {
        ...row,
        monthlyPayments,
        monthlyConfirmed,
        monthlyHighConfidence,
        monthlyRed,
        weeklyPayments,
        // 색 보유 여부는 오버라이드 삭제 '전' 원본 기준으로 보존 — 색이 그 달에만 있던 행을
        // 지운 뒤 맵으로 재판정하면 남은 과거 월이 무색상 폴백으로 확정 오집계된다.
        confidenceColorHint: ledgerRowHasColor(row),
      }
    })
    return [...appliedDraftRows, ...adjustedSheetRows]
  }, [appliedDraftRows, sheetRows, editRowOverrideMonths])

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

  // 검수(forecast) 필터만 제외한 베이스 — 검수 인박스 칩의 모집단. 칩 카운트와 "칩 클릭 결과
  // 건수"가 일치하려면 다른 필터(담당자/상품/검색 등)는 이미 반영된 상태에서 세야 한다.
  // (기존엔 무필터 rows 기준이라 담당자 필터 중 "불일치 7" 클릭 → 2행만 나오는 불일치가 있었다.)
  const revBaseFilteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows
      .filter((row) => managerFilter === "ALL" || row.manager === managerFilter)
      .filter((row) => regionFilter === "ALL" || row.region === regionFilter)
      .filter((row) => productFilter === "all" || rowProductCategory(row) === productFilter)
      .filter((row) => revStatusFilter === "ALL" || row.status === revStatusFilter)
      .filter((row) => revDealTypeFilter === "ALL" || row.dealType === revDealTypeFilter)
      .filter((row) => revOriginFilter === "all" || row.ledgerOrigin === revOriginFilter)
      .filter((row) => {
        if (!needle) return true
        const originLabel = row.ledgerOrigin === "draft" ? "장부 입력 applied draft 신규 수정" : "시트 원본 sheet"
        const productMeta = productCategoryMeta(rowProductCategory(row))
        return [row.customer, row.manager, row.team, row.region, row.status, row.dealType, row.productVersion, productMeta.label, productMeta.shortLabel, originLabel, row.draftKind, row.draftNote, row.draftMonth, row.sourceDealId].some((value) =>
          String(value ?? "").toLowerCase().includes(needle),
        )
      })
  }, [managerFilter, productFilter, query, regionFilter, revDealTypeFilter, revOriginFilter, revStatusFilter, rows])

  const filteredRows = useMemo(() => {
    // "연간합계" 헤더 정렬은 표시값과 같은 12개월 전체(모든 확도) 합으로 — period 스코프
    // 확정 전용인 revenue로 정렬하면 눈에 보이는 연간 숫자와 순서가 모순된다.
    const annualOf = (row: LedgerRevenueRow) => matrixMonths.reduce((sum, month) => sum + rowMonthAmount(row, month), 0)
    return revBaseFilteredRows
      .filter((row) => rowMatchesForecastFilterInMonths(row, matrixMonths, revForecastFilter))
      .sort((a, b) => {
        const direction = revSortDirection === "asc" ? 1 : -1
        let result = 0

        if (revSortKey === "revenue") result = a.revenue - b.revenue
        if (revSortKey === "annual") result = annualOf(a) - annualOf(b)
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
  }, [revBaseFilteredRows, matrixMonths, revForecastFilter, revSortDirection, revSortKey, selectedMonth])

  const revWeekProjection = useMemo(() => buildRevWeekProjection(filteredRows, selectedMonth), [filteredRows, selectedMonth])
  // 레일 확정/고확도 합계는 매트릭스·footer와 동일한 rowMonth* 헬퍼로 계산해 '확정'의 정의를 통일한다.
  // (projection은 주차 분해 전용 — month-only/inferred 행의 확정을 버킷에서 제외하므로, projection 합을
  //  그대로 쓰면 월합계만 입력된 확정 행이 레일에서만 '예정'으로 빠져 footer와 다른 숫자가 됐다.)
  // monthlyOnly는 '주차 미상이면서 미확정'인 잔여만 집계 — covered(확정+고확도)와 겹치지 않는다.
  const revMonthScalars = useMemo(() => {
    let total = 0
    let confirmed = 0
    let high = 0
    let monthlyOnlyOpen = 0
    for (const row of filteredRows) {
      const amount = rowMonthAmount(row, selectedMonth)
      if (amount <= 0) continue
      const rowConfirmed = rowMonthConfirmed(row, selectedMonth)
      const rowHigh = rowMonthHighConfidence(row, selectedMonth)
      total += amount
      confirmed += rowConfirmed
      high += rowHigh
      if (rowWeeklySplit(row, selectedMonth).source === "month-only") {
        monthlyOnlyOpen += Math.max(amount - rowConfirmed - rowHigh, 0)
      }
    }
    return { total, confirmed, high, monthlyOnlyOpen }
  }, [filteredRows, selectedMonth])
  const revMonthTotal = revMonthScalars.total
  const revMonthConfirmed = revMonthScalars.confirmed
  const revMonthHighConfidence = revMonthScalars.high
  const revMonthMonthlyOnly = revMonthScalars.monthlyOnlyOpen
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
  // 월 목표(DSH 시리즈)는 팀/기간 축으로만 내려온다(summary API가 team·period만 받음). 분자(확정 등)는
  // 검색/필터를 타므로, 팀 외 필터가 하나라도 걸리면 달성률·부족액이 서로 다른 모집단 비교가 된다
  // → 목표 비교를 생략하고 "필터 중 생략"을 표기한다. 팀·기간·선택월은 목표와 같은 축이라 허용.
  const revGoalComparable =
    query.trim() === "" &&
    managerFilter === "ALL" &&
    regionFilter === "ALL" &&
    productFilter === "all" &&
    revStatusFilter === "ALL" &&
    revDealTypeFilter === "ALL" &&
    revOriginFilter === "all" &&
    revForecastFilter === "all"
  const revComparableGoal = revGoalComparable ? revMonthGoal : null
  const revGoalMutedByFilter = !revGoalComparable && revMonthGoal !== null
  const revMonthPlanned = revMonthOpen + revMonthMonthlyOnly
  const revMonthCovered = revMonthConfirmed + revMonthHighConfidence
  const revMonthRemaining = revComparableGoal !== null ? revComparableGoal - revMonthConfirmed : null
  const revMonthScale = Math.max(revComparableGoal ?? 0, revMonthTotal, 1)
  const revMonthRowCount = useMemo(
    () => filteredRows.filter((row) => rowMonthAmount(row, selectedMonth) > 0).length,
    [filteredRows, selectedMonth],
  )
  // 검수 인박스 카운트: 표시 열(회계연도 12개월) 전체를 검사하되, 모집단은 forecast 제외
  // 필터가 반영된 revBaseFilteredRows — 칩 숫자와 "칩 클릭 후 결과 건수"가 항상 일치한다.
  // (무필터 rows 기준이던 시절엔 담당자/상품 필터 활성 시 칩 숫자 > 결과 건수 불일치가 났다.)
  const revInboxCounts = useMemo(() => {
    let weekMismatch = 0
    let monthOnly = 0
    let open = 0
    for (const row of revBaseFilteredRows) {
      if (matrixMonths.some((month) => rowWeeklyMismatch(row, month))) weekMismatch += 1
      if (matrixMonths.some((month) => rowMonthAmount(row, month) > 0 && rowWeeklySplit(row, month).source === "month-only")) monthOnly += 1
      if (matrixMonths.some((month) => rowMonthHighConfidence(row, month) + rowMonthOpen(row, month) > 0)) open += 1
    }
    return { weekMismatch, monthOnly, open }
  }, [revBaseFilteredRows, matrixMonths])
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
    // SW는 과금 리듬(구독/충전·소비)별 하위행으로 분해해 함께 보여준다.
    const subtypeTotals = new Map<SalesLedgerSoftwareSubtype, { confirmed: number; highConfidence: number; open: number; total: number; count: number }>()
    for (const row of filteredRows) {
      if (rowProductCategory(row) !== "software") continue
      const total = rowMonthAmount(row, selectedMonth)
      if (total <= 0) continue
      const subtype = classifySalesLedgerSoftwareSubtype({
        product: row.productVersion,
        account: row.customer,
        rawText: row.draftMetadata,
      })
      const current = subtypeTotals.get(subtype) ?? { confirmed: 0, highConfidence: 0, open: 0, total: 0, count: 0 }
      current.confirmed += rowMonthConfirmed(row, selectedMonth)
      current.highConfidence += rowMonthHighConfidence(row, selectedMonth)
      current.open += rowMonthOpen(row, selectedMonth)
      current.total += total
      current.count += 1
      subtypeTotals.set(subtype, current)
    }

    const SW_SUBTYPE_LABELS: Array<{ id: SalesLedgerSoftwareSubtype; label: string }> = [
      { id: "subscription", label: "구독" },
      { id: "recharge", label: "충전·소비" },
      { id: "other", label: "기타" },
    ]

    const result: BreakdownNumbersRow[] = []
    for (const row of revProductSummary) {
      result.push({
        id: row.category,
        label: <ProductCategoryPill category={row.category} />,
        confirmed: row.confirmed,
        highConfidence: row.highConfidence,
        open: row.open,
        total: row.total,
        count: row.rows,
      })
      if (row.category !== "software") continue
      for (const subtype of SW_SUBTYPE_LABELS) {
        const totals = subtypeTotals.get(subtype.id)
        if (!totals || totals.count === 0) continue
        result.push({
          id: `software-${subtype.id}`,
          label: <span className="pl-3 text-[10.5px] font-semibold text-[#615D59]">└ {subtype.label}</span>,
          confirmed: totals.confirmed,
          highConfidence: totals.highConfidence,
          open: totals.open,
          total: totals.total,
          count: totals.count,
          excludeFromTotals: true,
        })
      }
    }
    return result
  }, [filteredRows, revProductSummary, selectedMonth])

  // filteredRows(정렬 반영)를 고객 단위로 묶는다. Map 삽입 순서 = 정렬상 첫 등장 순서라
  // 그룹 순서도 기존 정렬 UX를 그대로 따른다. 페이지네이션·아코디언은 그룹 단위.
  const revCustomerGroups = useMemo<RevCustomerGroup[]>(() => {
    const groups = new Map<string, RevCustomerGroup>()
    for (const row of filteredRows) {
      const key = normalizedAccountKey(row.customer) || row.id
      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          customer: row.customer || "미지정",
          rows: [],
          monthTotal: 0,
          monthConfirmed: 0,
          revenueTotal: 0,
          weeks: [0, 0, 0, 0, 0],
          hasExplicitWeeks: false,
          monthOnlyAmount: 0,
          categoryTotals: { software: 0, hardware: 0, unknown: 0 },
          categories: [],
          categoryMonthly: {},
          categoryAnnual: {},
          managers: [],
          teams: [],
          regions: [],
          hasDraft: false,
          mismatchCount: 0,
          mismatchMonths: [],
          monthlyTotals: Object.fromEntries(matrixMonths.map((month) => [month, emptyMonthlyBucket()])),
          annualTotal: emptyMonthlyBucket(),
        }
        groups.set(key, group)
      }
      group.rows.push(row)
      const category = rowProductCategory(row)
      // 카테고리별 12개월/연간 소계 버킷 lazy 초기화(HW/SW 합산 1행용).
      let categoryMonthly = group.categoryMonthly[category]
      if (!categoryMonthly) {
        categoryMonthly = Object.fromEntries(matrixMonths.map((month) => [month, emptyMonthlyBucket()]))
        group.categoryMonthly[category] = categoryMonthly
        group.categoryAnnual[category] = emptyMonthlyBucket()
      }
      const categoryAnnual = group.categoryAnnual[category]!
      // 다중월 매트릭스: 12개월 각 셀에 이 행의 확도 분해를 누적(그룹 소계 1패스).
      // 같은 패스에서 주차↔월 불일치도 12개월 전체로 검사한다(검수 배지 연도화).
      let rowHasMismatch = false
      for (const month of matrixMonths) {
        const bucket = rowMonthBucket(row, month)
        if (bucket.total > 0) {
          addMonthlyBucket(group.monthlyTotals[month], bucket)
          addMonthlyBucket(group.annualTotal, bucket)
          addMonthlyBucket(categoryMonthly[month], bucket)
          addMonthlyBucket(categoryAnnual, bucket)
        }
        if (rowWeeklyMismatch(row, month)) {
          rowHasMismatch = true
          if (!group.mismatchMonths.includes(month)) group.mismatchMonths.push(month)
        }
      }
      const monthAmount = rowMonthAmount(row, selectedMonth)
      group.monthTotal += monthAmount
      group.monthConfirmed += rowMonthConfirmed(row, selectedMonth)
      group.revenueTotal += row.revenue
      const split = rowWeeklySplit(row, selectedMonth)
      if (split.source === "explicit" || split.source === "inferred") {
        split.weeks.forEach((value, index) => {
          group!.weeks[index] += value
        })
        if (split.source === "explicit") group.hasExplicitWeeks = true
      } else if (split.source === "month-only") {
        group.monthOnlyAmount += monthAmount
      }
      group.categoryTotals[category] += monthAmount
      if (!group.categories.includes(category)) group.categories.push(category)
      if (row.manager && !group.managers.includes(row.manager)) group.managers.push(row.manager)
      if (row.team && !group.teams.includes(row.team)) group.teams.push(row.team)
      if (row.region && !group.regions.includes(row.region)) group.regions.push(row.region)
      if (row.ledgerOrigin === "draft") group.hasDraft = true
      if (rowHasMismatch) group.mismatchCount += 1
    }
    // 고객 펼침 시 HW 합산행을 먼저, 그다음 SW 합산행 순으로 그린다. categories/rows 둘 다
    // HW-first로 정렬(안정 정렬이라 카테고리 내부는 기존 실적 순서 유지).
    for (const group of groups.values()) {
      group.categories.sort((a, b) => categoryRank(a) - categoryRank(b))
      if (group.categories.length > 1) {
        group.rows.sort((a, b) => categoryRank(rowProductCategory(a)) - categoryRank(rowProductCategory(b)))
      }
    }
    // 그룹 정렬은 그룹 대표값(합계·첫 값) 기준으로 다시 계산한다. 첫 등장 순서에 기대면
    // 정렬 키가 합계(월 금액·실적)일 때 그룹 순서가 행 최댓값 기준으로 어긋난다.
    const direction = revSortDirection === "asc" ? 1 : -1
    const dominantCategory = (group: RevCustomerGroup) => {
      const entries = Object.entries(group.categoryTotals) as Array<[Exclude<RevProductCategory, "all">, number]>
      entries.sort((a, b) => b[1] - a[1])
      return productCategoryMeta(entries[0][0]).label
    }
    return Array.from(groups.values()).sort((a, b) => {
      const groupAnnualOf = (group: RevCustomerGroup) =>
        matrixMonths.reduce((sum, month) => sum + (group.monthlyTotals[month]?.total ?? 0), 0)
      let result = 0
      if (revSortKey === "revenue") result = a.revenueTotal - b.revenueTotal
      if (revSortKey === "annual") result = groupAnnualOf(a) - groupAnnualOf(b)
      if (revSortKey === "month") result = a.monthTotal - b.monthTotal
      if (revSortKey === "customer") result = compareText(a.customer, b.customer)
      if (revSortKey === "product") result = compareText(dominantCategory(a), dominantCategory(b))
      if (revSortKey === "manager") result = compareText(a.managers[0], b.managers[0])
      if (revSortKey === "team") result = compareText(a.teams[0], b.teams[0])
      if (revSortKey === "region") result = compareText(a.regions[0], b.regions[0])
      if (revSortKey === "origin") result = (a.hasDraft ? 0 : 1) - (b.hasDraft ? 0 : 1)
      const primary = result * direction
      if (primary !== 0) return primary
      return compareText(a.customer, b.customer)
    })
  }, [filteredRows, matrixMonths, revSortDirection, revSortKey, selectedMonth])

  const revTotalPages = Math.max(1, Math.ceil(revCustomerGroups.length / revPageSize))
  const clampedRevPage = Math.min(revPage, revTotalPages)
  const revPageStartIndex = (clampedRevPage - 1) * revPageSize
  const visibleGroups = useMemo(() => {
    return revCustomerGroups.slice(revPageStartIndex, revPageStartIndex + revPageSize)
  }, [revCustomerGroups, revPageSize, revPageStartIndex])
  const revRangeStart = revCustomerGroups.length === 0 ? 0 : revPageStartIndex + 1
  const revRangeEnd = Math.min(revCustomerGroups.length, revPageStartIndex + visibleGroups.length)

  // 모바일 카드 목록과 데스크톱 테이블이 같은 행을 각자 렌더링하면서 draftRow/productCategory/
  // weeklySplit/monthAmount/mismatch를 두 곳에서 따로 계산했다 — 한 번만 계산해 공유한다.
  const revRowViews = useMemo(() => {
    const views = new Map<string, RevRowView>()
    for (const group of visibleGroups) {
      for (const row of group.rows) {
        if (views.has(row.id)) continue
        // 다중월 매트릭스: 현재 페이지에 보이는 행만 12개월 셀 버킷 + 연간 합계를 캐시.
        const monthlyByMonth: Record<string, RevMonthlyBucket> = {}
        const annual = emptyMonthlyBucket()
        for (const month of matrixMonths) {
          const bucket = rowMonthBucket(row, month)
          monthlyByMonth[month] = bucket
          if (bucket.total > 0) addMonthlyBucket(annual, bucket)
        }
        views.set(row.id, {
          row,
          draftRow: row.ledgerOrigin === "draft",
          productCategory: rowProductCategory(row),
          weeklySplit: rowWeeklySplit(row, selectedMonth),
          monthAmount: rowMonthAmount(row, selectedMonth),
          monthConfirmedAmount: rowMonthConfirmed(row, selectedMonth),
          mismatch: rowWeeklyMismatch(row, selectedMonth),
          monthlyByMonth,
          annual,
        })
      }
    }
    return views
  }, [visibleGroups, matrixMonths, selectedMonth])

  // 매트릭스 12개 열의 그랜드토탈(필터 반영, 전체 그룹 기준) + 월 목표. 하단 sticky 합계행이 소비.
  // revCustomerGroups는 이미 월별 소계를 담으므로 그룹 소계만 합산하면 된다(행 재순회 없음).
  const revMatrixColumns = useMemo<RevMatrixColumn[]>(() => {
    const goalByMonth = new Map(monthlySeriesRows.map((planRow) => [planRow.month, planRow.goal]))
    const totals = new Map<string, RevMonthlyBucket>(matrixMonths.map((month) => [month, emptyMonthlyBucket()]))
    for (const group of revCustomerGroups) {
      for (const month of matrixMonths) {
        addMonthlyBucket(totals.get(month)!, group.monthlyTotals[month])
      }
    }
    return monthOptions.map((option) => {
      const bucket = totals.get(option.value)!
      const goal = goalByMonth.get(option.value)
      return {
        ...bucket,
        month: option.value,
        label: option.label,
        current: option.current,
        // 목표는 팀 스코프 고정이라 팀 외 필터가 걸리면 footer '월 목표 대비 %'가 왜곡 — 비교 가능할 때만 전달.
        goal: revGoalComparable && goal && goal > 0 ? goal : null,
      }
    })
  }, [revCustomerGroups, matrixMonths, monthOptions, monthlySeriesRows, revGoalComparable])

  const revMatrixGrand = useMemo<RevMonthlyBucket>(() => {
    const grand = emptyMonthlyBucket()
    for (const column of revMatrixColumns) addMonthlyBucket(grand, column)
    return grand
  }, [revMatrixColumns])

  // 빈 상태 안내 셀 colSpan: 고객+상품+연간(3) + 월(요약 1칸 / 확장 5칸+월계 1칸).
  const matrixColSpan = useMemo(
    () => 3 + matrixMonths.reduce((sum, month) => sum + (expandedRevMonths.has(month) ? 6 : 1), 0),
    [matrixMonths, expandedRevMonths],
  )

  // 적용 전(new-row) 초안은 매트릭스에 행 자체가 없어 "초안 넣었는데 표에 없음"이 되던 사각 —
  // 표 상단 요약 스트립으로 노출한다(집계에는 미반영, 적용 후 정식 행으로 합류).
  const pendingNewRowDrafts = useMemo(
    () => drafts.filter((draft) => draft.kind === "new-row" && (draft.status === "draft" || draft.status === "checked")),
    [drafts],
  )

  // ── Phase 2: 매트릭스 인라인 편집 배선 ─────────────────────────────────────
  // 현재 페이지에서 실제로 보이는 딜행(접힌 그룹 하위행 제외)만 대상. row.id로 좌표 부여.
  const visibleDealRows = useMemo(() => {
    // 인라인 편집(엑셀식) 대상 = 실제로 렌더되는 "품목 잎 행"만.
    //  · 단일 품목 고객: 딜행이 바로 렌더 → 편집 대상
    //  · 다중 품목 고객: 그룹 펼침 + 그 카테고리(HW/SW) 합산행까지 펼쳐야 품목행이 나옴 → 그때만 대상
    const list: LedgerRevenueRow[] = []
    for (const group of visibleGroups) {
      if (group.rows.length <= 1) {
        for (const row of group.rows) list.push(row)
        continue
      }
      if (!expandedRevGroups.has(group.key)) continue
      for (const row of group.rows) {
        const category = rowProductCategory(row)
        if (expandedRevCategories.has(`${group.key}::${category}`)) list.push(row)
      }
    }
    return list
  }, [visibleGroups, expandedRevGroups, expandedRevCategories])

  const rowById = useMemo(() => {
    const map = new Map<string, LedgerRevenueRow>()
    for (const row of visibleDealRows) map.set(row.id, row)
    return map
  }, [visibleDealRows])

  // 편집가능 셀 좌표(렌더 순서: 행 위→아래, 월 좌→우, 확장월은 w1→w5). 잠금 셀은 제외.
  // 방향키/Tab 순회의 단일 소스. matrixMonths는 4→3 회계연도 순.
  // 확장된 편집가능 월은 주차 5칸으로 분해(Tab이 w1→…→w5→다음 월로 흐름), 비확장 월은 월 요약 셀 1칸.
  const editableCells = useMemo<MatrixCellCoord[]>(() => {
    const cells: MatrixCellCoord[] = []
    for (const row of visibleDealRows) {
      for (const month of matrixMonths) {
        if (!isMatrixCellEditable(row, month)) continue
        if (expandedRevMonths.has(month)) {
          for (let week = 0; week < 5; week += 1) cells.push({ rowId: row.id, month, week })
        } else {
          cells.push({ rowId: row.id, month })
        }
      }
    }
    return cells
  }, [visibleDealRows, matrixMonths, expandedRevMonths])

  // 미검수(draft|checked) 초안 → 셀 낙관적 표시. drafts에서 파생(별도 버퍼 없음).
  // 매칭: 초안 sourceDealId == 행 sourceDealId(또는 id) && 초안 month == 셀 month.
  // 월 키(`rowId::month`)와 주차 키(`rowId::month::wN`)를 각각 채운다:
  //   - 월 키: 그 달에 걸린 최신 초안(주차 초안 포함) → 접힌 월 셀 앰버 점.
  //   - 주차 키: metadata.week가 wN인 초안만 → 확장 주차 칸 앰버 점.
  // 같은 키에 여러 초안이 있으면 가장 최근(drafts 앞쪽) 것을 표시.
  const pendingByCell = useMemo(() => {
    const map = new Map<string, MatrixPendingDraft>()
    const pending = drafts.filter((draft) => draft.status === "draft" || draft.status === "checked")
    for (const row of visibleDealRows) {
      const dealKey = row.sourceDealId ?? row.id
      for (const draft of pending) {
        const draftDealId = draft.sourceDealId ?? metadataString(draft.metadata, "sourceDealId")
        if (draft.kind === "edit-row" ? draftDealId !== dealKey : draft.customer.trim() !== row.customer.trim()) continue
        const summary: MatrixPendingDraft = { amount: draft.amount, confidence: draftConfidenceFromMetadata(draft.metadata) }
        const monthKey = `${row.id}::${draft.month}`
        if (!map.has(monthKey)) map.set(monthKey, summary) // 월 셀: 첫(=최신) 초안
        const weekIdx = weekIndexFromToken(metadataString(draft.metadata, "week"))
        if (weekIdx != null) {
          const weekKey = `${row.id}::${draft.month}::w${weekIdx + 1}`
          if (!map.has(weekKey)) map.set(weekKey, summary) // 주차 칸: 그 주차 첫(=최신) 초안
        }
      }
    }
    return map
  }, [drafts, visibleDealRows])

  // 커밋 기준값(원 단위): 편집 진입 초기값·fill-down·중복 판정 소스.
  // 주차 셀이면 그 주차의 현재 표시값(explicit/inferred 기준), 아니면 그 달 표시 금액.
  const matrixCellValue = useCallback(
    (coord: MatrixCellCoord) => {
      const row = rowById.get(coord.rowId)
      if (!row) return 0
      if (coord.week != null) return rowWeeklySplit(row, coord.month).weeks[coord.week] ?? 0
      return rowMonthAmount(row, coord.month)
    },
    [rowById],
  )

  // 셀 우세 확도 → 편집 팝오버 기본 선택. 미검수 초안이 있으면 그 확도 우선.
  // 주차 셀은 그 주차 pending → 없으면 월 pending → 없으면 월 버킷 우세 확도로 폴백.
  const matrixCellConfidence = useCallback(
    (coord: MatrixCellCoord): DraftConfidence => {
      const pending =
        (coord.week != null ? pendingByCell.get(`${coord.rowId}::${coord.month}::w${coord.week + 1}`) : null) ??
        pendingByCell.get(`${coord.rowId}::${coord.month}`)
      if (pending) return pending.confidence
      const row = rowById.get(coord.rowId)
      return row ? dominantCellConfidence(rowMonthBucket(row, coord.month)) : "expected"
    },
    [pendingByCell, rowById],
  )

  // 셀 커밋 1건 = createDraft 1건. buildDraftInput의 metadata 키·단위 규약을 그대로 따른다.
  // kind: sourceDealId 있으면 edit-row(항상 있음, 시트 딜행), 없으면 new-row.
  // operation: 기존 금액 있으면 amount-change, 없던 칸이면 forecast-add.
  //   - 월 셀: 기준 = 그 달 표시 금액. 주차 셀: 기준 = 그 주차 표시 금액(월 기준과 동일 분기 규약).
  // week: 주차 칸이면 "w1".."w5", 월 셀이면 "month". 저장은 커밋 시 metadata.week만 넣으면 끝(target_week 승격 완료).
  // 주차 병합: explicit 주차가 있는 행의 주차 셀 편집은 나머지 주차를 보존해 metadata.weekly(5칸)로
  // 싣고 amount=주차 합으로 재기재한다 — 단일 주차 값이 그 달 전체를 대체해 다른 주차가 소멸하던 버그 방지.
  // (inferred/월합계만 행은 보존할 실주차가 없어 기존 단일 주차 대체 규약 유지 — 팝오버/큐에서 경고.)
  const onCommitCell = useCallback(
    (rowId: string, month: string, amount: number, confidence: DraftConfidence, week?: number) => {
      const row = rowById.get(rowId)
      if (!row) return
      const sourceDealId = row.sourceDealId ?? (row.ledgerOrigin === "sheet" ? row.id : undefined)
      const kind: DraftKind = sourceDealId ? "edit-row" : "new-row"
      const weekToken = week != null ? `w${week + 1}` : "month"
      const weekSplit = week != null ? rowWeeklySplit(row, month) : null
      const priorAmount = week != null ? (weekSplit?.weeks[week] ?? 0) : rowMonthAmount(row, month)
      const operation: DraftOperation = priorAmount > 0 ? "amount-change" : "forecast-add"
      let draftAmount = amount
      let mergedWeekly: number[] | null = null
      if (week != null && weekSplit?.source === "explicit") {
        const weeks = Array.from({ length: 5 }, (_, index) => Math.max(Number(weekSplit.weeks[index] ?? 0), 0))
        weeks[week] = amount
        mergedWeekly = weeks
        draftAmount = weeks.reduce((sum, value) => sum + value, 0)
      }
      const productCategory = rowProductCategory(row)
      const input: LedgerDraftInput = {
        kind,
        sourceDealId,
        sourceSheetRow: row.sheetRow ?? null,
        sourceSnapshot: {
          capturedAt: new Date().toISOString(),
          origin: "rev-matrix-cell",
          selectedMonth: month,
          week: weekToken,
          row: {
            id: row.id,
            customer: row.customer,
            manager: row.manager,
            team: row.team,
            region: row.region,
            productVersion: row.productVersion,
            monthAmount: priorAmount, // 주차 커밋이면 그 주차의 직전 값
          },
        },
        customer: row.customer.trim(),
        manager: (row.manager ?? "").trim(),
        team: (row.team ?? (team === "ALL" ? "BD" : team)).trim(),
        month,
        amount: draftAmount,
        note: "",
        metadata: {
          source: "sales-ledger-workbench",
          origin: "rev-matrix-cell",
          lens,
          period,
          team,
          operation,
          productCategory,
          fromMonth: month,
          week: weekToken,
          weekly: mergedWeekly,
          confidence,
          quantity: null,
          sourceDealId: sourceDealId ?? null,
        },
      }
      void createDraft(input).then((draft) => {
        // createDraft는 실패 시에도 local-* 초안으로 폴백해 resolve된다 — 편집 지점에서 침묵하지 않게
        // 셀 인근 토스트로 실패(=로컬 임시 저장, 장부 적용 불가)를 알린다. 성공 피드백은 셀 앰버 점.
        if (draft?.id?.startsWith("local-")) {
          pushMatrixToast({
            kind: "error",
            text: "서버 저장 실패 — 로컬 임시 초안으로만 저장됐습니다 (장부 적용 불가). 입력 큐에서 서버 재연결 후 다시 입력하세요.",
          })
        }
      })
    },
    [createDraft, lens, period, pushMatrixToast, rowById, team],
  )

  const matrixEditor = useMatrixEditor({
    editableCells,
    cellValue: matrixCellValue,
    cellConfidence: matrixCellConfidence,
    onCommitCell,
  })

  // 딜행별 편집 prop — selected/editing 좌표를 이 행 스코프로 좁힌다. actions·selected·editing은
  // 안정 참조라, 이 행이 선택/편집 중이 아니면 매 렌더 같은 값(null/""/"expected")이 되어 RevMatrixDealRow
  // memo가 스킵된다. 선택·타이핑이 관여하는 행만 리렌더 → 수백 셀 재렌더 없앰. (반환 객체는 매 렌더
  // 새로 만들어지지만 memo 셀에 직접 넘어가지 않고 개별 prop으로 펼쳐지므로 문제 없음.)
  const matrixRowEditorProps = (rowId: string) => {
    const isEditingRow = matrixEditor.editing?.rowId === rowId
    return {
      actions: matrixEditor.actions,
      selectedCoord: matrixEditor.selected?.rowId === rowId ? matrixEditor.selected : null,
      editingCoord: isEditingRow ? matrixEditor.editing : null,
      editBuffer: isEditingRow ? matrixEditor.buffer : "",
      editConfidence: isEditingRow ? matrixEditor.editConfidence : "expected",
    }
  }

  // ── SL-2: 클립보드 붙여넣기 상태 — 프리뷰 확인 전에는 아무 초안도 만들지 않는다. ─────────
  const [pastePlan, setPastePlan] = useState<MatrixPastePlan | null>(null)
  const [pasteConfidence, setPasteConfidence] = useState<DraftConfidence>("expected")

  const handleMatrixPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      // 편집 중(input 포커스)이면 input의 기본 붙여넣기를 존중한다. 선택 셀이 없으면 대상 불명 → 무시.
      if (matrixEditor.editing) return
      const anchor = matrixEditor.selected
      if (!anchor) return
      const text = event.clipboardData?.getData("text/plain") ?? ""
      if (!text.trim()) return
      event.preventDefault()
      if (anchor.week != null) {
        // 주차 칸 붙여넣기는 B1 주차 병합 규약과 얽혀 파괴 위험 — 월 셀만 지원(잠금과 같은 안전 규약).
        pushMatrixToast({ kind: "info", text: "주차 칸에는 붙여넣기를 지원하지 않습니다 — 월 셀을 선택한 뒤 붙여넣으세요." })
        return
      }
      const plan = buildMatrixPastePlan(text, anchor, visibleDealRows, matrixMonths)
      if (!plan) {
        pushMatrixToast({ kind: "info", text: "붙여넣을 숫자 값을 찾지 못했습니다 — 엑셀에서 금액 셀 범위를 복사해 주세요." })
        return
      }
      setPasteConfidence(loadStoredMatrixConfidence() ?? "expected")
      setPastePlan(plan)
    },
    [matrixEditor.editing, matrixEditor.selected, matrixMonths, pushMatrixToast, visibleDealRows],
  )

  // 프리뷰 확인 → 셀 편집과 동일한 onCommitCell 경로로만 커밋(셀당 검토 초안 1건, 2단 게이트 유지).
  const confirmMatrixPaste = useCallback(() => {
    if (!pastePlan) return
    storeMatrixConfidence(pasteConfidence)
    let committed = 0
    for (const cell of pastePlan.cells) {
      if (cell.status !== "apply") continue
      onCommitCell(cell.rowId, cell.month, cell.next, pasteConfidence)
      committed += 1
    }
    setPastePlan(null)
    if (committed > 0) {
      pushMatrixToast({
        kind: "info",
        text: `검토 초안 ${committed.toLocaleString("ko-KR")}건 생성 — 체크 큐에서 검수(체크 → 적용) 후 장부에 반영됩니다.`,
      })
    }
  }, [onCommitCell, pasteConfidence, pastePlan, pushMatrixToast])

  const toggleRevMonth = useCallback((month: string) => {
    setExpandedRevMonths((prev) => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }, [])

  const toggleRevGroup = useCallback((key: string) => {
    setExpandedRevGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleRevCategory = useCallback((groupKey: string, category: Exclude<RevProductCategory, "all">) => {
    const key = `${groupKey}::${category}`
    setExpandedRevCategories((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // 현재 페이지에서 묶음(2행 이상) 그룹만 펼치기/접기 대상.
  const multiRowGroupKeys = useMemo(
    () => visibleGroups.filter((group) => group.rows.length > 1).map((group) => group.key),
    [visibleGroups],
  )
  const allRevGroupsExpanded = multiRowGroupKeys.length > 0 && multiRowGroupKeys.every((key) => expandedRevGroups.has(key))
  const toggleAllRevGroups = useCallback(() => {
    setExpandedRevGroups((prev) => {
      const next = new Set(prev)
      const everyExpanded = multiRowGroupKeys.length > 0 && multiRowGroupKeys.every((key) => next.has(key))
      if (everyExpanded) multiRowGroupKeys.forEach((key) => next.delete(key))
      else multiRowGroupKeys.forEach((key) => next.add(key))
      return next
    })
  }, [multiRowGroupKeys])

  // 그룹 헤더 클릭 = 우측 상세 패널에 고객 통합(HW+SW 합산) 요약만 로드.
  // 하위 행 펼침은 셰브론/펼치기 버튼(toggleRevGroup)으로만 — 접힘=우측 요약, 펼침=아래 행.
  const selectRevGroup = useCallback((key: string) => {
    setSelectedGroupKey(key)
    setSelectedRow(null)
    setDetail(null)
    setDetailError(null)
    setSidePanelCollapsed(false)
    setRailView("detail")
  }, [])

  const selectedGroup = useMemo(
    () => (selectedGroupKey ? revCustomerGroups.find((group) => group.key === selectedGroupKey) ?? null : null),
    [revCustomerGroups, selectedGroupKey],
  )
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
    revPageSize !== 100

  useEffect(() => {
    // 데이터 로드 전(revTotalPages가 아직 1)에는 클램프하지 않는다 — URL로 복원한 p가
    // 마운트 레이스로 1페이지에 깎여 소실되던 문제 방지. 로드 후 초과분만 보정한다.
    if (!pipeline.data) return
    if (revPage > revTotalPages) setRevPage(revTotalPages)
  }, [pipeline.data, revPage, revTotalPages])

  const selectedMember = useMemo(() => {
    if (!selectedRow?.manager) return null
    return members.find((row) => row.member === selectedRow.manager) ?? null
  }, [members, selectedRow])

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
    // 상세 응답(REV 원천 snake_case)도 같은 캐논 산식으로 분해한다 — 상세 로딩 전
    // (rowMonth* 경유)과 후(detail)의 확도 스택이 같은 정의(클램프·red 전액·무색상
    // 폴백)를 공유해야 같은 행이 로딩 시점에 따라 다른 분해를 보여주지 않는다.
    const detailHasColor = dealHasColorData(detail)
    return monthOptions.map((month) => {
      const amount = Number(detail.monthly_payments?.[month.value] ?? 0)
      const split = amount > 0
        ? splitMonthConfidence(detail, month.value, amount, detailHasColor)
        : { confirmed: 0, highConfidence: 0, expected: 0 }
      return {
        ...month,
        amount,
        confirmed: split.confirmed,
        highConfidence: split.highConfidence,
        red: Boolean(detail.monthly_red?.[month.value]),
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
    setSelectedGroupKey(null)
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
      confidence: draftConfidenceFromMetadata(row.draftMetadata),
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
        // 동기화 함정 해소: 액티브 소스가 DB 임포트 run이면 시트 미러만 갱신해서는 아무것도
        // 안 바뀐 것처럼 보인다. 시트 동기화 성공 후 재캡처(POST db-import)를 이어 붙인다.
        // 결과/에러는 Source 바 인라인(dbImportNotice/dbImportError)으로 표면화된다.
        if (dbNativeActive) {
          await captureDbImport()
        }
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error))
    } finally {
      clearBranchRequestCache()
      setRefreshKey((value) => value + 1)
      setRefreshing(false)
    }
  }, [canRunAdminOperations, captureDbImport, dbNativeActive])

  // Source 바의 명시적 'DB 재동기화' — 시트 동기화 없이 미러 → DB 임포트 재캡처만 수행.
  // 새 run이 잡혔거나(비 dedupe) 액티브 run이 전환됐을 때(runChanged) 데이터 훅을 다시 읽는다.
  // 완전 동일(deduped + 같은 run)이면 화면 그대로가 정답이라 refetch를 생략한다.
  const onDbResync = useCallback(async () => {
    const result = await captureDbImport()
    if (result && (!result.deduped || result.runChanged)) {
      clearBranchRequestCache()
      setRefreshKey((value) => value + 1)
    }
  }, [captureDbImport])

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
        confidence: draftForm.confidence,
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
      productCategory: draft.metadata?.productCategory === "hardware" ? "hardware" : "software",
      month: draft.month,
      fromMonth: metadataString(draft.metadata, "fromMonth") ?? draft.month,
      week: metadataString(draft.metadata, "week") ?? "month",
      confidence: draftConfidenceFromMetadata(draft.metadata),
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
  // 첫 로드 중 타일이 가짜 ¥0을 보여주지 않도록 — 값이 오기 전에는 대시로 정직하게.
  const summaryPending = summary.loading && !summary.data
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
  }, [])
  const draftTotal = openDrafts.reduce((sum, draft) => sum + draft.amount, 0)
  const appliedDraftTotal = additiveAppliedDraftRows.reduce((sum, row) => sum + row.revenue, 0)
  const ledgerConfirmed = (revenue?.confirmed ?? 0) + appliedDraftTotal
  const ledgerDelta = ledgerConfirmed - (revenue?.confirmed ?? 0)
  const periodLabel = period === "M" ? formatMonthLabel(selectedMonth) : period === "Q" ? "현재 분기" : "FY26-27"
  const canCreateEditDraft = Boolean(selectedRow && (selectedRow.ledgerOrigin === "sheet" || selectedRow.sourceDealId))
  const draftAmountValue = safeAmount(draftForm.amount)
  const draftAmountInvalid = !draftForm.amount.trim() || draftAmountValue <= 0
  const draftQuantityInvalid = draftForm.operation === "quantity-change" && draftForm.quantity.trim() !== "" && safeAmount(draftForm.quantity) <= 0
  const draftFormInvalid = !draftForm.customer.trim() || draftAmountInvalid || draftQuantityInvalid
  const selectedProductCategory = selectedRow ? rowProductCategory(selectedRow) : "software"
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
              <Link
                href="/admin/branch"
                className="underline-offset-2 transition hover:text-[#084734] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
              >
                KR Team
              </Link>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>FY26-27</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>Sales Ledger</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em] text-[#111110] sm:text-[32px]">
              매출 장부
            </h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[#615D59]">
              만지는 화면. 시트 수치 검수·장부 입력·주간 마감을 담당합니다. 차트·시각화는 KR Team으로 옮겨졌고, 여기는 수치가 정본입니다.
              {" "}통화 ¥ — 본사 보고 기준 · 단위 표기가 있는 그리드·매트릭스 셀은 호버(또는 title)로 반올림 전 원값을 확인할 수 있습니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/branch"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-[rgba(0,0,0,0.15)] bg-white px-3 text-[12px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
            >
              대시보드 보기 →
            </Link>
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

      <main className="space-y-5 px-4 pt-5 sm:px-6 lg:px-9">
        {/* 정합성 배지 — KR Team 개요와 동일 컴포넌트(데이터품질 이슈 요약). 검수 화면이 원 소비처라 상단 고정. */}
        <IntegrityStrip refreshKey={refreshKey} />
        <aside className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1 self-start">
          <div className="inline-flex flex-wrap gap-1 self-start rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-1" role="tablist" aria-label="Sales ledger views">
            {LENSES.map((item, index) => (
              <button
                key={item.id}
                type="button"
                id={`sales-ledger-lens-${item.id}`}
                role="tab"
                aria-selected={lens === item.id}
                aria-controls="sales-ledger-lens-panel"
                title={item.description}
                tabIndex={lens === item.id ? 0 : -1}
                ref={(node) => { lensTabRefs.current[index] = node }}
                onClick={() => selectLens(item.id)}
                onKeyDown={(event) => handleRovingTabKeyDown(event, index, LENSES, lensTabRefs, (nextItem) => selectLens(nextItem.id))}
                className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-bold transition ${
                  lens === item.id ? "bg-[#111110] text-white" : "text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#111110]"
                }`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-md ${
                  lens === item.id ? "bg-white/12" : "bg-[#ECFDF5] text-[#084734]"
                }`}>
                  {item.id === "dsh" ? <Gauge className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                </span>
                {item.label}
              </button>
            ))}
          </div>
          {/* 활성 lens 부제 상시 렌더 — hover title에만 있던 설명을 터치·랩탑에서도 읽히게(SL-7). */}
          <p className="px-1 text-[10.5px] font-semibold text-[#A39E98]">
            {LENSES.find((item) => item.id === lens)?.description}
          </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[11px] text-[#615D59]">
            <span className="flex items-center gap-1.5 font-bold text-[#111110]">
              <Database className="h-3.5 w-3.5 text-[#084734]" />
              Source
            </span>
            <span>sync <span className="font-semibold text-[#111110]">{formatDateTime(summary.data?.lastSync)}</span></span>
            <span>시트수정 <span className="font-semibold text-[#111110]">{formatDateTime(summary.data?.sheetModifiedAt)}</span></span>
            <span>입력 큐 <span className="font-semibold text-[#111110]">{queueMode === "server" ? "서버" : "로컬"} · {openDrafts.length}건</span></span>
            <span>내부 원장 <span className="font-semibold text-[#111110]">{ledgerHealth?.ok === false ? "준비 필요" : `${ledgerEntries.length}건`}</span></span>
            <span className="flex items-center gap-1.5">
              REV 원천{" "}
              <span
                className="font-semibold text-[#111110]"
                title={dbImportInfo ? `액티브 DB 임포트 run ${dbImportInfo.runId}` : undefined}
              >
                {dbImportInfo
                  ? `DB run ${dbImportInfo.runId.slice(0, 8)}${dbImportInfo.capturedAt ? ` · ${formatDateTime(dbImportInfo.capturedAt)}` : ""}`
                  : dbNativeActive
                    ? "DB 임포트 · run 미확인"
                    : dbSourceServerState === "inactive"
                      ? "시트 미러 (DB 임포트 비활성)"
                      : "미확인 (시트 폴백 가능)"}
              </span>
              {canRunAdminOperations && (
                <button
                  type="button"
                  onClick={() => void onDbResync()}
                  disabled={dbImportBusy || refreshing}
                  title="시트 미러를 버전드 DB 임포트로 재캡처하고 그 run을 활성화합니다 (변경 없으면 기존 run 유지)"
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-2 text-[10.5px] font-bold text-[#084734] transition hover:bg-[#D1FAE5] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#084734]"
                >
                  {dbImportBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
                  DB 재동기화
                </button>
              )}
            </span>
            {(queueError || ledgerHealth?.ok === false) && (
              <span className="rounded border border-[#ECD29C] bg-[#FBF1E0] px-1.5 py-0.5 text-[10px] font-semibold text-[#7A520F]">
                ⚠ {queueError ?? ledgerHealth?.message ?? "내부 원장 준비 필요"}
              </span>
            )}
            {(dbImportError || dbImportNotice) && (
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                  dbImportError
                    ? "border-[#F2B8B8] bg-[#FCE9E9] text-[#8F2C2C]"
                    : "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
                }`}
              >
                {dbImportError ? `⚠ DB 재동기화 실패: ${dbImportError}` : dbImportNotice}
              </span>
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricTile
              label="목표"
              value={summaryPending ? "–" : formatMoney(revenue?.goal)}
              hint={summaryPending ? "불러오는 중" : `${periodLabel} 목표 매출`}
              icon={<Target className="h-3.5 w-3.5" />}
            />
            <MetricTile
              label="실적"
              value={summaryPending ? "–" : formatMoney(revenue?.confirmed)}
              hint={summaryPending ? "불러오는 중" : `시트 원천 · ${periodLabel} 달성률 ${formatPercent(revenue?.pacing_pct)}`}
              tone="text-[#084734]"
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            />
            <MetricTile
              label="장부 가감"
              value={summaryPending ? "–" : `${ledgerDelta >= 0 ? "+" : ""}${formatMoney(ledgerDelta)}`}
              hint={
                summaryPending
                  ? "불러오는 중"
                  : `DB 신규 ${additiveAppliedDraftRows.length}건 · 수정 ${replacementAppliedDraftRows.length}건 · 장부 합계 ${formatMoney(ledgerConfirmed)}`
              }
              tone={ledgerDelta >= 0 ? "text-[#084734]" : "text-[#A8741A]"}
              icon={<Send className="h-3.5 w-3.5" />}
            />
            <MetricTile
              label="Gap"
              value={summaryPending ? "–" : formatMoney(gap)}
              hint={summaryPending ? "불러오는 중" : gap >= 0 ? "시트 기준 목표 초과" : "시트 기준 목표 대비 부족"}
              tone={gap >= 0 ? "text-[#084734]" : "text-[#B43E3E]"}
              icon={gap >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            />
            <MetricTile
              label="입력 큐"
              value={queueLoading && drafts.length === 0 ? "–" : formatMoney(draftTotal)}
              hint={queueLoading && drafts.length === 0 ? "불러오는 중" : `${openDrafts.length}건 ${queueMode === "server" ? "서버 큐" : "로컬 fallback"} 검토 대기`}
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
                <DshNumericGrid
                  breakdown={summary.data?.dsh_breakdown ?? []}
                  view={dshGridView}
                  onViewChange={setDshGridView}
                  loading={summary.loading && !summary.data}
                  dataSource={summary.data?.data_sources?.dsh ?? null}
                />

                <WeeklyCloseSection
                  selectedMonth={selectedMonth}
                  captureWeeklySnapshot={captureWeeklySnapshot}
                  wcSnapshotting={wcSnapshotting}
                  wcNotice={wcNotice}
                  wcError={wcError}
                  wcRuns={wcRuns}
                  wcBase={wcBase}
                  setWcBase={setWcBase}
                  wcHead={wcHead}
                  setWcHead={setWcHead}
                  wcLoading={wcLoading}
                  wcDiff={wcDiff}
                />
              </div>
            )}

            {lens === "rev" && (
              <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
            <div className="border-b border-[rgba(0,0,0,0.08)] p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                      <FileSpreadsheet className="h-4 w-4 text-[#084734]" />
                      REV 매출 행
                    </p>
                    <div className="inline-flex items-center gap-0.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedMonth((month) =>
                            // 회계연도 밖 값(URL 주입 등)이면 달력 걷기 대신 FY 경계로 스냅한다.
                            matrixMonths.includes(month) ? shiftMonth(month, -1) : month < matrixMonths[0] ? matrixMonths[0] : matrixMonths[matrixMonths.length - 1],
                          )
                        }
                        disabled={matrixMonths.indexOf(selectedMonth) === 0}
                        aria-label="이전 달"
                        title="이전 달 (회계연도 안에서만 이동)"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#615D59] transition hover:bg-white hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[64px] px-1 text-center text-[12px] font-bold text-[#111110]">
                        {formatMonthLabel(selectedMonth)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedMonth((month) =>
                            matrixMonths.includes(month) ? shiftMonth(month, 1) : month > matrixMonths[matrixMonths.length - 1] ? matrixMonths[matrixMonths.length - 1] : matrixMonths[0],
                          )
                        }
                        disabled={matrixMonths.indexOf(selectedMonth) === matrixMonths.length - 1}
                        aria-label="다음 달"
                        title="다음 달 (회계연도 안에서만 이동)"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#615D59] transition hover:bg-white hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/30 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {selectedMonth !== ymKeyUtc(new Date()) && (
                      <button
                        type="button"
                        onClick={() => setSelectedMonth(ymKeyUtc(new Date()))}
                        className="text-[11px] font-bold text-[#084734] underline-offset-2 hover:underline"
                      >
                        이번 달로
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-[11px] text-[#615D59]">
                      검색 결과 {filteredRows.length.toLocaleString("ko-KR")}행 · 고객 {revCustomerGroups.length.toLocaleString("ko-KR")}곳 · {revRangeStart.toLocaleString("ko-KR")}-{revRangeEnd.toLocaleString("ko-KR")}곳 표시 · DB 신규 반영 {additiveAppliedDraftRows.length.toLocaleString("ko-KR")}건 포함
                    </p>
                    <MatrixToneLegend />
                  </div>
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
                  <button
                    type="button"
                    onClick={toggleAllRevGroups}
                    disabled={multiRowGroupKeys.length === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={allRevGroupsExpanded ? "고객 묶음 모두 접기" : "고객 묶음 모두 펼치기"}
                  >
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${allRevGroupsExpanded ? "rotate-90" : ""}`} />
                    {allRevGroupsExpanded ? "모두 접기" : "모두 펼치기"}
                  </button>
                  <div className="inline-flex items-center gap-0.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" aria-label="매트릭스 행 밀도">
                    {MATRIX_DENSITY_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setMatrixDensity(option.id)}
                        title={option.title}
                        aria-pressed={matrixDensity === option.id}
                        className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold transition ${
                          matrixDensity === option.id ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59] hover:text-[#111110]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
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
                {/* 정렬 드롭다운 — 매트릭스 열 구조상 헤더 클릭 정렬(고객/연간합계)이 없는 5개 키까지
                    포함해 9개 정렬 키 전부를 여기서 노출한다. onRevSort 재사용: 다른 키 선택은 그
                    키 기본 방향으로, 같은 키(방향 버튼)는 토글로 — RevSortHeader와 동일 로직. */}
                <div className="inline-flex items-center gap-0.5 rounded-full bg-[#F6F5F4] pl-2.5 pr-1 py-0.5">
                  <label htmlFor="rev-sort-key" className="sr-only">정렬 기준</label>
                  <select
                    id="rev-sort-key"
                    value={revSortKey}
                    onChange={(event) => onRevSort(event.target.value as RevSortKey)}
                    className="h-6 rounded-full border-0 bg-transparent pr-1 text-[11px] font-bold text-[#615D59] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#084734]"
                  >
                    {(Object.keys(REV_SORT_LABELS) as RevSortKey[]).map((key) => (
                      <option key={key} value={key}>{REV_SORT_LABELS[key]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onRevSort(revSortKey)}
                    aria-label={`정렬 방향 전환 (현재 ${revSortDirection === "asc" ? "오름차순" : "내림차순"})`}
                    title="정렬 방향 전환"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[#615D59] transition hover:bg-white hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#084734]"
                  >
                    {revSortDirection === "asc" ? (
                      <ArrowUpNarrowWide className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ArrowDownNarrowWide className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {query.trim() && <FilterTag label={`검색 ${query.trim()}`} onClear={() => setQuery("")} />}
                {managerFilter !== "ALL" && <FilterTag label={`담당자 ${managerFilter}`} onClear={() => setManagerFilter("ALL")} />}
                {regionFilter !== "ALL" && <FilterTag label={`지역 ${regionFilter}`} onClear={() => setRegionFilter("ALL")} />}
                {productFilter !== "all" && (
                  <FilterTag label={`상품 ${productCategoryMeta(productFilter).label}`} onClear={() => setProductFilter("all")} />
                )}
                {revStatusFilter !== "ALL" && <FilterTag label={`상태 ${revStatusFilter}`} onClear={() => setRevStatusFilter("ALL")} />}
                {revDealTypeFilter !== "ALL" && <FilterTag label={`유형 ${revDealTypeFilter}`} onClear={() => setRevDealTypeFilter("ALL")} />}
                {revOriginFilter !== "all" && (
                  <FilterTag label={REV_ORIGIN_FILTERS.find((item) => item.id === revOriginFilter)?.label ?? "원천"} onClear={() => setRevOriginFilter("all")} />
                )}
                {revForecastFilter !== "all" && (
                  <FilterTag label={REV_FORECAST_FILTERS.find((item) => item.id === revForecastFilter)?.label ?? "검수"} onClear={() => setRevForecastFilter("all")} />
                )}
                <span className="ml-auto flex flex-wrap items-center gap-1.5" aria-label="검수 인박스">
                  {/* 편집→검수 큐 연결 고리: 셀 편집으로 쌓인 미적용 초안이 있으면 여기서 바로 큐를 연다 */}
                  {openDrafts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => selectRailView("queue")}
                      title="체크 큐 열기 — 체크·적용 대기 초안"
                      className="inline-flex h-6 items-center gap-1 rounded-full border border-[#ECD29C] bg-[#FFFCF5] px-2 text-[10px] font-bold tabular-nums text-[#7A520F] transition hover:bg-[#FBF1E0]"
                    >
                      미적용 초안 {openDrafts.length.toLocaleString("ko-KR")} → 체크 큐
                    </button>
                  )}
                  {([
                    ["week-mismatch", "불일치", revInboxCounts.weekMismatch, "border-[#F2B8B8] bg-[#FCE9E9] text-[#B43E3E]"],
                    ["month-only", "월합계만", revInboxCounts.monthOnly, "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"],
                    // 확도 잔여(예정/고확도 미전환) 칩 — 고확도 예외 토큰의 틴트 칩을 소비한다.
                    ["open", "예정 남음", revInboxCounts.open, CONFIDENCE_TOKENS["high-confidence"].chipClass],
                  ] as Array<[RevForecastFilter, string, number, string]>).map(([id, label, count, tone]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRevForecastFilter((current) => (current === id ? "all" : id))}
                      aria-pressed={revForecastFilter === id}
                      title={`${label} 행만 보기 (다시 누르면 해제)`}
                      className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-bold tabular-nums transition ${
                        revForecastFilter === id ? "ring-2 ring-[#084734]/25" : ""
                      } ${count > 0 ? tone : "border-[rgba(0,0,0,0.08)] bg-white text-[#A39E98]"}`}
                    >
                      {label} {count.toLocaleString("ko-KR")}
                    </button>
                  ))}
                </span>
              </div>
            </div>

            {pipeline.loading && !pipeline.data ? (
              <div className="p-4"><LoadingPanel label="REV 행을 불러오는 중" /></div>
            ) : pipeline.error && !pipeline.data ? (
              // API 실패를 "필터 결과 없음" 빈 상태로 위장하지 않는다 — 원인 표기 + 제자리 재시도.
              <div className="p-6">
                <div className="mx-auto max-w-md rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] p-4 text-center">
                  <p className="text-[13px] font-bold text-[#B43E3E]">REV 데이터를 불러오지 못했습니다</p>
                  <p className="mt-1 break-all text-[11px] leading-relaxed text-[#B43E3E] opacity-80">{pipeline.error}</p>
                  <button
                    type="button"
                    onClick={() => setRefreshKey((value) => value + 1)}
                    className="mt-3 rounded-md border border-[#B43E3E] bg-white px-3 py-1.5 text-[11px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9]"
                  >
                    다시 불러오기
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* 로컬 큐 모드: 서버 저장 불가 상태를 매트릭스 근처에서 명시 — 입력이 쌓이는 막다른 길 방지 */}
                {queueMode === "local" && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECD29C] bg-[#FBF1E0] px-4 py-2.5">
                    <p className="min-w-0 text-[11.5px] font-bold leading-relaxed text-[#7A520F]">
                      로컬 큐 모드 — 서버 입력 큐 연결이 끊겨, 지금 만드는 초안은 임시 저장이며 장부에 적용할 수 없습니다.
                      {queueError ? <span className="ml-1 font-semibold">({queueError})</span> : null}
                    </p>
                    <button
                      type="button"
                      onClick={() => void reloadDrafts()}
                      className="shrink-0 rounded-md border border-[#ECD29C] bg-white px-2.5 py-1 text-[11px] font-bold text-[#7A520F] transition hover:bg-[#FBF1E0]"
                    >
                      서버 재연결
                    </button>
                  </div>
                )}
                <RevAuxAnalysisSection
                  revAuxOpen={revAuxOpen}
                  setRevAuxOpen={setRevAuxOpen}
                  selectedMonth={selectedMonth}
                  revComparableGoal={revComparableGoal}
                  revGoalMutedByFilter={revGoalMutedByFilter}
                  revMonthConfirmed={revMonthConfirmed}
                  revMonthPlanned={revMonthPlanned}
                  revMonthHighConfidence={revMonthHighConfidence}
                  revMonthCovered={revMonthCovered}
                  revMonthMonthlyOnly={revMonthMonthlyOnly}
                  revMonthRemaining={revMonthRemaining}
                  revMonthScale={revMonthScale}
                  revMonthOpen={revMonthOpen}
                  revPeakWeek={revPeakWeek}
                  revWeekProjection={revWeekProjection}
                  revMonthRowCount={revMonthRowCount}
                  revManagerTableRows={revManagerTableRows}
                  revProductTableRows={revProductTableRows}
                />

                <RevMobileList
                  filteredRows={filteredRows}
                  revControlsDirty={revControlsDirty}
                  resetRevFilters={resetRevFilters}
                  visibleGroups={visibleGroups}
                  expandedRevGroups={expandedRevGroups}
                  toggleRevGroup={toggleRevGroup}
                  revRowViews={revRowViews}
                  selectedRow={selectedRow}
                  loadDealDetail={loadDealDetail}
                />

                {revTotalPages > 1 && (
                  <div className="hidden items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.08)] px-4 py-2 text-[11.5px] text-[#615D59] md:flex">
                    <p className="font-semibold">
                      {revRangeStart.toLocaleString("ko-KR")}-{revRangeEnd.toLocaleString("ko-KR")} / 고객 {revCustomerGroups.length.toLocaleString("ko-KR")}곳 · 행 {filteredRows.length.toLocaleString("ko-KR")}건
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setRevPage((page) => Math.max(1, page - 1))}
                        disabled={clampedRevPage <= 1}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 font-bold transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3 w-3" />
                        이전
                      </button>
                      <span className="min-w-[56px] text-center font-bold text-[#111110]">
                        {clampedRevPage} / {revTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRevPage((page) => Math.min(revTotalPages, page + 1))}
                        disabled={clampedRevPage >= revTotalPages}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 font-bold transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        다음
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}
                {/* 세로 스크롤을 이 컨테이너 안으로 한정해야 thead sticky top / tfoot sticky bottom이
                    실제로 붙는다 — 페이지 스크롤 + overflow-x-auto 조합에서는 세로 sticky가 무효였음.
                    onPaste: 선택 셀(포커스된 td)에서 버블된 Ctrl+V를 받아 TSV 벌크 프리뷰를 연다(SL-2). */}
                <div
                  className="relative hidden max-h-[calc(100vh-13rem)] min-h-[320px] overflow-auto md:block"
                  onPaste={handleMatrixPaste}
                >
                  <table className="w-max min-w-full border-collapse text-left text-[12px]">
                    <thead className="text-[10px] uppercase tracking-[0.06em] text-[#615D59]">
                      <tr className="h-8 bg-[#FAFAF8]">
                        <th
                          className="sticky left-0 top-0 z-40 border-r border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-left align-middle"
                          style={{ width: MATRIX_CUSTOMER_W, minWidth: MATRIX_CUSTOMER_W, maxWidth: MATRIX_CUSTOMER_W }}
                        >
                          <RevSortHeader label="고객/계정" sortKey="customer" activeKey={revSortKey} direction={revSortDirection} onSort={onRevSort} />
                        </th>
                        <th
                          className="sticky top-0 z-20 border-l border-[#E7E5E1] bg-[#FAFAF8] px-1 text-center align-middle"
                          style={{ width: MATRIX_PRODUCT_W, minWidth: MATRIX_PRODUCT_W, maxWidth: MATRIX_PRODUCT_W }}
                        >
                          상품
                        </th>
                        {revMatrixColumns.map((column) => {
                          const isExpanded = expandedRevMonths.has(column.month)
                          const width = isExpanded ? MATRIX_WEEK_W * 5 + MATRIX_MONTH_W : MATRIX_MONTH_W
                          return (
                            <th
                              key={column.month}
                              colSpan={isExpanded ? 6 : 1}
                              className={`sticky top-0 z-20 border-l border-[#E7E5E1] px-0.5 text-center align-middle ${column.current ? "bg-[#ECFDF5]" : isExpanded ? "bg-[#F6F5F4]" : "bg-[#FAFAF8]"}`}
                              style={{ width, minWidth: width }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleRevMonth(column.month)}
                                aria-expanded={isExpanded}
                                title={`클릭: 주차(w1~w5) 펼치기/접기 · ${formatMonthLabel(column.month)} 합계 ${formatMoney(column.total)}`}
                                className={`inline-flex w-full items-center justify-center gap-0.5 rounded py-1 font-bold transition hover:bg-[#F0F0EC] hover:text-[#084734] ${
                                  column.current ? "text-[#084734]" : "text-[#615D59]"
                                }`}
                              >
                                {column.label}
                                <ChevronDown className={`h-2.5 w-2.5 shrink-0 text-[#A39E98] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </button>
                              {isExpanded && (
                                <div
                                  className="grid gap-0 pb-0.5 text-[10px] font-bold normal-case tracking-normal text-[#615D59]"
                                  style={{ gridTemplateColumns: `repeat(5, ${MATRIX_WEEK_W}px) ${MATRIX_MONTH_W}px` }}
                                >
                                  {["W1", "W2", "W3", "W4", "W5"].map((week) => (
                                    <span key={week}>{week}</span>
                                  ))}
                                  <span className="text-[#084734]">월계</span>
                                </div>
                              )}
                            </th>
                          )
                        })}
                        <th
                          className="sticky right-0 top-0 z-40 border-l border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-right align-middle"
                          style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
                        >
                          <RevSortHeader label="연간합계" sortKey="annual" activeKey={revSortKey} direction={revSortDirection} onSort={onRevSort} align="right" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 && (
                        <tr>
                          <td colSpan={matrixColSpan} className="p-4">
                            <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] text-[#615D59]">
                              <p>조건에 맞는 REV 행이 없습니다 · 필터/검색을 초기화해 보세요</p>
                              {revControlsDirty && (
                                <button
                                  type="button"
                                  onClick={resetRevFilters}
                                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  초기화
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      {pendingNewRowDrafts.length > 0 && (
                        <tr className="border-t border-dashed border-[#ECD29C] bg-[#FFFCF5]">
                          <td colSpan={matrixColSpan} className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => selectRailView("queue")}
                              title="체크 큐 열기 — 신규 초안 검수"
                              className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left text-[11px] font-semibold text-[#7A520F]"
                            >
                              <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 font-bold">
                                미적용 신규 초안 {pendingNewRowDrafts.length}건
                              </span>
                              {pendingNewRowDrafts.slice(0, 3).map((draft) => (
                                <span key={draft.id} className="max-w-[220px] truncate">
                                  {draft.customer || "고객명 미입력"} · {formatMonthLabel(draft.month)} · {formatMoney(draft.amount)}
                                </span>
                              ))}
                              {pendingNewRowDrafts.length > 3 && <span>외 {pendingNewRowDrafts.length - 3}건</span>}
                              <span className="inline-flex items-center gap-1 font-bold text-[#084734] sm:ml-auto">
                                체크 큐에서 검수
                                <ChevronRight className="h-3 w-3" />
                              </span>
                            </button>
                          </td>
                        </tr>
                      )}
                      {visibleGroups.map((group) => {
                        const grouped = group.rows.length > 1
                        const expanded = expandedRevGroups.has(group.key)
                        return (
                          <Fragment key={group.key}>
                            {grouped ? (
                              <RevMatrixGroupRow
                                group={group}
                                months={matrixMonths}
                                expandedMonths={expandedRevMonths}
                                expanded={expanded}
                                selected={selectedGroup?.key === group.key}
                                needsLink={isNeedsLink(group.customer)}
                                onSelect={selectRevGroup}
                                onToggle={toggleRevGroup}
                                density={matrixDensity}
                              />
                            ) : null}
                            {grouped
                              ? expanded &&
                                // 고객 펼침: 카테고리(HW/SW)별 합산 1행. ▸로 펼치면 그 카테고리 품목행(엑셀식 편집)이 나온다.
                                group.categories.map((category) => {
                                  const catRows = group.rows.filter((row) => rowProductCategory(row) === category)
                                  const products = Array.from(new Set(catRows.map((row) => row.productVersion).filter((value): value is string => Boolean(value))))
                                  const catExpanded = expandedRevCategories.has(`${group.key}::${category}`)
                                  const catEditable = catRows.some((row) => matrixMonths.some((month) => isMatrixCellEditable(row, month)))
                                  return (
                                    <Fragment key={`cat-${group.key}-${category}`}>
                                      <RevMatrixCategoryRow
                                        category={category}
                                        customer={group.customer}
                                        products={products}
                                        monthlyByMonth={group.categoryMonthly[category] ?? {}}
                                        annual={group.categoryAnnual[category] ?? EMPTY_BUCKET}
                                        rows={catRows}
                                        months={matrixMonths}
                                        expandedMonths={expandedRevMonths}
                                        expanded={catExpanded}
                                        editable={catEditable}
                                        hardwareLinked={isHardwareLinked(group.customer)}
                                        onToggle={() => toggleRevCategory(group.key, category)}
                                        onOpen={() => selectRevGroup(group.key)}
                                        density={matrixDensity}
                                      />
                                      {catExpanded &&
                                        catRows.map((row) => {
                                          const view = revRowViews.get(row.id)
                                          if (!view) return null
                                          return (
                                            <RevMatrixDealRow
                                              key={row.id}
                                              view={view}
                                              grouped
                                              nested
                                              months={matrixMonths}
                                              expandedMonths={expandedRevMonths}
                                              active={selectedRow?.id === row.id}
                                              selectedMonth={selectedMonth}
                                              onOpen={loadDealDetail}
                                              {...matrixRowEditorProps(row.id)}
                                              pendingByCell={pendingByCell}
                                              density={matrixDensity}
                                              sourceLabel={revRowSourceLabel}
                                            />
                                          )
                                        })}
                                    </Fragment>
                                  )
                                })
                              : // 단일 품목 고객: 편집 가능한 딜행 그대로.
                                group.rows.map((row) => {
                                  const view = revRowViews.get(row.id)
                                  if (!view) return null
                                  return (
                                    <RevMatrixDealRow
                                      key={row.id}
                                      view={view}
                                      grouped={false}
                                      hardwareLinked={isHardwareLinked(row.customer)}
                                      needsLink={isNeedsLink(row.customer)}
                                      months={matrixMonths}
                                      expandedMonths={expandedRevMonths}
                                      active={selectedRow?.id === row.id}
                                      selectedMonth={selectedMonth}
                                      onOpen={loadDealDetail}
                                      {...matrixRowEditorProps(row.id)}
                                      pendingByCell={pendingByCell}
                                      density={matrixDensity}
                                      sourceLabel={revRowSourceLabel}
                                    />
                                  )
                                })}
                          </Fragment>
                        )
                      })}
                    </tbody>
                    {filteredRows.length > 0 && (
                      <RevMatrixFooter
                        columns={revMatrixColumns}
                        grand={revMatrixGrand}
                        months={matrixMonths}
                        expandedMonths={expandedRevMonths}
                      />
                    )}
                  </table>
                </div>
                <div className="flex flex-col gap-3 border-t border-[rgba(0,0,0,0.08)] px-4 py-3 text-[12px] text-[#615D59] sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold">
                    {revRangeStart.toLocaleString("ko-KR")}-{revRangeEnd.toLocaleString("ko-KR")} / 고객 {revCustomerGroups.length.toLocaleString("ko-KR")}곳 · 행 {filteredRows.length.toLocaleString("ko-KR")}건
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
            {/* KPI 렌즈는 KR Team 파이프라인 탭으로 흡수됐다(2026-07-16 역할 재배분) — LENSES에서
                제거됐고 ?lens=kpi는 마운트 시 /admin/branch?tab=pipeline로 리다이렉트된다. */}
          </div>
        </section>

        {pastePlan && (
          <RevMatrixPasteDialog
            plan={pastePlan}
            confidence={pasteConfidence}
            onPickConfidence={setPasteConfidence}
            onCancel={() => setPastePlan(null)}
            onConfirm={confirmMatrixPaste}
          />
        )}

        {matrixToast && (
          <div
            role="alert"
            className={`fixed bottom-20 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border px-4 py-2.5 text-[12px] font-bold shadow-[0_18px_48px_rgba(17,17,16,0.18)] ${
              matrixToast.kind === "error"
                ? "border-[#F2B8B8] bg-[#FCE9E9] text-[#B43E3E]"
                : "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"
            }`}
          >
            {matrixToast.text}
          </div>
        )}

        {sidePanelCollapsed && (
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

        {!sidePanelCollapsed && (
        <aside className="fixed inset-x-3 bottom-3 top-auto z-50 max-h-[86dvh] overflow-y-auto rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-2 shadow-[0_24px_70px_rgba(17,17,16,0.22)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:w-[min(420px,calc(100vw-2rem))] sm:max-h-[calc(100dvh-2rem)]">
          <>
          <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-1.5">
            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#A39E98]">빠른 작업</span>
              <button
                type="button"
                onClick={() => setSidePanelCollapsed(true)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[#A39E98] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                aria-label="빠른 작업 패널 닫기"
                title="빠른 작업 패널 닫기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-0.5 rounded-lg bg-[#F6F5F4] p-[3px]" role="tablist" aria-label="빠른 작업 보기 전환">
              {railViewItems.map((item, index) => {
                const Icon = item.icon
                const active = railView === item.id
                const showQueueBadge = item.id === "queue" && openDrafts.length > 0
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    ref={(node) => { railTabRefs.current[index] = node }}
                    onClick={() => selectRailView(item.id)}
                    onKeyDown={(event) => handleRovingTabKeyDown(event, index, railViewItems, railTabRefs, (nextItem) => selectRailView(nextItem.id))}
                    title={item.description}
                    className={`relative flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#084734] ${
                      active ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#615D59] hover:text-[#111110]"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-[#084734]" : ""}`} />
                    <span className="truncate">{item.shortLabel}</span>
                    {showQueueBadge && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FBF1E0] px-1 text-[9px] font-bold text-[#7A520F]">
                        {openDrafts.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {railView === "detail" && (
          <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
            <div className="border-b border-[rgba(0,0,0,0.08)] px-4 py-3">
              <p className="text-[13px] font-bold text-[#111110]">행 상세</p>
              <p className="mt-1 text-[11px] text-[#615D59]">REV 행 선택 시 월별 금액과 수정 초안 입력</p>
            </div>
            <div className="p-4">
              {selectedGroup && !selectedRow ? (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-[15px] font-bold tracking-[-0.01em] text-[#111110]">{selectedGroup.customer}</p>
                    <span className="shrink-0 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] font-bold text-[#084734]">
                      {selectedGroup.rows.length}건 통합
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-[#615D59]">
                    {[selectedGroup.managers.join(", "), selectedGroup.teams.join("·"), selectedGroup.regions.join("·")]
                      .filter(Boolean)
                      .join(" · ") || "-"}
                  </p>
                  {isNeedsLink(selectedGroup.customer) && (
                    <p className="mt-1.5">
                      <NeedsLinkBadge customer={selectedGroup.customer} long />
                    </p>
                  )}
                  <div className="mt-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11.5px] font-bold text-[#111110]">HW+SW 합산 · {formatMonthLabel(selectedMonth)}</p>
                      <span className="text-[10px] font-bold text-[#615D59]">선택 월</span>
                    </div>
                    <div className="space-y-1.5">
                      {selectedGroup.categories.map((category) => (
                        <div key={category} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <ProductCategoryPill category={category} compact />
                            {category === "hardware" && isHardwareLinked(selectedGroup.customer) && (
                              <Link
                                href={`/admin/hardware?customer=${encodeURIComponent(selectedGroup.customer)}`}
                                title={`${selectedGroup.customer} 하드웨어 거래이력 열기`}
                                className="shrink-0 text-[10px] font-bold text-[#7A520F] underline-offset-2 transition hover:text-[#A8741A] hover:underline"
                              >
                                하드웨어 ↗
                              </Link>
                            )}
                          </span>
                          <span className="font-bold tabular-nums text-[#111110]">{formatMoney(selectedGroup.categoryTotals[category])}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.08)] pt-1.5 text-[11.5px]">
                        <span className="font-bold text-[#615D59]">월 합계</span>
                        <span className="font-bold tabular-nums text-[#111110]">{formatMoney(selectedGroup.monthTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-[#615D59]">확정</span>
                        <span className="font-bold tabular-nums text-[#084734]">{formatMoney(selectedGroup.monthConfirmed)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-[#615D59]">실적 합계</span>
                        <span className="font-bold tabular-nums text-[#111110]">{formatMoney(selectedGroup.revenueTotal)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11.5px] font-bold text-[#111110]">주차 합산</p>
                      {selectedGroup.mismatchCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FCE9E9] px-1.5 py-0.5 text-[10px] font-bold text-[#B43E3E]">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          불일치 {selectedGroup.mismatchCount}행 <span className="font-semibold text-[#A39E98]">(12개월 기준)</span>
                        </span>
                      )}
                    </div>
                    <div className="mb-1 grid grid-cols-5 gap-1 text-right text-[9.5px] font-bold text-[#A39E98]">
                      {["W1", "W2", "W3", "W4", "W5"].map((week) => (
                        <span key={week}>{week}</span>
                      ))}
                    </div>
                    <WeekNumbersCell
                      weeks={selectedGroup.weeks}
                      inferred={!selectedGroup.hasExplicitWeeks}
                      monthOnlyAmount={selectedGroup.monthOnlyAmount}
                    />
                    {selectedGroup.monthOnlyAmount > 0 && selectedGroup.weeks.some((value) => value > 0) && (
                      <p className="mt-1 text-right text-[9.5px] font-semibold text-[#7A520F]">+월합계만 {formatWeekAmount(selectedGroup.monthOnlyAmount)}</p>
                    )}
                  </div>
                  <div className="mt-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white">
                    <p className="border-b border-[rgba(0,0,0,0.08)] px-3 py-2 text-[11.5px] font-bold text-[#111110]">구성 행 {selectedGroup.rows.length}건</p>
                    <div className="max-h-[260px] overflow-y-auto">
                      {selectedGroup.rows.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => void loadDealDetail(row)}
                          className="flex w-full items-center justify-between gap-2 border-t border-[#F0F0EC] px-3 py-2 text-left transition first:border-t-0 hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/30"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <ProductCategoryPill category={rowProductCategory(row)} compact />
                            <span className="min-w-0 truncate text-[11px] font-semibold text-[#615D59]">
                              {row.productVersion || row.dealType || row.status || "-"}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="text-[11.5px] font-bold tabular-nums text-[#111110]">
                              {formatMoney(rowMonthAmount(row, selectedMonth) || row.revenue)}
                            </span>
                            <ChevronRight className="h-3 w-3 text-[#A39E98]" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : !selectedRow ? (
                <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-4 text-[12px] leading-relaxed text-[#615D59]">
                  왼쪽 REV 행을 선택하면 상세 데이터, 월별 금액, 담당자 KPI와 수정 입력 폼이 열립니다. 고객 묶음 헤더를 누르면 HW+SW 통합 요약이 열립니다.
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
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <ProductCategoryPill category={selectedProductCategory} />
                      {selectedProductCategory === "hardware" && isHardwareLinked(detail?.customer_name ?? selectedRow.customer) && (
                        <Link
                          href={`/admin/hardware?customer=${encodeURIComponent(detail?.customer_name ?? selectedRow.customer)}`}
                          title={`${detail?.customer_name ?? selectedRow.customer} 하드웨어 거래이력 열기`}
                          className="text-[10px] font-bold text-[#7A520F] underline-offset-2 transition hover:text-[#A8741A] hover:underline"
                        >
                          하드웨어 ↗
                        </Link>
                      )}
                    </span>
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
                        [CONFIDENCE_TOKENS.confirmed.label, selectedRowMonthConfirmed, CONFIDENCE_TOKENS.confirmed.textClass],
                        [CONFIDENCE_TOKENS["high-confidence"].label, selectedRowMonthHighConfidence, CONFIDENCE_TOKENS["high-confidence"].textClass],
                        [CONFIDENCE_TOKENS.expected.label, selectedRowMonthOpen, CONFIDENCE_TOKENS.expected.textClass],
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
                    {/* KPI 렌즈는 KR Team 파이프라인 탭으로 이동 — 페이지 내 전환 대신 그 탭으로 링크. */}
                    <Link
                      href="/admin/branch?tab=pipeline"
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 text-[11px] font-bold text-[#084734] transition hover:bg-[#D1FAE5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                    >
                      <Users className="h-3.5 w-3.5" />
                      KPI 보기 →
                    </Link>
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
                                className={CONFIDENCE_TOKENS.confirmed.bgClass}
                                style={{ width: `${Math.min(100, (month.confirmed / month.amount) * 100)}%` }}
                              />
                              <span
                                className={CONFIDENCE_TOKENS["high-confidence"].bgClass}
                                style={{ width: `${Math.min(100, (month.highConfidence / month.amount) * 100)}%` }}
                              />
                              <span className={`flex-1 ${CONFIDENCE_TOKENS.expected.bgClass}`} />
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
          <InputRailSection
            editingDraft={editingDraft}
            queueMode={queueMode}
            draftForm={draftForm}
            setDraftForm={setDraftForm}
            selectedDraftOperation={selectedDraftOperation}
            monthOptions={monthOptions}
            selectedMonth={selectedMonth}
            draftAmountInvalid={draftAmountInvalid}
            draftQuantityInvalid={draftQuantityInvalid}
            draftFormInvalid={draftFormInvalid}
            draftSaving={draftSaving}
            canCreateEditDraft={canCreateEditDraft}
            saveEditedDraft={saveEditedDraft}
            cancelDraftEdit={cancelDraftEdit}
            saveDraft={saveDraft}
          />
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

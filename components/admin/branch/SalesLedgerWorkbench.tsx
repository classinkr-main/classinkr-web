"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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
  Columns3,
  Database,
  FileSpreadsheet,
  Gauge,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Table2,
  Target,
  Users,
  X,
} from "lucide-react"
import { adminFetchJson, clearBranchRequestCache, useBranchJson } from "./client-api"
// 서버 입력 큐 훅(초안 CRUD·적용·되돌리기·로컬 폴백·낙관적 잠금)은 ledger/useLedgerDraftQueue로
// 물리 이동(웨이브 7 2단 F5 — 기계적 분할, 로직 무변경).
import {
  errorMessage,
  useLedgerDraftQueue,
  type LedgerDraftInput,
} from "./ledger/useLedgerDraftQueue"
// 회귀 테스트(tests/branch/ledger-record-error-isolation)가 이 모듈 경로에서 import하는 기존
// 표면 유지용 재수출.
export { isDraftRecordError } from "./ledger/useLedgerDraftQueue"
import { matchesTokens, tokenize } from "./search-tokens"
import { normalizedAccountKey } from "@/lib/branch/account-key"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { ledgerMonthSplit, ledgerRowHasColor } from "@/lib/branch/computations/revenue-core"
import { dealHasColorData, splitMonthConfidence } from "@/lib/branch/computations/rev-confirmed"
import { formatMoney, formatPercent } from "@/lib/branch/ledger-format"
import { isSheetAheadOfSync } from "@/lib/branch/sheet-freshness"
// 기간(M/Q/Y) 인지 확장(웨이브 5) — 분기 경계 계산은 fiscal.ts 단일 정의를 그대로 쓴다(새 산식 금지).
import { fiscalQuarter } from "@/lib/branch/fiscal"
// ledger/ 섹션 파일들이 워크벤치를 단일 진입점으로 import — 포매터 SSOT는 lib/branch/ledger-format
export { formatMoney, formatPercent } from "@/lib/branch/ledger-format"
import {
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
import type { DshGridView } from "./ledger/DshNumericGrid"
// 웨이브 7 2단(S4): DSH 렌즈 서브트리(수치 그리드·주간 마감)는 초기 렌더(기본 렌즈 REV)에 필요
// 없다 — shared.tsx 차트 dynamic과 동일 관례(ssr:false + LoadingPanel 스켈레톤)로 지연 로드해
// 첫 로드 번들에서 청크를 제외한다. lens 전환(URL ?lens=dsh 포함)은 마운트 후 상태 변경이라
// 서버 렌더 산출물은 원래도 REV 렌즈 — 동작 무변경.
const DshNumericGrid = dynamic(() => import("./ledger/DshNumericGrid").then((m) => m.DshNumericGrid), {
  ssr: false,
  loading: () => <LoadingPanel label="DSH 수치 그리드를 불러오는 중" />,
})
const WeeklyCloseSection = dynamic(() => import("./ledger/WeeklyCloseSection").then((m) => m.WeeklyCloseSection), {
  ssr: false,
  loading: () => <LoadingPanel label="주간 마감 데이터를 불러오는 중" />,
})
// 주차 Forecast 보드(렌즈 "board", Board-1b 이식) — 기본 렌즈(REV) 첫 로드에 불필요한 서브트리라
// DSH 렌즈와 동일 관례(ssr:false + LoadingPanel)로 지연 로드한다.
const ForecastBoard = dynamic(() => import("./ledger/ForecastBoard").then((m) => m.ForecastBoard), {
  ssr: false,
  loading: () => <LoadingPanel label="주차 Forecast 보드를 불러오는 중" />,
})
import { RevAuxAnalysisSection } from "./ledger/RevAuxAnalysisSection"
import { RevMobileList } from "./ledger/RevMobileList"
import IntegrityStrip from "./IntegrityStrip"
import CrmSyncStrip from "./CrmSyncStrip"
import MultiSelect from "./MultiSelect"
import { InputRailSection } from "./ledger/InputRailSection"
// 검토 초안 체크 큐는 ledger/DraftQueue로 물리 이동(웨이브 7 2단 F5 — 기계적 분할, 로직 무변경).
// S4: 큐는 railView === "queue"에서만 렌더된다(기본 "detail") — 지연 로드로 첫 로드 번들에서
// 제외한다. 정적 재수출을 함께 두면 청크 분리가 무효화되므로 draftStatusMeta 재수출은 두지
// 않는다(테스트는 ledger/DraftQueue에서 직접 import).
const DraftQueue = dynamic(() => import("./ledger/DraftQueue").then((m) => m.DraftQueue), {
  ssr: false,
  loading: () => <LoadingPanel label="체크 큐를 불러오는 중" />,
})
// REV 다중월 매트릭스 클러스터(순수 로직 + 인라인 편집 인프라 + 행/셀/푸터)는 ledger/RevMatrix로
// 물리 이동(웨이브 7 2단 F5 — 기계적 분할, 로직 무변경).
import {
  buildMatrixPastePlan,
  dominantCellConfidence,
  EMPTY_BUCKET,
  findOpenNewRowDuplicate,
  isDraftFormTargetLocked,
  isMatrixCellEditable,
  isMatrixDensity,
  loadStoredMatrixConfidence,
  lookupMatrixPending,
  MATRIX_ANNUAL_W,
  MATRIX_CUSTOMER_W,
  MATRIX_DENSITY_OPTIONS,
  MATRIX_DENSITY_STORAGE_KEY,
  MATRIX_MONTH_W,
  MATRIX_PRODUCT_W,
  MATRIX_WEEK_W,
  MatrixToneLegend,
  NeedsLinkBadge,
  pendingCellAmount,
  railDedupTarget,
  resolveDraftEditTargetRow,
  RevMatrixCategoryRow,
  RevMatrixDealRow,
  RevMatrixFooter,
  RevMatrixGroupRow,
  RevMatrixPasteDialog,
  storeMatrixConfidence,
  useMatrixEditor,
  weekIndexFromToken,
  weeklyPaymentsFromDraftMetadata,
  type MatrixCellCoord,
  type MatrixDensity,
  type MatrixPastePlan,
  type MatrixPendingDraft,
  type RevMatrixColumn,
} from "./ledger/RevMatrix"
// 회귀 테스트(tests/branch/ledger-cell-dedup·ledger-cell-relock·rail-lock-precheck)가 이 모듈
// 경로에서 import하는 기존 표면 유지용 재수출.
export {
  buildMatrixPendingByCell,
  findOpenNewRowDuplicate,
  isDraftFormTargetLocked,
  isMatrixCellEditable,
  isMatrixCellLocked,
  lookupMatrixPending,
  matrixCoordKey,
  pendingCellAmount,
  railDedupTarget,
  resolveDraftEditTargetRow,
} from "./ledger/RevMatrix"
export type { MatrixCellCoord, MatrixPendingDraft } from "./ledger/RevMatrix"
import {
  buildRevWeekProjection,
  DRAFT_CONFLICT_MESSAGE,
  DRAFT_DEDUPED_RECENT_NOTICE,
  DRAFT_OPERATIONS,
  DRAFT_STATUS_LABELS,
  draftWeeklySaveContract,
  draftWeeklyTotal,
  emptyDraftWeekly,
  formatDateTime,
  formatMonthLabel,
  formatWeekAmount,
  LoadingPanel,
  draftConfidenceFromMetadata,
  mergedWeeklyFromMetadata,
  metadataString,
  operationSupportsWeeklySplit,
  productCategoryFromText,
  productCategoryMeta,
  ProductCategoryPill,
  REV_PRODUCT_FILTERS,
  rowMonthAmount,
  rowMonthConfirmed,
  rowMonthHighConfidence,
  rowProductCategory,
  rowWeeklyMismatch,
  rowWeeklySplit,
  safeAmount,
  WeekNumbersCell,
  type BreakdownNumbersRow,
  type DraftConfidence,
  type DraftForm,
  type DraftKind,
  type DraftOperation,
  type DraftSaveResult,
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
  DraftSaveResult,
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

type LedgerLens = "dsh" | "rev" | "board"
type RailView = "detail" | "input" | "queue"
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

// export: 웨이브 5 회귀 테스트(tests/branch)가 순수 집계 함수와 함께 이 타입을 직접 검증한다.
export interface RevManagerSummary {
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
// 매트릭스 토스트 최대 스택 개수(품질 웨이브 3, 항목 6) — 이 이상 쌓이면 가장 오래된 info부터 밀어낸다.
const MATRIX_TOAST_MAX = 3
// 기간 하이라이트 없음(period === "Y") 시 안정 참조로 넘기는 빈 Set — 매 렌더 새 Set을 만들면
// 하이라이트를 소비하는 매트릭스 행 메모(RevMatrixGroupRow 등)가 불필요하게 리렌더된다(웨이브 5, 항목 1).
const EMPTY_MONTH_SET: Set<string> = new Set()
const LENSES: Array<{ id: LedgerLens; label: string; description: string }> = [
  { id: "dsh", label: "DSH", description: "수치 상세 · 목표/실적 그리드" },
  { id: "rev", label: "REV", description: "주차·목표 수치 검수와 행 상세" },
  { id: "board", label: "보드", description: "주차 Forecast 칸반 · 확정/고확도/예정 카드 검수" },
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

// Source 스트립 시간 표기 — KR Team SyncStatusBar.tsx의 relativeTime과 같은 규칙("방금"/"N분 전"/
// "N시간 전"/"N일 전")으로 통일한 워크벤치 로컬 사본(SyncStatusBar는 이 포매터를 내보내지 않는다).
function relativeTimeFromNow(iso: string | null | undefined, now: number): string {
  if (!iso) return "미확인"
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const diff = Math.max(0, now - t)
  if (diff < 60_000) return "방금"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  return `${Math.floor(diff / 86_400_000)}일 전`
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

// FY 라벨(품질 웨이브 3, 항목 4) — fiscalYearOf 기반 "FY{시작}-{종료}" 2자리 문자열.
// 브레드크럼·기간 라벨 2곳의 "FY26-27" 하드코딩을 대체하는 단일 계산원 — 회계연도가
// 바뀌어도 코드 수정 없이 자동으로 다음 연도 라벨을 보여준다.
function fiscalYearLabel(date: Date): string {
  const fy = fiscalYearOf(date)
  const startYY = String(fy % 100).padStart(2, "0")
  const endYY = String((fy + 1) % 100).padStart(2, "0")
  return `FY${startYY}-${endYY}`
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

// 품질 웨이브 7 — 항목 3: 담당/지역 URL 파라미터(mgr/region) 파싱. 콤마 구분 다중값을 지원하되,
// 단일값(기존 링크·PipelineTable/BranchPipelineKanban/ActivityBottleneckSection 등 다른 화면이
// 보내는 크로스링크는 항상 단일 값 하나만 싣는다 — "첫 값 규약")도 그대로 Set 1개짜리로 동작한다.
export function parseMultiFilterParam(value: string | null): Set<string> {
  if (!value) return new Set()
  return new Set(
    value.split(",").map((token) => token.trim()).filter((token) => token.length > 0),
  )
}

// 역방향(상태 → URL). 정렬은 결정적 직렬화를 위해서만(집합 자체의 필터 의미에는 영향 없음).
export function serializeMultiFilterParam(values: Set<string>): string | null {
  if (values.size === 0) return null
  return Array.from(values).sort((a, b) => a.localeCompare(b, "ko")).join(",")
}

// URL 복원이 반응형(딥링크마다 재실행)이 된 뒤로는 내용이 같은 Set을 새 참조로 갈아끼우면
// 필터 memo 체인이 헛돌므로, 동치일 때 기존 참조를 유지한다.
function replaceEquivalentSet(current: Set<string>, next: Set<string>): Set<string> {
  if (current.size === next.size && Array.from(next).every((value) => current.has(value))) return current
  return next
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

// ── 웨이브 5: 장부 기간(M/Q/Y) UX 확장 — 순수 함수만 (tests/branch가 렌더 없이 직접 구동) ──

// 기간 토글이 가리키는 회계월 목록. Q는 "선택월의 분기"가 아니라 "오늘(now) 기준 회계분기"다 —
// periodLabel("현재 분기")·서버 summary API(period=Q가 selectedMonth를 무시하고 fiscalQuarter(now)만
// 쓰는 관례)와 동일하게 맞춘다. M은 항상 [selectedMonth] 단일 원소 — 기존 selectedMonth 단일월
// 집계와 정확히 같은 모집단이 되어 회귀가 없다. now는 테스트에서 실제 시계에 기대지 않도록 주입 가능.
export function buildPeriodMonths(period: Period, selectedMonth: string, matrixMonths: string[], now: Date = new Date()): string[] {
  if (period === "Y") return matrixMonths
  if (period === "Q") {
    const quarter = fiscalQuarter(now.getUTCMonth() + 1)
    return matrixMonths.filter((month) => fiscalQuarter(Number(month.split("-")[1])) === quarter)
  }
  return [selectedMonth]
}

// 기간 헤더 라벨: M="7월", Q="Q2(7-9월)", Y=fyLabel("FY26-27") 그대로. periodMonths는 이미
// buildPeriodMonths로 계산된 결과를 받아 분기 번호를 그 첫 달에서 역산한다(날짜 재계산 이중화 방지).
export function periodShortLabel(period: Period, selectedMonth: string, periodMonths: string[], fyLabel: string): string {
  if (period === "Y") return fyLabel
  if (period === "Q") {
    if (periodMonths.length === 0) return "분기"
    const calendarMonths = periodMonths.map((month) => Number(month.split("-")[1]))
    const quarter = fiscalQuarter(calendarMonths[0])
    return `Q${quarter}(${calendarMonths[0]}-${calendarMonths[calendarMonths.length - 1]}월)`
  }
  return `${Number(selectedMonth.split("-")[1])}월`
}

// 담당자별 기간 집계(품질 철칙: 확도 티어 합산은 rowMonthAmount/rowMonthConfirmed/
// rowMonthHighConfidence를 월 단위로 호출해 합산만 — 새 확도 산식 금지). 금액은 월별로 실제로
// 서로 다른 매출이라 월 3개를 더해도 이중계상이 아니다. 건수(rows)만 딜 id로 dedupe한다 —
// 같은 딜이 분기 3개월 모두에 금액이 있어도 "1건"으로 세야 "N명의 담당자가 M건을 진행"이라는
// 의미가 유지된다(월별로 세면 3배 부풀려진다).
export function aggregatePeriodManagerSummaries(rows: LedgerRevenueRow[], months: string[]): RevManagerSummary[] {
  const managers = new Map<string, RevManagerSummary & { rowIds: Set<string> }>()
  for (const month of months) {
    for (const row of rows) {
      const total = rowMonthAmount(row, month)
      if (total <= 0) continue
      const manager = row.manager ?? "미지정"
      const current = managers.get(manager) ?? {
        manager,
        total: 0,
        confirmed: 0,
        highConfidence: 0,
        open: 0,
        rows: 0,
        rowIds: new Set<string>(),
      }
      current.total += total
      current.confirmed += rowMonthConfirmed(row, month)
      current.highConfidence += rowMonthHighConfidence(row, month)
      current.open += rowMonthOpen(row, month)
      current.rowIds.add(row.id)
      managers.set(manager, current)
    }
  }
  return Array.from(managers.values())
    .map(({ rowIds, ...rest }) => ({ ...rest, rows: rowIds.size }))
    .sort((a, b) => b.total - a.total)
}

export interface PeriodComparisonChip {
  label: string
  deltaPct: number
}

// 전기 대비 칩(웨이브 5, 항목 3) — 이전 기간 확정 합계를 REV rows에서 직접 구한다(matrixMonths가
// 회계연도 12개월을 이미 다 갖고 있어 서버 재조회가 필요 없다). 확정 합산도 위와 동일하게
// rowMonthConfirmed를 월 단위로만 호출한다. FY 경계를 벗어나는 이전 기간(4월의 전월, Q1의
// 전분기)이거나 이전 기간 합이 0이면 null을 반환해 렌더 자체를 생략시킨다 — 거짓 0%를 보여주지
// 않는다(DealMixSection의 prev_period_available 가드와 동일한 원칙, 그 파일은 참고만 하고 손대지 않음).
// Y는 비교 대상(전년 FY)이 로드돼 있지 않아 항상 미지원.
export function buildPrevPeriodComparison(
  period: Period,
  currentActual: number | null | undefined,
  rows: LedgerRevenueRow[],
  matrixMonths: string[],
  periodMonths: string[],
): PeriodComparisonChip | null {
  if (period === "Y") return null
  if (currentActual == null) return null

  let prevMonths: string[]
  let label: string
  if (period === "M") {
    const idx = matrixMonths.indexOf(periodMonths[0] ?? "")
    if (idx <= 0) return null // FY 첫 달(4월)의 "전월"은 회계연도 밖 — 데이터 없음
    prevMonths = [matrixMonths[idx - 1]]
    label = `${formatMonthLabel(prevMonths[0])} 대비`
  } else {
    const calendarMonths = periodMonths.map((month) => Number(month.split("-")[1]))
    const quarter = calendarMonths.length > 0 ? fiscalQuarter(calendarMonths[0]) : null
    if (quarter == null || quarter <= 1) return null // Q1의 "전분기"는 회계연도 밖 — 데이터 없음
    prevMonths = matrixMonths.filter((month) => fiscalQuarter(Number(month.split("-")[1])) === quarter - 1)
    if (prevMonths.length === 0) return null
    label = `Q${quarter - 1} 대비`
  }

  let prevConfirmed = 0
  for (const month of prevMonths) {
    for (const row of rows) prevConfirmed += rowMonthConfirmed(row, month)
  }
  if (prevConfirmed <= 0) return null

  return { label, deltaPct: ((currentActual - prevConfirmed) / prevConfirmed) * 100 }
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

function MetricTile({
  label,
  value,
  hint,
  tone,
  icon,
  chip,
}: {
  label: string
  value: string
  hint: string
  tone?: string
  icon: React.ReactNode
  // 웨이브 5 — 항목 3: 전기 대비 등 짧은 보조 신호. 가드에 걸려 데이터가 없으면 호출부가 null을
  // 넘겨 렌더 자체를 생략한다(거짓 0% 금지).
  chip?: React.ReactNode
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
      {chip && <p className="mt-1">{chip}</p>}
    </div>
  )
}

// th의 aria-sort 값 계산(품질 웨이브 3, 항목 8) — RevSortHeader를 감싸는 <th>가 실제
// aria-sort 소유자(ARIA 표준상 columnheader 상태). 비활성 컬럼은 "none".
function revSortAriaValue(active: boolean, direction: RevSortDirection): "ascending" | "descending" | "none" {
  if (!active) return "none"
  return direction === "asc" ? "ascending" : "descending"
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
      {/* 비활성(정렬 안 됨) 화살표는 흐림 처리로 활성 상태와 구분(항목 8). */}
      <Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-35"}`} aria-hidden="true" />
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


export default function SalesLedgerWorkbench() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
  // Source(원천) 스트립 상대 시간 표기용 tick — SyncStatusBar와 동일하게 1분마다 갱신.
  const [sourceStripNow, setSourceStripNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setSourceStripNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const [query, setQuery] = useState("")
  // 품질 웨이브 7 — 항목 3: 단일 select → MultiSelect(Set) 전환. 빈 Set === "전체"(기존 "ALL"과
  // 동일 의미) — 필터 로직·URL 직렬화·크로스링크 모두 Set 기준으로 다시 쓴다.
  const [managerFilter, setManagerFilter] = useState<Set<string>>(() => new Set())
  const [regionFilter, setRegionFilter] = useState<Set<string>>(() => new Set())
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
  // 1열 미연결 칩 팝오버(2단계 공개) — 열림은 매트릭스 전체에서 그룹키/행ID 1개만(동시 다중 열림 금지).
  // 토글/닫기 콜백은 안정 참조로 내려 memo 행 리렌더를 열림이 바뀐 행으로만 좁힌다.
  const [revLinkPopoverKey, setRevLinkPopoverKey] = useState<string | null>(null)
  const toggleRevLinkPopover = useCallback((key: string) => {
    setRevLinkPopoverKey((prev) => (prev === key ? null : key))
  }, [])
  const closeRevLinkPopover = useCallback(() => setRevLinkPopoverKey(null), [])
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
  // 담당자별 월 수치 테이블 top6 캡 해제 토글(항목 6) — 기본은 캡, "전체 보기"로 전체 목록.
  const [revManagerSummaryExpanded, setRevManagerSummaryExpanded] = useState(false)
  // 매트릭스 셀 커밋 실패(로컬 폴백) 등 편집 지점 인근 알림 토스트 — 상단 Source 바만으로는
  // 편집 중 시야 밖이라 침묵 실패가 되던 문제 대응. 각 토스트는 7초 뒤 자동 소멸.
  // 최대 MATRIX_TOAST_MAX개 스택(품질 웨이브 3, 항목 6) — 이전엔 단일 슬롯이라 에러 표시 도중
  // 뒤이은 info 토스트가 그걸 덮어써 실패 알림을 놓칠 수 있었다. 같은 문구는 dedupe(연타 방지),
  // 초과분은 에러를 우선 유지하고 가장 오래된 info부터 밀어낸다(전부 에러면 가장 오래된 에러부터).
  const [matrixToasts, setMatrixToasts] = useState<Array<{ id: string; kind: "error" | "info"; text: string }>>([])
  const pushMatrixToast = useCallback((next: { kind: "error" | "info"; text: string }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setMatrixToasts((current) => {
      if (current.some((toast) => toast.text === next.text)) return current
      const stacked = [...current, { id, ...next }]
      if (stacked.length <= MATRIX_TOAST_MAX) return stacked
      const dropIndex = stacked.findIndex((toast) => toast.kind === "info")
      return stacked.filter((_, index) => index !== (dropIndex !== -1 ? dropIndex : 0))
    })
    window.setTimeout(() => {
      setMatrixToasts((current) => current.filter((toast) => toast.id !== id))
    }, 7000)
  }, [])
  const dismissMatrixToast = useCallback((id: string) => {
    setMatrixToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])
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
    reversedDraftIds,
    ledgerHealth,
    queueMode,
    queueLoading,
    queueError,
    unsyncedLocalCount,
    recordErrors,
    createDraft,
    updateDraft,
    toggleDraft,
    applyDraft,
    deleteDraft,
    reverseEntry,
    reloadDrafts,
  } = useLedgerDraftQueue()
  // 웨이브 5 — "되돌리기" 결과를 매트릭스 근처 토스트로 알린다(DraftQueue의 인라인 에러 배너와
  // 별개 — 되돌리기는 상태 배지만 남기고 배너를 띄우지 않아 토스트가 유일한 즉시 피드백이다).
  // 에러를 catch 후 다시 던져 DraftQueue의 confirmAndReverse가 다이얼로그를 항상 닫도록 둔다.
  const handleReverseEntry = useCallback(async (draftId: string, reason?: string) => {
    try {
      const entry = await reverseEntry(draftId, reason)
      pushMatrixToast({ kind: "info", text: "적용이 상쇄되었습니다" })
      return entry
    } catch (error) {
      pushMatrixToast({ kind: "error", text: `적용 되돌리기에 실패했습니다. ${errorMessage(error)}` })
      throw error
    }
  }, [reverseEntry, pushMatrixToast])
  const monthOptions = useMemo(() => buildFiscalMonthOptions(new Date()), [])
  // 회계연도 라벨(품질 웨이브 3, 항목 4) — 브레드크럼·기간 라벨 2곳이 이 값 하나를 공유한다.
  const fyLabel = useMemo(() => fiscalYearLabel(new Date()), [])
  // 매트릭스 12개 열의 회계월 값(4→3 순서). monthOptions와 동일 순서·동일 배열이나 값만 뽑아
  // 그룹/행 파생값 루프와 컬럼 memo가 공유한다.
  const matrixMonths = useMemo(() => monthOptions.map((option) => option.value), [monthOptions])
  // 웨이브 5 — 항목 2·3: M/Q/Y 토글이 가리키는 회계월 목록(순수 함수는 파일 상단에 export).
  // REV 매트릭스 자체(그리드 열 구성)는 이 값과 무관하게 항상 matrixMonths(FY 12개월) 그대로다 —
  // periodMonths는 보조 분석(담당자별 수치)·전기 대비 칩처럼 "선택 기간"을 반영해야 하는
  // 하위 UI에만 흘려보낸다.
  const periodMonths = useMemo(() => buildPeriodMonths(period, selectedMonth, matrixMonths), [period, selectedMonth, matrixMonths])
  // 매트릭스 헤더·열 하이라이트(항목 1)용 Set — Y는 FY 전체가 곧 매트릭스라 강조할 대상이 없다(빈 Set).
  const periodHighlightMonths = useMemo(
    () => (period === "Y" ? EMPTY_MONTH_SET : new Set(periodMonths)),
    [period, periodMonths],
  )
  const periodLabelShort = useMemo(
    () => periodShortLabel(period, selectedMonth, periodMonths, fyLabel),
    [period, selectedMonth, periodMonths, fyLabel],
  )

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
  // 복원은 useSearchParams 반응형: 마운트뿐 아니라 same-route 소프트 내비게이션(IntegrityStrip
  // "장부에서 열기" 등 장부 내부 딥링크)과 뒤로/앞으로가기에서도 재실행된다. 계약은 절대적 —
  // 파라미터 생략은 "기본값 복귀"다(아래 writer가 기본값을 URL에서 지우는 규약의 정확한 역방향).
  // writer가 replaceState한 자기 URL이 복원을 되돌리는 self-echo(입력 중 검색어 트림 등)는
  // lastWrittenSearchRef로 차단한다. SSR 기본 렌더(REV 렌즈)와의 하이드레이션 미스매치를 피하기 위해
  // 초기 적용은 lazy useState가 아니라 지금처럼 effect 시점에 한다.
  const defaultMonthRef = useRef(ymKeyUtc(new Date()))
  const [urlReady, setUrlReady] = useState(false)
  const lastWrittenSearchRef = useRef<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    // writer가 방금 기록한 정규형과 같으면 상태가 이미 URL의 원천이므로 재적용하지 않는다.
    if (params.toString() === lastWrittenSearchRef.current) return
    const lensParam = params.get("lens")
    // KPI 렌즈는 KR Team 파이프라인 탭으로 흡수됐다 — 옛 링크(?lens=kpi)는 그리로 리다이렉트.
    if (lensParam === "kpi") {
      router.replace("/admin/branch?tab=pipeline")
      return
    }
    setLens(lensParam === "dsh" || lensParam === "board" ? lensParam : "rev")
    const monthParam = params.get("month")
    setSelectedMonth(
      monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : defaultMonthRef.current,
    )
    const periodParam = params.get("period")
    setPeriod(periodParam && (PERIODS as string[]).includes(periodParam) ? (periodParam as Period) : "Q")
    const teamParam = params.get("team")
    setTeam(teamParam && (TEAMS as string[]).includes(teamParam) ? (teamParam as Team) : "ALL")
    setQuery(params.get("q") ?? "")
    const nextManagerFilter = parseMultiFilterParam(params.get("mgr"))
    setManagerFilter((current) => replaceEquivalentSet(current, nextManagerFilter))
    const nextRegionFilter = parseMultiFilterParam(params.get("region"))
    setRegionFilter((current) => replaceEquivalentSet(current, nextRegionFilter))
    const prod = params.get("prod")
    setProductFilter(prod === "software" || prod === "hardware" || prod === "unknown" ? prod : "all")
    setRevStatusFilter(params.get("status") ?? "ALL")
    setRevDealTypeFilter(params.get("type") ?? "ALL")
    const origin = params.get("origin")
    setRevOriginFilter(origin === "sheet" || origin === "draft" ? origin : "all")
    const fc = params.get("fc")
    setRevForecastFilter(
      fc && REV_FORECAST_FILTERS.some((item) => item.id === fc) ? (fc as RevForecastFilter) : "all",
    )
    const sort = params.get("sort")
    setRevSortKey(sort && sort in REV_SORT_LABELS ? (sort as RevSortKey) : "revenue")
    const dir = params.get("dir")
    setRevSortDirection(dir === "asc" || dir === "desc" ? dir : "desc")
    const ps = Number(params.get("ps"))
    setRevPageSize((REV_PAGE_SIZES as readonly number[]).includes(ps) ? (ps as RevPageSize) : 100)
    const pageParam = Number(params.get("p"))
    setRevPage(Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1)
    setUrlReady(true)
  }, [router, searchParams])

  useEffect(() => {
    if (!urlReady) return
    const params = new URLSearchParams()
    if (lens !== "rev") params.set("lens", lens)
    if (selectedMonth !== defaultMonthRef.current) params.set("month", selectedMonth)
    if (period !== "Q") params.set("period", period)
    if (team !== "ALL") params.set("team", team)
    if (query.trim()) params.set("q", query.trim())
    const mgrParam = serializeMultiFilterParam(managerFilter)
    if (mgrParam) params.set("mgr", mgrParam)
    const regionParam = serializeMultiFilterParam(regionFilter)
    if (regionParam) params.set("region", regionParam)
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
    // replaceState 여부와 무관하게 항상 기록 — "URL이 현재 상태의 정규형과 일치"가 복원 스킵 조건이라,
    // 쓰기가 생략된 경우(이미 일치)에도 ref는 최신 정규형을 가리켜야 한다.
    lastWrittenSearchRef.current = search
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
    // 주차 분해 그리드(Ledger-1a/Cockpit-1c)는 기본 꺼짐 — 리셋(저장 성공·편집 취소) 경로가
    // 이 값을 그대로 쓰므로 weekly 버퍼도 여기서 함께 비워진다.
    weeklyMode: false,
    weekly: emptyDraftWeekly(),
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
    setManagerFilter(new Set())
    setRegionFilter(new Set())
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
  const summary = useBranchJson<BranchSummaryResponse>(`/api/admin/branch/summary?team=${team}&period=${period}${monthQuery}&breakdown=1`, refreshKey)
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
      // 웨이브 5 — "되돌리기": draft.status는 상쇄 후에도 "applied" 그대로다(감사 추적 보존).
      // reversedDraftIds 없이는 이 안전망(entries 누락 시 applied draft를 대체 표시)이 방금
      // 상쇄된 항목까지 "아직 동기화 안 된 신규 적용"으로 오인해 되살린다 — 반드시 함께 걸러야
      // ledgerEntryRows의 active 필터가 매트릭스에서 해당 반영분을 실제로 소거할 수 있다.
      .filter((draft) => !reversedDraftIds.has(draft.id))
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
  }, [drafts, matrixMonths, team, reversedDraftIds])
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
    // 다중 토큰 AND 매칭(품질 웨이브 3, 항목 1) — "김민 BD"처럼 서로 다른 필드에 걸친 복합
    // 검색을 지원한다. sheetRow를 필드에 포함(항목 2) — IntegrityStrip의 "장부에서 열기 →"
    // 딥링크(`?lens=rev&q=<sheetRow>`)가 실제로 그 행을 찾아 매칭되게 한다(기존엔 sheetRow가
    // 검색 대상에 없어 링크를 눌러도 검색 결과가 비었다).
    const tokens = tokenize(query)
    return rows
      .filter((row) => managerFilter.size === 0 || (row.manager != null && managerFilter.has(row.manager)))
      .filter((row) => regionFilter.size === 0 || (row.region != null && regionFilter.has(row.region)))
      .filter((row) => productFilter === "all" || rowProductCategory(row) === productFilter)
      .filter((row) => revStatusFilter === "ALL" || row.status === revStatusFilter)
      .filter((row) => revDealTypeFilter === "ALL" || row.dealType === revDealTypeFilter)
      .filter((row) => revOriginFilter === "all" || row.ledgerOrigin === revOriginFilter)
      .filter((row) => {
        if (tokens.length === 0) return true
        const originLabel = row.ledgerOrigin === "draft" ? "장부 입력 applied draft 신규 수정" : "시트 원본 sheet"
        const productMeta = productCategoryMeta(rowProductCategory(row))
        return matchesTokens(tokens, [
          row.customer,
          row.manager,
          row.team,
          row.region,
          row.status,
          row.dealType,
          row.productVersion,
          productMeta.label,
          productMeta.shortLabel,
          originLabel,
          row.draftKind,
          row.draftNote,
          row.draftMonth,
          row.sourceDealId,
          row.sheetRow != null ? String(row.sheetRow) : "",
        ])
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
  // 담당자 전체(캡 없음) — top6 캡은 표시 단계(revTopManagers)에서만 건다. "전체 보기" 토글이
  // 캡을 해제할 수 있도록 집계 자체는 항상 전체 담당자를 계산해 둔다(항목 6).
  // 웨이브 5 — 항목 2: selectedMonth 고정이던 집계를 periodMonths(M=선택월/Q=현재 분기 3개월/
  // Y=FY 전체)로 확장 — M은 periodMonths가 [selectedMonth] 단일 원소라 기존과 동일한 결과.
  const revManagersSorted = useMemo<RevManagerSummary[]>(
    () => aggregatePeriodManagerSummaries(filteredRows, periodMonths),
    [filteredRows, periodMonths],
  )
  const revTopManagers = useMemo(
    () => (revManagerSummaryExpanded ? revManagersSorted : revManagersSorted.slice(0, 6)),
    [revManagersSorted, revManagerSummaryExpanded],
  )
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
    managerFilter.size === 0 &&
    regionFilter.size === 0 &&
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
          // 품질 웨이브 4 — 항목 1: 정정 적용으로 재잠긴 월 집합을 행 뷰에 함께 캐시해
          // RevMatrixDealRow가 매 렌더 별도 Map 조회 없이 소비하게 한다.
          correctedMonths: editRowOverrideMonths.get(row.id) ?? null,
        })
      }
    }
    return views
  }, [visibleGroups, matrixMonths, selectedMonth, editRowOverrideMonths])

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

  // dealKey(row.sourceDealId ?? row.id) → 그 행(품질 웨이브 3, 항목 3). pendingByCell의 dealKey
  // 판정과 동일 규약 — saveEditedDraft가 editingDraft의 딜 정체성만으로 대응 행을 찾을 때 쓴다
  // (큐에서 바로 "수정" 진입하면 selectedRow가 그 딜과 무관할 수 있어 selectedRow에 기댈 수 없다).
  const rowByDealKey = useMemo(() => {
    const map = new Map<string, LedgerRevenueRow>()
    for (const row of visibleDealRows) map.set(row.sourceDealId ?? row.id, row)
    return map
  }, [visibleDealRows])

  // 편집가능 셀 좌표(렌더 순서: 행 위→아래, 월 좌→우, 확장월은 w1→w5). 잠금 셀은 제외.
  // 방향키/Tab 순회의 단일 소스. matrixMonths는 4→3 회계연도 순.
  // 확장된 편집가능 월은 주차 5칸으로 분해(Tab이 w1→…→w5→다음 월로 흐름), 비확장 월은 월 요약 셀 1칸.
  const editableCells = useMemo<MatrixCellCoord[]>(() => {
    const cells: MatrixCellCoord[] = []
    for (const row of visibleDealRows) {
      const correctedMonths = editRowOverrideMonths.get(row.id)
      for (const month of matrixMonths) {
        if (!isMatrixCellEditable(row, month, correctedMonths)) continue
        if (expandedRevMonths.has(month)) {
          for (let week = 0; week < 5; week += 1) cells.push({ rowId: row.id, month, week })
        } else {
          cells.push({ rowId: row.id, month })
        }
      }
    }
    return cells
  }, [visibleDealRows, matrixMonths, expandedRevMonths, editRowOverrideMonths])

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
        const summary: MatrixPendingDraft = {
          id: draft.id,
          amount: draft.amount,
          confidence: draftConfidenceFromMetadata(draft.metadata),
          weekly: mergedWeeklyFromMetadata(draft.metadata),
        }
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
  // 그 셀에 미검수(draft|checked) 초안이 있으면 시트 원값 대신 그 초안 금액을 우선한다 — 그래야
  // 재편집 시작값이 "이미 대기 중인 값"이 되어 (a) 같은 값 재입력이 중복 초안을 만들지 않고
  // (b) 값을 바꿔도 onCommitCell이 새 초안 대신 이 초안을 PATCH한다(이중계상 방지, P0).
  // pending이 없으면 기존 규약: 주차 셀은 그 주차의 현재 표시값, 아니면 그 달 표시 금액.
  const matrixCellValue = useCallback(
    (coord: MatrixCellCoord) => {
      const pending = lookupMatrixPending(pendingByCell, coord)
      if (pending) return pendingCellAmount(pending, coord.week)
      const row = rowById.get(coord.rowId)
      if (!row) return 0
      if (coord.week != null) return rowWeeklySplit(row, coord.month).weeks[coord.week] ?? 0
      return rowMonthAmount(row, coord.month)
    },
    [pendingByCell, rowById],
  )

  // 셀 우세 확도 → 편집 팝오버 기본 선택. 미검수 초안이 있으면 그 확도 우선.
  // 주차 셀은 그 주차 pending → 없으면 월 pending → 없으면 월 버킷 우세 확도로 폴백.
  const matrixCellConfidence = useCallback(
    (coord: MatrixCellCoord): DraftConfidence => {
      const pending = lookupMatrixPending(pendingByCell, coord)
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
  // 반환값: 서버에 실제로 반영됐으면 true, 로컬 폴백(장부 적용 불가)이면 false — 붙여넣기 루프가
  // 이 값을 모아 "N건 생성 · M건 실패" 요약 토스트를 만든다(SL-2 실패 집계, 항목 4).
  // options.silent=true면 개별 실패 토스트를 억제한다(붙여넣기 루프처럼 상위에서 집계 토스트를 낼 때).
  const onCommitCell = useCallback(
    (
      rowId: string,
      month: string,
      amount: number,
      confidence: DraftConfidence,
      week?: number,
      options?: { silent?: boolean },
    ): Promise<boolean> => {
      const row = rowById.get(rowId)
      if (!row) return Promise.resolve(false)
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
      // 같은 셀(월/주차)에 이미 대기 중(draft|checked)인 초안이 있으면 새 초안을 POST하지 않고
      // 그 초안을 PATCH한다 — sourceDealId+month에 DB 유일성이 없어, 재편집 때마다 새 초안을 만들면
      // 둘 다 적용됐을 때 같은 셀 매출이 이중 계상된다(P0). 상태 전이(draft/checked/applied)는 건드리지
      // 않는다 — 이 input에는 status 필드가 없어 PATCH가 금액/메타데이터만 갱신한다.
      const existingId = lookupMatrixPending(pendingByCell, { rowId, month, week })?.id ?? null
      const persist = existingId ? updateDraft(existingId, input) : createDraft(input)
      return persist.then((result) => {
        // 낙관적 잠금 충돌(웨이브 7 2단, I4): 이번 수정은 반영되지 않았고, 해당 초안은 훅이 서버
        // 현재본으로 이미 새로고침했다(로컬 낙관 반영 없음) — 로컬 폴백과는 다른 문구로 정확히 알린다.
        if (result.conflict) {
          if (!options?.silent) pushMatrixToast({ kind: "error", text: DRAFT_CONFLICT_MESSAGE })
          return false
        }
        // 서버 검증 거부(400, 감액 양수 검증 등) — 서버 문구를 그대로 노출한다. 로컬 임시 저장도
        // 되지 않았다(유효하지 않은 입력을 로컬 큐에 남기지 않는 훅 계약).
        if (result.validationMessage) {
          if (!options?.silent) pushMatrixToast({ kind: "error", text: result.validationMessage })
          return false
        }
        const draft = result.draft
        // createDraft는 실패 시에도 local-* 초안으로 폴백해 resolve된다. updateDraft의 로컬 폴백은
        // 기존 서버 id를 유지하므로 이 접두어 판정만으론 못 잡지만, 그 경우는 queueError 전역 배너가 알린다.
        const usedLocalFallback = !draft || draft.id.startsWith("local-")
        if (usedLocalFallback && !options?.silent) {
          pushMatrixToast({
            kind: "error",
            text: "서버 저장 실패 — 로컬 임시 초안으로만 저장됐습니다 (장부 적용 불가). 입력 큐에서 서버 재연결 후 다시 입력하세요.",
          })
        }
        // 직전 60초 내 동일 입력 재사용(POST 200, 더블클릭/더블탭 방어) — 저장은 유효하지만 새
        // 초안이 생긴 게 아니라는 사실을 알려 중복 생성 오인을 막는다(웨이브 7 2단, I4 항목 3).
        if (result.dedupedRecent && !usedLocalFallback && !options?.silent) {
          pushMatrixToast({ kind: "info", text: DRAFT_DEDUPED_RECENT_NOTICE })
        }
        return !usedLocalFallback
      })
    },
    [createDraft, lens, pendingByCell, period, pushMatrixToast, rowById, team, updateDraft],
  )

  const onMatrixAmountClamped = useCallback(() => {
    pushMatrixToast({ kind: "info", text: "음수는 0으로 처리됩니다 — 감액은 장부 가감 입력 사용" })
  }, [pushMatrixToast])

  const matrixEditor = useMatrixEditor({
    editableCells,
    cellValue: matrixCellValue,
    cellConfidence: matrixCellConfidence,
    onCommitCell,
    onAmountClamped: onMatrixAmountClamped,
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
      const plan = buildMatrixPastePlan(text, anchor, visibleDealRows, matrixMonths, editRowOverrideMonths)
      if (!plan) {
        pushMatrixToast({ kind: "info", text: "붙여넣을 숫자 값을 찾지 못했습니다 — 엑셀에서 금액 셀 범위를 복사해 주세요." })
        return
      }
      setPasteConfidence(loadStoredMatrixConfidence() ?? "expected")
      setPastePlan(plan)
    },
    [matrixEditor.editing, matrixEditor.selected, matrixMonths, pushMatrixToast, visibleDealRows, editRowOverrideMonths],
  )

  // 프리뷰 확인 → 셀 편집과 동일한 onCommitCell 경로로만 커밋(셀당 검토 초안 1건, 2단 게이트 유지).
  // 붙여넣기 커밋 루프: 셀당 onCommitCell(silent) → 결과를 모아 성공/실패 건수를 한 번에 요약한다.
  // 이전엔 셀마다 개별 실패 토스트가 fire-and-forget으로 날아와 단일 슬롯 토스트를 서로 덮어썼다
  // (항목 4) — 이제 개별 토스트는 억제하고 전체 완료 후 "N건 생성 · M건 실패" 하나만 띄운다.
  const confirmMatrixPaste = useCallback(async () => {
    if (!pastePlan) return
    storeMatrixConfidence(pasteConfidence)
    const applyCells = pastePlan.cells.filter((cell) => cell.status === "apply")
    setPastePlan(null)
    if (applyCells.length === 0) return
    const results = await Promise.all(
      applyCells.map((cell) => onCommitCell(cell.rowId, cell.month, cell.next, pasteConfidence, undefined, { silent: true })),
    )
    const committed = results.filter(Boolean).length
    const failed = results.length - committed
    pushMatrixToast({
      kind: failed > 0 ? "error" : "info",
      text:
        failed > 0
          ? `${committed.toLocaleString("ko-KR")}건 생성 · ${failed.toLocaleString("ko-KR")}건 실패 — 실패분은 로컬 임시 저장(장부 적용 불가), 서버 재연결 후 다시 붙여넣으세요.`
          : `검토 초안 ${committed.toLocaleString("ko-KR")}건 생성 — 체크 큐에서 검수(체크 → 적용) 후 장부에 반영됩니다.`,
    })
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
    managerFilter.size > 0 ||
    regionFilter.size > 0 ||
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
    const operation: DraftOperation = row.ledgerOrigin === "draft" && isDraftOperation(metadataString(row.draftMetadata, "operation"))
      ? metadataString(row.draftMetadata, "operation") as DraftOperation
      : "amount-change"
    const formMonth = row.draftMonth ?? selectedMonth
    // 주차 프리필(Ledger-1a): 폼 타겟 월에 explicit 주차 입력이 있으면 5칸을 채워 주차 분해
    // 모드로 연다 — inferred(일자 추정)/month-only는 실주차 입력이 아니라 월합계 모드 유지.
    // week 토큰은 저장 계약(week:"month")·이중계상 dedup 좌표와 일치하도록 month로 고정한다.
    const weeklySplit = rowWeeklySplit(row, formMonth)
    const weeklyPrefill = weeklySplit.source === "explicit" && operationSupportsWeeklySplit(operation)
    setDraftForm({
      operation,
      customer: row.customer,
      manager: row.manager ?? "",
      team: row.team ?? (team === "ALL" ? "BD" : team),
      productCategory: rowProductCategory(row),
      month: formMonth,
      fromMonth: metadataString(row.draftMetadata, "fromMonth") ?? row.draftMonth ?? selectedMonth,
      week: weeklyPrefill ? "month" : metadataString(row.draftMetadata, "week") ?? "month",
      confidence: draftConfidenceFromMetadata(row.draftMetadata),
      amount: row.revenue ? String(Math.round(row.revenue)) : "",
      quantity: metadataNumberString(row.draftMetadata, "quantity"),
      note: row.draftNote ?? "",
      weeklyMode: weeklyPrefill,
      weekly: weeklyPrefill
        ? weeklySplit.weeks.map((value) => (value > 0 ? String(Math.round(value)) : ""))
        : emptyDraftWeekly(),
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
      const message = error instanceof Error ? error.message : String(error)
      // 딜 상세 API의 raw 리터럴("not_found")을 그대로 노출하지 않는다 — 재동기화(시트 미러
      // 교체·DB 재임포트)로 행 id가 바뀐 뒤 이전 화면의 행을 누르면 나는 상태라, 원인과 복구
      // 동작(새로고침)을 함께 안내한다.
      setDetailError(
        message === "not_found"
          ? "행 원천 딜을 찾을 수 없습니다 — 재동기화로 원천 데이터가 바뀌었을 수 있어요. 화면을 새로고침한 뒤 다시 선택해 주세요."
          : message,
      )
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

    // 주차 분해 저장 계약(shared.draftWeeklySaveContract): weeklyMode + 지원 작업 유형(forecast-add·
    // amount-change 한정 — 기간 이동/수량 변경은 단일 금액 UX 유지) + 주차 합>0이면
    // amount=주차 합(draftForm.amount 무시)·metadata.weekly=5칸 숫자·metadata.week="month"로 싣는다 —
    // onCommitCell의 주차 병합 초안과 동일한 metadata 키 규약이라 서버 스키마·적용(주차 복원) 경로 호환.
    const weeklyContract = draftWeeklySaveContract(draftForm)
    return {
      kind,
      sourceDealId: kind === "edit-row" ? (selectedRow?.sourceDealId ?? selectedRow?.id ?? base?.sourceDealId) : undefined,
      sourceSheetRow: kind === "edit-row" ? (selectedRow?.sheetRow ?? detail?.sheet_row ?? base?.sourceSheetRow ?? null) : null,
      sourceSnapshot,
      customer: draftForm.customer.trim(),
      manager: draftForm.manager.trim(),
      team: draftForm.team.trim(),
      month: draftForm.month,
      amount: weeklyContract ? weeklyContract.amount : safeAmount(draftForm.amount),
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
        week: weeklyContract ? weeklyContract.week : draftForm.week,
        // 단일 금액 경로에서는 null을 명시해 base(재편집 초안)의 이전 weekly 잔존을 지운다 —
        // 주차 분해를 껐다 저장하면 단일 금액 초안으로 되돌아간다(onCommitCell의 weekly: null 규약과 동일).
        weekly: weeklyContract ? weeklyContract.weekly : null,
        confidence: draftForm.confidence,
        quantity: draftForm.quantity.trim() ? safeAmount(draftForm.quantity) : null,
      },
    }
  }, [detail, draftForm, lens, period, selectedMonth, selectedRow, team])

  // 반환값(DraftSaveResult): persisted는 서버에 실제로 저장됐으면 true, 로컬 폴백(장부 적용 불가)이면
  // false — InputRailSection이 이 값으로 저장 성공/실패 인라인 메시지를 낸다(항목 5). deduped는
  // 이중계상 가드(품질 웨이브 3, 항목 3)가 새 POST 대신 기존 초안을 PATCH로 갱신했으면 true.
  //
  // 이중계상 가드: 매트릭스 셀 재편집(onCommitCell)과 동일한 lookupMatrixPending 판정을 여기서도
  // 쓴다 — kind==="edit-row"이고 선택된 행이 있을 때, 그 행·타겟 월/주차에 이미 열린 초안이
  // 있으면 새 초안을 만들지 않고 그 초안을 PATCH한다(railDedupTarget이 정확히 그 좌표만 비교하므로,
  // 기간이동처럼 타겟 월이 실제로 다른 정당한 별건 초안은 막지 않는다 — 차단이 아니라 타겟 재지정).
  // new-row(신규 고객)는 아직 매트릭스에 대응 행이 없어 이 재지정 판정 대상이 아니다 — 대신
  // duplicateWarning(품질 웨이브 4, 항목 2)으로 같은 고객명·월 조합의 열린 초안이 있으면 경고만 낸다.
  const saveDraft = useCallback(async (kind: DraftKind): Promise<DraftSaveResult> => {
    setDraftSaving(true)
    try {
      const dedupTarget = kind === "edit-row" && selectedRow
        ? railDedupTarget(pendingByCell, selectedRow.id, draftForm.month, draftForm.week, null)
        : null
      // 저장 전에 판정해둔다 — new-row 저장 성공 시 draftForm이 defaultDraftForm으로 리셋되므로
      // 저장 후에는 이 시점의 customer/month를 다시 읽을 수 없다.
      const duplicate = kind === "new-row" ? findOpenNewRowDuplicate(drafts, draftForm.customer, draftForm.month) : null
      const result = dedupTarget
        ? await updateDraft(dedupTarget.id, buildDraftInput(kind))
        : await createDraft(buildDraftInput(kind))
      const draft = result.draft
      // 웨이브 7 2단(I4): 검증 거부(400)·충돌(409)이면 폼을 리셋하지 않는다 — 사용자가 입력값을
      // 보존한 채 고쳐서 재시도해야 한다. (기존 경로는 실패해도 로컬 폴백 draft가 non-null이라
      // 이 가드로 동작이 바뀌지 않는다.)
      if (kind === "new-row" && draft) {
        setDraftForm(defaultDraftForm)
      }
      return {
        persisted: Boolean(draft && !draft.id.startsWith("local-")),
        deduped: Boolean(dedupTarget),
        duplicateWarning: Boolean(duplicate),
        conflict: result.conflict,
        dedupedRecent: result.dedupedRecent,
        validationMessage: result.validationMessage,
      }
    } finally {
      setDraftSaving(false)
    }
  }, [buildDraftInput, createDraft, defaultDraftForm, draftForm.customer, draftForm.month, draftForm.week, drafts, pendingByCell, selectedRow, updateDraft])

  const editDraft = useCallback((draft: LedgerDraft) => {
    setEditingDraftId(draft.id)
    setSidePanelCollapsed(false)
    setRailView("input")
    const operation: DraftOperation = isDraftOperation(draft.metadata?.operation) ? draft.metadata.operation : "forecast-add"
    // 주차 병합 초안(metadata.weekly — 레일 주차 분해 저장·onCommitCell 주차 병합 공통 규약)을
    // 재편집하면 5칸을 그대로 프리필해 주차 분해 모드로 연다(월 합=주차 합 불변식 유지).
    const mergedWeekly = mergedWeeklyFromMetadata(draft.metadata)
    const weeklyPrefill = mergedWeekly != null && operationSupportsWeeklySplit(operation)
    setDraftForm({
      operation,
      customer: draft.customer,
      manager: draft.manager,
      team: draft.team || (team === "ALL" ? "BD" : team),
      productCategory: draft.metadata?.productCategory === "hardware" ? "hardware" : "software",
      month: draft.month,
      fromMonth: metadataString(draft.metadata, "fromMonth") ?? draft.month,
      week: weeklyPrefill ? "month" : metadataString(draft.metadata, "week") ?? "month",
      confidence: draftConfidenceFromMetadata(draft.metadata),
      amount: draft.amount ? String(Math.round(draft.amount)) : "",
      quantity: metadataNumberString(draft.metadata, "quantity"),
      note: draft.note,
      weeklyMode: weeklyPrefill,
      weekly: weeklyPrefill && mergedWeekly
        ? mergedWeekly.map((value) => (value > 0 ? String(Math.round(value)) : ""))
        : emptyDraftWeekly(),
    })
  }, [team])

  const cancelDraftEdit = useCallback(() => {
    setEditingDraftId(null)
    setDraftForm(defaultDraftForm)
  }, [defaultDraftForm])

  // saveEditedDraft는 항상 editingDraft.id를 PATCH 대상으로 삼는다(새 POST가 아니므로 그 자체로
  // 이중계상을 만들지 않는다). 다만 편집 중 타겟 월/주차를 바꿔 "다른" 열린 초안과 같은 셀을
  // 가리키게 될 수 있다 — 이 경우 저장을 막지 않고(정당한 편집일 수 있음), deduped=true로
  // InputRailSection에 "이미 대기 초안 있음" 안내만 얹는다(항목 3, 판단은 사용자에게 맡긴다).
  const saveEditedDraft = useCallback(async (): Promise<DraftSaveResult> => {
    if (!editingDraft) return { persisted: false, deduped: false }
    setDraftSaving(true)
    try {
      const dealKey = editingDraft.kind === "edit-row"
        ? editingDraft.sourceDealId ?? metadataString(editingDraft.metadata, "sourceDealId")
        : null
      const dedupRow = dealKey ? rowByDealKey.get(dealKey) : undefined
      const dedupTarget = dedupRow
        ? railDedupTarget(pendingByCell, dedupRow.id, draftForm.month, draftForm.week, editingDraft.id)
        : null
      const result = await updateDraft(editingDraft.id, buildDraftInput(editingDraft.kind, editingDraft))
      const draft = result.draft
      // 웨이브 7 2단(I4): 충돌(409)·검증 거부(400)면 편집 상태를 유지한다 — 폼의 입력값을 보존한 채
      // (충돌이면 큐 카드가 서버 현재본으로 새로고침된 걸 확인하고) 바로 재시도할 수 있게 한다.
      // 편집 상태를 여기서 닫으면 editingDraft 전환 시 인라인 피드백도 함께 초기화돼 안내가 사라진다.
      if (!result.conflict && !result.validationMessage) {
        setEditingDraftId(null)
        setDraftForm(defaultDraftForm)
      }
      return {
        persisted: Boolean(draft && !draft.id.startsWith("local-")),
        deduped: Boolean(dedupTarget),
        conflict: result.conflict,
        validationMessage: result.validationMessage,
      }
    } finally {
      setDraftSaving(false)
    }
  }, [buildDraftInput, defaultDraftForm, draftForm.month, draftForm.week, editingDraft, pendingByCell, rowByDealKey, updateDraft])

  const revenue = summary.data?.revenue
  // 첫 로드 중 타일이 가짜 ¥0을 보여주지 않도록 — 값이 오기 전에는 대시로 정직하게.
  const summaryPending = summary.loading && !summary.data
  const gap = (revenue?.confirmed ?? 0) - (revenue?.goal ?? 0)
  // 웨이브 5 — 항목 3: "실적" 타일(revenue.confirmed, 이미 서버가 period=M/Q/Y로 스코프해 내려줌)
  // 바로 옆에 붙는 전기 대비 칩. 이전 기간 합계는 서버 재조회 없이 REV rows(matrixMonths가 FY
  // 12개월을 이미 다 들고 있다)에서 클라이언트가 직접 낸다 — rows는 팀 스코프·검색필터 미반영이라
  // revenue.confirmed(서버, 팀 스코프)와 같은 모집단이다.
  const revPrevPeriodComparison = useMemo(
    () => buildPrevPeriodComparison(period, summaryPending ? null : revenue?.confirmed ?? null, rows, matrixMonths, periodMonths),
    [period, summaryPending, revenue?.confirmed, rows, matrixMonths, periodMonths],
  )
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
      // 품질 웨이브 7 — 항목 4: "초안/체크"라는 산재 표현 대신 DRAFT_STATUS_LABELS SSOT 용어로.
      description: `${openDrafts.length}건의 ${DRAFT_STATUS_LABELS.draft}/${DRAFT_STATUS_LABELS.checked} 항목을 확인합니다.`,
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
  const periodLabel = period === "M" ? formatMonthLabel(selectedMonth) : period === "Q" ? "현재 분기" : fyLabel
  // 파이프라인 탭 딥링크(품질 웨이브 3, 항목 9 → 웨이브 6, 항목 4) — 지금 보고 있는 team/period
  // 컨텍스트를 동봉해 "KPI 보기" 클릭 후에도 같은 팀/기간을 유지한다. q(검색어)·mgr(담당자 필터)도
  // 함께 동봉 — BranchDashboardClient가 이번 웨이브에서 q/mgr 파싱을 추가할 예정이라 파라미터 이름은
  // 이 파일의 자체 URL 동기화(setUrl, 위 q/mgr set 참조)와 동일하게 맞춘다. 기본값(ALL/Q/빈 검색어)은
  // 그 페이지도 기본값이라 생략(URL 동기화 규약과 동일하게 diff만 반영).
  const pipelineHref = useMemo(() => {
    const params = new URLSearchParams({ tab: "pipeline" })
    if (team !== "ALL") params.set("team", team)
    if (period !== "Q") params.set("period", period)
    // 항목 3 수정 — period==="M"일 때 month를 동봉하지 않으면 BranchDashboardClient가 URL의
    // month를 못 읽어(그 파일 line 119 searchParams.get("month")) selectedMonth가 기본값(이번
    // 달)으로 되돌아간다 — 다른 달을 보다가 링크를 눌러도 이번 달로 튕기는 버그. PipelineTable의
    // ledgerHref(sections/PipelineTable.tsx)와 동일 규약.
    if (period === "M") params.set("month", selectedMonth)
    if (query.trim()) params.set("q", query.trim())
    // BranchDashboardClient의 mgr는 단일 select(pipelineManager) 기준이다(그 파일은 이 웨이브에서
    // 수정 금지) — 장부가 여러 담당자를 골랐어도 PipelineTable.ledgerHref와 동일한 "첫 값 규약"으로
    // 하나만 동봉한다.
    const [firstManager] = managerFilter
    if (firstManager) params.set("mgr", firstManager)
    return `/admin/branch?${params.toString()}`
  }, [team, period, selectedMonth, query, managerFilter])
  const canCreateEditDraft = Boolean(selectedRow && (selectedRow.ledgerOrigin === "sheet" || selectedRow.sourceDealId))
  // 품질 웨이브 7 — 항목 1: 레일 폼 잠금 사전검사. 지금 저장하면 targeting할 (행, 월)이 이미
  // isMatrixCellLocked(correctedMonths 포함)면 InputRailSection이 서버로 보내기 전에 인라인
  // 경고로 막는다 — 적용된 정정과 겹쳐 409를 부르는 헛수고 제거(집계·저장 로직은 무변경, 제출
  // 직전 판정만 추가).
  const draftEditTargetRow = resolveDraftEditTargetRow(editingDraft, selectedRow, rowByDealKey)
  const isEditRowSaveTarget = editingDraft ? editingDraft.kind === "edit-row" : canCreateEditDraft
  const targetCellLocked = useMemo(
    () => isDraftFormTargetLocked(
      isEditRowSaveTarget,
      draftEditTargetRow,
      draftForm.month,
      draftEditTargetRow ? editRowOverrideMonths.get(draftEditTargetRow.id) : null,
    ),
    [isEditRowSaveTarget, draftEditTargetRow, draftForm.month, editRowOverrideMonths],
  )
  const draftAmountValue = safeAmount(draftForm.amount)
  // 주차 분해 모드(지원 작업 유형 한정)에서는 단일 금액(draftForm.amount) 대신 주차 자동합계가
  // 저장 금액이므로 "고객명 + 주차 합>0"이 유효 조건이다 — 음수/비숫자 칸은 draftWeeklyAmounts가
  // 0 처리해 합계에서 자연히 빠진다(buildDraftInput의 draftWeeklySaveContract 게이트와 동일 판정).
  const draftWeeklySplitActive = draftForm.weeklyMode && operationSupportsWeeklySplit(draftForm.operation)
  const draftAmountInvalid = draftWeeklySplitActive
    ? draftWeeklyTotal(draftForm.weekly) <= 0
    : !draftForm.amount.trim() || draftAmountValue <= 0
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
      // 주차 분해 유지 중 다른 작업 유형을 오갔다 돌아오면 그 사이 고른 week 토큰이 남을 수 있다 —
      // 주차 분해가 다시 활성화되는 순간 저장 계약(week:"month")·dedup 좌표와 재일치시킨다.
      week: current.weeklyMode && operationSupportsWeeklySplit(operation) ? "month" : current.week || "month",
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
              <span>{fyLabel}</span>
              <ChevronRight className="h-3.5 w-3.5" />
              {/* 구 IA 시절 영문 라벨("Sales Ledger") 잔재 — 현재 admin-nav 섹션 라벨(sales="영업·매출")로 정정. */}
              <span>영업·매출</span>
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
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[12px] font-semibold text-[#8F2C2C]"
          >
            <span>{syncError ?? summary.error ?? kpi.error ?? pipeline.error}</span>
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={refreshing}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[#B43E3E] bg-white px-2.5 text-[11px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              다시 시도
            </button>
          </div>
        )}
      </header>

      <main className="space-y-5 px-4 pt-5 sm:px-6 lg:px-9">
        {/* 정합성 배지 — KR Team 개요와 동일 컴포넌트(데이터품질 이슈 요약). 검수 화면이 원 소비처라 상단 고정. */}
        <IntegrityStrip refreshKey={refreshKey} />
        {/* CRM 싱크 스트립(A안) — 정합 체크(시트 자체 품질)의 형제 축: "시트가 CRM과 이어져
            있는가". 표시 레이어 전용, fail-soft(로딩 미렌더·실패 시 조용한 한 줄). */}
        <CrmSyncStrip />
        <aside className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1 self-start">
          <div className="inline-flex flex-wrap gap-1 self-start rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-1" role="tablist" aria-label="장부 렌즈 전환">
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
                  {item.id === "dsh" ? <Gauge className="h-3.5 w-3.5" /> : item.id === "rev" ? <Table2 className="h-3.5 w-3.5" /> : <Columns3 className="h-3.5 w-3.5" />}
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
              원천
            </span>
            <span>
              sync{" "}
              <span className="font-semibold text-[#111110]" title={formatDateTime(summary.data?.lastSync)}>
                {relativeTimeFromNow(summary.data?.lastSync, sourceStripNow)}
              </span>
            </span>
            <span>
              시트수정{" "}
              <span className="font-semibold text-[#111110]" title={formatDateTime(summary.data?.sheetModifiedAt)}>
                {relativeTimeFromNow(summary.data?.sheetModifiedAt, sourceStripNow)}
              </span>
            </span>
            {/* 스테일 경고 공유화(품질 웨이브 4 — 항목 4) — SyncStatusBar와 같은 순수 판정
                (lib/branch/sheet-freshness.ts)을 여기서도 써서 "시트수정"이 "sync"보다 눈에 띄게
                앞서 있으면 동일 경고를 낸다(2026-07-16 사고 재발 감지력이 이 화면에도 있어야 한다). */}
            {!summary.error && isSheetAheadOfSync(summary.data?.sheetModifiedAt, summary.data?.lastSync) && (
              <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[10.5px] font-semibold text-[#7A520F]">
                시트가 더 새로움 — 동기화 필요
              </span>
            )}
            <span>입력 큐 <span className="font-semibold text-[#111110]">{queueMode === "server" ? "서버" : "로컬"} · {openDrafts.length}건</span></span>
            <span>내부 원장 <span className="font-semibold text-[#111110]">{ledgerHealth?.ok === false ? "준비 필요" : `${ledgerEntries.length}건`}</span></span>
            <span className="flex items-center gap-1.5">
              REV 원천{" "}
              <span
                className="font-semibold text-[#111110]"
                title={dbImportInfo ? `액티브 DB 임포트 run ${dbImportInfo.runId} · ${formatDateTime(dbImportInfo.capturedAt)}` : undefined}
              >
                {dbImportInfo
                  ? `DB run ${dbImportInfo.runId.slice(0, 8)}${dbImportInfo.capturedAt ? ` · ${relativeTimeFromNow(dbImportInfo.capturedAt, sourceStripNow)}` : ""}`
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
              label="확정 매출"
              value={summaryPending ? "–" : formatMoney(revenue?.confirmed)}
              hint={summaryPending ? "불러오는 중" : `시트 원천 · ${periodLabel} 달성률 ${formatPercent(revenue?.pacing_pct)}`}
              tone="text-[#084734]"
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              chip={
                revPrevPeriodComparison && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10.5px] font-bold ${
                      revPrevPeriodComparison.deltaPct >= 0 ? "text-[#084734]" : "text-[#B43E3E]"
                    }`}
                  >
                    {revPrevPeriodComparison.deltaPct >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {revPrevPeriodComparison.label} {revPrevPeriodComparison.deltaPct >= 0 ? "+" : ""}
                    {revPrevPeriodComparison.deltaPct.toFixed(0)}%
                  </span>
                )
              }
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
                    {/* 웨이브 5 — 항목 1(a): M/Q 토글이 아래 본표(12개월 매트릭스)를 좁힌다는 오인
                        방지 — 본표 열 구성은 항상 FY 12개월 고정이고, M/Q/Y는 이 카드의 보조
                        분석(목표대비·담당자별 등)과 아래 요약 타일에만 반영된다는 것을 명시한다. */}
                    <span
                      title="M/Q/Y 토글은 아래 요약 타일·보조 분석 기간만 바꿉니다. 이 표는 항상 회계연도 12개월 전체를 보여줍니다."
                      className="inline-flex shrink-0 items-center rounded-full border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 py-0.5 text-[10px] font-bold text-[#615D59]"
                    >
                      본표는 FY 전체 12개월 고정
                    </span>
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
                  {/* 품질 웨이브 4 — 항목 9: 툴바를 탐색/표시/액션 3그룹으로 시각 구분(구분선+미세 라벨).
                      컨트롤 자체(핸들러·disabled·aria-label 등)는 그대로 두고, 인접 배치와 얇은 라벨만
                      더했다 — 그룹 안에서 초기화 버튼만 액션 그룹으로 옮겨 표시 그룹을 인접시켰다. */}
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="탐색">
                    <span aria-hidden className="h-5 w-px shrink-0 bg-[rgba(0,0,0,0.08)]" />
                    <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-[#A39E98]">탐색</span>
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
                    <MultiSelect
                      label="담당자"
                      options={managerOptions}
                      selected={managerFilter}
                      onChange={setManagerFilter}
                      placeholder="전체"
                      width="w-48"
                    />
                    <MultiSelect
                      label="지역"
                      options={regionOptions}
                      selected={regionFilter}
                      onChange={setRegionFilter}
                      placeholder="전체"
                      width="w-48"
                    />
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
                  </div>
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="표시">
                    <span aria-hidden className="h-5 w-px shrink-0 bg-[rgba(0,0,0,0.08)]" />
                    <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-[#A39E98]">표시</span>
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
                  <div className="flex items-center gap-2" role="group" aria-label="액션">
                    <span aria-hidden className="h-5 w-px shrink-0 bg-[rgba(0,0,0,0.08)]" />
                    <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-[#A39E98]">액션</span>
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
                {/* 품질 웨이브 6 — 항목 3: 초기 sortKey="revenue"인데 aria-sort는 고객/연간합계 th에만
                    붙어 있어(테이블 구조는 그대로 둔다) 스크린리더 사용자에게 "기본 정렬 없음"으로
                    잘못 들린다. 정렬 드롭다운·방향 토글이 바뀔 때마다 실제 상태를 능동 고지. */}
                <span className="text-[10px] font-semibold text-[#A39E98]" aria-live="polite">
                  현재 정렬: {REV_SORT_LABELS[revSortKey]} {revSortDirection === "asc" ? "오름차순" : "내림차순"}
                </span>
                {query.trim() && <FilterTag label={`검색 ${query.trim()}`} onClear={() => setQuery("")} />}
                {/* 품질 웨이브 7 — 항목 3: 멀티셀렉트 전환 — 선택값마다 칩 1개, 개별 해제(Set에서 그
                    값만 delete) 가능. MultiSelect 버튼 자체의 "A 외 N" 요약과는 별개로, 툴바 아래
                    활성 필터 칩 줄은 기존 관례(다른 필터도 전부 여기서 개별 해제)를 그대로 따른다. */}
                {Array.from(managerFilter).map((name) => (
                  <FilterTag
                    key={`mgr-${name}`}
                    label={`담당자 ${name}`}
                    onClear={() => setManagerFilter((current) => {
                      const next = new Set(current)
                      next.delete(name)
                      return next
                    })}
                  />
                ))}
                {Array.from(regionFilter).map((name) => (
                  <FilterTag
                    key={`region-${name}`}
                    label={`지역 ${name}`}
                    onClear={() => setRegionFilter((current) => {
                      const next = new Set(current)
                      next.delete(name)
                      return next
                    })}
                  />
                ))}
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
                {/* 서버는 복구됐지만(queueMode=server) 재연결 시 자동 재전송이 일부/전부 실패해 여전히
                    로컬에만 남은 초안 — 무음 유실 방지 경고 배지(항목 2). 재시도는 loadDrafts 재호출로. */}
                {queueMode === "server" && unsyncedLocalCount > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F2B8B8] bg-[#FCE9E9] px-4 py-2.5">
                    <p className="min-w-0 text-[11.5px] font-bold leading-relaxed text-[#B43E3E]">
                      로컬 초안 {unsyncedLocalCount}건 미전송 — 서버 재연결 시 자동 재전송을 시도했지만 실패했습니다. 장부에 적용할 수 없습니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => void reloadDrafts()}
                      className="shrink-0 rounded-md border border-[#F2B8B8] bg-white px-2.5 py-1 text-[11px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9]"
                    >
                      다시 재전송
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
                  revManagerTotalCount={revManagersSorted.length}
                  revManagerSummaryExpanded={revManagerSummaryExpanded}
                  onToggleManagerSummaryExpanded={() => setRevManagerSummaryExpanded((value) => !value)}
                  onManagerRowClick={(manager) => setManagerFilter(new Set([manager]))}
                  revProductTableRows={revProductTableRows}
                  revManagerPeriodLabel={periodLabelShort}
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
                  <table role="grid" aria-label="REV 매출 매트릭스" className="w-max min-w-full border-collapse text-left text-[12px]">
                    <thead className="text-[10px] uppercase tracking-[0.06em] text-[#615D59]">
                      <tr role="row" className="h-8 bg-[#FAFAF8]">
                        <th
                          aria-sort={revSortAriaValue(revSortKey === "customer", revSortDirection)}
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
                          // 웨이브 5 — 항목 1(b): "선택 기간"(M=선택월, Q=현재 분기) 컬럼을 오늘
                          // (column.current)과는 구분되는 옅은 톤으로 표시 — 기존 column.current
                          // 강조 패턴(같은 그린 계열)을 확장한다. 컬럼 자체(폭·순서·개수)는 불변 —
                          // 톤만 얹어 "지금 보조 분석/전기 대비 칩의 기준 컬럼"임을 알린다.
                          const isPeriodColumn = periodHighlightMonths.has(column.month)
                          return (
                            <th
                              key={column.month}
                              colSpan={isExpanded ? 6 : 1}
                              className={`sticky top-0 z-20 border-l px-0.5 text-center align-middle ${
                                column.current
                                  ? "border-[#E7E5E1] bg-[#ECFDF5]"
                                  : isPeriodColumn
                                    ? "border-[#BDEFD8] bg-[#ECFDF5]/45"
                                    : isExpanded
                                      ? "border-[#E7E5E1] bg-[#F6F5F4]"
                                      : "border-[#E7E5E1] bg-[#FAFAF8]"
                              }`}
                              style={{ width, minWidth: width }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleRevMonth(column.month)}
                                aria-expanded={isExpanded}
                                title={`클릭: 주차(w1~w5) 펼치기/접기 · ${formatMonthLabel(column.month)} 합계 ${formatMoney(column.total)}${
                                  isPeriodColumn ? ` · 현재 선택 기간(${periodLabelShort})` : ""
                                }`}
                                className={`inline-flex w-full items-center justify-center gap-0.5 rounded py-1 font-bold transition hover:bg-[#F0F0EC] hover:text-[#084734] ${
                                  column.current || isPeriodColumn ? "text-[#084734]" : "text-[#615D59]"
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
                          aria-sort={revSortAriaValue(revSortKey === "annual", revSortDirection)}
                          className="sticky right-0 top-0 z-40 border-l border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 text-right align-middle"
                          style={{ width: MATRIX_ANNUAL_W, minWidth: MATRIX_ANNUAL_W, maxWidth: MATRIX_ANNUAL_W }}
                        >
                          <RevSortHeader label="연간합계" sortKey="annual" activeKey={revSortKey} direction={revSortDirection} onSort={onRevSort} align="right" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 && (
                        <tr role="row">
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
                        <tr role="row" className="border-t border-dashed border-[#ECD29C] bg-[#FFFCF5]">
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
                                linkPopoverOpen={revLinkPopoverKey === group.key}
                                onLinkPopoverToggle={toggleRevLinkPopover}
                                onLinkPopoverClose={closeRevLinkPopover}
                                onSelect={selectRevGroup}
                                onToggle={toggleRevGroup}
                                density={matrixDensity}
                                periodMonths={periodHighlightMonths}
                              />
                            ) : null}
                            {grouped
                              ? expanded &&
                                // 고객 펼침: 카테고리(HW/SW)별 합산 1행. ▸로 펼치면 그 카테고리 품목행(엑셀식 편집)이 나온다.
                                group.categories.map((category) => {
                                  const catRows = group.rows.filter((row) => rowProductCategory(row) === category)
                                  const products = Array.from(new Set(catRows.map((row) => row.productVersion).filter((value): value is string => Boolean(value))))
                                  const catExpanded = expandedRevCategories.has(`${group.key}::${category}`)
                                  const catEditable = catRows.some((row) => matrixMonths.some((month) => isMatrixCellEditable(row, month, editRowOverrideMonths.get(row.id))))
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
                                        periodMonths={periodHighlightMonths}
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
                                              periodMonths={periodHighlightMonths}
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
                                      needsLink={isNeedsLink(row.customer)}
                                      linkPopoverOpen={revLinkPopoverKey === row.id}
                                      onLinkPopoverToggle={toggleRevLinkPopover}
                                      onLinkPopoverClose={closeRevLinkPopover}
                                      months={matrixMonths}
                                      expandedMonths={expandedRevMonths}
                                      active={selectedRow?.id === row.id}
                                      selectedMonth={selectedMonth}
                                      onOpen={loadDealDetail}
                                      {...matrixRowEditorProps(row.id)}
                                      pendingByCell={pendingByCell}
                                      density={matrixDensity}
                                      periodMonths={periodHighlightMonths}
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
                        periodMonths={periodHighlightMonths}
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

            {/* 주차 Forecast 보드(Board-1b 이식) — REV와 같은 filteredRows 모집단(검색·담당자·지역·
                상품 필터 반영)을 주차 칸반으로 재배열. 카드 클릭은 기존 빠른 작업 레일(행 상세)로
                연결된다 — 보드 전용 편집 경로를 만들지 않는다. */}
            {lens === "board" && (
              <ForecastBoard
                rows={filteredRows}
                selectedMonth={selectedMonth}
                monthOptions={monthOptions}
                onSelectMonth={setSelectedMonth}
                onOpenRow={(row) => void loadDealDetail(row)}
                selectedRowId={selectedRow?.id ?? null}
              />
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

        {matrixToasts.length > 0 && (
          <div className="fixed bottom-20 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2">
            {matrixToasts.map((toast) => (
              <div
                key={toast.id}
                role="alert"
                className={`flex items-start gap-2 rounded-lg border px-4 py-2.5 text-[12px] font-bold shadow-[0_18px_48px_rgba(17,17,16,0.18)] ${
                  toast.kind === "error"
                    ? "border-[#F2B8B8] bg-[#FCE9E9] text-[#B43E3E]"
                    : "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"
                }`}
              >
                <span className="pt-0.5">{toast.text}</span>
                <button
                  type="button"
                  onClick={() => dismissMatrixToast(toast.id)}
                  aria-label="알림 닫기"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
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
                      <NeedsLinkBadge customer={selectedGroup.customer} />
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
              ) : (
                <div>
                  {/* 딜 원천 조회 실패가 패널 전체를 막지 않는다 — 아래 상세는 전부
                      detail ?? selectedRow 폴백이라 행 기반 월 분해·주차 바·빠른 액션이 그대로
                      동작한다. 경고 스트립만 얹어 사이드탭 데드엔드(과거 raw not_found 전면
                      ErrorPanel)를 해소한다. */}
                  {detailError && (
                    <div
                      role="alert"
                      className="mb-3 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[11px] font-semibold leading-relaxed text-[#7A520F]"
                    >
                      {detailError} 아래 정보는 화면 행 데이터 기준으로 표시합니다.
                    </div>
                  )}
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
                  {/* 계보(1열 다이어트로 매트릭스 ⓘ 배지에서 이동) — 시트 N행·원천 라벨을 뮤트 라인으로.
                      sheetRow 없는 행(장부 신규 등)은 생략한다. */}
                  {selectedRow.sheetRow != null && (
                    <p className="mt-1 text-[10px] font-semibold text-[#A39E98]">
                      {`시트 '2. REV' ${selectedRow.sheetRow}행 · 원천 ${revRowSourceLabel}`}
                    </p>
                  )}
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
                    {/* KPI 렌즈는 KR Team 파이프라인 탭으로 이동 — 페이지 내 전환 대신 그 탭으로 링크.
                        team/period 컨텍스트를 동봉(항목 9) — 필터를 좁혀 보던 도중에도 그대로 이어진다. */}
                    <Link
                      href={pipelineHref}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 text-[11px] font-bold text-[#084734] transition hover:bg-[#D1FAE5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
                    >
                      <Users className="h-3.5 w-3.5" />
                      KPI 보기 →
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("")
                        setManagerFilter(selectedRow.manager ? new Set([selectedRow.manager]) : new Set())
                        setRegionFilter(new Set())
                        setRevPage(1)
                      }}
                      disabled={!selectedRow.manager}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Table2 className="h-3.5 w-3.5" />
                      담당 REV
                    </button>
                    {/* 렌즈 교차 점프(라운드 2 Track C) — 같은 행 맥락을 유지한 채 다른 렌즈로 이동.
                        REV에서 열었으면 보드(선택월 카드가 selectedRowId 링으로 하이라이트),
                        그 외(보드/DSH)에서 열었으면 REV 매트릭스로 고객 검색을 걸어 그 행을 좁힌다.
                        URL 반영은 렌즈 절대 계약(반응형 복원·writer)이 알아서 처리한다. */}
                    {lens === "rev" ? (
                      <button
                        type="button"
                        onClick={() => selectLens("board")}
                        className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
                      >
                        <Columns3 className="h-3.5 w-3.5" />
                        보드에서 보기 — {formatMonthLabel(selectedMonth)} 주차 카드
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery(selectedRow.customer)
                          setManagerFilter(new Set())
                          setRegionFilter(new Set())
                          setRevPage(1)
                          selectLens("rev")
                        }}
                        className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
                      >
                        <Table2 className="h-3.5 w-3.5" />
                        REV 매트릭스에서 보기 — 고객 검색 적용
                      </button>
                    )}
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
            targetCellLocked={targetCellLocked}
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
                reversedDraftIds={reversedDraftIds}
                recordErrors={recordErrors}
                onReload={() => void reloadDrafts()}
                onEdit={editDraft}
                onToggle={toggleDraft}
                onApply={applyDraft}
                onDelete={deleteDraft}
                onReverse={handleReverseEntry}
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

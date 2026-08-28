"use client"

// SalesLedgerWorkbench 모듈-레벨 타입·상수·순수 헬퍼·소형 아톰.
// SalesLedgerWorkbench.tsx 분해(2026-08-28)로 물리 이동 — 로직 무변경.
// 주의: 이 파일은 ../SalesLedgerWorkbench를 import하지 않는다 — 사이클 금지(ledger/shared와 동일 규칙).

import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from "react"
import { ArrowDownNarrowWide, ArrowUpNarrowWide, X } from "lucide-react"
import { formatMoney } from "@/lib/branch/ledger-format"
import { ledgerMonthSplit } from "@/lib/branch/computations/revenue-core"
import { fiscalQuarter } from "@/lib/branch/fiscal"
import {
  PERIODS,
  TEAMS,
  type BranchPipelineResponse,
  type Period,
} from "../types"
import {
  DRAFT_OPERATIONS,
  draftConfidenceFromMetadata,
  formatMonthLabel,
  mergedWeeklyFromMetadata,
  rowMonthAmount,
  rowMonthConfirmed,
  rowMonthHighConfidence,
  rowProductCategory,
  rowWeeklyMismatch,
  rowWeeklySplit,
  weeklyConfidenceFromMetadata,
  type DraftOperation,
  type LedgerRevenueRow,
  type RevMonthlyBucket,
  type RevProductCategory,
  type RevWeekPoint,
} from "./shared"

type LedgerLens = "dsh" | "rev" | "board" | "cockpit"
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
// 라운드 3(P1): 유효한 weekly+weeklyConfidence(주차별 확도 병렬 배열)가 있으면 초안 단위
// 확도 대신 주차 합 exact로 분해한다 —
//   - monthlyConfirmed[month] = Σ(confirmed 주차 금액), monthlyHighConfidence = Σ(high-confidence).
//   - monthlyRed[month]는 전액 확정(¥1 오차 허용 — confirmed 합 ≥ amount-1)일 때만 true.
//     부분 확정을 red로 만들면 캐논(rev-confirmed)의 red 폴백이 월 전체를 확정으로 오집계한다.
// weeklyConfidence 부재/무효(기존 초안)는 기존 로직 그대로 — 완전 하위호환.
// export: tests/branch/weekly-confidence.test.ts가 exact 합·red 규칙을 직접 검증한다.
export function appliedDraftConfidenceMaps(
  month: string,
  amount: number,
  metadata: Record<string, unknown> | null | undefined,
): Pick<LedgerRevenueRow, "monthlyConfirmed" | "monthlyHighConfidence" | "monthlyRed"> {
  const weekly = mergedWeeklyFromMetadata(metadata)
  const states = weekly ? weeklyConfidenceFromMetadata(metadata) : null
  if (weekly && states) {
    let confirmed = 0
    let highConfidence = 0
    weekly.forEach((value, index) => {
      if (value <= 0) return
      if (states[index] === "confirmed") confirmed += value
      else if (states[index] === "high-confidence") highConfidence += value
    })
    return {
      monthlyConfirmed: confirmed > 0 ? { [month]: confirmed } : {},
      monthlyHighConfidence: highConfidence > 0 ? { [month]: highConfidence } : {},
      monthlyRed: amount > 0 && confirmed >= amount - 1 ? { [month]: true } : {},
    }
  }
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
  { id: "cockpit", label: "콕핏", description: "내 딜 목록 → 우측 빠른 입력에서 주차별 확도 (콕핏 입력)" },
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

// 시간 게이트(2026-07-20): '미연결' 칩은 미래 '예정' 매출만 있는 계정엔 아직 안 띄운다 —
// cutoffMonth(보통 이번 달) 이하 달에 확정 매출이 잡혀야 띄운다. 미래 달은 예측치라
// 안 맞아도 정상이라 검사 대상에서 뺀다(월 키가 YYYY-MM zero-pad라 문자열 비교로 충분).
function hasConfirmedThroughMonth(monthlyTotals: Record<string, RevMonthlyBucket>, cutoffMonth: string): boolean {
  return Object.entries(monthlyTotals).some(([month, bucket]) => month <= cutoffMonth && bucket.confirmed > 0)
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

// 라운드 3 P3 — "내 딜" 담당자 프리셋 핀. pristine 진입(마운트 후 첫 실행 + URL 파라미터 0개)
// 여부만 판정하는 순수 함수 — ref 갱신(1회 소비)·localStorage 읽기 등 부수효과는 호출부(URL
// 복원 effect)가 담당한다. 파라미터가 하나라도 있으면(예: ?lens=rev&q=349) 이번이 이 컴포넌트의
// 첫 실행이라도 false다 — 핀이 딥링크 결과를 가리면 안 된다(검색된 행이 다른 담당자 소유일 수
// 있다). alreadyAttempted가 true면(직전 실행에서 이미 판정을 소비) 파라미터가 이번엔 우연히
// 비어 있어도 항상 false — "pristine 진입 최초 1회만"이라 내비게이션·self-echo로 되돌아온
// 빈 파라미터는 재시드 대상이 아니다.
export function isPinSeedEligible(alreadyAttempted: boolean, searchParamsString: string): boolean {
  return !alreadyAttempted && searchParamsString === ""
}

// 서버 프리페치 시드 게이트용 — URL 복원이 끝난 뒤 이 화면이 실제로 요청하게 될 파이프라인
// URL을 검색 파라미터만으로 미리 계산한다. 정규화(team/period 화이트리스트, month 형식,
// period !== "M"이면 month를 URL에 넣지 않음)는 URL 복원 effect·아래 pipelineUrl 조립과
// 문자 그대로 같아야 한다 — 어긋나면 시드가 맞는데도 버려지거나(성능 손실), 틀린데도
// 적용된다(잘못된 행 표시).
export function pipelineUrlForSearchParams(searchParamsString: string, defaultMonth: string): string {
  const params = new URLSearchParams(searchParamsString)
  const teamParam = params.get("team")
  const team = teamParam && (TEAMS as readonly string[]).includes(teamParam) ? teamParam : "ALL"
  const periodParam = params.get("period")
  const period = periodParam && (PERIODS as readonly string[]).includes(periodParam) ? periodParam : "Q"
  const monthParam = params.get("month")
  const month = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : defaultMonth
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(month)}` : ""
  return `/api/admin/branch/pipeline?team=${team}&period=${period}${monthQuery}`
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
          <p className="mt-1 truncate text-[10px] font-bold tabular-nums text-[#111110]">{formatMoney(week.total)}</p>
        </div>
      ))}
    </div>
  )
}


/** 페이지 서버 프리페치가 내려주는 첫 화면 파이프라인 응답 + 그 응답이 대응하는 요청 URL. */
export interface LedgerPipelinePrefetch {
  url: string
  data: BranchPipelineResponse
}


// 이전에 파일-프라이빗이던 심볼도 본체(SalesLedgerWorkbench)가 계속 쓰도록 일괄 공개한다.
export type {
  LedgerLens,
  RailView,
  RevSortKey,
  RevSortDirection,
  RevOriginFilter,
  RevForecastFilter,
  DealDetail,
  DealDetailResponse,
  RevProductSummary,
  RevPageSize,
  RevDbImportResponse,
  RevDbImportInfo,
  ActiveRevImportStatusResponse,
}
export {
  REV_PAGE_SIZES,
  REV_SORT_LABELS,
  REV_ORIGIN_FILTERS,
  REV_FORECAST_FILTERS,
  MATRIX_TOAST_MAX,
  EMPTY_MONTH_SET,
  LENSES,
  handleRovingTabKeyDown,
  relativeTimeFromNow,
  canRunAdminOperationsFromSession,
  loadStoredRevDbImport,
  storeRevDbImport,
  clearStoredRevDbImport,
  ymKeyUtc,
  hasConfirmedThroughMonth,
  fiscalYearOf,
  fiscalYearLabel,
  buildFiscalMonthOptions,
  shiftMonth,
  compareText,
  replaceEquivalentSet,
  metadataNumberString,
  isDraftOperation,
  categoryRank,
  FilterTag,
  rowMonthOpen,
  rowMonthBucket,
  emptyMonthlyBucket,
  addMonthlyBucket,
  rowHasWeeklyInput,
  rowMatchesForecastFilter,
  rowMatchesForecastFilterInMonths,
  buildRevProductSummary,
  snapshotField,
  snapshotText,
  MetricTile,
  revSortAriaValue,
  RevSortHeader,
  SelectedWeekBars,
}

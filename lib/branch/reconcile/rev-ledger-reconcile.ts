// REV 시트 ↔ 매출 장부 대조(U-2 ①, E-7, 2026-11-25) — 12/1 시트 잠금 전에 "장부가 시트와 같은가"를 숫자로 판단한다.
// 순수 모듈: I/O·process.env 금지, 지금 시각은 인자(opts.asOf·opts.now)로만 받는다.
//
// 비교하는 넷(담당자 × 달 × 확정/고확도/예정/합계):
//   S_now  = 지금 시트(그리드를 오늘 asOf 로 파싱)
//   S_data = 같은 그리드를 장부 DB 의 데이터 날짜(dataDate)로 파싱 — "그날 동기화했다면 DB 에 들어갔을 값"
//   D      = 장부 DB 의 REV 행 그대로(액티브 임포트, 없으면 미러 — 화면과 같은 원천)
//   L      = 장부(D1) = D + 적용된 장부 항목(정정은 그 (시트 행, 달)을 대체, 신규는 더함) − 상쇄 − 시트가 이미 읽은 초안.
//            화면과 서버가 쓰는 lib/branch/ledger-overlay.ts 그대로(buildLedgerOverlay).
// 확도는 넷 다 같은 캐논(revenue-core.ledgerMonthBucket → rev-confirmed.ts)으로, 같은 읽는 날(asOf, KST)에 판정한다.
//
// 차이 Δ = L − S_now 를 셋으로 나눈다(항등식 — 항상 정확히 성립):
//   장부 입력          = L − D       (장부 항목이 만든 차이 — 받아들일 것인가는 사람이 본다)
//   동기화 뒤 시트 변경 = D − S_data  (DB 가 데이터 날짜의 시트와 다르다 — 동기화·캡처 뒤 시트 수정, 또는 캡처 결함)
//   시간 경과          = S_data − S_now (파싱한 날만 다를 때의 차이 — 읽는 시점 판정(F-08·F-09)이 맞으면 0)
// 잠금을 막는 것: 동기화 뒤 시트 변경 ≠ 0, 시트 자체 점검(0절)의 설명 안 된 차이·못 읽은 칸, 화면 식 ↔ 서버 식 차이.

import type { BranchPipelineRow } from "@/components/admin/branch/types"
import type { FormattedCell } from "@/lib/branch/google-sheets"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { normalizedAccountKey } from "@/lib/branch/account-key"
import { listRevRevenue, type RevRevenueRow } from "@/lib/branch/computations/pipeline"
import { readRevPendingCells, type RevPendingCell } from "@/lib/branch/computations/rev-confirmed"
import { ledgerMonthBucket } from "@/lib/branch/computations/revenue-core"
import { fiscalYearMonths } from "@/lib/branch/fiscal"
import { isRecord, snapshotSheetRowId } from "@/lib/branch/ledger-draft-metadata"
import {
  buildLedgerOverlay,
  createSheetRowResolver,
  mergeLedgerIntoDeals,
  type LedgerOverlayInput,
  type LedgerOverlayResult,
  type LedgerRevenueRow,
} from "@/lib/branch/ledger-overlay"
import { BRANCH_MEMBER_CANONICAL_NAMES, isKnownBranchMember, normalizeBranchMemberName } from "@/lib/branch/member-names"
import { parseRevWithStats, resolveRevColumns, resolveRevMonthBlocks, type RevDealParsed } from "@/lib/branch/parsers/rev"
import { isUnparsedSheetAmount, sheetCellAmount } from "@/lib/branch/sheet-number"
import { colToA1, isRevLayoutError, resolveRevLayout } from "@/lib/branch/sheet-writeback/layout"
import { oldestSyncedAt } from "@/lib/branch/sheet-writeback/ledger-rules"
import { isRangeLikelyTruncated } from "@/lib/branch/sync/range-truncation"
import { getBusinessCalendarParts } from "@/lib/business-time"
import { formatYuanExact } from "./rev-ledger-render"
import type { ReconcileDraft, ReconcileEntry, ReconcileLedgerInput, ReconcileSheetInput } from "./rev-ledger-inputs"

// ── 공개 모양 ───────────────────────────────────────────────────────────────────────────

export type ReconcileMeasure = "total" | "confirmed" | "highConfidence" | "expected"
export const RECONCILE_MEASURES: readonly ReconcileMeasure[] = ["total", "confirmed", "highConfidence", "expected"]

/** 한 달 금액의 확도 분해 — total = confirmed + highConfidence + expected. */
export interface MoneySplit {
  total: number
  confirmed: number
  highConfidence: number
  expected: number
}

export interface ManagerMonthCell {
  managerKey: string
  manager: string
  month: string
  measure: ReconcileMeasure
  sheet: number
  ledger: number
  /** ledger − sheet */
  delta: number
  /** 장부 입력(L − D) */
  deltaEntries: number
  /** 동기화 뒤 시트 변경(D − S_data) */
  deltaSync: number
  /** 시간 경과(S_data − S_now) */
  deltaTime: number
}

export interface ManagerSummary {
  managerKey: string
  manager: string
  sheet: number
  ledger: number
  delta: number
  deltaEntries: number
  deltaSync: number
  deltaTime: number
  /** 차이(어느 성분이든)가 있는 칸 수 — 달 × 확도 */
  diffCells: number
  /** 시트 음수(환불) 달 합 — 합계에 들어 있다(D2) */
  negativeMonths: number
}

export type RowDiffCause =
  | "ledger_new"
  | "ledger_edit"
  | "ledger_edit_unresolved"
  | "sheet_changed"
  | "sheet_only_row"
  | "db_only_row"
  | "manager_changed"
  | "pending_rollover"
  | "ambiguous_match"

export const ROW_DIFF_CAUSE_ORDER: readonly RowDiffCause[] = [
  "ledger_new",
  "ledger_edit",
  "ledger_edit_unresolved",
  "sheet_changed",
  "sheet_only_row",
  "db_only_row",
  "manager_changed",
  "pending_rollover",
  "ambiguous_match",
]

export interface RowDiffRefs {
  entryId?: string
  draftId?: string
  dbRowId?: string
  appliedAt?: string
  sheetWrite?: string
}

export interface RowDiff {
  managerKey: string
  manager: string
  /** 이 건이 걸린 담당 키(시트·DB 담당이 다르면 둘 다) — 담당 필터가 쓴다 */
  managerKeys: string[]
  customer: string
  sheetRow: number | null
  rowId: string | null
  month: string | null
  /** 시트 쪽 값(원인별 — 아래 주석) */
  sheet: MoneySplit | null
  /** 장부 쪽 값 */
  ledger: MoneySplit | null
  cause: RowDiffCause
  detail: string
  refs: RowDiffRefs
}

export interface SheetColumnCheck {
  month: string
  kind: "month" | "week"
  /** 주차 칸이면 1~5 */
  week: number | null
  col: number
  a1: string
  /** 시트 1행 SUM(없으면 null — 판정하지 않는다) */
  sheetSum: number | null
  /** 앱이 읽은 합(고객 행) */
  appSum: number
  /** sheetSum − appSum */
  delta: number | null
  /** 고객명 빈 행의 금액(시트 SUM 은 더하고 앱은 읽지 않는다) */
  orphanSum: number
  /** 글자로 적힌 금액(앱은 읽고 시트 SUM 은 더하지 않는다) */
  textSum: number
  /** 월 칸이 빈 고객 행에서 앱이 주차 합으로 채운 금액(월 칸 전용) */
  weekFallbackSum: number
  /** 위 셋으로 설명되지 않는 차이 */
  residual: number | null
  /** 금액으로 못 읽은 칸 수 */
  unparsed: number
}

export interface SheetChecks {
  headerProblem: string | null
  monthBlocks: number
  rowsRead: number
  customerRows: number
  columns: SheetColumnCheck[]
  orphanRows: Array<{ sheetRow: number; amount: number; months: string[] }>
  unparsedCells: Array<{ a1: string; sheetRow: number; text: string; customer: string | null }>
  textAmountCells: Array<{ a1: string; sheetRow: number; amount: number; text: string }>
  monthWeekMismatch: Array<{ managerKey: string; sheetRow: number; customer: string; month: string; monthValue: number; weekSum: number }>
  sumColumn: { a1: string; sheetValue: number | null; monthsSum: number | null; delta: number | null } | null
  missingSumCells: number
  truncatedLikely: boolean
  /** |residual| ≥ 허용 오차인 열 수 */
  unexplainedColumns: number
}

interface ManagerAmount {
  managerKey: string
  manager: string
}

export interface ReconcileChecks {
  doubleEntrySuspects: Array<ManagerAmount & {
    customer: string
    month: string
    amount: number
    sheetRows: number[]
    sheetAmount: number
    exactMatch: boolean
    entryId: string | null
    draftId: string | null
  }>
  unresolvedCorrections: Array<ManagerAmount & { customer: string; month: string; amount: number; entryId: string | null; draftId: string | null; sheetRow: number | null }>
  supersededCorrections: Array<ManagerAmount & { customer: string; month: string; amount: number; rowId: string; winnerId: string }>
  driftCorrections: Array<ManagerAmount & { customer: string; month: string; baselineTotal: number; currentTotal: number; correctionAmount: number }>
  nonCnyEntries: Array<ManagerAmount & { customer: string; month: string; amount: number; currency: string; entryId: string }>
  emptyManagerEntries: Array<{ customer: string; month: string; amount: number; id: string }>
  openDrafts: Array<ManagerAmount & { count: number; amount: number }>
  fallbackDraftIds: string[]
  absorbedDraftIds: string[]
  /** 잠금 뒤 저절로 확정되지 않는 금액 — 회계연도가 끝난 다음 날(readDate)에 읽어도 예정·고확도로 남는다 */
  stuckAfterLock: {
    readDate: string
    byManager: Array<ManagerAmount & { expected: number; highConfidence: number }>
    rows: Array<ManagerAmount & { customer: string; sheetRow: number | null; month: string; expected: number; highConfidence: number; origin: "sheet" | "ledger" }>
  }
  /** 지금은 예정이지만 시간이 지나면 저절로 확정되는 금액(빨간 예정 칸 = 주 시작일, 색 없는 행 = 달이 끝난 뒤) */
  autoPromote: {
    byManager: Array<ManagerAmount & { amount: number }>
    cells: Array<ManagerAmount & { customer: string; sheetRow: number | null; month: string; amount: number; when: string; reason: "red_week" | "no_color_month" }>
  }
  /** 화면 식(buildLedgerOverlay) ↔ 서버 식(mergeLedgerIntoDeals) 합 비교 — 다르면 잠금 뒤 타일과 장부 표가 어긋난다 */
  serverParity: { ok: boolean; cells: Array<ManagerAmount & { month: string; measure: ReconcileMeasure; screen: number; server: number }> }
}

export type ManagerNameNoteKind = "alias_applied" | "case_variant" | "unknown" | "whitespace" | "empty"

export interface ManagerNameNote {
  managerKey: string
  label: string
  sheetSpellings: Array<{ raw: string; rows: number }>
  entrySpellings: Array<{ raw: string; entries: number }>
  notes: ManagerNameNoteKind[]
}

export type ReconcileStatus = "same" | "explained" | "blocked" | "incomplete"

export interface ReconcileMeta {
  ranAt: string
  ranAtKst: string
  fiscalYear: number
  months: string[]
  /** 담당 필터(정규 이름). 없으면 전체 */
  manager: string | null
  managerKey: string | null
  /** 읽는 날(KST) — 확도 판정·예정 판정 기준일 */
  asOf: string
  /** 장부 DB 데이터 날짜(KST) — S_data 파싱 기준일 */
  dataDate: string
  tolerance: number
  sheet: { range: string; readAt: string; rowsRead: number; customerRows: number }
  db: { kind: "import" | "mirror"; runId: string | null; startedAt: string | null; rows: number; dataSyncedAt: string | null; lastRevSyncStartedAt: string | null }
  ledger: {
    activeEntries: number
    reversedEntries: number
    appliedDrafts: number
    absorbed: number
    fallbackDrafts: number
    superseded: number
    openDrafts: number
  }
  managersTotal: number
  managersWithDiff: number
  diffCells: number
  /** 담당 범위 동기화 뒤 시트 변경 합(합계) */
  deltaSyncTotal: number
  incompleteReasons: string[]
  blockReasons: string[]
}

export interface ReconcileReport {
  meta: ReconcileMeta
  status: ReconcileStatus
  exitCode: 0 | 1 | 3
  /** 0 아닌 칸만(넷 중 하나라도 0 이 아닌 담당 × 달 × 확도) */
  totals: ManagerMonthCell[]
  managerSummary: ManagerSummary[]
  rowDiffs: RowDiff[]
  sheetChecks: SheetChecks
  checks: ReconcileChecks
  managerNames: ManagerNameNote[]
}

export interface ReconcileOptions {
  fiscalYear: number
  /** 읽는 날 KST 'YYYY-MM-DD' */
  asOf: string
  /** 실행 시각 ISO(머리말 표시용) */
  now: string
  /** 같다고 보는 차이(¥). 기본 0.5 */
  tolerance?: number
  /** 볼 달(회계연도 달의 부분집합). 없으면 열두 달 */
  months?: readonly string[] | null
  /** 이 담당만(별칭·대소문자 무시) */
  manager?: string | null
}

export const RECONCILE_DEFAULT_TOLERANCE = 0.5
export const UNASSIGNED_MANAGER_LABEL = "(미지정)"

/** 담당 비교 키 — branchManagerMatches 와 같은 규칙(별칭 → 정규 이름, 대소문자 무시). 빈 담당은 ''. */
export function reconcileManagerKey(name: string | null | undefined): string {
  return normalizeBranchMemberName(name)?.toLowerCase() ?? ""
}

// ── 작은 도우미 ─────────────────────────────────────────────────────────────────────────

const ZERO_SPLIT: Readonly<MoneySplit> = Object.freeze({ total: 0, confirmed: 0, highConfidence: 0, expected: 0 })
const YMD_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function kstDateOf(iso: string | null | undefined): string | null {
  if (!iso) return null
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  const { year, month, day } = getBusinessCalendarParts(new Date(at))
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function kstDateTimeOf(iso: string): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return iso
  const shifted = new Date(at + KST_OFFSET_MS).toISOString()
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)} KST`
}

function mmdd(iso: string | null | undefined): string {
  const date = kstDateOf(iso)
  return date ? date.slice(5) : "?"
}

function shortId(id: string | null | undefined): string {
  if (!id) return "—"
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
}

function splitOfRow(row: BranchPipelineRow | LedgerRevenueRow, month: string, readDate: string): MoneySplit {
  const bucket = ledgerMonthBucket(row, month, readDate)
  return { total: bucket.total, confirmed: bucket.confirmed, highConfidence: bucket.high, expected: bucket.open }
}

function isZeroSplit(split: MoneySplit): boolean {
  return split.total === 0 && split.confirmed === 0 && split.highConfidence === 0 && split.expected === 0
}

function differs(a: MoneySplit, b: MoneySplit, tolerance: number): boolean {
  return RECONCILE_MEASURES.some((measure) => Math.abs(a[measure] - b[measure]) >= tolerance)
}

function addInto(target: MoneySplit, split: MoneySplit): void {
  target.total += split.total
  target.confirmed += split.confirmed
  target.highConfidence += split.highConfidence
  target.expected += split.expected
}

type Accumulator = Map<string, Map<string, MoneySplit>>

function accumulate(rows: ReadonlyArray<BranchPipelineRow | LedgerRevenueRow>, months: readonly string[], readDate: string): Accumulator {
  const acc: Accumulator = new Map()
  for (const row of rows) {
    const key = reconcileManagerKey(row.manager)
    for (const month of months) {
      const split = splitOfRow(row, month, readDate)
      if (isZeroSplit(split)) continue
      let byMonth = acc.get(key)
      if (!byMonth) {
        byMonth = new Map()
        acc.set(key, byMonth)
      }
      const current = byMonth.get(month)
      if (current) addInto(current, split)
      else byMonth.set(month, { ...split })
    }
  }
  return acc
}

function splitAt(acc: Accumulator, key: string, month: string): MoneySplit {
  return acc.get(key)?.get(month) ?? ZERO_SPLIT
}

function compareKo(a: string, b: string): number {
  return a.localeCompare(b, "ko")
}

// 시트 파싱 결과 → BranchRevDeal(미러와 같은 모양 — sync-rev 가 DB 에 넣는 필드 그대로).
function parsedToDeal(parsed: RevDealParsed, readAt: string): BranchRevDeal {
  return {
    id: `sheet:${parsed.sheet_row}`,
    sheet_row: parsed.sheet_row,
    customer_name: parsed.customer_name,
    branch_contact: parsed.branch_contact,
    team: parsed.team,
    manager: parsed.manager,
    deal_type: parsed.deal_type,
    status: parsed.status,
    first_payment: parsed.first_payment,
    product_version: parsed.product_version,
    region: parsed.region,
    importance: parsed.importance,
    note: parsed.note,
    contract_target: parsed.contract_target,
    monthly_payments: parsed.monthly_payments,
    monthly_red: parsed.monthly_red,
    monthly_confirmed: parsed.monthly_confirmed,
    monthly_high_conf: parsed.monthly_high_conf,
    raw: parsed.raw,
    synced_at: readAt,
  }
}

function cellText(cell: FormattedCell | undefined | null): string | null {
  const value = cell?.value
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}

/** 시트 SUM 이 더하는 값 — 실제 숫자 칸만(글자 칸은 SUM 이 건너뛴다). */
function sumContribution(cell: FormattedCell | undefined | null): number {
  if (!cell) return 0
  if (typeof cell.numberValue === "number" && Number.isFinite(cell.numberValue)) return cell.numberValue
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) return cell.value
  return 0
}

/** 앱이 글자에서 읽은 금액(숫자 칸이 아닌데 금액으로 읽힘). 아니면 null. */
function textAmount(cell: FormattedCell | undefined | null): number | null {
  if (!cell) return null
  if (typeof cell.numberValue === "number" && Number.isFinite(cell.numberValue)) return null
  if (typeof cell.value !== "string") return null
  return sheetCellAmount(cell)
}

// ── 시트 자체 점검(0절) ─────────────────────────────────────────────────────────────────

function buildSheetChecks(
  sheet: ReconcileSheetInput,
  fiscalYear: number,
  scopeMonths: readonly string[],
  parsedNow: readonly RevDealParsed[],
  tolerance: number,
): SheetChecks {
  const grid = sheet.grid
  const headers = grid[1] ?? []
  const sumRow = grid[0] ?? []
  const cols = resolveRevColumns(headers)
  const layout = resolveRevLayout(headers.map((cell) => cell?.value ?? null), fiscalYear)
  const blocks = resolveRevMonthBlocks(headers, fiscalYear, cols.monthlyStart)
  const scope = new Set(scopeMonths)
  const parsedByRow = new Map(parsedNow.map((deal) => [deal.sheet_row, deal]))
  const customerAt = (r: number) => (cols.customer >= 0 ? cellText(grid[r]?.[cols.customer]) : null)

  const columns: SheetColumnCheck[] = []
  const unparsedCells: SheetChecks["unparsedCells"] = []
  const textAmountCells: SheetChecks["textAmountCells"] = []
  const orphanByRow = new Map<number, { amount: number; months: Set<string> }>()
  let missingSumCells = 0

  for (const block of blocks) {
    if (!scope.has(block.ym)) continue
    const columnSpecs: Array<{ col: number; kind: "month" | "week"; week: number | null }> = [
      { col: block.totalIdx, kind: "month", week: null },
      ...block.weekIdxs.map((col, index) => ({ col, kind: "week" as const, week: index + 1 })),
    ]
    for (const spec of columnSpecs) {
      let appSum = 0
      let orphanSum = 0
      let textSum = 0
      let weekFallbackSum = 0
      let unparsed = 0
      for (let r = 2; r < grid.length; r++) {
        const cell = grid[r]?.[spec.col]
        const customer = customerAt(r)
        if (isUnparsedSheetAmount(cell)) {
          unparsed += 1
          unparsedCells.push({ a1: `${colToA1(spec.col)}${r + 1}`, sheetRow: r + 1, text: String(cell?.value ?? "").slice(0, 40), customer })
        }
        if (!customer) {
          const amount = sumContribution(cell)
          if (amount !== 0) {
            orphanSum += amount
            if (spec.kind === "month") {
              const orphan = orphanByRow.get(r + 1) ?? { amount: 0, months: new Set<string>() }
              orphan.amount += amount
              orphan.months.add(block.ym)
              orphanByRow.set(r + 1, orphan)
            }
          }
          continue
        }
        const fromText = textAmount(cell)
        if (fromText != null && fromText !== 0) {
          textSum += fromText
          textAmountCells.push({ a1: `${colToA1(spec.col)}${r + 1}`, sheetRow: r + 1, amount: fromText, text: String(cell?.value ?? "").slice(0, 40) })
        }
        if (spec.kind === "month") {
          const parsedAmount = parsedByRow.get(r + 1)?.monthly_payments[block.ym]
          const amount = typeof parsedAmount === "number" && Number.isFinite(parsedAmount) ? parsedAmount : 0
          appSum += amount
          if (sheetCellAmount(cell) == null && amount !== 0) weekFallbackSum += amount
        } else {
          appSum += sheetCellAmount(cell) ?? 0
        }
      }
      const sheetSum = sheetCellAmount(sumRow[spec.col])
      if (sheetSum == null) missingSumCells += 1
      const delta = sheetSum == null ? null : sheetSum - appSum
      const residual = delta == null ? null : delta - (orphanSum - textSum - weekFallbackSum)
      const column: SheetColumnCheck = {
        month: block.ym,
        kind: spec.kind,
        week: spec.week,
        col: spec.col,
        a1: colToA1(spec.col),
        sheetSum,
        appSum,
        delta,
        orphanSum,
        textSum,
        weekFallbackSum,
        residual,
        unparsed,
      }
      // 월 칸은 늘 싣고, 주차 칸은 무언가 있을 때만 싣는다(보고서를 줄인다).
      const weekNoteworthy =
        (residual != null && Math.abs(residual) >= tolerance) || orphanSum !== 0 || textSum !== 0 || unparsed > 0
      if (spec.kind === "month" || weekNoteworthy) columns.push(column)
    }
  }

  const monthWeekMismatch: SheetChecks["monthWeekMismatch"] = []
  for (const deal of parsedNow) {
    const mismatch = isRecord(deal.raw.monthWeekMismatch) ? deal.raw.monthWeekMismatch : null
    if (!mismatch) continue
    for (const [month, value] of Object.entries(mismatch)) {
      if (!scope.has(month) || !isRecord(value)) continue
      monthWeekMismatch.push({
        managerKey: reconcileManagerKey(deal.manager),
        sheetRow: deal.sheet_row,
        customer: deal.customer_name,
        month,
        monthValue: Number(value.month) || 0,
        weekSum: Number(value.weeks) || 0,
      })
    }
  }

  let sumColumn: SheetChecks["sumColumn"] = null
  const sumIdx = headers.slice(0, cols.monthlyStart).findIndex((cell) => cellText(cell)?.toLowerCase() === "sum")
  if (sumIdx >= 0) {
    const sheetValue = sheetCellAmount(sumRow[sumIdx])
    let monthsSum: number | null = blocks.length > 0 ? 0 : null
    for (const block of blocks) {
      const value = sheetCellAmount(sumRow[block.totalIdx])
      if (value == null || monthsSum == null) {
        monthsSum = null
        break
      }
      monthsSum += value
    }
    sumColumn = {
      a1: colToA1(sumIdx),
      sheetValue,
      monthsSum,
      delta: sheetValue != null && monthsSum != null ? sheetValue - monthsSum : null,
    }
  }

  let customerRows = 0
  for (let r = 2; r < grid.length; r++) if (customerAt(r)) customerRows += 1

  return {
    headerProblem: isRevLayoutError(layout) ? layout.detail : null,
    monthBlocks: blocks.length,
    rowsRead: grid.length,
    customerRows,
    columns,
    orphanRows: [...orphanByRow.entries()]
      .map(([sheetRow, orphan]) => ({ sheetRow, amount: orphan.amount, months: [...orphan.months].sort() }))
      .sort((a, b) => a.sheetRow - b.sheetRow),
    unparsedCells,
    textAmountCells,
    monthWeekMismatch,
    sumColumn,
    missingSumCells,
    truncatedLikely: isRangeLikelyTruncated(grid.length, sheet.range),
    unexplainedColumns: columns.filter((column) => column.residual != null && Math.abs(column.residual) >= tolerance).length,
  }
}

// ── 담당 이름(5절) ──────────────────────────────────────────────────────────────────────

const CANONICAL_BY_LOWER = new Map(BRANCH_MEMBER_CANONICAL_NAMES.map((name) => [name.toLowerCase(), name]))

class ManagerLabels {
  private readonly spellings = new Map<string, Map<string, number>>()

  note(name: string | null | undefined): string {
    const key = reconcileManagerKey(name)
    const normalized = normalizeBranchMemberName(name)
    if (normalized) {
      const counts = this.spellings.get(key) ?? new Map<string, number>()
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
      this.spellings.set(key, counts)
    }
    return key
  }

  label(key: string): string {
    if (!key) return UNASSIGNED_MANAGER_LABEL
    const canonical = CANONICAL_BY_LOWER.get(key)
    if (canonical) return canonical
    const counts = this.spellings.get(key)
    if (!counts || counts.size === 0) return key
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || compareKo(a[0], b[0]))[0][0]
  }
}

function buildManagerNames(
  grid: FormattedCell[][],
  entries: readonly ReconcileEntry[],
  labels: ManagerLabels,
): ManagerNameNote[] {
  const headers = grid[1] ?? []
  const cols = resolveRevColumns(headers)
  const sheet = new Map<string, Map<string, number>>()
  const entry = new Map<string, Map<string, number>>()
  const add = (target: Map<string, Map<string, number>>, raw: string) => {
    const key = reconcileManagerKey(raw)
    const counts = target.get(key) ?? new Map<string, number>()
    counts.set(raw, (counts.get(raw) ?? 0) + 1)
    target.set(key, counts)
  }
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] ?? []
    if (cols.customer < 0 || !cellText(row[cols.customer])) continue
    const value = cols.manager >= 0 ? row[cols.manager]?.value : null
    add(sheet, value == null ? "" : String(value))
  }
  for (const item of entries) {
    if (item.entryStatus !== "active") continue
    add(entry, item.manager ?? "")
  }
  const keys = [...new Set([...sheet.keys(), ...entry.keys()])]
  const notes: ManagerNameNote[] = []
  for (const key of keys) {
    const sheetCounts = sheet.get(key) ?? new Map<string, number>()
    const entryCounts = entry.get(key) ?? new Map<string, number>()
    const raws = [...sheetCounts.keys(), ...entryCounts.keys()]
    const kinds = new Set<ManagerNameNoteKind>()
    if (!key) kinds.add("empty")
    const normalizedForms = new Set<string>()
    for (const raw of raws) {
      const trimmed = raw.trim()
      if (!trimmed) continue
      if (raw !== trimmed) kinds.add("whitespace")
      const normalized = normalizeBranchMemberName(raw)
      if (normalized && normalized !== trimmed) kinds.add("alias_applied")
      if (normalized) normalizedForms.add(normalized)
    }
    if (normalizedForms.size > 1) kinds.add("case_variant")
    const label = labels.label(key)
    if (key && !isKnownBranchMember(label)) kinds.add("unknown")
    const order: ManagerNameNoteKind[] = ["alias_applied", "case_variant", "unknown", "whitespace", "empty"]
    notes.push({
      managerKey: key,
      label,
      sheetSpellings: [...sheetCounts.entries()].map(([raw, rows]) => ({ raw, rows })).sort((a, b) => b.rows - a.rows || compareKo(a.raw, b.raw)),
      entrySpellings: [...entryCounts.entries()].map(([raw, entries]) => ({ raw, entries })).sort((a, b) => b.entries - a.entries || compareKo(a.raw, b.raw)),
      notes: order.filter((kind) => kinds.has(kind)),
    })
  }
  return notes.sort((a, b) => (a.managerKey ? 0 : 1) - (b.managerKey ? 0 : 1) || compareKo(a.label, b.label))
}

// ── 대조 ────────────────────────────────────────────────────────────────────────────────

const SHEET_WRITE_LABELS: Record<string, string> = {
  written: "씀",
  sending: "보내는 중",
  refused: "거절",
  failed: "실패",
  unknown: "결과 모름",
}

function sheetWriteLabel(status: string | undefined): string {
  return status ? SHEET_WRITE_LABELS[status] ?? status : "없음"
}

function entryIdOfRow(row: LedgerRevenueRow): string | null {
  return row.id.startsWith("ledger-") ? row.id.slice("ledger-".length) : null
}

function pendingCellsOf(row: { pendingCells?: unknown }, month: string): RevPendingCell[] {
  const cells = readRevPendingCells({ pendingCells: row.pendingCells })
  return cells?.[month] ?? []
}

function nextMonthStart(month: string): string {
  const year = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01`
}

function rowMonthAmount(row: BranchPipelineRow, month: string): number {
  return Number(row.monthlyPayments?.[month]) || 0
}

/** 대조 한 번의 공통 재료 — 단계 함수들이 같은 값을 본다. */
interface ReconcileContext {
  fiscalYear: number
  fyMonths: string[]
  scopeMonths: string[]
  scopeSet: Set<string>
  readDate: string
  dataDate: string
  tolerance: number
  labels: ManagerLabels
  filterKey: string | null
  ledger: ReconcileLedgerInput
  dbRows: RevRevenueRow[]
  sheetNowRows: RevRevenueRow[]
  sheetDataRows: RevRevenueRow[]
  overlay: LedgerOverlayResult
  overlaySources: Omit<LedgerOverlayInput, "sheetRows">
}

function inManagerScope(ctx: ReconcileContext, keys: readonly string[]): boolean {
  return ctx.filterKey == null || keys.includes(ctx.filterKey)
}

function managerOf(ctx: ReconcileContext, name: string | null | undefined): ManagerAmount {
  const managerKey = reconcileManagerKey(name)
  return { managerKey, manager: ctx.labels.label(managerKey) }
}

function sortManagerKeys(ctx: ReconcileContext, keys: Iterable<string>): string[] {
  return [...new Set(keys)].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || compareKo(ctx.labels.label(a), ctx.labels.label(b)))
}

/** 담당 → 고객 → 달 → 시트 행 순(목록 순서를 입력 행 순서와 떼어 낸다). */
function compareListItems(
  a: ManagerAmount & { customer: string; month: string; sheetRow: number | null },
  b: ManagerAmount & { customer: string; month: string; sheetRow: number | null },
): number {
  return (
    (a.managerKey ? 0 : 1) - (b.managerKey ? 0 : 1) ||
    compareKo(a.manager, b.manager) ||
    compareKo(a.customer, b.customer) ||
    a.month.localeCompare(b.month) ||
    (a.sheetRow ?? 0) - (b.sheetRow ?? 0)
  )
}

function cellHasDiff(cell: ManagerMonthCell, tolerance: number): boolean {
  return [cell.delta, cell.deltaEntries, cell.deltaSync, cell.deltaTime].some((value) => Math.abs(value) >= tolerance)
}

// 7) 칸 — 넷 누적에서 담당 × 달 × 확도 칸을 만든다(넷 다 0 인 칸은 싣지 않는다).
function buildTotals(
  ctx: ReconcileContext,
  acc: { now: Accumulator; data: Accumulator; db: Accumulator; ledger: Accumulator },
): { totals: ManagerMonthCell[]; managerSummary: ManagerSummary[] } {
  // 담당 순서는 이름순(빈 담당은 끝) — 행 순서(listRevRevenue 는 금액순)와 무관하게 같은 입력이면 같은 보고서.
  const keys = sortManagerKeys(ctx, [...acc.now.keys(), ...acc.data.keys(), ...acc.db.keys(), ...acc.ledger.keys()])
  const totals: ManagerMonthCell[] = []
  for (const key of keys) {
    if (!inManagerScope(ctx, [key])) continue
    for (const month of ctx.scopeMonths) {
      const sNow = splitAt(acc.now, key, month)
      const sData = splitAt(acc.data, key, month)
      const d = splitAt(acc.db, key, month)
      const l = splitAt(acc.ledger, key, month)
      for (const measure of RECONCILE_MEASURES) {
        if ([sNow[measure], sData[measure], d[measure], l[measure]].every((value) => value === 0)) continue
        totals.push({
          managerKey: key,
          manager: ctx.labels.label(key),
          month,
          measure,
          sheet: sNow[measure],
          ledger: l[measure],
          delta: l[measure] - sNow[measure],
          deltaEntries: l[measure] - d[measure],
          deltaSync: d[measure] - sData[measure],
          deltaTime: sData[measure] - sNow[measure],
        })
      }
    }
  }

  const summaryByKey = new Map<string, ManagerSummary>()
  for (const cell of totals) {
    let summary = summaryByKey.get(cell.managerKey)
    if (!summary) {
      summary = {
        managerKey: cell.managerKey,
        manager: cell.manager,
        sheet: 0,
        ledger: 0,
        delta: 0,
        deltaEntries: 0,
        deltaSync: 0,
        deltaTime: 0,
        diffCells: 0,
        negativeMonths: 0,
      }
      summaryByKey.set(cell.managerKey, summary)
    }
    if (cellHasDiff(cell, ctx.tolerance)) summary.diffCells += 1
    if (cell.measure !== "total") continue
    summary.sheet += cell.sheet
    summary.ledger += cell.ledger
    summary.delta += cell.delta
    summary.deltaEntries += cell.deltaEntries
    summary.deltaSync += cell.deltaSync
    summary.deltaTime += cell.deltaTime
    if (cell.sheet < 0) summary.negativeMonths += cell.sheet
  }
  const managerSummary = [...summaryByKey.values()].sort(
    (a, b) => (a.managerKey ? 0 : 1) - (b.managerKey ? 0 : 1) || compareKo(a.manager, b.manager),
  )
  return { totals, managerSummary }
}

type PushRowDiff = (diff: Omit<RowDiff, "managerKey" | "manager"> & { managerKey?: string }) => void

// 8~9) 시트 ↔ 장부 DB 행 짝 — 화면의 원본 찾기 순서(Row ID → 행 번호 + 고객 → 고객 + 상품)로 DB 행 → 데이터 날짜 시트 행.
// 짝마다 동기화 뒤 시트 변경·담당 바뀜·시간 경과를, 짝 없는 행은 시트에만·DB 에만으로 남긴다.
// 돌려주는 값: DB 행 id → 그 짝의 오늘 시트 행(정정 건별 차이가 "지금 시트 값"을 보이는 데 쓴다).
function diffSheetAgainstDb(ctx: ReconcileContext, push: PushRowDiff): Map<string, RevRevenueRow> {
  const { readDate, dataDate, tolerance, labels } = ctx
  const sheetNowById = new Map(ctx.sheetNowRows.map((row) => [row.id, row]))
  const resolveSheetRow = createSheetRowResolver(ctx.sheetDataRows)
  const dbBySheetId = new Map<string, RevRevenueRow[]>()
  for (const dbRow of ctx.dbRows) {
    const target = resolveSheetRow({
      sheetRowId: dbRow.rowId ?? null,
      sourceDealId: null,
      sheetRow: dbRow.sheetRow,
      customer: dbRow.customer,
      productVersion: dbRow.productVersion,
    })
    if (!target) continue
    const list = dbBySheetId.get(target.id) ?? []
    list.push(dbRow)
    dbBySheetId.set(target.id, list)
  }

  const pairedDbIds = new Set<string>()
  const sheetByDbId = new Map<string, RevRevenueRow>()
  for (const sheetRow of ctx.sheetDataRows) {
    const hits = dbBySheetId.get(sheetRow.id) ?? []
    const sheetKey = reconcileManagerKey(sheetRow.manager)
    if (hits.length > 1) {
      for (const dbRow of hits) {
        pairedDbIds.add(dbRow.id)
        push({
          managerKeys: [...new Set([reconcileManagerKey(dbRow.manager), sheetKey])],
          customer: dbRow.customer,
          sheetRow: sheetRow.sheetRow,
          rowId: dbRow.rowId ?? sheetRow.rowId ?? null,
          month: null,
          sheet: null,
          ledger: null,
          cause: "ambiguous_match",
          detail: `시트 ${sheetRow.sheetRow}행 하나에 장부 DB 행 ${hits.length}개가 붙음 — Row ID 를 확인한다`,
          refs: { dbRowId: dbRow.id },
        })
      }
      continue
    }
    if (hits.length === 0) {
      for (const month of ctx.scopeMonths) {
        const split = splitOfRow(sheetRow, month, readDate)
        if (isZeroSplit(split)) continue
        push({
          managerKeys: [sheetKey],
          customer: sheetRow.customer,
          sheetRow: sheetRow.sheetRow,
          rowId: sheetRow.rowId ?? null,
          month,
          sheet: split,
          ledger: null,
          cause: "sheet_only_row",
          detail: `데이터 날짜(${dataDate}) 뒤 시트에 생긴 행 — 장부 DB 에 없다`,
          refs: {},
        })
      }
      continue
    }

    const dbRow = hits[0]
    const sheetNow = sheetNowById.get(sheetRow.id) ?? sheetRow
    pairedDbIds.add(dbRow.id)
    sheetByDbId.set(dbRow.id, sheetNow)
    const dbKey = reconcileManagerKey(dbRow.manager)
    const keys = [...new Set([dbKey, sheetKey])]
    const rowId = dbRow.rowId ?? sheetRow.rowId ?? null
    if (dbKey !== sheetKey) {
      push({
        managerKey: sheetKey,
        managerKeys: keys,
        customer: sheetRow.customer,
        sheetRow: sheetRow.sheetRow,
        rowId,
        month: null,
        sheet: null,
        ledger: null,
        cause: "manager_changed",
        detail: `담당 ${labels.label(dbKey)}(장부 DB) → ${labels.label(sheetKey)}(시트)`,
        refs: { dbRowId: dbRow.id },
      })
    }
    for (const month of ctx.scopeMonths) {
      const d = splitOfRow(dbRow, month, readDate)
      const sData = splitOfRow(sheetRow, month, readDate)
      const sNow = splitOfRow(sheetNow, month, readDate)
      if (differs(d, sData, tolerance)) {
        push({
          managerKey: sheetKey,
          managerKeys: keys,
          customer: sheetRow.customer,
          sheetRow: sheetRow.sheetRow,
          rowId,
          month,
          sheet: sData,
          ledger: d,
          cause: "sheet_changed",
          detail: `데이터 날짜(${dataDate}) 뒤 시트에서 바뀜 — 다음 동기화(잠금 뒤에는 12/1 스냅샷 다시 읽기)가 가져온다`,
          refs: { dbRowId: dbRow.id },
        })
      }
      if (differs(sData, sNow, tolerance)) {
        // 한쪽 날짜로만 예정이던 빨간 칸(파싱한 날이 그 주 시작 전·후로 갈렸다)
        const keyOf = (cell: RevPendingCell) => `${cell.week}:${cell.start}`
        const atData = pendingCellsOf(sheetRow, month)
        const atNow = pendingCellsOf(sheetNow, month)
        const dataKeys = new Set(atData.map(keyOf))
        const nowKeys = new Set(atNow.map(keyOf))
        const moved = [...atData.filter((cell) => !nowKeys.has(keyOf(cell))), ...atNow.filter((cell) => !dataKeys.has(keyOf(cell)))]
        const weeks = moved.map((cell) => `${cell.week === 0 ? "월 칸" : `w${cell.week}`}(${cell.start.slice(5)} 시작)`).join(" · ")
        push({
          managerKey: sheetKey,
          managerKeys: [sheetKey],
          customer: sheetRow.customer,
          sheetRow: sheetRow.sheetRow,
          rowId: sheetRow.rowId ?? null,
          month,
          sheet: sNow,
          ledger: sData,
          cause: "pending_rollover",
          detail: `데이터 날짜(${dataDate})로 읽은 확도와 오늘(${readDate})로 읽은 확도가 다르다${weeks ? ` — ${weeks}` : ""}`,
          refs: {},
        })
      }
    }
  }

  for (const dbRow of ctx.dbRows) {
    if (pairedDbIds.has(dbRow.id)) continue
    for (const month of ctx.scopeMonths) {
      const split = splitOfRow(dbRow, month, readDate)
      if (isZeroSplit(split)) continue
      push({
        managerKeys: [reconcileManagerKey(dbRow.manager)],
        customer: dbRow.customer,
        sheetRow: dbRow.sheetRow ?? null,
        rowId: dbRow.rowId ?? null,
        month,
        sheet: null,
        ledger: split,
        cause: "db_only_row",
        detail: "장부 DB 에만 있는 행 — 시트에서 지워졌거나 고객명·행이 바뀌었다",
        refs: { dbRowId: dbRow.id },
      })
    }
  }
  return sheetByDbId
}

// 9) 장부 행(오버레이) — 신규·정정·원본 못 찾은 정정. 정정 → 원본 짝은 오버레이가 낸 것(overlay.resolved)을 그대로 쓴다
// (금액도 오버레이가 이미 정했다 — 여기서는 근거 글만 만든다. Row ID 키는 "어떻게 찾았나" 글에만 쓴다).
function diffLedgerRows(ctx: ReconcileContext, sheetByDbId: ReadonlyMap<string, RevRevenueRow>, push: PushRowDiff): void {
  const { ledger, overlay, readDate } = ctx
  const entryById = new Map(ledger.entries.map((item) => [item.id, item]))
  const draftById = new Map(ledger.appliedDrafts.map((item) => [item.id, item]))
  const snapshotOfRow = (row: LedgerRevenueRow) => {
    const entryId = entryIdOfRow(row)
    if (entryId) return entryById.get(entryId)?.sourceSnapshot ?? null
    return row.draftId ? draftById.get(row.draftId)?.sourceSnapshot ?? null : null
  }
  // 오버레이와 같은 Row ID 키: 초안 스냅샷 → 항목 스냅샷(항목이 이긴다) → 행 자기 스냅샷
  const sheetRowIdByDraftId = new Map<string, string>()
  for (const item of ledger.appliedDrafts) {
    const rowId = snapshotSheetRowId(isRecord(item.sourceSnapshot) ? item.sourceSnapshot : null)
    if (rowId) sheetRowIdByDraftId.set(item.id, rowId)
  }
  for (const item of ledger.entries) {
    const rowId = snapshotSheetRowId(isRecord(item.sourceSnapshot) ? item.sourceSnapshot : null)
    if (rowId && item.draftId) sheetRowIdByDraftId.set(item.draftId, rowId)
  }
  const rowIdOf = (row: LedgerRevenueRow) => {
    const snapshot = snapshotOfRow(row)
    return sheetRowIdByDraftId.get(row.draftId ?? "") ?? snapshotSheetRowId(isRecord(snapshot) ? snapshot : null)
  }
  const unresolvedIds = new Set(overlay.unresolved.map((row) => row.id))
  const targetByCorrectionId = new Map(overlay.resolved.map((item) => [item.correction.id, item.target]))
  const refsOfRow = (row: LedgerRevenueRow): RowDiffRefs => {
    const entryId = entryIdOfRow(row)
    const source = entryId ? entryById.get(entryId) : row.draftId ? draftById.get(row.draftId) : undefined
    const sheetWrite = row.draftId ? ledger.sheetWrites[row.draftId]?.status : undefined
    return {
      ...(entryId ? { entryId } : {}),
      ...(row.draftId ? { draftId: row.draftId } : {}),
      ...(source?.appliedAt ? { appliedAt: source.appliedAt } : {}),
      ...(sheetWrite ? { sheetWrite } : {}),
    }
  }

  for (const row of overlay.appliedRows) {
    if (row.draftId?.startsWith("local-")) continue
    const month = row.draftMonth
    if (!month || !ctx.scopeSet.has(month)) continue
    const key = reconcileManagerKey(row.manager)
    const refs = refsOfRow(row)
    const ledgerSplit = splitOfRow(row, month, readDate)
    const origin = refs.entryId
      ? `항목 ${shortId(refs.entryId)} · 초안 ${shortId(refs.draftId)} · ${mmdd(refs.appliedAt)} 적용 · 시트 쓰기 ${sheetWriteLabel(refs.sheetWrite)}`
      : `초안 ${shortId(refs.draftId)} · 항목 없는 적용 초안(안전망)`
    const base = { customer: row.customer, month, ledger: ledgerSplit, refs }
    if (row.draftKind !== "edit-row") {
      push({ ...base, managerKeys: [key], sheetRow: row.sheetRow ?? null, rowId: null, sheet: null, cause: "ledger_new", detail: origin })
      continue
    }
    if (unresolvedIds.has(row.id)) {
      push({
        ...base,
        managerKeys: [key],
        sheetRow: row.sheetRow ?? null,
        rowId: rowIdOf(row),
        sheet: null,
        cause: "ledger_edit_unresolved",
        detail: `원본 시트 행을 못 찾음 — 화면은 원본과 정정을 둘 다 더한다 · ${origin}`,
      })
      continue
    }
    const target = targetByCorrectionId.get(row.id)
    const live = target ? sheetByDbId.get(target.id) : undefined
    const sheetSplit = live ? splitOfRow(live, month, readDate) : target ? splitOfRow(target, month, readDate) : null
    const how = target?.rowId && rowIdOf(row) === target.rowId ? "Row ID 로" : "행 번호·고객명으로"
    const where = live ? `시트 ${live.sheetRow}행` : target ? `장부 DB 원본(${target.sheetRow ?? "?"}행 — 지금 시트에서 못 찾음)` : "원본"
    push({
      ...base,
      managerKeys: [...new Set([key, ...(live ? [reconcileManagerKey(live.manager)] : [])])],
      sheetRow: live?.sheetRow ?? target?.sheetRow ?? row.sheetRow ?? null,
      rowId: target?.rowId ?? rowIdOf(row),
      sheet: sheetSplit,
      cause: "ledger_edit",
      detail: `${how} ${where} 찾음 · 정정 ${formatYuanExact(ledgerSplit.total)}이 시트 ${formatYuanExact(sheetSplit?.total ?? 0)}을 대신함 · ${origin}`,
      refs: { ...refs, ...(target ? { dbRowId: target.id } : {}) },
    })
  }
}

function sumByManager<T extends ManagerAmount, V extends Record<string, number>>(
  items: readonly T[],
  pick: (item: T) => V,
): Array<ManagerAmount & V> {
  const byKey = new Map<string, { managerKey: string; manager: string; values: Record<string, number> }>()
  for (const item of items) {
    const current = byKey.get(item.managerKey) ?? { managerKey: item.managerKey, manager: item.manager, values: {} }
    for (const [name, value] of Object.entries(pick(item))) current.values[name] = (current.values[name] ?? 0) + value
    byKey.set(item.managerKey, current)
  }
  return [...byKey.values()]
    .map(({ managerKey, manager, values }) => ({ managerKey, manager, ...(values as V) }))
    .sort((a, b) => compareKo(a.manager, b.manager))
}

// 10) 잠금 전에 볼 것 — 합계 차이와 별개로 사람이 확인할 목록.
function buildChecks(ctx: ReconcileContext, accLedger: Accumulator): ReconcileChecks {
  const { ledger, overlay, scopeSet, scopeMonths, readDate, tolerance, fyMonths } = ctx
  const inScope = <T extends { managerKey: string }>(items: readonly T[]) => items.filter((item) => inManagerScope(ctx, [item.managerKey]))

  // 이중 입력 의심: 장부 신규 행과 같은 고객(normalizedAccountKey)·같은 달에 지금 시트 금액(0 아님)이 있다.
  const sheetNowByAccount = new Map<string, RevRevenueRow[]>()
  for (const row of ctx.sheetNowRows) {
    const accountKey = normalizedAccountKey(row.customer)
    if (!accountKey) continue
    const list = sheetNowByAccount.get(accountKey) ?? []
    list.push(row)
    sheetNowByAccount.set(accountKey, list)
  }
  const doubleEntrySuspects: ReconcileChecks["doubleEntrySuspects"] = []
  for (const row of overlay.additiveRows) {
    const month = row.draftMonth
    const accountKey = normalizedAccountKey(row.customer)
    if (!month || !scopeSet.has(month) || !accountKey) continue
    const matches = (sheetNowByAccount.get(accountKey) ?? []).filter((sheetRow) => rowMonthAmount(sheetRow, month) !== 0)
    if (matches.length === 0) continue
    const amount = rowMonthAmount(row, month) || Number(row.revenue) || 0
    const exactMatch = matches.some(
      (sheetRow) =>
        Math.abs(rowMonthAmount(sheetRow, month) - amount) <= 1 ||
        (sheetRow.weeklyPayments?.[month] ?? []).some((week) => week !== 0 && Math.abs(week - amount) <= 1),
    )
    doubleEntrySuspects.push({
      ...managerOf(ctx, row.manager),
      customer: row.customer,
      month,
      amount,
      sheetRows: matches.map((sheetRow) => sheetRow.sheetRow),
      sheetAmount: matches.reduce((sum, sheetRow) => sum + rowMonthAmount(sheetRow, month), 0),
      exactMatch,
      entryId: entryIdOfRow(row),
      draftId: row.draftId ?? null,
    })
  }

  const unresolvedCorrections = overlay.unresolved
    .filter((row) => row.draftMonth && scopeSet.has(row.draftMonth))
    .map((row) => ({
      ...managerOf(ctx, row.manager),
      customer: row.customer,
      month: row.draftMonth ?? "",
      amount: rowMonthAmount(row, row.draftMonth ?? "") || Number(row.revenue) || 0,
      entryId: entryIdOfRow(row),
      draftId: row.draftId ?? null,
      sheetRow: row.sheetRow ?? null,
    }))
  const supersededCorrections = overlay.superseded
    .filter((item) => scopeSet.has(item.month))
    .map((item) => ({
      ...managerOf(ctx, item.row.manager),
      customer: item.row.customer,
      month: item.month,
      amount: rowMonthAmount(item.row, item.month) || Number(item.row.revenue) || 0,
      rowId: item.row.id,
      winnerId: item.winnerId,
    }))
  const driftCorrections = overlay.drift
    .filter((item) => scopeSet.has(item.month))
    .map((item) => ({
      ...managerOf(ctx, item.row.manager),
      customer: item.row.customer,
      month: item.month,
      baselineTotal: item.baselineTotal,
      currentTotal: item.currentTotal,
      correctionAmount: item.correctionAmount,
    }))

  // 통화·빈 담당: 활성 항목 + 항목 없는 적용 초안(실제로 합계에 들어간 것)
  const activeEntries = ledger.entries.filter((item) => item.entryStatus === "active" && fyMonths.includes(item.month))
  const draftById = new Map(ledger.appliedDrafts.map((item) => [item.id, item]))
  const fallbackDraftIds = overlay.appliedRows.filter((row) => row.id.startsWith("draft-") && row.draftId).map((row) => row.draftId as string)
  const counted: Array<{ item: ReconcileEntry | ReconcileDraft; id: string }> = [
    ...activeEntries.map((item) => ({ item, id: item.id })),
    ...fallbackDraftIds
      .map((id) => draftById.get(id))
      .filter((item): item is ReconcileDraft => Boolean(item))
      .map((item) => ({ item, id: `draft:${item.id}` })),
  ].filter(({ item }) => scopeSet.has(item.month))
  const isNonCny = (currency: string | null | undefined) => Boolean(currency?.trim() && currency.trim().toUpperCase() !== "CNY")
  const nonCnyEntries = counted
    .filter(({ item }) => isNonCny(item.currency))
    .map(({ item, id }) => ({
      ...managerOf(ctx, item.manager),
      customer: item.customer,
      month: item.month,
      amount: item.amount,
      currency: String(item.currency ?? "").trim(),
      entryId: id,
    }))
  const emptyManagerEntries = counted
    .filter(({ item }) => !(item.manager ?? "").trim())
    .map(({ item, id }) => ({ customer: item.customer || "고객명 미입력", month: item.month, amount: item.amount, id }))

  const openByKey = new Map<string, { count: number; amount: number }>()
  for (const item of ledger.openDrafts) {
    if (!scopeSet.has(item.month)) continue
    const key = reconcileManagerKey(item.manager)
    const current = openByKey.get(key) ?? { count: 0, amount: 0 }
    current.count += 1
    current.amount += Number(item.amount) || 0
    openByKey.set(key, current)
  }
  const openDrafts = [...openByKey.entries()]
    .map(([managerKey, value]) => ({ managerKey, manager: ctx.labels.label(managerKey), ...value }))
    .sort((a, b) => compareKo(a.manager, b.manager))

  // 잠금 뒤: 회계연도가 끝난 다음 날에 읽어도 예정·고확도로 남는 금액(색 있는 행의 검정·파랑 칸, 장부 예정 입력)과
  // 시간이 지나면 저절로 확정되는 금액(빨간 예정 칸 = 그 주 시작일, 색 없는 행 = 그 달이 끝난 뒤)을 나눈다. 순액 0 이하 달은 뺀다(D2).
  const farDate = `${ctx.fiscalYear + 1}-04-01`
  const stuckRows: ReconcileChecks["stuckAfterLock"]["rows"] = []
  const autoCells: ReconcileChecks["autoPromote"]["cells"] = []
  for (const row of overlay.rows) {
    for (const month of scopeMonths) {
      const far = ledgerMonthBucket(row, month, farDate)
      if (far.total <= 0) continue
      const where = { ...managerOf(ctx, row.manager), customer: row.customer, sheetRow: row.sheetRow ?? null, month }
      if (far.open >= tolerance || far.high >= tolerance) {
        stuckRows.push({ ...where, expected: far.open, highConfidence: far.high, origin: row.ledgerOrigin === "draft" ? "ledger" : "sheet" })
      }
      const promoted = far.confirmed - ledgerMonthBucket(row, month, readDate).confirmed
      if (promoted < tolerance) continue
      const pending = pendingCellsOf(row, month).filter((cell) => cell.start > readDate)
      autoCells.push({
        ...where,
        amount: promoted,
        when: pending.length > 0 ? pending.map((cell) => cell.start).sort()[0] : nextMonthStart(month),
        reason: pending.length > 0 ? "red_week" : "no_color_month",
      })
    }
  }

  // 화면 식(buildLedgerOverlay) ↔ 서버 식(mergeLedgerIntoDeals) — 같은 입력, 같은 읽는 날
  const merged = mergeLedgerIntoDeals(ledger.deals, { ...ctx.overlaySources, todayYm: readDate })
  const accServer = accumulate(listRevRevenue(merged.deals), scopeMonths, readDate)
  const parityCells: ReconcileChecks["serverParity"]["cells"] = []
  for (const key of sortManagerKeys(ctx, [...accLedger.keys(), ...accServer.keys()])) {
    for (const month of scopeMonths) {
      const screen = splitAt(accLedger, key, month)
      const server = splitAt(accServer, key, month)
      for (const measure of RECONCILE_MEASURES) {
        if (Math.abs(screen[measure] - server[measure]) < tolerance) continue
        parityCells.push({ managerKey: key, manager: ctx.labels.label(key), month, measure, screen: screen[measure], server: server[measure] })
      }
    }
  }

  const stuckScoped = inScope(stuckRows).sort(compareListItems)
  const autoScoped = inScope(autoCells).sort(compareListItems)
  const parityScoped = inScope(parityCells)
  return {
    doubleEntrySuspects: inScope(doubleEntrySuspects),
    unresolvedCorrections: inScope(unresolvedCorrections),
    supersededCorrections: inScope(supersededCorrections),
    driftCorrections: inScope(driftCorrections),
    nonCnyEntries: inScope(nonCnyEntries),
    // 빈 담당 항목은 담당 필터로 고를 수 없다 — 전체 보기에서만 싣는다
    emptyManagerEntries: ctx.filterKey == null ? emptyManagerEntries : [],
    openDrafts: inScope(openDrafts),
    fallbackDraftIds,
    absorbedDraftIds: [...overlay.absorbedDraftIds].sort(),
    stuckAfterLock: {
      readDate: farDate,
      byManager: sumByManager(stuckScoped, (item) => ({ expected: item.expected, highConfidence: item.highConfidence })),
      rows: stuckScoped,
    },
    autoPromote: {
      byManager: sumByManager(autoScoped, (item) => ({ amount: item.amount })),
      cells: autoScoped,
    },
    serverParity: { ok: parityScoped.length === 0, cells: parityScoped },
  }
}

// 12) 판정 — 불완전(판정 못 함) > 막음(잠금을 막는 차이) > 설명된 차이 > 같음.
function judge(
  ctx: ReconcileContext,
  sheet: ReconcileSheetInput,
  result: { totals: ManagerMonthCell[]; rowDiffs: RowDiff[]; sheetChecks: SheetChecks; checks: ReconcileChecks },
): { status: ReconcileStatus; exitCode: 0 | 1 | 3; incompleteReasons: string[]; blockReasons: string[]; deltaSyncTotal: number; diffCells: number } {
  const { ledger, tolerance } = ctx
  const { totals, rowDiffs, sheetChecks, checks } = result
  const incompleteReasons: string[] = []
  if (ledger.truncated.deals) incompleteReasons.push("REV 행이 안전 상한에 닿았다(합계가 모자랄 수 있음)")
  if (ledger.truncated.entries) incompleteReasons.push("장부 항목이 안전 상한에 닿았다(합계가 모자랄 수 있음)")
  if (ledger.truncated.appliedDrafts) incompleteReasons.push("적용 초안이 안전 상한에 닿았다(합계가 모자랄 수 있음)")
  if (ledger.truncated.openDrafts) incompleteReasons.push("열린 초안이 안전 상한에 닿았다(열린 초안 수가 모자랄 수 있음)")
  if (!ledger.entriesHealthOk) incompleteReasons.push("장부 항목 표를 읽지 못했다(장부 입력을 셀 수 없음)")
  if (ledger.sheetWritesReadable === false) incompleteReasons.push("시트 쓰기 기록을 읽지 못했다(시트가 이미 읽은 정정을 가리지 못함)")
  if (sheetChecks.headerProblem) incompleteReasons.push(`시트 머리를 못 알아봄 — ${sheetChecks.headerProblem}`)
  else if (sheetChecks.monthBlocks !== 12) incompleteReasons.push(`시트 월 블록이 ${sheetChecks.monthBlocks}개(12개 필요)`)
  if (sheetChecks.truncatedLikely) incompleteReasons.push(`시트 범위 ${sheet.range} 상한에 닿았다(아래 행이 잘렸을 수 있음)`)

  const syncCells = totals.filter((cell) => Math.abs(cell.deltaSync) >= tolerance)
  const deltaSyncTotal = totals.filter((cell) => cell.measure === "total").reduce((sum, cell) => sum + cell.deltaSync, 0)
  const blockReasons: string[] = []
  if (syncCells.length > 0) blockReasons.push(`동기화 뒤 시트 변경 칸 ${syncCells.length}개(합계 ${formatYuanExact(deltaSyncTotal, { signed: true })})`)
  if (sheetChecks.unexplainedColumns > 0) blockReasons.push(`시트 자체 점검: 설명 안 된 차이 ${sheetChecks.unexplainedColumns}열`)
  if (sheetChecks.unparsedCells.length > 0) blockReasons.push(`시트 자체 점검: 숫자로 못 읽은 칸 ${sheetChecks.unparsedCells.length}개`)
  if (!checks.serverParity.ok) blockReasons.push(`화면 식 ↔ 서버 식 합이 다른 칸 ${checks.serverParity.cells.length}개`)

  const diffCells = totals.filter((cell) => cellHasDiff(cell, tolerance)).length
  const explainedSheetItems =
    sheetChecks.orphanRows.length > 0 || sheetChecks.textAmountCells.length > 0 || sheetChecks.monthWeekMismatch.length > 0
  const status: ReconcileStatus = incompleteReasons.length > 0
    ? "incomplete"
    : blockReasons.length > 0
      ? "blocked"
      : diffCells > 0 || rowDiffs.length > 0 || explainedSheetItems
        ? "explained"
        : "same"
  const exitCode: 0 | 1 | 3 = status === "incomplete" ? 3 : status === "blocked" ? 1 : 0
  return { status, exitCode, incompleteReasons, blockReasons, deltaSyncTotal, diffCells }
}

/**
 * REV 시트 ↔ 장부 대조. 같은 입력이면 늘 같은 보고서를 낸다(읽는 날 asOf 를 인자로 받는다).
 */
export function reconcileRevLedger(sheet: ReconcileSheetInput, ledger: ReconcileLedgerInput, opts: ReconcileOptions): ReconcileReport {
  if (!YMD_RE.test(opts.asOf)) throw new Error(`[reconcile] asOf 는 KST 'YYYY-MM-DD' 여야 한다: ${opts.asOf}`)
  const fiscalYear = opts.fiscalYear
  const fyMonths = fiscalYearMonths(fiscalYear)
  const outside = (opts.months ?? []).filter((month) => !fyMonths.includes(month))
  if (outside.length > 0) throw new Error(`[reconcile] 회계연도 FY${fiscalYear} 밖의 달: ${outside.join(", ")}`)
  const wanted = opts.months && opts.months.length > 0 ? new Set(opts.months) : null
  const scopeMonths = wanted ? fyMonths.filter((month) => wanted.has(month)) : fyMonths
  const readDate = opts.asOf

  // 1~3) 장부 DB 행과 데이터 날짜 — 가진 행의 가장 이른 데이터 시각(KST). 모르면 임포트 시작, 그것도 없으면 읽는 날.
  const dbRows = listRevRevenue([...ledger.deals])
  const dataSyncedAt = oldestSyncedAt(dbRows)
  const dataDate = kstDateOf(dataSyncedAt) ?? kstDateOf(ledger.source.startedAt) ?? readDate

  // 4) 같은 그리드를 두 날로 파싱(오늘 · 데이터 날짜)
  const parsedNow = parseRevWithStats(sheet.grid, { refFy: fiscalYear, today: readDate }).deals
  const parsedData = parseRevWithStats(sheet.grid, { refFy: fiscalYear, today: dataDate }).deals
  const sheetNowRows = listRevRevenue(parsedNow.map((deal) => parsedToDeal(deal, sheet.readAt)))
  const sheetDataRows = listRevRevenue(parsedData.map((deal) => parsedToDeal(deal, sheet.readAt)))

  // 5) 장부 = 화면·서버와 같은 오버레이(회계연도 열두 달, 전 팀)
  const overlaySources: Omit<LedgerOverlayInput, "sheetRows"> = {
    ledgerEntries: ledger.entries,
    drafts: ledger.appliedDrafts,
    reversedDraftIds: new Set(
      ledger.entries.filter((item) => item.entryStatus === "reversed").map((item) => item.draftId).filter((id): id is string => Boolean(id)),
    ),
    sheetWrites: ledger.sheetWrites,
    lastRevSyncStartedAt: ledger.lastRevSyncStartedAt,
    months: fyMonths,
  }
  const overlay = buildLedgerOverlay({ sheetRows: dbRows, ...overlaySources })

  const labels = new ManagerLabels()
  for (const row of [...sheetNowRows, ...dbRows, ...overlay.rows]) labels.note(row.manager)
  const ctx: ReconcileContext = {
    fiscalYear,
    fyMonths,
    scopeMonths,
    scopeSet: new Set(scopeMonths),
    readDate,
    dataDate,
    tolerance: opts.tolerance ?? RECONCILE_DEFAULT_TOLERANCE,
    labels,
    filterKey: opts.manager ? reconcileManagerKey(opts.manager) : null,
    ledger,
    dbRows,
    sheetNowRows,
    sheetDataRows,
    overlay,
    overlaySources,
  }

  // 6~7) 넷 누적 → 칸
  const accLedger = accumulate(overlay.rows, scopeMonths, readDate)
  const { totals, managerSummary } = buildTotals(ctx, {
    now: accumulate(sheetNowRows, scopeMonths, readDate),
    data: accumulate(sheetDataRows, scopeMonths, readDate),
    db: accumulate(dbRows, scopeMonths, readDate),
    ledger: accLedger,
  })

  // 8~9) 건별 차이
  const rowDiffs: RowDiff[] = []
  const push: PushRowDiff = (diff) => {
    const managerKey = diff.managerKey ?? diff.managerKeys[0] ?? ""
    rowDiffs.push({ ...diff, managerKey, manager: labels.label(managerKey) })
  }
  const sheetByDbId = diffSheetAgainstDb(ctx, push)
  diffLedgerRows(ctx, sheetByDbId, push)
  const causeIndex = (cause: RowDiffCause) => ROW_DIFF_CAUSE_ORDER.indexOf(cause)
  const scopedRowDiffs = rowDiffs
    .filter((diff) => inManagerScope(ctx, diff.managerKeys))
    .sort(
      (a, b) =>
        (a.managerKey ? 0 : 1) - (b.managerKey ? 0 : 1) ||
        compareKo(a.manager, b.manager) ||
        (a.month ?? "").localeCompare(b.month ?? "") ||
        causeIndex(a.cause) - causeIndex(b.cause) ||
        compareKo(a.customer, b.customer) ||
        (a.sheetRow ?? 0) - (b.sheetRow ?? 0),
    )

  // 10~11) 잠금 전 확인 · 시트 자체 점검(시트 전체 — 담당 필터와 무관) · 담당 이름
  const checks = buildChecks(ctx, accLedger)
  const sheetChecks = buildSheetChecks(sheet, fiscalYear, scopeMonths, parsedNow, ctx.tolerance)
  const managerNames = buildManagerNames(sheet.grid, ledger.entries, labels).filter((note) => inManagerScope(ctx, [note.managerKey]))

  // 12) 판정
  const verdict = judge(ctx, sheet, { totals, rowDiffs: scopedRowDiffs, sheetChecks, checks })
  const meta: ReconcileMeta = {
    ranAt: opts.now,
    ranAtKst: kstDateTimeOf(opts.now),
    fiscalYear,
    months: [...scopeMonths],
    manager: ctx.filterKey == null ? null : labels.label(ctx.filterKey),
    managerKey: ctx.filterKey,
    asOf: readDate,
    dataDate,
    tolerance: ctx.tolerance,
    sheet: { range: sheet.range, readAt: sheet.readAt, rowsRead: sheet.grid.length, customerRows: parsedNow.length },
    db: {
      kind: ledger.source.kind,
      runId: ledger.source.runId,
      startedAt: ledger.source.startedAt,
      rows: dbRows.length,
      dataSyncedAt,
      lastRevSyncStartedAt: ledger.lastRevSyncStartedAt,
    },
    ledger: {
      activeEntries: ledger.entries.filter((item) => item.entryStatus === "active" && fyMonths.includes(item.month)).length,
      reversedEntries: ledger.entries.filter((item) => item.entryStatus === "reversed").length,
      appliedDrafts: ledger.appliedDrafts.length,
      absorbed: overlay.absorbedDraftIds.size,
      fallbackDrafts: checks.fallbackDraftIds.length,
      superseded: overlay.superseded.length,
      openDrafts: ledger.openDrafts.length,
    },
    managersTotal: managerSummary.length,
    managersWithDiff: managerSummary.filter((summary) => summary.diffCells > 0).length,
    diffCells: verdict.diffCells,
    deltaSyncTotal: verdict.deltaSyncTotal,
    incompleteReasons: verdict.incompleteReasons,
    blockReasons: verdict.blockReasons,
  }

  return {
    meta,
    status: verdict.status,
    exitCode: verdict.exitCode,
    totals,
    managerSummary,
    rowDiffs: scopedRowDiffs,
    sheetChecks,
    checks,
    managerNames,
  }
}

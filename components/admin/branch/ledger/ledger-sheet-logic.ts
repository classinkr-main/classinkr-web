// 장부 건별 시트(2026-11-23, 기획 W2·W3) — 순수 함수만. 화면은 ledger/LedgerSheet.tsx.
//
// 시트 '2. REV' 처럼 건별 한 줄(같은 기관이 여러 건이면 여러 줄)로 펴고, 기준 달(m0)과 다음 달(m1)만
// 주차(W1~W5) 칸으로 편다. 지난달은 한 열로 묶고(지난달 고정), 그 뒤 달도 한 열로 묶는다.
// 금액·확도 분해는 기존 정본(rowMonthBucket · rowWeeklySplit · computeWeekCellStates)만 쓴다 — 여기서 다시 계산하지 않는다.
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { channelLabel, contractLabel } from "./ledger-simple-logic"
import { computeWeekCellStates, dominantCellConfidence, isMatrixCellLocked, type MatrixCellCoord } from "./rev-matrix-logic"
import {
  rowProductCategory,
  rowWeeklyMismatch,
  rowWeeklySplit,
  weeklyConfidenceFromMetadata,
  type DraftConfidence,
  type LedgerRevenueRow,
  type RevMonthlyBucket,
} from "./shared"
import { addMonthlyBucket, emptyMonthlyBucket, rowMonthBucket } from "./workbench-shared"

// ── 열 필터 ─────────────────────────────────────────────────────────────────────────────────────

/** 공백 제외(그 열에 값이 있는 행만) 또는 확도 한 단계. 확도 단계는 지금의 3단계 그대로다. */
export type SheetFilterMode = "any" | DraftConfidence

export const SHEET_FILTER_MODES: Array<{ id: SheetFilterMode; label: string }> = [
  { id: "any", label: "공백 제외" },
  { id: "confirmed", label: CONFIDENCE_TOKENS.confirmed.label },
  { id: "high-confidence", label: CONFIDENCE_TOKENS["high-confidence"].label },
  { id: "expected", label: CONFIDENCE_TOKENS.expected.label },
]

/**
 * 필터 열 키 — 달이 아니라 **자리**다. m0 = 기준 달, m1 = 그다음 달, `.wN` = 그 달의 N주차 칸, 없으면 월 "계".
 * 월을 옮기면 필터도 열과 함께 따라간다("이번 달 계 · 공백 제외"는 12월로 옮겨도 12월 계에 걸린다).
 */
export const SHEET_FILTER_KEYS: readonly string[] = [0, 1].flatMap((slot) => [
  `m${slot}`,
  ...[1, 2, 3, 4, 5].map((week) => `m${slot}.w${week}`),
])

export type SheetColumnFilters = Readonly<Record<string, SheetFilterMode>>

/** 들어오면 걸려 있는 필터 — 기준 달 계 · 공백 제외("매출 난 것만"). */
export const DEFAULT_SHEET_FILTERS: SheetColumnFilters = { m0: "any" }
export const DEFAULT_SHEET_FILTER_KEY = "m0"

const MODE_TO_PARAM: Record<SheetFilterMode, string> = {
  any: "any",
  confirmed: "confirmed",
  "high-confidence": "high",
  expected: "expected",
}
const PARAM_TO_MODE = new Map<string, SheetFilterMode>(
  (Object.entries(MODE_TO_PARAM) as Array<[SheetFilterMode, string]>).map(([mode, param]) => [param, mode]),
)

export function parseSheetFilterKey(key: string): { slot: 0 | 1; week: number | null } | null {
  const match = /^m([01])(?:\.w([1-5]))?$/.exec(key)
  if (!match) return null
  return { slot: match[1] === "0" ? 0 : 1, week: match[2] ? Number(match[2]) - 1 : null }
}

function normalizeSheetFilters(filters: Record<string, SheetFilterMode>): SheetColumnFilters {
  const out: Record<string, SheetFilterMode> = {}
  for (const key of SHEET_FILTER_KEYS) {
    if (filters[key]) out[key] = filters[key]
  }
  return out
}

/**
 * URL `cf` → 필터. 생략(null)은 기본값, `none` 은 "전부 풀림". 그 밖은 `m0:any,m0.w2:confirmed` 꼴이고
 * 모르는 키·값은 버린다(남의 주소를 붙여 넣어도 화면이 깨지지 않게).
 */
export function parseSheetFilters(param: string | null): SheetColumnFilters {
  if (param == null) return DEFAULT_SHEET_FILTERS
  const out: Record<string, SheetFilterMode> = {}
  for (const part of param.split(",")) {
    const [key, value] = part.split(":")
    const mode = PARAM_TO_MODE.get((value ?? "").trim())
    if (mode && parseSheetFilterKey((key ?? "").trim())) out[key.trim()] = mode
  }
  return normalizeSheetFilters(out)
}

/** 필터 → URL `cf`. 기본값이면 null(주소에서 지운다 — 생략 = 기본값 복귀), 비었으면 `none`. */
export function serializeSheetFilters(filters: SheetColumnFilters): string | null {
  const entries = Object.entries(normalizeSheetFilters({ ...filters }))
  if (entries.length === 0) return "none"
  if (entries.length === 1 && entries[0][0] === DEFAULT_SHEET_FILTER_KEY && entries[0][1] === DEFAULT_SHEET_FILTERS.m0) return null
  return entries.map(([key, mode]) => `${key}:${MODE_TO_PARAM[mode]}`).join(",")
}

/** 열 하나의 필터를 걸거나(mode) 푼다(null). 다른 열의 필터는 그대로 — 겹쳐 걸린다. */
export function setSheetFilter(filters: SheetColumnFilters, key: string, mode: SheetFilterMode | null): SheetColumnFilters {
  if (!parseSheetFilterKey(key)) return filters
  const next: Record<string, SheetFilterMode> = { ...filters }
  if (mode) next[key] = mode
  else delete next[key]
  return normalizeSheetFilters(next)
}

export const NO_SHEET_FILTERS: SheetColumnFilters = {}

export function sameSheetFilters(a: SheetColumnFilters, b: SheetColumnFilters): boolean {
  return serializeSheetFilters(a) === serializeSheetFilters(b)
}

// ── 열 구성 ─────────────────────────────────────────────────────────────────────────────────────

export interface SheetMonthBlock {
  slot: 0 | 1
  /** YYYY-MM */
  month: string
  /** "11월" */
  label: string
}

export interface SheetColumns {
  /** 기준 달(회계연도 안으로 맞춘 값). */
  anchor: string
  /** 기준 달 이전의 회계월. 고정이면 한 열로 묶이고, 풀면 달마다 한 열. */
  pastMonths: string[]
  pastLabel: string | null
  pastPinned: boolean
  /** 주차로 펴는 달 — 기준 달, 다음 달(회계연도 마지막 달이면 하나뿐). */
  blocks: SheetMonthBlock[]
  /** 다음 달 뒤의 회계월 — 늘 한 열. */
  laterMonths: string[]
  laterLabel: string | null
}

function monthNumber(month: string) {
  return Number(month.split("-")[1])
}

function rangeLabel(months: string[]): string | null {
  if (months.length === 0) return null
  const first = monthNumber(months[0])
  const last = monthNumber(months[months.length - 1])
  return months.length === 1 ? `${first}월` : `${first}–${last}월`
}

/** 기준 달이 회계연도 밖이면 가장 가까운 끝 달로 맞춘다. */
export function clampSheetAnchor(months: string[], anchorMonth: string): string {
  if (months.length === 0 || months.includes(anchorMonth)) return anchorMonth
  return anchorMonth < months[0] ? months[0] : months[months.length - 1]
}

export function buildSheetColumns(months: string[], anchorMonth: string, pastPinned = true): SheetColumns {
  const anchor = clampSheetAnchor(months, anchorMonth)
  const index = Math.max(months.indexOf(anchor), 0)
  const pastMonths = months.slice(0, index)
  const blockMonths = months.slice(index, index + 2)
  const laterMonths = months.slice(index + 2)
  return {
    anchor,
    pastMonths,
    pastLabel: rangeLabel(pastMonths),
    pastPinned,
    blocks: blockMonths.map((month, slot) => ({ slot: slot as 0 | 1, month, label: `${monthNumber(month)}월` })),
    laterMonths,
    laterLabel: rangeLabel(laterMonths),
  }
}

/** "11월 계" · "11월 W2". 그 자리에 달이 없으면(회계연도 끝) null. */
export function sheetFilterColumnLabel(key: string, columns: SheetColumns): string | null {
  const parsed = parseSheetFilterKey(key)
  if (!parsed) return null
  const block = columns.blocks.find((item) => item.slot === parsed.slot)
  if (!block) return null
  return parsed.week == null ? `${block.label} 계` : `${block.label} W${parsed.week + 1}`
}

export function sheetFilterModeLabel(mode: SheetFilterMode): string {
  return SHEET_FILTER_MODES.find((item) => item.id === mode)?.label ?? mode
}

/** 걸린 필터 목록 — "11월 계 공백 제외", "11월 W2 확정" … (열 순서대로). */
export function describeSheetFilters(filters: SheetColumnFilters, columns: SheetColumns): Array<{ key: string; label: string }> {
  return SHEET_FILTER_KEYS.flatMap((key) => {
    const mode = filters[key]
    if (!mode) return []
    return [{ key, label: `${sheetFilterColumnLabel(key, columns) ?? key} ${sheetFilterModeLabel(mode)}` }]
  })
}

// ── 행 ──────────────────────────────────────────────────────────────────────────────────────────

export interface SheetWeekCell {
  /** 화면에 보이는 금액(월합계만 있는 행은 W5 에 얹는다 — computeWeekCellStates 규약). */
  display: number
  isMonthOnly: boolean
  /** 값이 있는 칸의 확도. 빈 칸은 null. */
  confidence: DraftConfidence | null
}

export interface SheetBlockView {
  slot: 0 | 1
  month: string
  bucket: RevMonthlyBucket
  /** 주차 5칸(표시용). */
  weeks: SheetWeekCell[]
  /** rowWeeklySplit 원본 — 칸 편집 컴포넌트(RevMatrixWeekCells)에 그대로 넘긴다. */
  rawWeeks: number[]
  inferred: boolean
  monthOnlyAmount: number
  /** 주차 합계와 월 금액이 어긋났다(rowWeeklyMismatch). */
  mismatch: boolean
  /** 그 달이 잠겼다(isMatrixCellLocked) — 값이 있는 주차 칸은 고칠 수 없다. */
  monthLocked: boolean
}

export interface SheetRowView {
  row: LedgerRevenueRow
  /** 제품 — "SW" · "HW", 분류 못 하면 빈 문자열. */
  product: string
  /** 계약 — 신규 · 갱신 · 기타. */
  contract: string
  /** 경로 — 직접 · 채널 · 기타. */
  channel: string
  past: RevMonthlyBucket
  pastByMonth: RevMonthlyBucket[]
  blocks: SheetBlockView[]
  later: RevMonthlyBucket
  annual: RevMonthlyBucket
  /** 금액이 있는 달이 전부 확정이고 잠겼다 — 고객명 옆 자물쇠. */
  lockedConfirmed: boolean
  /** 주차·월 불일치가 난 달(회계연도 순) — 고객명 옆 경고. */
  mismatchMonths: string[]
  correctedMonths: Set<string> | null
  /** 비고 — 장부에서 넣은 행의 메모. 시트 행은 데이터 계약에 비고가 없어 비어 있다. */
  note: string
}

function uniformConfidence(bucket: RevMonthlyBucket): DraftConfidence | null {
  if (bucket.total <= 0) return null
  if (bucket.confirmed >= bucket.total) return "confirmed"
  if (bucket.confirmed <= 0 && bucket.open <= 0) return "high-confidence"
  if (bucket.confirmed <= 0 && bucket.high <= 0) return "expected"
  return null
}

/**
 * 주차 칸별 확도(표시·필터용). 월 확도 분해(bucket)가 정본이라 그 합을 넘겨 칠하지 않는다.
 *  - 그 달이 한 가지 확도뿐이면 값 있는 칸 전부 그 확도.
 *  - 섞였으면 장부 입력 행은 저장된 주차별 확도, 시트 행은 칸 글자색(weeklyColors: r 빨강 · b 파랑 · k 그 밖)을
 *    읽되, 빨강·파랑 칸은 그 달의 확정·고확도 금액이 남아 있을 때만 그 확도로 본다(아직 오지 않은 주차의 빨강은
 *    정본에서 예정이다). 글자색을 모르면 그 달의 우세 확도.
 */
export function weekCellConfidences(
  row: Pick<LedgerRevenueRow, "weeklyColors" | "draftMetadata" | "draftMonth">,
  month: string,
  displays: number[],
  bucket: RevMonthlyBucket,
): Array<DraftConfidence | null> {
  const uniform = uniformConfidence(bucket)
  if (bucket.total <= 0) return displays.map(() => null)
  if (uniform) return displays.map((value) => (value > 0 ? uniform : null))
  const stored = row.draftMonth === month ? weeklyConfidenceFromMetadata(row.draftMetadata) : null
  const marks = row.weeklyColors?.[month] ?? ""
  const dominant = dominantCellConfidence(bucket)
  let confirmedLeft = bucket.confirmed
  let highLeft = bucket.high
  return displays.map((value, index) => {
    if (value <= 0) return null
    if (stored?.[index]) return stored[index]
    const mark = marks[index]
    if (mark === "r" && confirmedLeft >= value - 1) {
      confirmedLeft -= value
      return "confirmed"
    }
    if (mark === "b" && highLeft >= value - 1) {
      highLeft -= value
      return "high-confidence"
    }
    if (mark === "r" || mark === "b" || mark === "k") return "expected"
    return dominant
  })
}

export function buildSheetRowView(row: LedgerRevenueRow, columns: SheetColumns, correctedMonths: Set<string> | null = null): SheetRowView {
  const past = emptyMonthlyBucket()
  const later = emptyMonthlyBucket()
  const annual = emptyMonthlyBucket()
  const mismatchMonths: string[] = []
  let valuedMonths = 0
  let lockedConfirmedMonths = 0
  const visit = (month: string) => {
    const bucket = rowMonthBucket(row, month)
    if (bucket.total > 0) {
      valuedMonths += 1
      addMonthlyBucket(annual, bucket)
      if (bucket.confirmed >= bucket.total && isMatrixCellLocked(row, month, correctedMonths)) lockedConfirmedMonths += 1
    }
    if (rowWeeklyMismatch(row, month)) mismatchMonths.push(month)
    return bucket
  }
  const pastByMonth = columns.pastMonths.map((month) => {
    const bucket = visit(month)
    addMonthlyBucket(past, bucket)
    return bucket
  })
  const blocks = columns.blocks.map((block): SheetBlockView => {
    const bucket = visit(block.month)
    const split = rowWeeklySplit(row, block.month)
    const rawWeeks = split.source === "explicit" || split.source === "inferred" ? split.weeks : [0, 0, 0, 0, 0]
    const monthOnlyAmount = split.source === "month-only" ? split.total : 0
    const monthLocked = isMatrixCellLocked(row, block.month, correctedMonths)
    const states = computeWeekCellStates(rawWeeks, monthOnlyAmount, monthLocked)
    const confidences = weekCellConfidences(row, block.month, states.map((state) => state.display), bucket)
    return {
      slot: block.slot,
      month: block.month,
      bucket,
      weeks: states.map((state, index) => ({ display: state.display, isMonthOnly: state.isMonthOnly, confidence: confidences[index] })),
      rawWeeks,
      inferred: split.source === "inferred",
      monthOnlyAmount,
      mismatch: mismatchMonths.includes(block.month),
      monthLocked,
    }
  })
  for (const month of columns.laterMonths) addMonthlyBucket(later, visit(month))
  const category = rowProductCategory(row)
  return {
    row,
    product: category === "hardware" ? "HW" : category === "software" ? "SW" : "",
    contract: contractLabel(row),
    channel: channelLabel(row),
    past,
    pastByMonth,
    blocks,
    later,
    annual,
    lockedConfirmed: valuedMonths > 0 && lockedConfirmedMonths === valuedMonths,
    mismatchMonths,
    correctedMonths,
    note: (row.draftNote ?? "").trim(),
  }
}

/** 시트 순서 — 시트 행 번호 오름차순, 행 번호가 없는 행(장부에서 넣은 행)은 원래 순서대로 맨 뒤. */
export function sortSheetRows<T extends Pick<LedgerRevenueRow, "sheetRow">>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aRow = a.row.sheetRow ?? Number.POSITIVE_INFINITY
      const bRow = b.row.sheetRow ?? Number.POSITIVE_INFINITY
      return aRow === bRow ? a.index - b.index : aRow - bRow
    })
    .map((item) => item.row)
}

function bucketHasConfidence(bucket: RevMonthlyBucket, mode: DraftConfidence): boolean {
  if (mode === "confirmed") return bucket.confirmed > 0
  if (mode === "high-confidence") return bucket.high > 0
  return bucket.open > 0
}

/**
 * 걸린 필터를 전부 통과해야 보인다(AND). 월 "계" 열의 확도 필터는 그 달에 그 확도 금액이 조금이라도 있으면 통과,
 * 주차 열은 그 칸에 값이 있고 그 칸의 확도가 같아야 통과한다. 그 자리에 달이 없는 필터(회계연도 끝)는 건너뛴다.
 */
export function sheetRowPassesFilters(view: Pick<SheetRowView, "blocks">, filters: SheetColumnFilters): boolean {
  for (const [key, mode] of Object.entries(filters)) {
    const parsed = parseSheetFilterKey(key)
    if (!parsed) continue
    const block = view.blocks.find((item) => item.slot === parsed.slot)
    if (!block) continue
    if (parsed.week == null) {
      if (mode === "any" ? block.bucket.total <= 0 : !bucketHasConfidence(block.bucket, mode)) return false
      continue
    }
    const cell = block.weeks[parsed.week]
    if (!cell || cell.display <= 0) return false
    if (mode !== "any" && cell.confidence !== mode) return false
  }
  return true
}

export function filterSheetRows<T extends Pick<SheetRowView, "blocks">>(views: T[], filters: SheetColumnFilters): T[] {
  if (Object.keys(filters).length === 0) return views
  return views.filter((view) => sheetRowPassesFilters(view, filters))
}

// ── 합계 ────────────────────────────────────────────────────────────────────────────────────────

export interface SheetTotals {
  past: RevMonthlyBucket
  pastByMonth: RevMonthlyBucket[]
  blocks: Array<{ slot: 0 | 1; month: string; bucket: RevMonthlyBucket; weeks: number[] }>
  later: RevMonthlyBucket
  annual: RevMonthlyBucket
}

/** 머리 아래 합계 행 — 지금 보이는 행(필터 반영)만 더한다. */
export function sumSheetRows(views: SheetRowView[], columns: SheetColumns): SheetTotals {
  const totals: SheetTotals = {
    past: emptyMonthlyBucket(),
    pastByMonth: columns.pastMonths.map(() => emptyMonthlyBucket()),
    blocks: columns.blocks.map((block) => ({ slot: block.slot, month: block.month, bucket: emptyMonthlyBucket(), weeks: [0, 0, 0, 0, 0] })),
    later: emptyMonthlyBucket(),
    annual: emptyMonthlyBucket(),
  }
  for (const view of views) {
    addMonthlyBucket(totals.past, view.past)
    view.pastByMonth.forEach((bucket, index) => {
      if (totals.pastByMonth[index]) addMonthlyBucket(totals.pastByMonth[index], bucket)
    })
    view.blocks.forEach((block, index) => {
      const target = totals.blocks[index]
      if (!target) return
      addMonthlyBucket(target.bucket, block.bucket)
      block.weeks.forEach((cell, week) => {
        target.weeks[week] += cell.display
      })
    })
    addMonthlyBucket(totals.later, view.later)
    addMonthlyBucket(totals.annual, view.annual)
  }
  return totals
}

// ── 칸 편집 순서 ────────────────────────────────────────────────────────────────────────────────

/**
 * 고칠 수 있는 칸 좌표(행 위→아래, 달 왼→오, W1→W5) — 방향키·Tab·Enter 이동의 순서다.
 * 잠긴 달에서도 빈 주차 칸은 열려 있다(computeWeekCellStates) — 값이 찍힌 잠긴 칸만 뺀다.
 */
export function sheetEditableCells(views: SheetRowView[]): MatrixCellCoord[] {
  const cells: MatrixCellCoord[] = []
  for (const view of views) {
    for (const block of view.blocks) {
      block.weeks.forEach((cell, week) => {
        if (block.monthLocked && cell.display > 0) return
        cells.push({ rowId: view.row.id, month: block.month, week })
      })
    }
  }
  return cells
}

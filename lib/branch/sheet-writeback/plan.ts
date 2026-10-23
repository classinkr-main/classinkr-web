// 쓰기 직전 시트(live)와 초안들로 시트 쓰기 계획을 만든다 — 순수 모듈.
//
// 판정 순서(초안마다, 하나라도 걸리면 그 초안은 쓰지 않는다):
//   new-row → app_only(시트 쓰기 대상 아님)
//   탭 title·sheetId 가 REV_WRITE_TARGET 와 다름 → not_allowed / 머리 구조 이상 → layout_changed
//   baseline 없음 → no_baseline / 행 ID 없음 → no_row_id / 행 ID 0행 → row_not_found · 2행+ → row_id_duplicate
//   A열 고객 바뀜 → identity_changed / 그 달 블록 없음 → month_not_in_sheet
//   baseline 과 live 주차 칸이 다름 → (live 가 이미 의도한 결과면 already_written, 아니면 conflict)
//   planWeekWrites 거절 → 그 코드(주차 토큰 metadata.week 도 넘긴다) / 대상 칸 수식(상수 산식 포함)·글자 → formula_cell
//   월 합계 수식 불규칙 → month_formula_irregular / 같은 (행 ID, 달) 두 건 → 늦게 고친 것만, 나머지 conflict
//   바꿀 칸 없음 → noop

import { REV_WRITE_TARGET } from "./config"
import {
  parseDraftConfidence,
  weekColorForConfidence,
  weekColorOf,
  type DraftConfidenceLike,
  type RgbColor,
  type WeekColor,
} from "./colors"
import { parseSheetBaseline, type SheetBaselineV1 } from "./baseline"
import { colToA1, isRevLayoutError, resolveRevLayout, type RevLayout, type RevMonthBlock } from "./layout"
import type { SheetWriteCode } from "./messages"
import { checkMonthFormulas } from "./month-formula"
import { planWeekWrites, type WeekWrite } from "./target"

export interface LiveCell {
  value: number | null
  formula: string | null
  fg: RgbColor | null
  text: string | null
}

export interface LiveGrid {
  title: string
  sheetId: number
  header: Array<string | number | null>
  /** grid index 0 = sheet row 1 */
  rows: LiveCell[][]
}

export interface DraftForWrite {
  id: string
  kind: "new-row" | "edit-row"
  month: string
  amount: number
  currency: string
  customer: string
  sourceSnapshot: Record<string, unknown>
  metadata: Record<string, unknown>
  /** 같은 (행 ID, 달) 초안이 한 배치에 둘 이상일 때 늦게 고친 것만 쓴다. 없으면 배열 순서(뒤가 늦음). */
  updatedAt?: string
}

export interface PlannedCell {
  a1: string
  /** 0-based grid */
  row: number
  col: number
  before: { value: number | null; color: WeekColor }
  after: { value: number | null; color: WeekColor }
  writeValue: boolean
  writeColor: boolean
}

export type DraftPlan =
  | { draftId: string; action: "app_only"; code: "new_row_app_only" }
  | { draftId: string; action: "refuse"; code: SheetWriteCode }
  | { draftId: string; action: "skip_write"; code: "already_written"; rowIndex: number; rowId: string; cells: PlannedCell[] }
  | { draftId: string; action: "write"; rowIndex: number; rowId: string; cells: PlannedCell[] }
  | { draftId: string; action: "noop"; code: "written" }

export type WriteDraftPlan = Extract<DraftPlan, { action: "write" }>

const FIRST_DATA_ROW_INDEX = 2 // 3행
const SHEET_CURRENCY = "CNY"
const EMPTY_CELL: LiveCell = { value: null, formula: null, fg: null, text: null }

export function liveCell(grid: LiveGrid, rowIndex: number, col: number): LiveCell {
  return grid.rows[rowIndex]?.[col] ?? EMPTY_CELL
}

export function liveRowId(grid: LiveGrid, rowIndex: number, rowIdCol: number): string | null {
  const cell = liveCell(grid, rowIndex, rowIdCol)
  const text = cell.text ?? (cell.value != null ? String(cell.value) : null)
  const trimmed = text?.trim()
  return trimmed ? trimmed : null
}

export function liveText(cell: LiveCell): string {
  return (cell.text ?? (cell.value != null ? String(cell.value) : "")).trim()
}

/** 칸에 숫자 말고 글자만 있으면(예: "TBD") 덮지 않는다. */
function hasNonNumericText(cell: LiveCell): boolean {
  return cell.value == null && liveText(cell) !== ""
}

export function liveWeeks(grid: LiveGrid, rowIndex: number, block: RevMonthBlock): Array<{ value: number; color: WeekColor }> {
  return block.weekCols.map((col) => {
    const cell = liveCell(grid, rowIndex, col)
    return { value: cell.value ?? 0, color: weekColorOf(cell.fg) }
  })
}

/** 값 칸은 값·색을, 빈 칸은 값만 비교한다(빈 칸 색은 보이지 않으니 baseline 이 모른다). */
function sameWeeks(
  a: Array<{ value: number; color: WeekColor }>,
  b: Array<{ value: number; color: WeekColor }>,
): boolean {
  if (a.length !== b.length) return false
  return a.every((week, index) => week.value === b[index].value && (week.value === 0 || week.color === b[index].color))
}

function draftWeekly(metadata: Record<string, unknown>): number[] | null {
  const weekly = metadata.weekly
  if (!Array.isArray(weekly) || weekly.length !== 5) return null
  if (!weekly.every((value) => typeof value === "number" && Number.isFinite(value))) return null
  return weekly.some((value) => value > 0) ? (weekly as number[]) : null
}

function draftWeeklyConfidence(metadata: Record<string, unknown>): Array<DraftConfidenceLike | null> | null {
  const raw = metadata.weeklyConfidence
  if (!Array.isArray(raw) || raw.length !== 5) return null
  const states = raw.map((value) => (value == null ? null : parseDraftConfidence(value)))
  if (raw.some((value, index) => value != null && states[index] == null)) return null
  return states.some((value) => value != null) ? states : null
}

/** metadata.week 의 주차 토큰("w1".."w5") → 0-based. "month"·없음·그 밖은 null(월 칸 수정). */
function draftWeekToken(metadata: Record<string, unknown>): number | null {
  const match = typeof metadata.week === "string" ? /^w([1-5])$/.exec(metadata.week.trim()) : null
  return match ? Number(match[1]) - 1 : null
}

function draftFirstPayment(draft: DraftForWrite): string | null {
  const candidates = [
    (draft.sourceSnapshot.row as Record<string, unknown> | undefined)?.firstPayment,
    draft.sourceSnapshot.firstPayment,
    draft.metadata.firstPayment,
  ]
  for (const value of candidates) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim()
  }
  return null
}

function plannedCells(
  rowIndex: number,
  block: RevMonthBlock,
  writes: WeekWrite[],
  beforeOf: (weekIndex: number) => { value: number | null; color: WeekColor },
  fallbackColor: WeekColor,
): PlannedCell[] {
  return writes.map((write) => {
    const col = block.weekCols[write.weekIndex]
    const before = beforeOf(write.weekIndex)
    const writeValue = write.value != null
    // 빈 칸에 값을 쓸 때는 숨은 색을 덮으려고 색을 늘 함께 쓴다.
    const fillsEmpty = writeValue && (before.value == null || before.value === 0)
    const writeColor = write.color != null || fillsEmpty
    const afterColor = write.color ?? (fillsEmpty ? fallbackColor : before.color)
    return {
      a1: `${colToA1(col)}${rowIndex + 1}`,
      row: rowIndex,
      col,
      before,
      after: { value: writeValue ? write.value : before.value, color: afterColor },
      writeValue,
      writeColor,
    }
  })
}

/** 의도한 결과(after)를 baseline 위에 그대로 얹었을 때의 주차 칸. */
function applyWrites(
  weeks: Array<{ value: number; color: WeekColor }>,
  writes: WeekWrite[],
  fallbackColor: WeekColor,
): Array<{ value: number; color: WeekColor }> {
  const next = weeks.map((week) => ({ ...week }))
  for (const write of writes) {
    const target = next[write.weekIndex]
    if (!target) continue
    const fillsEmpty = write.value != null && target.value === 0
    if (write.value != null) target.value = write.value
    if (write.color != null) target.color = write.color
    else if (fillsEmpty) target.color = fallbackColor
  }
  return next
}

interface EvaluatedDraft {
  draft: DraftForWrite
  order: number
  plan: DraftPlan
  /** 같은 (행 ID, 달) 묶음 판정용 */
  key: string | null
}

function evaluateEditDraft(
  live: LiveGrid,
  layout: RevLayout,
  rowIdIndex: Map<string, number[]>,
  draft: DraftForWrite,
  today: string,
): { plan: DraftPlan; key: string | null } {
  const refuse = (code: SheetWriteCode, key: string | null = null) => ({
    plan: { draftId: draft.id, action: "refuse" as const, code },
    key,
  })

  const baseline: SheetBaselineV1 | null = parseSheetBaseline(draft.sourceSnapshot.sheetBaseline)
  if (!baseline || baseline.month !== draft.month) return refuse("no_baseline")
  if (!baseline.rowId) return refuse("no_row_id")
  const key = `${baseline.rowId}|${draft.month}`
  if (layout.rowIdCol == null) return refuse("no_row_id", key)

  const matches = rowIdIndex.get(baseline.rowId) ?? []
  if (matches.length === 0) return refuse("row_not_found", key)
  if (matches.length > 1) return refuse("row_id_duplicate", key)
  const rowIndex = matches[0]

  if (liveText(liveCell(live, rowIndex, 0)) !== baseline.customer) return refuse("identity_changed", key)

  const block = layout.monthBlocks.find((candidate) => candidate.ym === draft.month)
  if (!block) return refuse("month_not_in_sheet", key)
  if (!Number.isFinite(draft.amount) || draft.currency !== SHEET_CURRENCY) return refuse("amount_invalid", key)

  const current = liveWeeks(live, rowIndex, block)
  const confidence = parseDraftConfidence(draft.metadata.confidence) ?? "expected"
  const fallbackColor = weekColorForConfidence(confidence)
  const planInput = {
    month: draft.month,
    draftAmount: draft.amount,
    draftWeekly: draftWeekly(draft.metadata),
    draftConfidence: confidence,
    draftWeeklyConfidence: draftWeeklyConfidence(draft.metadata),
    confidenceTouched: draft.metadata.confidenceTouched === true,
    firstPayment: draftFirstPayment(draft),
    today,
    draftWeek: draftWeekToken(draft.metadata),
  }

  // baseline 에 그 달 값이 없었으면(weeks []) 칸 수는 live 로 정하고 값은 전부 0 이었던 것으로 본다.
  const baselineWeeks = baseline.weeks.length > 0
    ? baseline.weeks
    : current.map(() => ({ value: 0, color: "k" as WeekColor }))

  if (!sameWeeks(baselineWeeks, current)) {
    // 이전 시도가 "결과 모름"으로 끝났을 수 있다 — live 가 이미 의도한 결과면 장부만 마무리한다.
    const intended = planWeekWrites({ ...planInput, baselineWeeks })
    if (intended.ok && intended.writes.length > 0) {
      const expected = applyWrites(baselineWeeks, intended.writes, fallbackColor)
      if (sameWeeks(expected, current)) {
        const cells = plannedCells(
          rowIndex,
          block,
          intended.writes,
          (weekIndex) => ({ value: baselineWeeks[weekIndex].value || null, color: baselineWeeks[weekIndex].color }),
          fallbackColor,
        )
        return {
          plan: { draftId: draft.id, action: "skip_write", code: "already_written", rowIndex, rowId: baseline.rowId, cells },
          key,
        }
      }
    }
    return refuse("conflict", key)
  }

  // 같다는 것이 확인됐다 — 빈 칸의 숨은 색까지 보이는 live 를 기준으로 계획한다.
  const planned = planWeekWrites({ ...planInput, baselineWeeks: current })
  if (!planned.ok) return refuse(planned.refusal, key)
  if (planned.writes.length === 0) return { plan: { draftId: draft.id, action: "noop", code: "written" }, key }

  for (const write of planned.writes) {
    const cell = liveCell(live, rowIndex, block.weekCols[write.weekIndex])
    if (cell.formula || hasNonNumericText(cell)) return refuse("formula_cell", key)
  }

  const rowFormulas = new Map<number, string | null>()
  for (const monthBlock of layout.monthBlocks) {
    rowFormulas.set(monthBlock.totalCol, liveCell(live, rowIndex, monthBlock.totalCol).formula)
  }
  const targetCols = planned.writes.map((write) => block.weekCols[write.weekIndex])
  const formulaCheck = checkMonthFormulas(rowIndex + 1, rowFormulas, layout, targetCols)
  if (!formulaCheck.ok) return refuse("month_formula_irregular", key)

  return {
    plan: {
      draftId: draft.id,
      action: "write",
      rowIndex,
      rowId: baseline.rowId,
      cells: plannedCells(
        rowIndex,
        block,
        planned.writes,
        (weekIndex) => {
          const cell = liveCell(live, rowIndex, block.weekCols[weekIndex])
          return { value: cell.value, color: weekColorOf(cell.fg) }
        },
        fallbackColor,
      ),
    },
    key,
  }
}

function buildRowIdIndex(live: LiveGrid, rowIdCol: number | null): Map<string, number[]> {
  const index = new Map<string, number[]>()
  if (rowIdCol == null) return index
  for (let rowIndex = FIRST_DATA_ROW_INDEX; rowIndex < live.rows.length; rowIndex += 1) {
    const id = liveRowId(live, rowIndex, rowIdCol)
    if (!id) continue
    const list = index.get(id) ?? []
    list.push(rowIndex)
    index.set(id, list)
  }
  return index
}

function isLater(a: EvaluatedDraft, b: EvaluatedDraft): boolean {
  const at = a.draft.updatedAt ? Date.parse(a.draft.updatedAt) : Number.NaN
  const bt = b.draft.updatedAt ? Date.parse(b.draft.updatedAt) : Number.NaN
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at > bt
  return a.order > b.order
}

export function planDraftWrites(
  live: LiveGrid,
  drafts: DraftForWrite[],
  opts: { today: string; refFy: number },
): { layoutError?: string; layout?: RevLayout; plans: DraftPlan[] } {
  const targetMatches = live.title === REV_WRITE_TARGET.tabTitle && live.sheetId === REV_WRITE_TARGET.sheetId
  const resolved = targetMatches ? resolveRevLayout(live.header, opts.refFy) : null
  const layoutError = resolved && isRevLayoutError(resolved) ? resolved.detail : undefined
  const layout = resolved && !isRevLayoutError(resolved) ? resolved : undefined
  const rowIdIndex = buildRowIdIndex(live, layout?.rowIdCol ?? null)

  const evaluated: EvaluatedDraft[] = drafts.map((draft, order) => {
    if (draft.kind === "new-row") {
      return { draft, order, key: null, plan: { draftId: draft.id, action: "app_only", code: "new_row_app_only" } }
    }
    if (!targetMatches) return { draft, order, key: null, plan: { draftId: draft.id, action: "refuse", code: "not_allowed" } }
    if (!layout) return { draft, order, key: null, plan: { draftId: draft.id, action: "refuse", code: "layout_changed" } }
    const { plan, key } = evaluateEditDraft(live, layout, rowIdIndex, draft, opts.today)
    return { draft, order, plan, key }
  })

  // 같은 (행 ID, 달) 초안이 둘 이상이면 늦게 고친 것만 남긴다(시트 칸 하나에 두 값을 쓰지 않는다).
  const latestByKey = new Map<string, EvaluatedDraft>()
  for (const item of evaluated) {
    if (!item.key) continue
    const current = latestByKey.get(item.key)
    if (!current || isLater(item, current)) latestByKey.set(item.key, item)
  }

  const plans = evaluated.map((item): DraftPlan => {
    if (item.key && latestByKey.get(item.key) !== item) {
      return { draftId: item.draft.id, action: "refuse", code: "conflict" }
    }
    return item.plan
  })

  return { ...(layoutError ? { layoutError } : {}), ...(layout ? { layout } : {}), plans }
}

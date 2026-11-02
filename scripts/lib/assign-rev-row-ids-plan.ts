// '2. REV' 행 ID 일괄 부여(scripts/assign-rev-row-ids.ts)의 순수 계획·허용 목록·사후 검증.
//
// 이 파일은 시트를 부르지 않는다 — 읽은 응답을 받아 "무엇을 보낼지"를 정하고, 보내기 직전 요청이
// 허용 목록 안인지, 보낸 뒤 다시 읽은 시트가 기대와 같은지를 판정만 한다. 테스트는
// tests/scripts/assign-rev-row-ids-plan.test.ts(실제 시트 호출 없음).
//
// 하는 일(ADR-011 · docs/active/rev-sheet-writeback-runbook.md):
//   1) "Row ID" 머리가 없고 열이 84개(A~CF)면 맨 끝에 열 하나를 붙여 CG(0-based 84)를 만든다.
//      머리가 이미 있으면 그 열을 다시 쓴다(멱등). 열 수가 84 가 아니면서 머리도 없으면 멈춘다.
//   2) CG2 = "Row ID", CG 열 숨김.
//   3) 기본 필터 범위를 CG 까지 넓힌다 — 읽은 filterSpecs·sortSpecs 를 그대로 복사한다(조건 유지).
//      필터 뷰는 range 만 고친다(fields "range").
//   4) 고객(A)이 있는 행 중 Row ID 칸이 빈 행에만 새 ID(generateRowId)를 stringValue 로 쓴다.
//      형식 오류·중복은 보고만 하고 고치지 않는다 — 있으면 --apply 를 막는다(사람이 시트에서 정리).
// 쓰는 칸은 Row ID 열 하나뿐이다. 주차·월 합계·속성 칸에 닿는 요청은 assertRowIdRequestsAllowed 가 거절한다.

import type { sheets_v4 } from "googleapis"

import { REV_ROW_ID_HEADER, REV_WRITE_TARGET } from "../../lib/branch/sheet-writeback/config"
import { colToA1, isRevLayoutError, resolveRevLayout } from "../../lib/branch/sheet-writeback/layout"
import { generateRowId, isValidRowId } from "../../lib/branch/sheet-writeback/row-id"

export type SheetsRequest = sheets_v4.Schema$Request
type GridRange = sheets_v4.Schema$GridRange
type FilterSpec = sheets_v4.Schema$FilterSpec
type SortSpec = sheets_v4.Schema$SortSpec

/** 지금 시트(A~CF). Row ID 열이 없을 때 이 열 수에서만 맨 끝에 붙인다. */
export const REV_ROW_ID_EXPECTED_COLUMNS = 84
/** 읽기 범위 상한 — 앱(REV_WRITE_READ_RANGE)·동기화(REV_RANGE)와 같은 'A1:CZ1000'. 넘는 행·열은 앱이 못 본다. */
export const REV_ROW_ID_MAX_ROWS = 1000
export const REV_ROW_ID_MAX_COLUMNS = 104
const HEADER_ROW_INDEX = 1 // 2행
const FIRST_DATA_ROW_INDEX = 2 // 3행
const CUSTOMER_COL = 0 // A(Account) — resolveRevLayout 이 A2 머리를 확인한다

export interface RowIdSheetSnapshot {
  spreadsheetId: string
  spreadsheetTitle: string | null
  /** '2. REV' 탭을 못 찾으면 null */
  sheetId: number | null
  title: string | null
  rowCount: number
  columnCount: number
  basicFilter: sheets_v4.Schema$BasicFilter | null
  filterViews: sheets_v4.Schema$FilterView[]
  /** hiddenByUser 인 열(0-based) */
  hiddenColumns: number[]
  /** grid index 0 = 시트 1행. 칸 글자(formattedValue → stringValue → 숫자), 없으면 null. */
  rows: Array<Array<string | null>>
}

export interface RowIdPlanOptions {
  refFy: number
  /** env GOOGLE_BRANCH_DASHBOARD_SHEET_ID — 허용 목록 id 와 같아야 --apply 할 수 있다 */
  envSpreadsheetId: string | null | undefined
  /** 기본 필터에 정렬(sortSpecs)이 있어도 그대로 복사해 다시 건다(--keep-sort). 없으면 멈춘다. */
  keepSort?: boolean
  rand?: (n: number) => Uint8Array
}

export interface RowIdFilterViewPlan {
  filterViewId: number | null
  title: string | null
  before: GridRange | null
  after: GridRange | null
  note: string | null
}

export interface RowIdPlan {
  /** 막는 이유가 하나도 없을 때만 true — --apply 는 이것이 true 일 때만 보낸다 */
  ok: boolean
  blockers: string[]
  warnings: string[]
  target: {
    spreadsheetId: string
    spreadsheetTitle: string | null
    title: string | null
    sheetId: number | null
    rowCount: number
    columnCount: number
    envMatches: boolean
  }
  rowIdCol: number | null
  appendColumn: boolean
  hideColumn: boolean
  counts: { dataRows: number; withId: number; missing: number; invalid: number; duplicate: number; orphan: number }
  invalidRows: Array<{ sheetRow: number; value: string }>
  duplicateIds: Array<{ rowId: string; sheetRows: number[] }>
  /** 고객(A)이 빈 행에 남은 Row ID 칸(정보) */
  orphanRows: number[]
  assignments: Array<{ sheetRow: number; rowId: string }>
  basicFilter: {
    before: GridRange | null
    after: GridRange | null
    filterSpecs: FilterSpec[]
    sortSpecs: SortSpec[]
  } | null
  filterViews: RowIdFilterViewPlan[]
  requests: SheetsRequest[]
}

/* ── 응답 → 스냅샷 ─────────────────────────────────────────── */

function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`
}

/** 메타 응답의 그리드 크기 그대로 읽는다(범위가 그리드를 넘지 않게). 상한은 앱 읽기 범위와 같다. */
export function gridReadRange(rowCount: number, columnCount: number, tabTitle: string = REV_WRITE_TARGET.tabTitle): string {
  const lastCol = Math.max(1, Math.min(columnCount, REV_ROW_ID_MAX_COLUMNS))
  const lastRow = Math.max(1, Math.min(rowCount, REV_ROW_ID_MAX_ROWS))
  return `${quoteSheetTitle(tabTitle)}!A1:${colToA1(lastCol - 1)}${lastRow}`
}

export function findRevSheet(
  spreadsheet: sheets_v4.Schema$Spreadsheet | null | undefined,
  tabTitle: string = REV_WRITE_TARGET.tabTitle,
): sheets_v4.Schema$Sheet | null {
  return spreadsheet?.sheets?.find((sheet) => sheet.properties?.title === tabTitle) ?? null
}

function cellText(cell: sheets_v4.Schema$CellData | undefined): string | null {
  if (!cell) return null
  if (typeof cell.formattedValue === "string" && cell.formattedValue !== "") return cell.formattedValue
  const entered = cell.userEnteredValue
  if (typeof entered?.stringValue === "string" && entered.stringValue !== "") return entered.stringValue
  if (typeof entered?.numberValue === "number") return String(entered.numberValue)
  return null
}

/**
 * meta = spreadsheets.get(그리드 없이: 속성·basicFilter·filterViews), grid = spreadsheets.get(gridReadRange, includeGridData).
 * 두 응답에서 '2. REV' 탭만 골라 한 스냅샷으로 만든다. 탭이 없으면 sheetId·title 이 null 이다.
 */
export function snapshotFromResponses(
  spreadsheetId: string,
  meta: sheets_v4.Schema$Spreadsheet | null | undefined,
  grid: sheets_v4.Schema$Spreadsheet | null | undefined,
): RowIdSheetSnapshot {
  const metaSheet = findRevSheet(meta)
  const gridSheet = findRevSheet(grid)
  const data = gridSheet?.data?.[0]
  const startRow = data?.startRow ?? 0
  const startColumn = data?.startColumn ?? 0
  const rows: Array<Array<string | null>> = []
  for (const [offset, row] of (data?.rowData ?? []).entries()) {
    const values = row.values ?? []
    const out: Array<string | null> = Array.from({ length: startColumn }, () => null)
    for (const cell of values) out.push(cellText(cell))
    rows[startRow + offset] = out
  }
  for (let index = 0; index < rows.length; index += 1) rows[index] ??= []
  const hiddenColumns: number[] = []
  for (const [offset, column] of (data?.columnMetadata ?? []).entries()) {
    if (column.hiddenByUser === true) hiddenColumns.push(startColumn + offset)
  }
  const properties = metaSheet?.properties
  return {
    spreadsheetId,
    spreadsheetTitle: meta?.properties?.title ?? null,
    sheetId: typeof properties?.sheetId === "number" ? properties.sheetId : null,
    title: properties?.title ?? null,
    rowCount: properties?.gridProperties?.rowCount ?? 0,
    columnCount: properties?.gridProperties?.columnCount ?? 0,
    basicFilter: metaSheet?.basicFilter ?? null,
    filterViews: metaSheet?.filterViews ?? [],
    hiddenColumns,
    rows,
  }
}

/* ── 공용 판정 ─────────────────────────────────────────────── */

function trimmed(value: string | null | undefined): string {
  return value == null ? "" : String(value).trim()
}

function customerAt(snapshot: RowIdSheetSnapshot, rowIndex: number): string {
  return trimmed(snapshot.rows[rowIndex]?.[CUSTOMER_COL])
}

function rowIdAt(snapshot: RowIdSheetSnapshot, rowIndex: number, rowIdCol: number): string {
  return trimmed(snapshot.rows[rowIndex]?.[rowIdCol])
}

function clone<T>(value: T): T {
  return value == null ? value : (JSON.parse(JSON.stringify(value)) as T)
}

/** 키 순서와 무관한 JSON — 필터 조건이 바뀌지 않았는지 비교할 때 쓴다. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`
  }
  return JSON.stringify(value ?? null)
}

/** 읽은 filterSpecs 사본(순서 그대로). 응답에 filterSpecs 가 없고 옛 criteria 지도만 있으면 그것을 filterSpecs 로 옮긴다. */
export function filterSpecsOf(filter: { filterSpecs?: FilterSpec[]; criteria?: Record<string, sheets_v4.Schema$FilterCriteria> | null } | null | undefined): FilterSpec[] {
  if (!filter) return []
  if (filter.filterSpecs?.length) return clone(filter.filterSpecs)
  return Object.entries(filter.criteria ?? {}).map(([column, filterCriteria]) => ({ columnIndex: Number(column), filterCriteria: clone(filterCriteria) }))
}

/** 조건이 같은지 비교할 때만 — 열 순서로 맞춘 뒤 키 순서와 무관한 JSON. 정렬(sortSpecs)은 순서가 뜻이라 그대로 본다. */
function filterSpecsKey(filter: Parameters<typeof filterSpecsOf>[0]): string {
  return stableJson(filterSpecsOf(filter).sort((a, b) => (a.columnIndex ?? -1) - (b.columnIndex ?? -1)))
}

function sortSpecsOf(filter: { sortSpecs?: SortSpec[] } | null | undefined): SortSpec[] {
  return clone(filter?.sortSpecs ?? [])
}

function sortSpecsKey(filter: { sortSpecs?: SortSpec[] } | null | undefined): string {
  return stableJson(sortSpecsOf(filter))
}

function gridRangeOf(range: GridRange | null | undefined, sheetId: number): GridRange | null {
  if (!range) return null
  const out: GridRange = { sheetId: range.sheetId ?? sheetId }
  if (range.startRowIndex != null) out.startRowIndex = range.startRowIndex
  if (range.endRowIndex != null) out.endRowIndex = range.endRowIndex
  if (range.startColumnIndex != null) out.startColumnIndex = range.startColumnIndex
  if (range.endColumnIndex != null) out.endColumnIndex = range.endColumnIndex
  return out
}

/** 범위 비교 키 — 시작 칸이 빠지면 0(응답이 0 을 생략한다), 끝 칸이 빠지면 열린 범위(null)로 본다. */
function rangeKey(range: GridRange | null | undefined, sheetId: number): string {
  if (!range) return "null"
  return stableJson({
    sheetId: range.sheetId ?? sheetId,
    startRowIndex: range.startRowIndex ?? 0,
    endRowIndex: range.endRowIndex ?? null,
    startColumnIndex: range.startColumnIndex ?? 0,
    endColumnIndex: range.endColumnIndex ?? null,
  })
}

/** GridRange → "A2:CG450"(끝 행이 열려 있으면 "A2:CG"). */
export function gridRangeA1(range: GridRange | null | undefined): string {
  if (!range) return "-"
  const startCol = colToA1(range.startColumnIndex ?? 0)
  const startRow = (range.startRowIndex ?? 0) + 1
  const endCol = range.endColumnIndex != null ? colToA1(range.endColumnIndex - 1) : ""
  const endRow = range.endRowIndex != null ? String(range.endRowIndex) : ""
  return `${startCol}${startRow}:${endCol}${endRow}`
}

type RangeExtension = { kind: "covered" } | { kind: "extend"; after: GridRange } | { kind: "blocked"; reason: string }

/** 필터 범위가 Row ID 열 바로 앞에서 끝날 때만 그 열까지 넓힌다. 이미 덮으면 그대로, 더 앞에서 끝나면 멈춘다. */
function extendRangeToRowIdCol(range: GridRange, sheetId: number, rowIdCol: number): RangeExtension {
  const end = range.endColumnIndex
  if (end == null || end > rowIdCol) return { kind: "covered" }
  if (end === rowIdCol) {
    const after = gridRangeOf(range, sheetId) as GridRange
    after.endColumnIndex = rowIdCol + 1
    return { kind: "extend", after }
  }
  return {
    kind: "blocked",
    reason: `${gridRangeA1(range)} 가 Row ID 열(${colToA1(rowIdCol)}) 바로 앞(${colToA1(rowIdCol - 1)})에서 끝나지 않습니다 — 사이 열까지 필터에 들어가므로 넓히지 않습니다`,
  }
}

function idCellRequest(sheetId: number, rowIndex: number, rowIdCol: number, values: string[]): SheetsRequest {
  return {
    updateCells: {
      start: { sheetId, rowIndex, columnIndex: rowIdCol },
      rows: values.map((stringValue) => ({ values: [{ userEnteredValue: { stringValue } }] })),
      fields: "userEnteredValue",
    },
  }
}

/* ── 계획 ─────────────────────────────────────────────────── */

export function planRowIdAssignment(snapshot: RowIdSheetSnapshot, opts: RowIdPlanOptions): RowIdPlan {
  const blockers: string[] = []
  const warnings: string[] = []
  const envId = trimmed(opts.envSpreadsheetId)
  const envMatches = envId === REV_WRITE_TARGET.spreadsheetId
  const plan: RowIdPlan = {
    ok: false,
    blockers,
    warnings,
    target: {
      spreadsheetId: snapshot.spreadsheetId,
      spreadsheetTitle: snapshot.spreadsheetTitle,
      title: snapshot.title,
      sheetId: snapshot.sheetId,
      rowCount: snapshot.rowCount,
      columnCount: snapshot.columnCount,
      envMatches,
    },
    rowIdCol: null,
    appendColumn: false,
    hideColumn: false,
    counts: { dataRows: 0, withId: 0, missing: 0, invalid: 0, duplicate: 0, orphan: 0 },
    invalidRows: [],
    duplicateIds: [],
    orphanRows: [],
    assignments: [],
    basicFilter: null,
    filterViews: [],
    requests: [],
  }
  const finish = (): RowIdPlan => {
    plan.ok = blockers.length === 0
    return plan
  }

  // 1) 대상 — 허용 목록 id·env·탭 이름·gid 가 전부 맞아야 한다.
  if (snapshot.spreadsheetId !== REV_WRITE_TARGET.spreadsheetId) {
    blockers.push(`대상 스프레드시트 id 가 허용 목록(REV_WRITE_TARGET)과 다릅니다: ${snapshot.spreadsheetId}`)
  }
  if (!envId) blockers.push("env GOOGLE_BRANCH_DASHBOARD_SHEET_ID 가 비어 있습니다")
  else if (!envMatches) blockers.push("env GOOGLE_BRANCH_DASHBOARD_SHEET_ID 가 허용 목록 id 와 다릅니다")
  if (snapshot.sheetId == null || snapshot.title !== REV_WRITE_TARGET.tabTitle) {
    blockers.push(`'${REV_WRITE_TARGET.tabTitle}' 탭을 찾지 못했습니다`)
    return finish()
  }
  if (snapshot.sheetId !== REV_WRITE_TARGET.sheetId) {
    blockers.push(`'${REV_WRITE_TARGET.tabTitle}' 탭 gid 가 ${snapshot.sheetId} 입니다(허용 목록 ${REV_WRITE_TARGET.sheetId})`)
    return finish()
  }
  const sheetId = snapshot.sheetId
  if (snapshot.rowCount > REV_ROW_ID_MAX_ROWS) {
    blockers.push(`행이 ${snapshot.rowCount}개입니다 — 앱 읽기 범위(${REV_ROW_ID_MAX_ROWS}행) 밖 행은 행 ID 를 확인할 수 없습니다`)
  }
  if (snapshot.columnCount > REV_ROW_ID_MAX_COLUMNS) {
    blockers.push(`열이 ${snapshot.columnCount}개입니다 — 앱 읽기 범위(CZ) 밖입니다`)
  }

  // 2) 머리 — 앱 쓰기와 같은 판정(resolveRevLayout). Row ID 열은 이 결과만 믿는다.
  const layout = resolveRevLayout(snapshot.rows[HEADER_ROW_INDEX] ?? [], opts.refFy)
  if (isRevLayoutError(layout)) {
    blockers.push(`시트 머리 구조가 예상과 다릅니다(layout_changed): ${layout.detail}`)
    return finish()
  }
  let rowIdCol = layout.rowIdCol
  if (rowIdCol == null) {
    if (snapshot.columnCount !== REV_ROW_ID_EXPECTED_COLUMNS) {
      blockers.push(
        `Row ID 머리가 없고 열이 ${snapshot.columnCount}개입니다(${REV_ROW_ID_EXPECTED_COLUMNS}개일 때만 맨 끝에 열을 붙입니다) — 사람이 시트 오른쪽 열을 확인해야 합니다`,
      )
      return finish()
    }
    rowIdCol = REV_ROW_ID_EXPECTED_COLUMNS
    plan.appendColumn = true
  }
  plan.rowIdCol = rowIdCol
  plan.hideColumn = plan.appendColumn || !snapshot.hiddenColumns.includes(rowIdCol)

  // 3) 행 — 고객(A)이 있는 행이 데이터 행이다(parseRev 와 같다). 중복은 3행부터 모든 행에서 센다(plan.ts 와 같다).
  const lastRowIndex = Math.min(snapshot.rows.length, snapshot.rowCount || snapshot.rows.length)
  const rowsById = new Map<string, number[]>()
  const existingTexts = new Set<string>()
  for (let rowIndex = FIRST_DATA_ROW_INDEX; rowIndex < lastRowIndex; rowIndex += 1) {
    const id = plan.appendColumn ? "" : rowIdAt(snapshot, rowIndex, rowIdCol)
    if (!id) continue
    existingTexts.add(id)
    if (!customerAt(snapshot, rowIndex)) plan.orphanRows.push(rowIndex + 1)
    if (!isValidRowId(id)) continue
    const list = rowsById.get(id) ?? []
    list.push(rowIndex + 1)
    rowsById.set(id, list)
  }
  for (const [rowId, sheetRows] of rowsById) if (sheetRows.length > 1) plan.duplicateIds.push({ rowId, sheetRows })

  const missingRows: number[] = []
  for (let rowIndex = FIRST_DATA_ROW_INDEX; rowIndex < lastRowIndex; rowIndex += 1) {
    if (!customerAt(snapshot, rowIndex)) continue
    plan.counts.dataRows += 1
    const id = plan.appendColumn ? "" : rowIdAt(snapshot, rowIndex, rowIdCol)
    const shown = id.slice(0, 40)
    if (!id) {
      plan.counts.missing += 1
      missingRows.push(rowIndex)
    } else if (!isValidRowId(id)) {
      plan.counts.invalid += 1
      plan.invalidRows.push({ sheetRow: rowIndex + 1, value: shown })
    } else if ((rowsById.get(id)?.length ?? 0) > 1) {
      plan.counts.duplicate += 1
    } else {
      plan.counts.withId += 1
    }
  }
  plan.counts.orphan = plan.orphanRows.length
  if (plan.counts.invalid > 0) {
    blockers.push(
      `Row ID 형식 오류 ${plan.counts.invalid}행(${plan.invalidRows.map((row) => row.sheetRow).join(", ")}) — 시트에서 그 칸을 비운 뒤 다시 돌립니다`,
    )
  }
  if (plan.duplicateIds.length > 0) {
    blockers.push(
      `같은 Row ID 가 여러 행에 있습니다: ${plan.duplicateIds.map((dup) => `${dup.rowId}(${dup.sheetRows.join("·")}행)`).join(", ")} — 복사로 생긴 쪽 칸을 비운 뒤 다시 돌립니다`,
    )
  }
  if (plan.counts.orphan > 0) {
    warnings.push(`고객(A)이 빈 행에 Row ID 가 ${plan.counts.orphan}칸 남아 있습니다(${plan.orphanRows.join(", ")}행) — 쓰기 대상은 아니지만 같은 ID 가 생기면 중복으로 막힙니다`)
  }

  // 새 ID — 열에 이미 있는 글자(형식 오류 포함)와도 겹치지 않게 뽑는다.
  for (const rowIndex of missingRows) {
    const rowId = generateRowId(existingTexts, opts.rand)
    existingTexts.add(rowId)
    plan.assignments.push({ sheetRow: rowIndex + 1, rowId })
  }

  // 4) 필터 — 기본 필터는 읽은 조건을 그대로 복사해 다시 걸고, 필터 뷰는 range 만 고친다.
  const filterRequests: SheetsRequest[] = []
  const basic = snapshot.basicFilter
  if (basic) {
    const filterSpecs = filterSpecsOf(basic)
    const sortSpecs = sortSpecsOf(basic)
    const before = gridRangeOf(basic.range, sheetId)
    plan.basicFilter = { before, after: before, filterSpecs, sortSpecs }
    if (basic.tableId) {
      blockers.push("기본 필터가 표(table)에 묶여 있습니다 — 범위를 바꾸지 않습니다")
    } else if (!before) {
      blockers.push("기본 필터 범위를 읽지 못했습니다")
    } else if (before.sheetId !== sheetId) {
      blockers.push(`기본 필터가 다른 탭(gid ${before.sheetId})을 가리킵니다`)
    } else {
      const extension = extendRangeToRowIdCol(before, sheetId, rowIdCol)
      if (extension.kind === "blocked") blockers.push(`기본 필터 ${extension.reason}`)
      if (extension.kind === "extend") {
        plan.basicFilter.after = extension.after
        if (sortSpecs.length > 0 && !opts.keepSort) {
          blockers.push(
            `기본 필터에 정렬(sortSpecs ${sortSpecs.length}개)이 있습니다 — 다시 걸면 그 정렬로 행이 다시 정렬될 수 있어 멈춥니다(확인했으면 --keep-sort)`,
          )
        }
        const filter: sheets_v4.Schema$BasicFilter = { range: extension.after }
        if (filterSpecs.length > 0) filter.filterSpecs = filterSpecs
        if (sortSpecs.length > 0) filter.sortSpecs = sortSpecs
        filterRequests.push({ setBasicFilter: { filter } })
      }
    }
  }
  for (const view of snapshot.filterViews) {
    const before = gridRangeOf(view.range, sheetId)
    const entry: RowIdFilterViewPlan = { filterViewId: view.filterViewId ?? null, title: view.title ?? null, before, after: before, note: null }
    plan.filterViews.push(entry)
    if (view.filterViewId == null) entry.note = "filterViewId 없음 — 그대로 둡니다"
    else if (view.namedRangeId || view.tableId || !before) entry.note = "이름 붙은 범위·표에 묶인 필터 뷰 — 그대로 둡니다"
    else if (before.sheetId !== sheetId) entry.note = "다른 탭 범위 — 그대로 둡니다"
    else {
      const extension = extendRangeToRowIdCol(before, sheetId, rowIdCol)
      if (extension.kind === "covered") entry.note = "이미 Row ID 열을 덮습니다"
      else if (extension.kind === "blocked") entry.note = `${extension.reason} — 그대로 둡니다`
      else {
        entry.after = extension.after
        filterRequests.push({ updateFilterView: { filter: { filterViewId: view.filterViewId, range: extension.after }, fields: "range" } })
      }
    }
    if (entry.note && entry.note !== "이미 Row ID 열을 덮습니다") {
      warnings.push(`필터 뷰 '${entry.title ?? entry.filterViewId}': ${entry.note}`)
    }
  }

  // 5) 요청 — 순서가 뜻이다: 열 붙이기 → 머리 → 숨김 → 행 ID → 필터. 행 ID 를 필터보다 먼저 써야
  //    (--keep-sort 로) 정렬이 다시 걸려도 ID 가 행과 같이 움직인다. batchUpdate 한 번 = 전부 아니면 전무.
  const requests: SheetsRequest[] = []
  if (plan.appendColumn) {
    requests.push({ appendDimension: { sheetId, dimension: "COLUMNS", length: 1 } })
    requests.push(idCellRequest(sheetId, HEADER_ROW_INDEX, rowIdCol, [REV_ROW_ID_HEADER]))
  }
  if (plan.hideColumn) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: rowIdCol, endIndex: rowIdCol + 1 },
        properties: { hiddenByUser: true },
        fields: "hiddenByUser",
      },
    })
  }
  // 이어진 빈 칸 묶음마다 updateCells 하나 — 이미 ID 가 있는 칸은 건드리지 않는다.
  let run: Array<{ rowIndex: number; rowId: string }> = []
  const flush = () => {
    if (run.length > 0) requests.push(idCellRequest(sheetId, run[0].rowIndex, rowIdCol, run.map((item) => item.rowId)))
    run = []
  }
  for (const assignment of plan.assignments) {
    const rowIndex = assignment.sheetRow - 1
    if (run.length > 0 && run[run.length - 1].rowIndex + 1 !== rowIndex) flush()
    run.push({ rowIndex, rowId: assignment.rowId })
  }
  flush()
  requests.push(...filterRequests)
  plan.requests = requests
  return finish()
}

/* ── 허용 목록(보내기 직전) ───────────────────────────────── */

export interface RowIdAllowContext {
  sheetId: number
  rowIdCol: number
  appendColumn: boolean
  /** 쓸 수 있는 데이터 행(grid index) — 고객(A)이 있고 Row ID 칸이 빈 행. 이미 글자가 있는 칸은 덮지 않는다. */
  fillableRows: ReadonlySet<number>
  basicFilter: sheets_v4.Schema$BasicFilter | null
  filterViews: sheets_v4.Schema$FilterView[]
}

/** 허용 목록 문맥은 계획이 아니라 읽은 스냅샷에서 따로 다시 센다 — 계획이 틀려도 빈 칸 밖은 못 쓴다. */
export function allowContextFor(snapshot: RowIdSheetSnapshot, plan: RowIdPlan): RowIdAllowContext {
  if (snapshot.sheetId == null || plan.rowIdCol == null) throw new Error("not_allowed: 대상 탭·Row ID 열이 정해지지 않았습니다")
  const rowIdCol = plan.rowIdCol
  const appendColumn = rowIdCol >= snapshot.columnCount
  const fillableRows = new Set<number>()
  const lastRowIndex = Math.min(snapshot.rows.length, snapshot.rowCount || snapshot.rows.length)
  for (let rowIndex = FIRST_DATA_ROW_INDEX; rowIndex < lastRowIndex; rowIndex += 1) {
    if (!customerAt(snapshot, rowIndex)) continue
    if (appendColumn || !rowIdAt(snapshot, rowIndex, rowIdCol)) fillableRows.add(rowIndex)
  }
  return {
    sheetId: snapshot.sheetId,
    rowIdCol,
    appendColumn,
    fillableRows,
    basicFilter: snapshot.basicFilter,
    filterViews: snapshot.filterViews,
  }
}

function notAllowed(detail: string): never {
  throw new Error(`not_allowed: ${detail}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function onlyKeys(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (!isRecord(value)) notAllowed(`${label} 형식`)
  for (const key of Object.keys(value)) if (!allowed.includes(key)) notAllowed(`${label}.${key}`)
  return value
}

function sameRangeExceptEnd(before: GridRange, after: unknown, ctx: RowIdAllowContext, label: string) {
  const range = onlyKeys(after, ["sheetId", "startRowIndex", "endRowIndex", "startColumnIndex", "endColumnIndex"], `${label}.range`)
  const expected = gridRangeOf(before, ctx.sheetId) as GridRange
  if (expected.endColumnIndex !== ctx.rowIdCol) notAllowed(`${label} 기존 범위가 Row ID 열 바로 앞에서 끝나지 않음`)
  if (range.sheetId !== ctx.sheetId) notAllowed(`${label} sheetId`)
  // 끝 열만 Row ID 열까지 넓어지고 나머지 칸은 읽은 그대로여야 한다.
  if (rangeKey(range as GridRange, ctx.sheetId) !== rangeKey({ ...expected, endColumnIndex: ctx.rowIdCol + 1 }, ctx.sheetId)) {
    notAllowed(`${label} 범위 — 끝 열 말고 바뀐 칸이 있음`)
  }
}

/**
 * 행 ID 스크립트가 보낼 수 있는 요청만 통과시킨다. 하나라도 어긋나면 throw Error("not_allowed: …") — 아무것도 보내지 않는다.
 *   appendDimension(COLUMNS, 1) — 열을 새로 붙일 때만, 맨 앞 한 번
 *   updateCells — Row ID 열 한 칸 폭, 값은 stringValue 만(2행 = "Row ID" 머리, 3행부터 = 형식 맞는 행 ID), fields "userEnteredValue"
 *   updateDimensionProperties — Row ID 열 hiddenByUser=true 만
 *   setBasicFilter — 범위 끝 열만 Row ID 열까지, filterSpecs·sortSpecs 는 읽은 값 그대로
 *   updateFilterView — fields "range", 범위 끝 열만 Row ID 열까지
 */
export function assertRowIdRequestsAllowed(requests: unknown[], ctx: RowIdAllowContext): void {
  if (!Array.isArray(requests) || requests.length === 0) notAllowed("요청 없음")
  const writtenRows = new Set<number>()
  const touchedViews = new Set<number>()
  let basicFilterSet = false
  let hidden = false

  requests.forEach((request, index) => {
    const keys = isRecord(request) ? Object.keys(request) : []
    if (keys.length !== 1) notAllowed(`요청 ${index} 형식`)
    const [kind] = keys
    const body = (request as Record<string, unknown>)[kind]

    if (kind === "appendDimension") {
      if (!ctx.appendColumn || index !== 0) notAllowed("appendDimension 은 새 열을 붙일 때 맨 앞 한 번만")
      const append = onlyKeys(body, ["sheetId", "dimension", "length"], "appendDimension")
      if (append.sheetId !== ctx.sheetId || append.dimension !== "COLUMNS" || append.length !== 1) notAllowed("appendDimension 값")
      return
    }

    if (kind === "updateCells") {
      const update = onlyKeys(body, ["start", "rows", "fields"], "updateCells")
      if (update.fields !== "userEnteredValue") notAllowed("updateCells.fields")
      const start = onlyKeys(update.start, ["sheetId", "rowIndex", "columnIndex"], "updateCells.start")
      if (start.sheetId !== ctx.sheetId) notAllowed("updateCells sheetId")
      if (start.columnIndex !== ctx.rowIdCol) notAllowed("updateCells 열 — Row ID 열만")
      const rowIndex = start.rowIndex
      if (typeof rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < HEADER_ROW_INDEX) notAllowed("updateCells 행")
      const rows = update.rows
      if (!Array.isArray(rows) || rows.length === 0) notAllowed("updateCells.rows")
      if (rowIndex === HEADER_ROW_INDEX && rows.length !== 1) notAllowed("머리 칸은 한 칸만")
      rows.forEach((row, offset) => {
        const values = onlyKeys(row, ["values"], "updateCells.rows[]").values
        if (!Array.isArray(values) || values.length !== 1) notAllowed("updateCells 한 칸 폭만")
        const cell = onlyKeys(values[0], ["userEnteredValue"], "updateCells 칸")
        const entered = onlyKeys(cell.userEnteredValue, ["stringValue"], "userEnteredValue")
        const text = entered.stringValue
        const target = rowIndex + offset
        if (writtenRows.has(target)) notAllowed(`같은 칸 두 번(${target + 1}행)`)
        writtenRows.add(target)
        if (target === HEADER_ROW_INDEX) {
          if (!ctx.appendColumn || text !== REV_ROW_ID_HEADER) notAllowed("머리 칸")
          return
        }
        if (!ctx.fillableRows.has(target)) notAllowed(`빈 Row ID 칸이 아닌 행(${target + 1}행)`)
        if (!isValidRowId(text)) notAllowed("행 ID 형식")
      })
      return
    }

    if (kind === "updateDimensionProperties") {
      if (hidden) notAllowed("숨김 두 번")
      hidden = true
      const update = onlyKeys(body, ["range", "properties", "fields"], "updateDimensionProperties")
      if (update.fields !== "hiddenByUser") notAllowed("updateDimensionProperties.fields")
      const range = onlyKeys(update.range, ["sheetId", "dimension", "startIndex", "endIndex"], "updateDimensionProperties.range")
      if (range.sheetId !== ctx.sheetId || range.dimension !== "COLUMNS" || range.startIndex !== ctx.rowIdCol || range.endIndex !== ctx.rowIdCol + 1) {
        notAllowed("숨김 범위 — Row ID 열만")
      }
      const properties = onlyKeys(update.properties, ["hiddenByUser"], "updateDimensionProperties.properties")
      if (properties.hiddenByUser !== true) notAllowed("hiddenByUser")
      return
    }

    if (kind === "setBasicFilter") {
      if (basicFilterSet || !ctx.basicFilter?.range) notAllowed("setBasicFilter — 기존 기본 필터 범위 넓히기만, 한 번")
      basicFilterSet = true
      const filter = onlyKeys(onlyKeys(body, ["filter"], "setBasicFilter").filter, ["range", "filterSpecs", "sortSpecs"], "setBasicFilter.filter")
      sameRangeExceptEnd(ctx.basicFilter.range, filter.range, ctx, "setBasicFilter")
      if (filterSpecsKey(filter as { filterSpecs?: FilterSpec[] }) !== filterSpecsKey(ctx.basicFilter)) {
        notAllowed("setBasicFilter.filterSpecs 가 읽은 조건과 다름")
      }
      if (sortSpecsKey(filter as { sortSpecs?: SortSpec[] }) !== sortSpecsKey(ctx.basicFilter)) {
        notAllowed("setBasicFilter.sortSpecs 가 읽은 정렬과 다름")
      }
      return
    }

    if (kind === "updateFilterView") {
      const update = onlyKeys(body, ["filter", "fields"], "updateFilterView")
      if (update.fields !== "range") notAllowed("updateFilterView.fields")
      const filter = onlyKeys(update.filter, ["filterViewId", "range"], "updateFilterView.filter")
      const view = ctx.filterViews.find((candidate) => candidate.filterViewId != null && candidate.filterViewId === filter.filterViewId)
      if (!view?.range || view.namedRangeId || view.tableId) notAllowed("updateFilterView — 읽은 필터 뷰만")
      if (touchedViews.has(view.filterViewId as number)) notAllowed("같은 필터 뷰 두 번")
      touchedViews.add(view.filterViewId as number)
      sameRangeExceptEnd(view.range, filter.range, ctx, "updateFilterView")
      return
    }

    notAllowed(`요청 종류 ${kind}`)
  })
}

/** --apply 대상: 허용 목록 id 와 env GOOGLE_BRANCH_DASHBOARD_SHEET_ID 둘 다와 같아야 한다. */
export function assertApplyTarget(spreadsheetId: string, envSpreadsheetId: string | null | undefined): void {
  if (spreadsheetId !== REV_WRITE_TARGET.spreadsheetId) notAllowed("스프레드시트 id 가 허용 목록과 다름")
  if (trimmed(envSpreadsheetId) !== REV_WRITE_TARGET.spreadsheetId) notAllowed("env GOOGLE_BRANCH_DASHBOARD_SHEET_ID 가 허용 목록과 다름")
}

/* ── 사후 검증 ─────────────────────────────────────────────── */

/**
 * 보낸 뒤 다시 읽은 시트(after)를 확인한다. 문제가 하나라도 있으면 목록을 돌려준다(스크립트는 exit 1).
 *   - Row ID 머리가 계획한 열에 하나, 그 열이 숨김
 *   - 고객 행 전부에 형식 맞는 ID, 3행부터 같은 ID 없음
 *   - 원래 있던 ID 는 그대로 남고, 새 ID 는 계획한 고객 행에 붙음(행 위치가 아니라 고객 글자로 대조)
 *   - 고객 행 수 그대로
 *   - 기본 필터·필터 뷰의 filterSpecs·sortSpecs 그대로, 범위는 Row ID 열을 덮음
 */
export function verifyRowIdAssignment(before: RowIdSheetSnapshot, after: RowIdSheetSnapshot, plan: RowIdPlan, refFy: number): string[] {
  const problems: string[] = []
  const rowIdCol = plan.rowIdCol
  if (rowIdCol == null) return ["계획에 Row ID 열이 없습니다"]
  if (after.sheetId !== before.sheetId || after.title !== before.title) problems.push("다시 읽은 탭이 다릅니다")

  const layout = resolveRevLayout(after.rows[HEADER_ROW_INDEX] ?? [], refFy)
  if (isRevLayoutError(layout)) problems.push(`머리 구조: ${layout.detail}`)
  else if (layout.rowIdCol !== rowIdCol) problems.push(`Row ID 머리가 ${layout.rowIdCol == null ? "없습니다" : colToA1(layout.rowIdCol)}(기대 ${colToA1(rowIdCol)})`)
  if (!after.hiddenColumns.includes(rowIdCol)) problems.push(`${colToA1(rowIdCol)} 열이 숨겨지지 않았습니다`)

  const lastRowIndex = (snapshot: RowIdSheetSnapshot) => Math.min(snapshot.rows.length, snapshot.rowCount || snapshot.rows.length)
  const idRows = new Map<string, number[]>()
  let dataRows = 0
  const missing: number[] = []
  for (let rowIndex = FIRST_DATA_ROW_INDEX; rowIndex < lastRowIndex(after); rowIndex += 1) {
    const id = rowIdAt(after, rowIndex, rowIdCol)
    if (id) idRows.set(id, [...(idRows.get(id) ?? []), rowIndex])
    if (!customerAt(after, rowIndex)) continue
    dataRows += 1
    if (!isValidRowId(id)) missing.push(rowIndex + 1)
  }
  if (missing.length > 0) problems.push(`형식 맞는 ID 가 없는 고객 행 ${missing.length}개(${missing.slice(0, 20).join(", ")}행)`)
  const duplicated = [...idRows].filter(([, rows]) => rows.length > 1)
  if (duplicated.length > 0) problems.push(`같은 ID 가 여러 행에: ${duplicated.map(([id, rows]) => `${id}(${rows.map((r) => r + 1).join("·")}행)`).join(", ")}`)
  if (dataRows !== plan.counts.dataRows) problems.push(`고객 행 수가 ${plan.counts.dataRows} → ${dataRows} 로 바뀌었습니다`)

  if (!plan.appendColumn) {
    for (let rowIndex = FIRST_DATA_ROW_INDEX; rowIndex < lastRowIndex(before); rowIndex += 1) {
      const id = rowIdAt(before, rowIndex, rowIdCol)
      if (id && isValidRowId(id) && !idRows.has(id)) problems.push(`원래 있던 ID ${id}(${rowIndex + 1}행)가 사라졌습니다`)
    }
  }
  for (const assignment of plan.assignments) {
    const rows = idRows.get(assignment.rowId) ?? []
    if (rows.length !== 1) {
      problems.push(`새 ID ${assignment.rowId}(${assignment.sheetRow}행)가 ${rows.length}곳에 있습니다`)
      continue
    }
    const expected = customerAt(before, assignment.sheetRow - 1)
    if (customerAt(after, rows[0]) !== expected) problems.push(`새 ID ${assignment.rowId} 가 다른 고객 행(${rows[0] + 1}행)에 붙었습니다`)
  }

  const basicBefore = before.basicFilter
  const basicAfter = after.basicFilter
  if (Boolean(basicBefore) !== Boolean(basicAfter)) problems.push("기본 필터가 생기거나 사라졌습니다")
  if (basicBefore && basicAfter) {
    if (filterSpecsKey(basicBefore) !== filterSpecsKey(basicAfter)) problems.push("기본 필터 조건(filterSpecs)이 바뀌었습니다")
    if (sortSpecsKey(basicBefore) !== sortSpecsKey(basicAfter)) problems.push("기본 필터 정렬(sortSpecs)이 바뀌었습니다")
    const expectedRange = plan.basicFilter?.after
    if (expectedRange && rangeKey(basicAfter.range, after.sheetId ?? -1) !== rangeKey(expectedRange, after.sheetId ?? -1)) {
      problems.push(`기본 필터 범위가 ${gridRangeA1(basicAfter.range)} 입니다(기대 ${gridRangeA1(expectedRange)})`)
    }
  }
  for (const view of before.filterViews) {
    const now = after.filterViews.find((candidate) => candidate.filterViewId === view.filterViewId)
    const label = view.title ?? String(view.filterViewId)
    if (!now) {
      problems.push(`필터 뷰 '${label}' 가 사라졌습니다`)
      continue
    }
    if (filterSpecsKey(view) !== filterSpecsKey(now)) problems.push(`필터 뷰 '${label}' 조건이 바뀌었습니다`)
    if (sortSpecsKey(view) !== sortSpecsKey(now)) problems.push(`필터 뷰 '${label}' 정렬이 바뀌었습니다`)
    const planned = plan.filterViews.find((candidate) => candidate.filterViewId === view.filterViewId)
    if (planned?.after && rangeKey(now.range, after.sheetId ?? -1) !== rangeKey(planned.after, after.sheetId ?? -1)) {
      problems.push(`필터 뷰 '${label}' 범위가 ${gridRangeA1(now.range)} 입니다(기대 ${gridRangeA1(planned.after)})`)
    }
  }
  return problems
}

/* ── 미리보기 출력용 요약 ─────────────────────────────────── */

/** 요청을 한 줄씩 사람이 읽는 꼴로. 행 ID 값 목록은 줄여서 보인다. */
export function describeRowIdRequests(requests: SheetsRequest[]): string[] {
  return requests.map((request) => {
    if (request.appendDimension) return `appendDimension COLUMNS +${request.appendDimension.length}`
    if (request.updateDimensionProperties) {
      const range = request.updateDimensionProperties.range
      return `updateDimensionProperties ${colToA1(range?.startIndex ?? 0)} 열 숨김(hiddenByUser)`
    }
    if (request.updateCells) {
      const start = request.updateCells.start
      const count = request.updateCells.rows?.length ?? 0
      const col = colToA1(start?.columnIndex ?? 0)
      const first = (start?.rowIndex ?? 0) + 1
      if (first === HEADER_ROW_INDEX + 1) return `updateCells ${col}${first} = "${request.updateCells.rows?.[0]?.values?.[0]?.userEnteredValue?.stringValue ?? ""}"`
      return `updateCells ${col}${first}:${col}${first + count - 1} — 새 행 ID ${count}칸`
    }
    if (request.setBasicFilter) {
      const filter = request.setBasicFilter.filter
      return `setBasicFilter ${gridRangeA1(filter?.range)} — filterSpecs ${filter?.filterSpecs?.length ?? 0}개 · sortSpecs ${filter?.sortSpecs?.length ?? 0}개 그대로`
    }
    if (request.updateFilterView) {
      const filter = request.updateFilterView.filter
      return `updateFilterView #${filter?.filterViewId} → ${gridRangeA1(filter?.range)} (fields ${request.updateFilterView.fields})`
    }
    return `알 수 없는 요청 ${Object.keys(request).join(",")}`
  })
}

/** 미리보기 JSON — 구조 요청은 그대로, 행 ID 칸 목록은 개수로 줄인다. */
export function rowIdRequestsSummaryJson(requests: SheetsRequest[]): unknown[] {
  return requests.map((request) => {
    const update = request.updateCells
    if (!update || (update.start?.rowIndex ?? 0) === HEADER_ROW_INDEX) return request
    const rows = update.rows ?? []
    const ids = rows.map((row) => row.values?.[0]?.userEnteredValue?.stringValue ?? "")
    return {
      updateCells: {
        start: update.start,
        fields: update.fields,
        rows: `${rows.length}칸 stringValue(${ids[0] ?? ""}${ids.length > 1 ? ` … ${ids[ids.length - 1]}` : ""})`,
      },
    }
  })
}

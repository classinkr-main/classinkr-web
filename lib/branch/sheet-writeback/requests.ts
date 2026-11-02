// 계획 → Sheets batchUpdate 요청, 그리고 보내기 전 허용 목록 검사 — 순수 모듈.
//
// 보내는 요청은 updateCells 하나뿐이고, 한 요청이 칸 하나(행 1·열 1)만 덮는다. fields 는 세 가지만 쓴다:
//   값+색 · 값만 · 색만. 색은 foregroundColor 와 foregroundColorStyle.rgbColor 에 같은 rgb 를 싣는다
//   (구글은 Style 쪽을 우선하므로 둘을 같이 써야 옛 색이 남지 않는다).
// assertRequestsAllowed 는 sheets-client 가 보내기 직전에 다시 부른다 — 계획 코드에 버그가 있어도
// 속성 칸·수식 칸·1~2행·다른 탭으로는 한 글자도 나가지 않게 하는 마지막 문이다.

import { rgbForWeekColor, type WeekColor } from "./colors"
import { allowedWeekCols, type RevLayout } from "./layout"
import type { WriteDraftPlan } from "./plan"

export const FIELDS_VALUE_AND_COLOR =
  "userEnteredValue,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.foregroundColorStyle"
export const FIELDS_VALUE_ONLY = "userEnteredValue"
export const FIELDS_COLOR_ONLY =
  "userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.foregroundColorStyle"

const ALLOWED_FIELDS = new Set([FIELDS_VALUE_AND_COLOR, FIELDS_VALUE_ONLY, FIELDS_COLOR_ONLY])
const FIRST_WRITABLE_ROW_INDEX = 2 // 3행부터(1행 합계·2행 머리는 금지)

export interface CellWrite {
  row: number
  col: number
  /** 쓸 값. null + writeValue = 칸 비우기(되돌리기 전용 — assert 의 allowClear 가 있어야 통과). */
  value: number | null
  color: WeekColor | null
  writeValue: boolean
  writeColor: boolean
}

export function buildCellUpdateRequest(cell: CellWrite, sheetId: number): unknown {
  const fields = cell.writeValue && cell.writeColor
    ? FIELDS_VALUE_AND_COLOR
    : cell.writeValue
      ? FIELDS_VALUE_ONLY
      : FIELDS_COLOR_ONLY
  const data: Record<string, unknown> = {}
  if (cell.writeValue && cell.value != null) data.userEnteredValue = { numberValue: cell.value }
  if (cell.writeColor) {
    const rgb = rgbForWeekColor(cell.color ?? "k")
    data.userEnteredFormat = { textFormat: { foregroundColor: { ...rgb }, foregroundColorStyle: { rgbColor: { ...rgb } } } }
  }
  return {
    updateCells: {
      range: {
        sheetId,
        startRowIndex: cell.row,
        endRowIndex: cell.row + 1,
        startColumnIndex: cell.col,
        endColumnIndex: cell.col + 1,
      },
      rows: [{ values: [data] }],
      fields,
    },
  }
}

export function buildUpdateCellsRequests(plans: WriteDraftPlan[], sheetId: number): unknown[] {
  const requests: unknown[] = []
  for (const plan of plans) {
    for (const cell of plan.cells) {
      if (!cell.writeValue && !cell.writeColor) continue
      requests.push(
        buildCellUpdateRequest(
          {
            row: cell.row,
            col: cell.col,
            value: cell.after.value,
            color: cell.after.color,
            writeValue: cell.writeValue,
            writeColor: cell.writeColor,
          },
          sheetId,
        ),
      )
    }
  }
  return requests
}

function notAllowed(): never {
  throw new Error("not_allowed")
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function onlyKeys(v: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(v).every((key) => keys.includes(key))
}

function isUnitNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1
}

function isRgb(v: unknown): boolean {
  return isPlainObject(v) && onlyKeys(v, ["red", "green", "blue"]) && Object.values(v).every(isUnitNumber)
}

function checkColorFormat(format: unknown) {
  if (!isPlainObject(format) || !onlyKeys(format, ["textFormat"])) notAllowed()
  const textFormat = format.textFormat
  if (!isPlainObject(textFormat) || !onlyKeys(textFormat, ["foregroundColor", "foregroundColorStyle"])) notAllowed()
  if (!isRgb(textFormat.foregroundColor)) notAllowed()
  const style = textFormat.foregroundColorStyle
  if (!isPlainObject(style) || !onlyKeys(style, ["rgbColor"]) || !isRgb(style.rgbColor)) notAllowed()
}

export function assertRequestsAllowed(
  requests: unknown[],
  layout: RevLayout,
  sheetId: number,
  opts: { allowClear?: boolean } = {},
): void {
  if (!Array.isArray(requests)) notAllowed()
  const weekCols = allowedWeekCols(layout)
  for (const request of requests) {
    if (!isPlainObject(request) || !onlyKeys(request, ["updateCells"])) notAllowed()
    const update = request.updateCells
    if (!isPlainObject(update) || !onlyKeys(update, ["range", "rows", "fields"])) notAllowed()

    const range = update.range
    if (!isPlainObject(range) || !onlyKeys(range, ["sheetId", "startRowIndex", "endRowIndex", "startColumnIndex", "endColumnIndex"])) {
      notAllowed()
    }
    const { startRowIndex, endRowIndex, startColumnIndex, endColumnIndex } = range
    if (range.sheetId !== sheetId) notAllowed()
    if (!Number.isSafeInteger(startRowIndex) || (startRowIndex as number) < FIRST_WRITABLE_ROW_INDEX) notAllowed()
    if (endRowIndex !== (startRowIndex as number) + 1) notAllowed()
    if (!Number.isSafeInteger(startColumnIndex) || !weekCols.has(startColumnIndex as number)) notAllowed()
    if (endColumnIndex !== (startColumnIndex as number) + 1) notAllowed()

    const fields = update.fields
    if (typeof fields !== "string" || !ALLOWED_FIELDS.has(fields)) notAllowed()

    const rows = update.rows
    if (!Array.isArray(rows) || rows.length !== 1) notAllowed()
    const rowData = rows[0]
    if (!isPlainObject(rowData) || !onlyKeys(rowData, ["values"]) || !Array.isArray(rowData.values) || rowData.values.length !== 1) {
      notAllowed()
    }
    const cell = rowData.values[0]
    if (!isPlainObject(cell) || !onlyKeys(cell, ["userEnteredValue", "userEnteredFormat"])) notAllowed()

    const writesValue = fields === FIELDS_VALUE_ONLY || fields === FIELDS_VALUE_AND_COLOR
    const writesColor = fields === FIELDS_COLOR_ONLY || fields === FIELDS_VALUE_AND_COLOR

    if (writesValue) {
      if (cell.userEnteredValue === undefined) {
        // 값 없이 userEnteredValue 를 고치면 칸이 비워진다 — 되돌리기 전용.
        if (!opts.allowClear) notAllowed()
      } else {
        const value = cell.userEnteredValue
        if (!isPlainObject(value) || !onlyKeys(value, ["numberValue"])) notAllowed()
        const numberValue = value.numberValue
        if (typeof numberValue !== "number" || !Number.isSafeInteger(numberValue) || numberValue < 0) notAllowed()
      }
    } else if (cell.userEnteredValue !== undefined) {
      notAllowed()
    }

    if (writesColor) checkColorFormat(cell.userEnteredFormat)
    else if (cell.userEnteredFormat !== undefined) notAllowed()
  }
}

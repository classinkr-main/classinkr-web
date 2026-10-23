// 초안을 만들 때 본 시트 칸(baseline) — 순수 모듈(클라이언트 겸용 — server-only 금지).
//
// 클라이언트가 초안을 만들 때 sourceSnapshot.sheetBaseline 에 싣는다. 반영 직전에 서버가 시트를 다시
// 읽어 그 달 주차 칸의 값·색이 이 baseline 과 같을 때만 쓴다(같지 않으면 conflict — 시트 우선).
// 값 없는 칸의 색은 보이지 않으므로 baseline 에는 'k' 로 담고, 비교·쓰기 때는 live 색을 본다.

import { isWeekColor, type WeekColor } from "./colors"
import { isValidRowId } from "./row-id"

export interface SheetBaselineV1 {
  v: 1
  /** 행의 raw.rowId (형식 맞을 때만), 없으면 null */
  rowId: string | null
  sheetRow: number | null
  /** A열 원문(trim) */
  customer: string
  /** "YYYY-MM" */
  month: string
  /** 그 달 주차 칸 순서대로(4~5칸). 값 없는 칸 value 0. 그 달에 값이 없던 행은 [](서버가 live 로 칸 수를 정한다). */
  weeks: Array<{ value: number; color: WeekColor }>
  /** ISO */
  capturedAt: string
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_WEEKS = 5

function isWeekValue(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
}

function isIsoTimestamp(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 40 && !Number.isNaN(Date.parse(v))
}

/**
 * 파이프라인(computations/pipeline.ts normalizedWeeklyPayments)은 weeklyPayments 를 늘 5칸으로 채워 보낸다.
 * 칸이 4개인 달(2월)은 시트 칸 수와 달라 서버 비교(plan.ts sameWeeks)가 길이에서 어긋나 늘 conflict 가 된다.
 * weeklyColors[month] 의 글자 수가 그 달 실제 주차 칸 수(parseRev 가 머리로 찾은 열)이므로, 그보다 긴 배열의
 * 뒤가 전부 0(채운 칸)일 때만 그 길이로 자른다. 뒤에 값이 있으면 자르지 않는다 — 서버가 conflict 로 막는다(안전 쪽).
 */
function trimToSheetWeeks(rawWeeks: unknown[], colors: string): unknown[] {
  // 글자가 없으면(재동기화 전 레거시 행) 0칸으로 본다 — 값이 전부 0이면 []("값 없던 달", 칸 수는 서버가 live 로),
  // 값이 있으면 그대로(칸 수를 모른다 — 서버가 conflict 로 막는다).
  const sheetWeekCount = colors.length
  if (sheetWeekCount >= rawWeeks.length) return rawWeeks
  const padded = rawWeeks.slice(sheetWeekCount)
  return padded.every((raw) => Number(raw) === 0) ? rawWeeks.slice(0, sheetWeekCount) : rawWeeks
}

export function buildSheetBaseline(
  row: {
    rowId?: string | null
    sheetRow?: number | null
    customer: string
    weeklyPayments?: Record<string, number[]>
    weeklyColors?: Record<string, string>
  },
  month: string,
  capturedAt: string,
): SheetBaselineV1 | null {
  if (!MONTH_RE.test(month) || !isIsoTimestamp(capturedAt)) return null
  const customer = typeof row.customer === "string" ? row.customer.trim() : ""
  if (!customer) return null

  const rawWeeks = row.weeklyPayments?.[month]
  let weeks: SheetBaselineV1["weeks"] = []
  if (rawWeeks != null) {
    if (!Array.isArray(rawWeeks) || rawWeeks.length > MAX_WEEKS) return null
    const colors = row.weeklyColors?.[month] ?? ""
    weeks = []
    for (const [index, raw] of trimToSheetWeeks(rawWeeks, colors).entries()) {
      const value = Number(raw)
      if (!isWeekValue(value)) return null
      const mark = colors[index]
      // '-'(값 없는 칸)·글자 없음은 'k' — 빈 칸의 숨은 색은 쓰기 때 live 로 판정한다.
      const color: WeekColor = value > 0 && isWeekColor(mark) ? mark : "k"
      weeks.push({ value, color })
    }
  }

  const sheetRow = typeof row.sheetRow === "number" && Number.isSafeInteger(row.sheetRow) && row.sheetRow > 0
    ? row.sheetRow
    : null

  return {
    v: 1,
    rowId: isValidRowId(row.rowId) ? row.rowId : null,
    sheetRow,
    customer,
    month,
    weeks,
    capturedAt,
  }
}

/** 형식이 하나라도 틀리면 null. 통과하면 정규화한 새 객체. */
export function parseSheetBaseline(v: unknown): SheetBaselineV1 | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const raw = v as Record<string, unknown>
  if (raw.v !== 1) return null
  if (raw.rowId !== null && !isValidRowId(raw.rowId)) return null
  if (
    raw.sheetRow !== null &&
    !(typeof raw.sheetRow === "number" && Number.isSafeInteger(raw.sheetRow) && raw.sheetRow > 0)
  ) {
    return null
  }
  if (typeof raw.customer !== "string" || !raw.customer.trim()) return null
  if (typeof raw.month !== "string" || !MONTH_RE.test(raw.month)) return null
  if (!isIsoTimestamp(raw.capturedAt)) return null
  if (!Array.isArray(raw.weeks) || raw.weeks.length > MAX_WEEKS) return null

  const weeks: SheetBaselineV1["weeks"] = []
  for (const week of raw.weeks) {
    if (!week || typeof week !== "object" || Array.isArray(week)) return null
    const { value, color } = week as Record<string, unknown>
    if (!isWeekValue(value) || !isWeekColor(color)) return null
    weeks.push({ value, color })
  }

  return {
    v: 1,
    rowId: raw.rowId as string | null,
    sheetRow: raw.sheetRow as number | null,
    customer: raw.customer.trim(),
    month: raw.month,
    weeks,
    capturedAt: raw.capturedAt,
  }
}

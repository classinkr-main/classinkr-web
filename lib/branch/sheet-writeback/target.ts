// 초안 하나를 그 달 주차 칸 쓰기로 바꾸는 규칙 — 순수 모듈(클라이언트 겸용: 칸 아래 힌트도 이 함수).
//
// 결정(계약서 0절):
//  - 쓰는 것은 기존 행의 주차 칸 금액·확도 글자색뿐. 칸 비우기·달 삭제는 하지 않는다.
//  - 지난 주차는 손대지 않는다: 쓰는 칸의 시작일(1·8·15·22·29일)이 이번 주차 시작일보다 앞이면 거절.
//  - 월 칸 수정(주차 없음): 값 있는 주차 1칸 → 그 칸, 0칸 → 첫 결제일 주차 → 이번 달이면 오늘 주차 → w1,
//    2칸 이상 + 금액 변경 → 거절(week_ambiguous). 확도만 바꾸면 값 있는 칸 전부를 그 색으로.
//  - 빈 칸에 새로 쓸 때는 색을 반드시 명시한다(빈 칸에도 빨강·파랑이 숨어 있다).
// 주차 시작일 규칙은 parsers/rev.ts ledgerCellStart 와 같다(w1 1일 · w2 8일 · w3 15일 · w4 22일 · w5 29일).

import { weekColorForConfidence, type DraftConfidenceLike, type WeekColor } from "./colors"
import { SHEET_WRITE_MESSAGES } from "./messages"

export type WriteRefusal =
  | "past_week"
  | "week_ambiguous"
  | "clear_not_supported"
  | "amount_invalid"
  | "no_row_id"
  | "no_baseline"
  | "month_not_in_sheet"

export interface WeekWrite {
  weekIndex: number
  /** null = 값 그대로(색만) */
  value: number | null
  /** null = 색 그대로 */
  color: WeekColor | null
}

export interface PlanWeekWritesInput {
  month: string
  /** 그 달 주차 칸 순서대로(4~5칸). 쓰기 직전 live 로 대체 가능. */
  baselineWeeks: Array<{ value: number; color: WeekColor }>
  /** 초안 month 금액(합) */
  draftAmount: number
  /** metadata.weekly(5칸) — 있으면 주차 단위 */
  draftWeekly: number[] | null
  draftConfidence: DraftConfidenceLike
  draftWeeklyConfidence: Array<DraftConfidenceLike | null> | null
  confidenceTouched: boolean
  /** YYYY-MM-DD */
  firstPayment: string | null
  /** KST YYYY-MM-DD */
  today: string
}

export type PlanWeekWritesResult =
  | { ok: true; writes: WeekWrite[]; note: string }
  | { ok: false; refusal: WriteRefusal }

const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/
const YMD_RE = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/

function dayOf(ymd: string): number | null {
  const match = YMD_RE.exec(ymd)
  if (!match) return null
  const day = Number(match[3])
  return day >= 1 && day <= 31 ? day : null
}

function weekIndexOfDay(day: number): number {
  return Math.min(Math.floor((day - 1) / 7), 4)
}

/** 오늘이 든 주차 칸 시작일(1·8·15·22·29). */
export function currentWeekStart(today: string): string {
  const day = dayOf(today)
  if (day == null) throw new Error(`currentWeekStart: 날짜 형식 오류 ${today}`)
  const start = 1 + 7 * weekIndexOfDay(day)
  return `${today.slice(0, 7)}-${String(start).padStart(2, "0")}`
}

/** weekIndex 0-based — w1 1일, w2 8일, w3 15일, w4 22일, w5 29일. */
export function weekStartOf(ym: string, weekIndex: number): string {
  const day = 1 + 7 * Math.max(0, Math.floor(weekIndex))
  return `${ym}-${String(day).padStart(2, "0")}`
}

/**
 * 칸 수가 4개인 달(2월)은 마지막 칸이 22일~말일을 맡는다 — 그 달 29일에 "이번 주차"는 w4 다.
 * 그래서 오늘이 든 칸은 그 달 칸 수로 잘라서 정한다.
 */
function isPastWeekCell(month: string, weekIndex: number, weekCount: number, today: string): boolean {
  const start = weekStartOf(month, weekIndex)
  const current = currentWeekStart(today)
  if (start >= current) return false
  if (today.slice(0, 7) === month && weekIndex === weekCount - 1) {
    const day = dayOf(today)
    if (day != null && weekIndexOfDay(day) >= weekCount - 1) return false
  }
  return true
}

function isWriteAmount(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0
}

function isWeekAmount(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0
}

/** 값 없는 달에 금액을 넣을 주차 — 첫 결제일 주차 → (이번 달이면) 오늘 주차 → w1. 칸 수로 자른다. */
function pickEmptyMonthWeek(month: string, weekCount: number, firstPayment: string | null, today: string): number {
  const clamp = (index: number) => Math.min(index, weekCount - 1)
  if (firstPayment && firstPayment.slice(0, 7) === month) {
    const day = dayOf(firstPayment)
    if (day != null) return clamp(weekIndexOfDay(day))
  }
  if (today.slice(0, 7) === month) {
    const day = dayOf(today)
    if (day != null) return clamp(weekIndexOfDay(day))
  }
  return 0
}

function weekLabel(index: number): string {
  return `W${index + 1}`
}

function noteFor(writes: WeekWrite[]): string {
  if (writes.length === 0) return "시트에서 바뀌는 칸이 없습니다 — 장부에만 기록됩니다"
  if (writes.every((write) => write.value == null)) return `값 있는 주차 ${writes.length}칸의 색을 바꿉니다`
  return `시트 ${writes.map((write) => weekLabel(write.weekIndex)).join("·")}에 씁니다`
}

export function planWeekWrites(input: PlanWeekWritesInput): PlanWeekWritesResult {
  const { month, baselineWeeks, today } = input
  if (!YM_RE.test(month) || dayOf(today) == null) return { ok: false, refusal: "month_not_in_sheet" }
  const weekCount = baselineWeeks.length
  if (weekCount === 0) return { ok: false, refusal: "month_not_in_sheet" }
  if (baselineWeeks.some((week) => !isWeekAmount(week.value))) return { ok: false, refusal: "amount_invalid" }

  const writes: WeekWrite[] = []
  const draftColor = weekColorForConfidence(input.draftConfidence)

  if (input.draftWeekly) {
    // 주차 단위 초안. 칸이 4개인 달에 w5 값이 오면 마지막 칸으로 합친다(0절 4의 "마지막 칸으로 자른다").
    const weekly = input.draftWeekly
    if (weekly.some((value) => !isWeekAmount(value))) return { ok: false, refusal: "amount_invalid" }
    const next = baselineWeeks.map((_, index) => weekly[index] ?? 0)
    for (let index = weekCount; index < weekly.length; index += 1) next[weekCount - 1] += weekly[index] ?? 0
    if (!next.every(isWeekAmount)) return { ok: false, refusal: "amount_invalid" }

    for (let index = 0; index < weekCount; index += 1) {
      const before = baselineWeeks[index]
      const after = next[index]
      if (after === 0 && before.value > 0) return { ok: false, refusal: "clear_not_supported" }
      const valueChanged = after !== before.value
      let color: WeekColor | null = null
      const chosen = input.draftWeeklyConfidence?.[index] ?? null
      if (input.confidenceTouched && chosen && after > 0) color = weekColorForConfidence(chosen)
      else if (before.value === 0 && after > 0) color = draftColor
      // 색이 이미 그 색이고 값도 그대로면 쓸 것이 없다. 빈 칸에 새로 쓰는 경우는 색을 늘 싣는다.
      if (!valueChanged && (color == null || color === before.color)) continue
      writes.push({ weekIndex: index, value: valueChanged ? after : null, color })
    }
  } else {
    // 월 칸 수정 — 금액은 양의 정수만(달 삭제 불가).
    if (!isWriteAmount(input.draftAmount)) return { ok: false, refusal: "amount_invalid" }
    const total = baselineWeeks.reduce((sum, week) => sum + week.value, 0)
    const valued = baselineWeeks.flatMap((week, index) => (week.value > 0 ? [index] : []))

    if (input.draftAmount === total) {
      if (input.confidenceTouched) {
        for (const index of valued) {
          if (baselineWeeks[index].color === draftColor) continue
          writes.push({ weekIndex: index, value: null, color: draftColor })
        }
      }
    } else if (valued.length === 1) {
      writes.push({ weekIndex: valued[0], value: input.draftAmount, color: input.confidenceTouched ? draftColor : null })
    } else if (valued.length === 0) {
      const index = pickEmptyMonthWeek(month, weekCount, input.firstPayment, today)
      writes.push({ weekIndex: index, value: input.draftAmount, color: draftColor })
    } else {
      return { ok: false, refusal: "week_ambiguous" }
    }
  }

  if (writes.some((write) => isPastWeekCell(month, write.weekIndex, weekCount, today))) {
    return { ok: false, refusal: "past_week" }
  }
  return { ok: true, writes, note: noteFor(writes) }
}

/** 칸 아래 한 줄 힌트. 거절이면 block(저장을 막는다), 아니면 info. */
export function sheetWriteHint(input: PlanWeekWritesInput): { tone: "info" | "block"; text: string } {
  const result = planWeekWrites(input)
  if (!result.ok) return { tone: "block", text: SHEET_WRITE_MESSAGES[result.refusal] }
  return { tone: "info", text: result.note }
}

// 초안 하나를 그 달 주차 칸 쓰기로 바꾸는 규칙 — 순수 모듈(클라이언트 겸용: 칸 아래 힌트도 이 함수).
//
// 결정(계약서 0절):
//  - 쓰는 것은 기존 행의 주차 칸 금액·확도 글자색뿐. 칸 비우기·달 삭제는 하지 않는다.
//  - 지난 주차: 쓰는 칸의 시작일(1·8·15·22·29일)이 이번 주차 시작일보다 앞이면 금액은 거절한다. 이번 달의 지난 주는
//    확도 글자색만 바꿀 수 있다(결제가 들어온 뒤 확정 처리 — 2026-10-23 사용자 결정). 지난 달 이전은 색도 거절.
//  - 월 칸 수정(주차 없음): 값 있는 주차 1칸 → 그 칸, 0칸 → 첫 결제일 주차 → 이번 달이면 오늘 주차 → w1,
//    2칸 이상 + 금액 변경 → 거절(week_ambiguous). 확도만 바꾸면 값 있는 칸 전부를 그 색으로.
//  - 주차 칸 하나를 가리킨 초안(metadata.week "w1".."w5", weekly 없음 — 매트릭스 주차 칸·레일의 주차 고르기):
//    빈 달이면 그 주차에 쓴다(장부도 그 주차에 둔다). 값 있는 칸이 다른 주차 1칸이면 장부는 그 달 값을 고른 주차로
//    옮기므로 시트도 원래 칸을 비워야 한다 → 거절(clear_not_supported).
//  - 빈 칸에 새로 쓸 때는 색을 반드시 명시한다(빈 칸에도 빨강·파랑이 숨어 있다).
//  - 값 있는 칸의 색은 사용자가 그 칸(주차 단위면 그 주차)의 확도를 직접 바꿨을 때만 쓴다(confidenceTouched·
//    weeklyConfidenceTouched). 화면이 채운 시드 확도는 시트 글자색과 다를 수 있다(미래 주차 빨강은 앱에서 '예정').
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
  /**
   * 주차 단위 초안에서 주차별로 확도를 직접 골랐는지(metadata.weeklyConfidenceTouched, 5칸). 주차 단위 초안의 칸 색은
   * confidenceTouched 이고 그 주차가 여기서 true 일 때만 쓴다. 없으면 초안이 가리킨 주차(draftWeek — 매트릭스 주차 칸)만
   * 고른 것으로 본다 — 손대지 않은 주차의 글자색을 시드 확도로 덮지 않는다(빈 칸에 새로 쓰는 칸은 예외: 색을 늘 싣는다).
   */
  draftWeeklyConfidenceTouched?: boolean[] | null
  /** YYYY-MM-DD */
  firstPayment: string | null
  /** KST YYYY-MM-DD */
  today: string
  /**
   * 초안이 가리킨 주차(metadata.week "w1".."w5" → 0-based). 월 칸 수정이면 null·생략.
   * weekly 가 있으면(주차 단위 초안) 금액 칸 고르기에는 쓰지 않고, 주차별 확도 표시가 없을 때 "확도를 고른 주차"로만 본다.
   * 칸이 4개인 달은 마지막 칸으로 자른다.
   */
  draftWeek?: number | null
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
    // 첫 결제 주차가 이미 지났으면 금액을 쓸 수 없으니 이번 주차로 넘긴다.
    if (day != null && !isPastWeekCell(month, clamp(weekIndexOfDay(day)), weekCount, today)) return clamp(weekIndexOfDay(day))
  }
  if (today.slice(0, 7) === month) {
    const day = dayOf(today)
    if (day != null) return clamp(weekIndexOfDay(day))
  }
  return 0
}

/** 초안이 가리킨 주차(0-based) — 0~4 정수만. 칸 수를 넘으면(4칸 달의 w5) 마지막 칸. */
function pickedWeekIndex(draftWeek: number | null | undefined, weekCount: number): number | null {
  if (draftWeek == null || !Number.isInteger(draftWeek) || draftWeek < 0 || draftWeek > 4) return null
  return Math.min(draftWeek, weekCount - 1)
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

    const touchedWeeks = input.draftWeeklyConfidenceTouched ?? null
    const pickedWeek = pickedWeekIndex(input.draftWeek, weekCount)
    const touchedAt = (index: number): boolean => {
      if (!input.confidenceTouched) return false
      if (!touchedWeeks) return pickedWeek === index
      if (touchedWeeks[index] === true) return true
      // 칸이 4개인 달은 w5 가 마지막 칸으로 합쳐진다 — 그 표시도 마지막 칸의 것으로 본다.
      return index === weekCount - 1 && touchedWeeks.slice(weekCount).some((value) => value === true)
    }

    for (let index = 0; index < weekCount; index += 1) {
      const before = baselineWeeks[index]
      const after = next[index]
      if (after === 0 && before.value > 0) return { ok: false, refusal: "clear_not_supported" }
      const valueChanged = after !== before.value
      let color: WeekColor | null = null
      const chosen = input.draftWeeklyConfidence?.[index] ?? null
      if (touchedAt(index) && chosen && after > 0) color = weekColorForConfidence(chosen)
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
    const pickedWeek = pickedWeekIndex(input.draftWeek, weekCount)

    if (input.draftAmount === total) {
      // 고른 주차가 값 있는 칸 하나와 같지 않으면 장부는 그 달 금액을 고른 주차로 옮긴다 — 시트는 원래 칸을 비워야
      // 하므로 금액이 같아도 쓰지 않는다(금액이 다른 아래 갈래와 같은 판정).
      if (pickedWeek != null && !(valued.length === 1 && valued[0] === pickedWeek)) {
        return { ok: false, refusal: "clear_not_supported" }
      }
      if (input.confidenceTouched) {
        for (const index of valued) {
          if (baselineWeeks[index].color === draftColor) continue
          writes.push({ weekIndex: index, value: null, color: draftColor })
        }
      }
    } else if (valued.length === 1) {
      // 고른 주차가 값 있는 칸과 다르면 장부는 금액을 고른 주차로 옮긴다 — 시트는 원래 칸을 비워야 하므로 쓰지 않는다.
      if (pickedWeek != null && pickedWeek !== valued[0]) return { ok: false, refusal: "clear_not_supported" }
      writes.push({ weekIndex: valued[0], value: input.draftAmount, color: input.confidenceTouched ? draftColor : null })
    } else if (valued.length === 0) {
      const index = pickedWeek ?? pickEmptyMonthWeek(month, weekCount, input.firstPayment, today)
      writes.push({ weekIndex: index, value: input.draftAmount, color: draftColor })
    } else {
      return { ok: false, refusal: "week_ambiguous" }
    }
  }

  // 지난 칸은 이번 달의 색만 바꾸기만 허용한다. 금액이 바뀌는 칸, 지난 달 이전 칸은 하나라도 있으면 전부 거절.
  const thisMonth = today.slice(0, 7) === month
  if (writes.some((write) => isPastWeekCell(month, write.weekIndex, weekCount, today) && !(thisMonth && write.value == null))) {
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

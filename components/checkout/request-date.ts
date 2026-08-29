/**
 * request-date.ts — 도입 신청 "희망 날짜" 캘린더의 날짜 로직.
 *
 * 의존성 추가 없이(react-day-picker/dayjs 미설치) 월 그리드를 직접 그리기 위한 순수 함수 모음.
 * UI(DesiredDateCalendar)는 여기서 계산된 셀만 렌더한다 — 렌더 코드에 날짜 산술을 두지 않는다.
 *
 * 기준 시각은 KST 다. 서버/브라우저 TZ 가 무엇이든 "오늘"은 `lib/business-time` 의
 * KST 벽시계 날짜를 쓰고, 날짜 산술은 UTC 정오가 아닌 UTC 자정 기준 Date 로만 한다
 * (로컬 TZ 로 Date 를 만들면 UTC-x 지역에서 하루가 밀린다).
 */

import { getBusinessDateParts } from "@/lib/business-time"

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const

/** 신청 가능한 최대 앞당김 폭(일). 설치 일정 협의 범위를 넘는 날짜 선택을 막는다. */
export const MAX_DESIRED_DATE_ADVANCE_DAYS = 180

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/

export interface YearMonth {
  year: number
  /** 1~12 (달력 표기 그대로. Date 의 0-based month 아님) */
  month: number
}

export interface MonthCell {
  iso: string
  day: number
  /** 그리드 앞뒤를 채우는 이웃 달 셀이면 false */
  inMonth: boolean
  /** 0=일 … 6=토 */
  weekday: number
}

/**
 * 희망 날짜 선택 가능 범위.
 *
 * `disabledIsoDates` 는 min~max 범위 안이지만 개별로 선택 불가인 날짜 집합이다 — 쇼룸
 * 예약(`/showroom`)의 주말·공휴일·마감된 날짜를 막는 데 쓴다. 선택적 필드라 안 넘기면
 * (undefined) 기존 `/checkout` 호출부와 완전히 동일하게 동작한다 — 하위 호환을 위해
 * 필드를 "추가"만 했다.
 */
export interface DesiredDateRange {
  minIso: string
  maxIso: string
  /** 조회를 O(1)로 하기 위해 Set 을 받는다. 렌더마다 새 Set 을 만들지 않는 건 호출자 책임이다. */
  disabledIsoDates?: ReadonlySet<string>
}

function pad2(value: number) {
  return value.toString().padStart(2, "0")
}

/** 'YYYY-MM-DD' → {year, month, day}. 형식·실재하지 않는 날짜(2026-02-30)는 null. */
export function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_REGEX.exec(iso)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  // 롤오버 검사 — Date.UTC 는 2026-02-30 을 3월 2일로 조용히 넘긴다.
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

export function isValidIsoDate(iso: string): boolean {
  return parseIsoDate(iso) !== null
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${pad2(month)}-${pad2(day)}`
}

function toUtcDate(iso: string): Date | null {
  const parts = parseIsoDate(iso)
  if (!parts) return null
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

/** ISO 날짜에 일수를 더한다. 파싱 불가한 값은 원문 유지. */
export function addDays(iso: string, delta: number): string {
  const date = toUtcDate(iso)
  if (!date) return iso
  date.setUTCDate(date.getUTCDate() + delta)
  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/** 0=일 … 6=토. 파싱 불가한 값은 -1. */
export function getWeekday(iso: string): number {
  const date = toUtcDate(iso)
  return date ? date.getUTCDay() : -1
}

/** KST 기준 오늘('YYYY-MM-DD'). */
export function getKstToday(now: Date = new Date()): string {
  return getBusinessDateParts(now).date
}

/** 선택 가능한 최소 날짜 — 오늘 이전은 비활성, 최소 내일부터. */
export function getMinDesiredDate(todayIso: string): string {
  return addDays(todayIso, 1)
}

/** 선택 가능한 최대 날짜. */
export function getMaxDesiredDate(todayIso: string): string {
  return addDays(todayIso, MAX_DESIRED_DATE_ADVANCE_DAYS)
}

/** ISO 날짜는 사전순 비교가 곧 시간순 비교다. */
export function compareIsoDate(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

export function isDesiredDateSelectable(iso: string, range: DesiredDateRange): boolean {
  if (!isValidIsoDate(iso)) return false
  if (compareIsoDate(iso, range.minIso) < 0 || compareIsoDate(iso, range.maxIso) > 0) return false
  // disabledIsoDates 를 안 넘기면(undefined) `?.has(...)` 가 undefined 를 돌려주고
  // `!undefined` 는 true 이므로 위 범위 판정 결과가 그대로 나간다 — 기존 호출부(범위만
  // 넘기던 /checkout)는 이 필드를 몰라도 동작이 1도 바뀌지 않는다.
  return !range.disabledIsoDates?.has(iso)
}

/**
 * 범위를 벗어난 날짜를 경계로 당긴다(키보드 이동이 범위 밖으로 나가지 않게).
 *
 * disabledIsoDates 는 일부러 보지 않는다 — 방향키로 옮긴 곳이 막힌 날짜라도 포커스는
 * 거기로 가게 두고 선택(클릭/Enter/Space)만 막는 게 이 캘린더의 방침이다. 그래야 막힌
 * 날짜가 줄줄이 이어져도(예: 주말 3연휴) 로빙 tabindex 가 건너뛸 대상 없이 계속 움직인다.
 * 실제 선택 차단은 DesiredDateCalendar 의 렌더/onClick 이 isDesiredDateSelectable 로 한다.
 */
export function clampToRange(iso: string, range: { minIso: string; maxIso: string }): string {
  if (!isValidIsoDate(iso)) return range.minIso
  if (compareIsoDate(iso, range.minIso) < 0) return range.minIso
  if (compareIsoDate(iso, range.maxIso) > 0) return range.maxIso
  return iso
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const zeroBased = year * 12 + (month - 1) + delta
  return {
    year: Math.floor(zeroBased / 12),
    month: (((zeroBased % 12) + 12) % 12) + 1,
  }
}

export function getYearMonth(iso: string): YearMonth {
  const parts = parseIsoDate(iso)
  if (!parts) return { year: 1970, month: 1 }
  return { year: parts.year, month: parts.month }
}

export function isSameMonth(iso: string, { year, month }: YearMonth): boolean {
  const parts = parseIsoDate(iso)
  return Boolean(parts && parts.year === year && parts.month === month)
}

/**
 * 6주 × 7열 월 그리드. 항상 일요일 시작이고 42칸 고정이라 달마다 높이가 튀지 않는다.
 * 앞뒤 이웃 달 셀도 실제 날짜(iso)를 갖는다 — 범위 안이면 선택 가능하게 둔다.
 */
export function buildMonthGrid({ year, month }: YearMonth): MonthCell[][] {
  const firstIso = toIsoDate(year, month, 1)
  const gridStart = addDays(firstIso, -getWeekday(firstIso))

  const weeks: MonthCell[][] = []
  for (let week = 0; week < 6; week += 1) {
    const cells: MonthCell[] = []
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const iso = addDays(gridStart, week * 7 + dayOfWeek)
      const parts = parseIsoDate(iso)
      cells.push({
        iso,
        day: parts?.day ?? 0,
        inMonth: parts?.year === year && parts?.month === month,
        weekday: dayOfWeek,
      })
    }
    weeks.push(cells)
  }
  return weeks
}

/** "2026년 7월" */
export function formatMonthLabel({ year, month }: YearMonth): string {
  return `${year}년 ${month}월`
}

/** "2026년 7월 28일 (화)" — 파싱 불가한 값은 원문 유지. */
export function formatDesiredDateLabel(iso: string): string {
  const parts = parseIsoDate(iso)
  if (!parts) return iso
  const weekday = WEEKDAY_LABELS[getWeekday(iso)] ?? ""
  return `${parts.year}년 ${parts.month}월 ${parts.day}일 (${weekday})`
}

import { getBusinessCalendarParts, getBusinessDateParts } from "@/lib/business-time"

export const FISCAL_MONTH_ORDER = [4,5,6,7,8,9,10,11,12,1,2,3] as const

// '지금(Date) → 달·회계연도·분기' 변환은 KST 영업일 기준이다(F-10). UTC 로 바꾸면 매월 1일 00:00~08:59 KST 에
// 지난달·지난 회계연도로 읽혀 12/1 잠금일·1/1·4/1 아침에 화면이 한 달 늦게 열린다. Asia/Seoul 은 DST 가 없어
// 고정 +09:00 으로 계산한다(getBusinessCalendarParts). Date.UTC(y, m, 1) 로 만든 달 시작(UTC 자정)은 KST 로도 같은 날이라
// YYYY-MM 산술(dateFromYmMonth 등)은 그대로 맞는다.
function businessMonthOf(d: Date): { year: number; month: number } {
  const { year, month } = getBusinessCalendarParts(d)
  return { year, month }
}

/** 날짜(지금)의 회계연도(4월 시작) — KST 영업일 기준. */
export function fyOf(d: Date): number {
  const { year, month } = businessMonthOf(d)
  return month >= 4 ? year : year - 1
}
export function fyStart(d: Date): Date { return new Date(Date.UTC(fyOf(d), 3, 1)) }
export function fiscalQuarter(month: number): 1|2|3|4 {
  if (month >= 4 && month <= 6) return 1
  if (month >= 7 && month <= 9) return 2
  if (month >= 10 && month <= 12) return 3
  return 4
}
export function fiscalMonthIndex(month: number): number {
  return FISCAL_MONTH_ORDER.indexOf(month as 4|5|6|7|8|9|10|11|12|1|2|3)
}
/** 날짜(지금)의 'YYYY-MM' — KST 영업일 기준. */
export function ymKey(d: Date): string {
  const { year, month } = businessMonthOf(d)
  return `${year}-${String(month).padStart(2,"0")}`
}

/** 'YYYY-MM'(또는 'YYYY-MM-DD')의 회계연도 — 시간대 없는 순수 산술. */
export function fiscalYearOfYm(ym: string): number {
  const year = Number(ym.slice(0, 4))
  const month = Number(ym.slice(5, 7))
  return month >= 4 ? year : year - 1
}

/** 지금의 KST 영업월 'YYYY-MM'. */
export function businessYm(now: Date = new Date()): string {
  return getBusinessDateParts(now).month
}
/** 지금의 KST 영업일 회계연도(4월 시작). */
export function businessFy(now: Date = new Date()): number {
  return fiscalYearOfYm(businessYm(now))
}
/** 지금의 KST 영업월이 속한 회계 분기(4~6월 = 1분기). */
export function businessQuarter(now: Date = new Date()): 1|2|3|4 {
  return fiscalQuarter(Number(businessYm(now).slice(5, 7)))
}
/** 회계연도 fy 의 열두 달 — ['fy-04', …, 'fy-12', 'fy+1-01', …, 'fy+1-03']. */
export function fiscalYearMonths(fy: number): string[] {
  return FISCAL_MONTH_ORDER.map((month) => `${month >= 4 ? fy : fy + 1}-${String(month).padStart(2, "0")}`)
}

export function currentFyPeriod(now: Date): { fy: number; quarter: 1|2|3|4; month: string } {
  return { fy: businessFy(now), quarter: businessQuarter(now), month: businessYm(now) }
}

export function parseYmMonth(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text || !/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) return null
  return text
}

export function dateFromYmMonth(ym: string): Date {
  const [year, month] = ym.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}

/**
 * 지금(now)의 KST 영업일을 UTC 자정 Date 로 — 이 값에는 UTC 게터(getUTCMonth·getUTCDate)와 KST 판정(fyOf·ymKey)이
 * 같은 달·같은 날을 돌려준다. 밀리초가 없어 같은 날의 요청은 같은 값을 만든다(캐시 키가 갈리지 않는다, F-50).
 */
export function businessDateAsUtc(now: Date = new Date()): Date {
  const { year, month, day } = getBusinessCalendarParts(now)
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * 기간 기준일. 월(M) + month 면 그 달 1일(UTC 자정). 그 밖에는 fallback(지금)의 KST 영업일(UTC 자정) —
 * 매월 1일 00:00~08:59 KST 에도 이번 달·이번 분기·이번 회계연도로 읽힌다(F-10).
 */
export function resolvePeriodDate(scope: "M" | "Q" | "Y", month: string | null | undefined, fallback = new Date()): Date | null {
  if (scope !== "M" || !month) return businessDateAsUtc(fallback)
  const parsed = parseYmMonth(month)
  return parsed ? dateFromYmMonth(parsed) : null
}

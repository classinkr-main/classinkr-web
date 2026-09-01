/**
 * calendar-range.ts — 어드민 캘린더 페이지의 "기본 진입 뷰"(view=month · anchor=오늘) 기간과
 * 그 기간의 실호출 URL을, 페이지 본체와 AdminSidebar hover 예열이 공유하기 위한 어댑터.
 *
 * adminFetchJsonCached의 캐시 키는 정규화 없는 URL 문자열 그대로다 — 파라미터 이름·순서·
 * 인코딩이 한 글자만 달라도 사이드바 예열이 페이지 실호출과 다른 키를 만들어 100% 미스한다.
 * 그래서 range 산출과 URL 조립을 각각 함수 하나로 못박아 두 소비처가 반드시 같은 경로를
 * 타게 한다. 페이지가 이 기본값과 다른 뷰/기간으로 이동한 뒤의 URL은 buildAdminCalendarUrl만
 * 공유하면 된다 — 사이드바는 진입 케이스만 알면 된다.
 */
import {
  addDays,
  getViewRange,
  startOfWeek,
  toDateString,
  type CalendarRange,
} from "@/lib/admin-calendar/range"

function todayDateString(now: Date): string {
  return toDateString(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function getDefaultAdminCalendarRange(now: Date = new Date()): CalendarRange {
  return getViewRange("month", todayDateString(now))
}

/**
 * 첫 화면 상단 주간 스트립이 쓰는 기간(이번 주 시작 ~ +6일).
 *
 * 페이지가 자체 계산하고 사이드바는 몰라서, 월 범위만 예열되고 스트립은 매 진입 콜드였다.
 * 위 주석의 이유(캐시 키 = URL 문자열 그대로)로 두 소비처가 같은 함수를 타야 한다.
 */
export function getAdminCalendarWeekStripRange(
  todayStr: string = todayDateString(new Date())
): CalendarRange {
  const from = startOfWeek(todayStr)
  return { from, to: addDays(from, 6) }
}

export function buildAdminCalendarUrl(range: CalendarRange): string {
  return `/api/admin/calendar?from=${range.from}&to=${range.to}`
}

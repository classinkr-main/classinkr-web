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
import { getViewRange, toDateString, type CalendarRange } from "@/lib/admin-calendar/range"

export function getDefaultAdminCalendarRange(now: Date = new Date()): CalendarRange {
  const todayStr = toDateString(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return getViewRange("month", todayStr)
}

export function buildAdminCalendarUrl(range: CalendarRange): string {
  return `/api/admin/calendar?from=${range.from}&to=${range.to}`
}

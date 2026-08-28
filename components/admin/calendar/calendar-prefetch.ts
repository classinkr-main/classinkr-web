/**
 * calendar-prefetch.ts — 현재 화면이 보여주는 기간과 "인접한" 기간을 유휴 시간에 데운다.
 *
 * 뷰마다 이동 폭이 다르다(lib/admin-calendar/range.ts의 stepAnchor와 같은 규칙). 다만 이
 * 페이지의 fetchEvents는 view/anchor 가 아니라 실제 조회 구간(from·to)만 의존값으로 잡는다
 * (사이드바 예열이 만든 캐시 키를 그대로 맞히기 위해서 — page.tsx 상단 주석 참고). 프리페치도
 * 같은 이유로 view 문자열을 따로 받지 않고, 이미 계산된 range(from·to)의 모양만으로 뷰 종류를
 * 되짚는다 — 월/목록(같은 모양) · 정확히 7일(주·담당자, 3차 개편에서 담당자 뷰도 1주가 됐다) ·
 * 정확히 55일(8주 타임라인) 세 가지만 알아본다. 그 외 모양은 명세에 없으므로 프리페치하지 않는다.
 */
import {
  addDays,
  addMonths,
  daysBetween,
  endOfMonth,
  startOfMonth,
  type CalendarRange,
} from "@/lib/admin-calendar/range"

/** fetchEvents와 프리페치가 반드시 같은 TTL을 쓰도록 상수 하나로 못박는다. */
export const CALENDAR_EVENTS_CACHE_TTL_MS = 5 * 60_000

/** 정확히 그 달의 1일~말일인가. 월 뷰와 목록(agenda) 뷰가 같은 모양을 쓴다. */
function isFullMonthRange(range: CalendarRange): boolean {
  return range.from === startOfMonth(range.from) && range.to === endOfMonth(range.from)
}

/** 주·담당자 뷰(월~일)의 일수 차이. daysBetween은 포함 경계라 6. */
const WEEK_SPAN_DAYS = 6
/** 8주 타임라인의 일수 차이(56일 - 1). */
const TIMELINE_SPAN_DAYS = 55
/** 타임라인은 절반(4주)씩 겹치며 전진한다 — stepAnchor("timeline", …)와 동일한 폭. */
const TIMELINE_STEP_DAYS = 28

/**
 * 인접 기간을 계산하는 순수 함수. 네트워크·캐시를 모르고 range 문자열만 받아
 * range 문자열만 반환한다.
 *
 * - 월(및 같은 모양의 목록) 범위: 이전 달 + 다음 달
 * - 정확히 7일(주·담당자 뷰 — 이동 폭도 7일로 같다): 이전 주 + 다음 주
 * - 정확히 55일(8주 타임라인): 다음 구간만 — 절반씩 겹치며 전진하는 뷰라 "이전"은
 *   이미 현재 범위 안에 절반 겹쳐 있다
 * - 그 외(명세에 없는 모양): 빈 배열 — 프리페치하지 않는다
 */
export function computeAdjacentPrefetchRanges(range: CalendarRange): CalendarRange[] {
  if (isFullMonthRange(range)) {
    const prevMonthStart = addMonths(range.from, -1)
    const nextMonthStart = addMonths(range.from, 1)
    return [
      { from: prevMonthStart, to: endOfMonth(prevMonthStart) },
      { from: nextMonthStart, to: endOfMonth(nextMonthStart) },
    ]
  }

  const span = daysBetween(range.from, range.to)

  if (span === WEEK_SPAN_DAYS) {
    return [
      { from: addDays(range.from, -7), to: addDays(range.to, -7) },
      { from: addDays(range.from, 7), to: addDays(range.to, 7) },
    ]
  }

  if (span === TIMELINE_SPAN_DAYS) {
    return [{ from: addDays(range.from, TIMELINE_STEP_DAYS), to: addDays(range.to, TIMELINE_STEP_DAYS) }]
  }

  return []
}

interface IdleWindow {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
  setTimeout: (callback: () => void, ms: number) => number
  clearTimeout?: (handle: number) => void
}

/** 예약 취소. 호출부는 항상 최신 예약 하나만 들고 있는다. 이미 실행됐으면 아무 일도 없다. */
export type CancelIdlePrefetch = () => void

const NOOP_CANCEL: CancelIdlePrefetch = () => {}

/**
 * requestIdleCallback가 없으면(사파리 등) 300ms 뒤에 실행 — 현재 렌더 프레임을 방해하지
 * 않는다. SSR/테스트(window 없음) 에서는 그냥 아무것도 하지 않는다.
 *
 * 취소 함수를 돌려주는 이유: 기간을 빠르게 넘기거나 Strict Mode로 effect가 두 번 돌면
 * 성공 콜백마다 idle 콜백이 하나씩 쌓이고, 2초 timeout에 그것들이 한꺼번에 깨어나 이미
 * 지나간 기간까지 요청한다. 호출부가 최신 예약만 남기고 나머지를 취소해야 한다.
 *
 * 탭이 숨겨져 있으면 아예 예약하지 않는다 — 보이지도 않는 화면의 인접 기간을 미리 받을
 * 이유가 없고, 숨은 탭의 idle 콜백은 복귀 시점에 몰려서 깨어난다.
 */
export function scheduleIdlePrefetch(run: () => void): CancelIdlePrefetch {
  if (typeof window === "undefined") return NOOP_CANCEL
  if (typeof document !== "undefined" && document.hidden) return NOOP_CANCEL

  const idleWindow = window as unknown as IdleWindow

  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(run, { timeout: 2_000 })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }

  const handle = idleWindow.setTimeout(run, 300)
  return () => idleWindow.clearTimeout?.(handle)
}

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CALENDAR_EVENTS_CACHE_TTL_MS,
  computeAdjacentPrefetchRanges,
  scheduleIdlePrefetch,
} from "@/components/admin/calendar/calendar-prefetch"
import {
  decodeHiddenSourcesParam,
  encodeHiddenSourcesParam,
} from "@/components/admin/calendar/calendar-hidden-sources-url"
import { getViewRange, stepAnchor } from "@/lib/admin-calendar/range"
import type { EventSource } from "@/lib/calendar-data"

describe("computeAdjacentPrefetchRanges", () => {
  const anchor = "2026-08-05" // 수요일

  it("월 범위는 이전 달 + 다음 달을 예열한다", () => {
    const range = getViewRange("month", anchor)
    const adjacent = computeAdjacentPrefetchRanges(range)
    expect(adjacent).toEqual([
      { from: "2026-07-01", to: "2026-07-31" },
      { from: "2026-09-01", to: "2026-09-30" },
    ])
  })

  it("목록(agenda) 뷰는 월 뷰와 같은 모양이라 동일하게 예열한다", () => {
    const range = getViewRange("agenda", anchor)
    expect(computeAdjacentPrefetchRanges(range)).toEqual(computeAdjacentPrefetchRanges(getViewRange("month", anchor)))
  })

  it("월 경계(1월)를 넘어도 정확하다", () => {
    const range = getViewRange("month", "2026-01-15")
    expect(computeAdjacentPrefetchRanges(range)).toEqual([
      { from: "2025-12-01", to: "2025-12-31" },
      { from: "2026-02-01", to: "2026-02-28" },
    ])
  })

  it("주 범위는 이전 주 + 다음 주를 예열하며 stepAnchor와 이동 폭이 일치한다", () => {
    const range = getViewRange("week", anchor)
    const adjacent = computeAdjacentPrefetchRanges(range)
    const expectedNext = getViewRange("week", stepAnchor("week", anchor, 1))
    const expectedPrev = getViewRange("week", stepAnchor("week", anchor, -1))
    expect(adjacent).toEqual([expectedPrev, expectedNext])
  })

  it("타임라인 범위는 다음 구간만 예열한다(절반씩 겹치며 전진)", () => {
    const range = getViewRange("timeline", anchor)
    const adjacent = computeAdjacentPrefetchRanges(range)
    const expectedNext = getViewRange("timeline", stepAnchor("timeline", anchor, 1))
    expect(adjacent).toEqual([expectedNext])
  })

  it("담당자(14일) 범위 등 명세에 없는 모양은 예열하지 않는다", () => {
    const range = getViewRange("assignee", anchor)
    expect(computeAdjacentPrefetchRanges(range)).toEqual([])
  })
})

describe("scheduleIdlePrefetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("window가 없으면(SSR/노드 테스트) 아무것도 하지 않는다", () => {
    const run = vi.fn()
    expect(() => scheduleIdlePrefetch(run)).not.toThrow()
    expect(run).not.toHaveBeenCalled()
  })

  it("requestIdleCallback이 있으면 그것으로 스케줄한다", () => {
    const requestIdleCallback = vi.fn()
    const setTimeout = vi.fn()
    vi.stubGlobal("window", { requestIdleCallback, setTimeout })

    const run = vi.fn()
    scheduleIdlePrefetch(run)

    expect(requestIdleCallback).toHaveBeenCalledWith(run, { timeout: 2_000 })
    expect(setTimeout).not.toHaveBeenCalled()
  })

  it("requestIdleCallback이 없으면(사파리 등) 300ms 뒤로 폴백한다", () => {
    const setTimeout = vi.fn()
    vi.stubGlobal("window", { setTimeout })

    const run = vi.fn()
    scheduleIdlePrefetch(run)

    expect(setTimeout).toHaveBeenCalledWith(run, 300)
  })

  // 빠른 기간 이동·Strict Mode에서 성공 콜백마다 idle 콜백이 쌓이면, 2초 timeout에 그것들이
  // 한꺼번에 깨어나 이미 지나간 기간까지 요청한다. 호출부가 최신 예약만 남길 수 있어야 한다.
  it("취소 함수를 돌려준다 — requestIdleCallback 경로", () => {
    const requestIdleCallback = vi.fn(() => 77)
    const cancelIdleCallback = vi.fn()
    vi.stubGlobal("window", { requestIdleCallback, cancelIdleCallback, setTimeout: vi.fn() })

    const cancel = scheduleIdlePrefetch(vi.fn())
    cancel()

    expect(cancelIdleCallback).toHaveBeenCalledWith(77)
  })

  it("취소 함수를 돌려준다 — setTimeout 폴백 경로", () => {
    const setTimeout = vi.fn(() => 42)
    const clearTimeout = vi.fn()
    vi.stubGlobal("window", { setTimeout, clearTimeout })

    const cancel = scheduleIdlePrefetch(vi.fn())
    cancel()

    expect(clearTimeout).toHaveBeenCalledWith(42)
  })

  it("취소 API가 없는 환경에서도 취소 호출이 던지지 않는다", () => {
    vi.stubGlobal("window", { requestIdleCallback: vi.fn(() => 1), setTimeout: vi.fn() })

    const cancel = scheduleIdlePrefetch(vi.fn())
    expect(() => cancel()).not.toThrow()
  })

  it("탭이 숨겨져 있으면 예약하지 않는다", () => {
    const requestIdleCallback = vi.fn()
    const setTimeout = vi.fn()
    vi.stubGlobal("window", { requestIdleCallback, setTimeout })
    vi.stubGlobal("document", { hidden: true })

    const cancel = scheduleIdlePrefetch(vi.fn())

    expect(requestIdleCallback).not.toHaveBeenCalled()
    expect(setTimeout).not.toHaveBeenCalled()
    expect(() => cancel()).not.toThrow()
  })

  it("탭이 보이면 평소대로 예약한다", () => {
    const requestIdleCallback = vi.fn(() => 5)
    vi.stubGlobal("window", { requestIdleCallback, setTimeout: vi.fn() })
    vi.stubGlobal("document", { hidden: false })

    const run = vi.fn()
    scheduleIdlePrefetch(run)

    expect(requestIdleCallback).toHaveBeenCalledWith(run, { timeout: 2_000 })
  })

  it("window가 없어도 취소 함수는 호출 가능하다(SSR 안전)", () => {
    expect(() => scheduleIdlePrefetch(vi.fn())()).not.toThrow()
  })
})

describe("CALENDAR_EVENTS_CACHE_TTL_MS", () => {
  it("클라이언트 캐시 TTL이 5분으로 상향되어 있다(서버 SWR에 신선도를 맡기는 구조)", () => {
    expect(CALENDAR_EVENTS_CACHE_TTL_MS).toBe(5 * 60_000)
  })
})

describe("hidden 소스 URL 파라미터 코덱", () => {
  it("아무것도 숨기지 않으면 빈 문자열 — 호출부가 파라미터를 지운다", () => {
    expect(encodeHiddenSourcesParam(new Set())).toBe("")
  })

  it("숨긴 소스를 정렬된 콤마 목록으로 인코딩한다(안정적인 URL)", () => {
    const hidden = new Set<EventSource>(["showroom", "calendar", "notion"])
    expect(encodeHiddenSourcesParam(hidden)).toBe("calendar,notion,showroom")
  })

  it("파라미터가 아예 없으면 null — 호출부가 localStorage로 폴백해야 함을 뜻한다", () => {
    expect(decodeHiddenSourcesParam(null)).toBeNull()
  })

  it("파라미터가 빈 문자열이면 '전체 표시'라는 명시적 상태로 해석한다", () => {
    const decoded = decodeHiddenSourcesParam("")
    expect(decoded).not.toBeNull()
    expect(decoded?.size).toBe(0)
  })

  it("알려진 값만 통과시키고 모르는 값은 조용히 버린다", () => {
    const decoded = decodeHiddenSourcesParam("calendar,not-a-real-source,notion")
    expect(decoded).toEqual(new Set(["calendar", "notion"]))
  })

  it("왕복(encode → decode)이 원래 집합을 복원한다", () => {
    const original = new Set<EventSource>(["partner", "event"])
    const roundTripped = decodeHiddenSourcesParam(encodeHiddenSourcesParam(original))
    expect(roundTripped).toEqual(original)
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

// app/api/admin/events/_revalidate.ts — admin-performance-round3-2026-09-10.md §3.4 누락 배선.
// public_events 쓰기(등록/수정/삭제)가 PUBLIC_EVENTS_CACHE_TAG만 무효화하고
// ADMIN_CALENDAR_EVENTS_CACHE_TAG(lib/calendar-data.ts의 getPublicEventsAsCalendarEvents가
// 쓰는 태그)는 건드리지 않아, 행사 변경이 어드민 캘린더에 최대 60초 지연 반영되던 공백을
// 고정한다. 이 회귀 가드는 두 태그가 "같은 쓰기에서 함께" 무효화되는지만 검증한다.

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

// _revalidate.ts가 임포트하는 lib/repositories/public-events.ts가 모듈 스코프에서 자체
// unstable_cache(listCachedPublicEvents)를 부르므로 함께 목킹해야 한다(pass-through).
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import { revalidatePublicEventSurfaces } from "@/app/api/admin/events/_revalidate"
import { PUBLIC_EVENTS_CACHE_TAG } from "@/lib/repositories/public-events"
import { ADMIN_CALENDAR_EVENTS_CACHE_TAG } from "@/lib/admin-calendar/cache-tags"

beforeEach(() => {
  mocks.revalidatePath.mockClear()
  mocks.revalidateTag.mockClear()
})

describe("revalidatePublicEventSurfaces — 캘린더 태그 동반 무효화", () => {
  it("공개 이벤트 태그와 어드민 캘린더 태그를 함께 SWR 무효화한다", () => {
    revalidatePublicEventSurfaces("summer-open-house")

    expect(mocks.revalidateTag).toHaveBeenCalledWith(PUBLIC_EVENTS_CACHE_TAG, "max")
    expect(mocks.revalidateTag).toHaveBeenCalledWith(ADMIN_CALENDAR_EVENTS_CACHE_TAG, "max")
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(2)
  })

  it("slug 가 없어도(삭제 등) 두 태그를 무효화한다", () => {
    revalidatePublicEventSurfaces(null, undefined)

    expect(mocks.revalidateTag).toHaveBeenCalledWith(PUBLIC_EVENTS_CACHE_TAG, "max")
    expect(mocks.revalidateTag).toHaveBeenCalledWith(ADMIN_CALENDAR_EVENTS_CACHE_TAG, "max")
  })

  it("공개 경로 재검증은 기존 그대로 유지한다", () => {
    revalidatePublicEventSurfaces("winter-fair")

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/sitemap.xml")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/winter-fair")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/winter-fair/calendar.ics")
  })
})

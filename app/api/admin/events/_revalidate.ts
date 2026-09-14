import { revalidatePath, revalidateTag } from "next/cache"

import { PUBLIC_EVENTS_CACHE_TAG } from "@/lib/repositories/public-events"
import { ADMIN_CALENDAR_EVENTS_CACHE_TAG } from "@/lib/admin-calendar/cache-tags"

export function revalidatePublicEventSurfaces(...slugs: Array<string | null | undefined>) {
  revalidateTag(PUBLIC_EVENTS_CACHE_TAG, "max")
  // admin-performance-round3-2026-09-10.md §3.4 — public_events 쓰기가 어드민 캘린더 태그를
  // 무효화하지 않아 행사 등록/수정/삭제가 최대 60초 동안 캘린더에 반영되지 않던 공백을 메운다.
  // lib/calendar-data.ts의 getPublicEventsAsCalendarEvents(월/전체 이벤트 조립)가 public_events를
  // 읽어 이 태그로 캐시하므로, 같은 쓰기 트랜잭션에서 두 태그를 함께 무효화해야 한다.
  revalidateTag(ADMIN_CALENDAR_EVENTS_CACHE_TAG, "max")
  revalidatePath("/events")
  revalidatePath("/sitemap.xml")

  for (const slug of new Set(slugs.filter((value): value is string => Boolean(value)))) {
    revalidatePath(`/events/${slug}`)
    revalidatePath(`/events/${slug}/calendar.ics`)
  }
}

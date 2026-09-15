// app/api/admin/showroom-bookings 전용 Data Cache 배선.
// route.ts는 핸들러 외 export가 금지되므로(Next App Router 규약) 태그·캐시 래퍼를 이
// 별도 파일에 둔다(app/api/admin/hardware/_validation.ts, app/api/admin/docs/articles/
// _revalidate.ts와 같은 관례).
//
// admin-performance-round3-2026-09-10.md §3.3 — GET /api/admin/showroom-bookings에
// 캐시가 전혀 없었다. lib/repositories/showroom-bookings.ts는 이 라우트 전용이 아니라
// app/api/admin/calendar/health/route.ts·lib/showroom/calendar-source.ts도 읽으므로(캘린더
// 파트 소유 영역과 겹친다), 그 저장소 파일 자체는 건드리지 않고 이 라우트 레벨에서만
// 캐시를 감싼다 — 다른 소비처의 캐시 정책에는 영향이 없다.
import "server-only"

import { unstable_cache } from "next/cache"
import { shareInFlightByArgs } from "@/lib/server/share-in-flight"
import {
  listShowroomBookings,
  type ListShowroomBookingsOptions,
} from "@/lib/repositories/showroom-bookings"

export const SHOWROOM_BOOKINGS_LIST_CACHE_TAG = "admin-showroom-bookings-list"

// options({from,to,status})가 캐시 키에 그대로 들어간다 — 필터 조합마다 별도 엔트리.
// 화면이 실제로 쓰는 조합 수가 적어(전체/오늘 이후/상태별) 카디널리티 우려는 낮다.
export const getCachedShowroomBookings = unstable_cache(
  shareInFlightByArgs("admin-showroom-bookings-list-v1", (options: ListShowroomBookingsOptions) =>
    listShowroomBookings(options)
  ),
  ["admin-showroom-bookings-list-v1"],
  { revalidate: 60, tags: [SHOWROOM_BOOKINGS_LIST_CACHE_TAG] }
)

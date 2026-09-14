// app/api/admin/receipts 전용 Data Cache 배선.
// route.ts는 핸들러 외 export가 금지되므로(Next App Router 규약) 태그·캐시 래퍼를 이
// 별도 파일에 둔다(app/api/admin/showroom-bookings/_cache.ts와 같은 관례).
//
// admin-performance-round3-2026-09-10.md §3.3 — GET /api/admin/receipts에 캐시가 전혀
// 없었다. lib/repositories/receipts.ts는 이 라우트 전용이 아니라 lib/portal/repositories/
// legacy.ts(파트너 포털, 읽기 전용)도 참조하므로, 그 저장소 파일 자체는 건드리지 않고
// 이 라우트 레벨에서만 캐시를 감싼다 — 포털 쪽 조회 경로는 그대로 무캐시로 남는다
// (포털 캐싱은 이번 라운드 스코프 밖, platform-data 파트 소유 영역).
import "server-only"

import { unstable_cache } from "next/cache"
import { shareInFlightByArgs } from "@/lib/server/share-in-flight"
import { listReceipts } from "@/lib/repositories/receipts"

export const ADMIN_RECEIPTS_CACHE_TAG = "admin-receipts-list"

export const getCachedReceipts = unstable_cache(
  shareInFlightByArgs("admin-receipts-list-v1", listReceipts),
  ["admin-receipts-list-v1"],
  { revalidate: 60, tags: [ADMIN_RECEIPTS_CACHE_TAG] }
)

// app/api/admin/docs (목록 GET) 전용 Data Cache 배선.
// route.ts는 핸들러 외 export가 금지되므로(Next App Router 규약) 태그·캐시 래퍼를 이
// 별도 파일에 둔다(app/api/admin/showroom-bookings/_cache.ts와 같은 관례).
//
// admin-performance-round3-2026-09-10.md §3.3 — GET /api/admin/docs(어드민 문서 목록·
// 카테고리·AI 청크 카운트 조립, lib/admin-docs.ts의 listAdminDocsContent)에 캐시가 전혀
// 없었다. lib/admin-docs.ts 자체는 콘텐츠 파트 소유의 큰 모듈이라 건드리지 않고, 이
// 라우트 레벨에서만 감싼다.
//
// 무효화: app/api/admin/docs/articles/_revalidate.ts의 revalidateDocsIndexPaths/
// revalidateDocsArticlePaths가 이 태그를 함께 무효화한다(그 두 함수는 이미 모든 기사
// CRUD/발행/롤백/일괄작업 경로에서 호출된다). docs_categories 쓰기(app/api/admin/docs/
// categories/**)는 그 두 함수를 아예 호출하지 않는 기존 공백이라 이 태그도 못 받는다 —
// 이번 라운드에서 새로 만든 공백이 아니라 그대로 문서화만 한다.
import "server-only"

import { unstable_cache } from "next/cache"
import { shareInFlight } from "@/lib/server/share-in-flight"
import { listAdminDocsContent } from "@/lib/admin-docs"

export const ADMIN_DOCS_LIST_CACHE_TAG = "admin-docs-list"

export const getCachedAdminDocsContent = unstable_cache(
  () => shareInFlight("admin-docs-list-v1", listAdminDocsContent),
  ["admin-docs-list-v1"],
  { revalidate: 60, tags: [ADMIN_DOCS_LIST_CACHE_TAG] }
)

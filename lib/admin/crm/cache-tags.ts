// 어드민 CRM 집계 캐시 태그 — 소스 링크 확정/해제/생성 뮤테이션과 coverage·os-summary 캐시가
// 같은 문자열을 공유하도록 한 곳에 둔다. 라우트 파일은 핸들러 외 export가 금지되므로 여기서 export한다.
export const ADMIN_CRM_COVERAGE_CACHE_TAG = "admin-crm-coverage"
// lib/admin/overview/os-summary.ts의 getCachedOsSummary가 쓰는 태그(같은 원천 getCrmSourceLinkCoverage).
export const ADMIN_OS_SUMMARY_CACHE_TAG = "admin-os-summary"

// lib/admin-crm-overview.ts의 getAdminCrmOverview(비-force 경로)가 unstable_cache에 거는 태그.
// force는 이 태그를 revalidateTag(tag, { expire: 0 })로 하드 만료해 다음 읽기를 새로 계산시킨다.
export const ADMIN_CRM_OVERVIEW_CACHE_TAG = "admin-crm-overview"

// lib/repositories/crm-unified-customers.ts의 소스 스냅샷(getCrmUnifiedCustomers·
// getCrmUnifiedHealthDistribution이 공유)이 unstable_cache에 거는 태그. 리드 쓰기
// (lib/repositories/leads.ts의 invalidateLeadReadCaches)와 소스 링크 확정/해제/생성
// 라우트(app/api/admin/crm/source-links/*)가 이 태그를 revalidateTag(tag, "max")로 건다.
export const ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG = "admin-crm-unified-snapshot"

// lib/repositories/crm-priority-queue.ts의 소스 스냅샷(getCrmPriorityQueue)이 unstable_cache에
// 거는 태그. invalidateCrmPrioritySourceSnapshot()이 이 태그를 revalidateTag(tag, "max")로 건다 —
// 리드·CRM 할 일·컨택 로그 쓰기가 그 함수를 구독해 호출한다(파일 하단 onLeadsMutated 등).
export const ADMIN_CRM_PRIORITY_QUEUE_SNAPSHOT_CACHE_TAG = "admin-crm-priority-queue-snapshot"

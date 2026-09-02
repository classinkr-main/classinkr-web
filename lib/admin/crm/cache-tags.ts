// 어드민 CRM 집계 캐시 태그 — 소스 링크 확정/해제/생성 뮤테이션과 coverage·os-summary 캐시가
// 같은 문자열을 공유하도록 한 곳에 둔다. 라우트 파일은 핸들러 외 export가 금지되므로 여기서 export한다.
export const ADMIN_CRM_COVERAGE_CACHE_TAG = "admin-crm-coverage"
// lib/admin/overview/os-summary.ts의 getCachedOsSummary가 쓰는 태그(같은 원천 getCrmSourceLinkCoverage).
export const ADMIN_OS_SUMMARY_CACHE_TAG = "admin-os-summary"

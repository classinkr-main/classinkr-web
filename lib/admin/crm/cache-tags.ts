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

// ── 2026-09-10 3라운드 승격분 (§3.2·§3.3) ────────────────────────────────────────

// lib/admin-crm-customers-neo.ts의 getNeoCrmCustomers가 unstable_cache에 거는 태그.
// 이전엔 process-local 모듈 변수(let neoCustomersCache)라 Vercel Fluid 콜드 인스턴스마다
// 매번 재계산됐다 — 개요·통합고객·os-summary 3화면이 공유하는 하위 소스라 영향이 컸다.
// invalidateNeoCrmCustomersCache()(같은 파일 export)가 이 태그를 revalidateTag(tag, "max")로
// 건다 — app/api/admin/crm/external-sync/route.ts가 crm_neo_customer_snapshots 재계산
// 직후 호출한다(수동 동기화 경로만; 크론 경로는 §3.4 보고서에 위임 요청으로 기록).
export const ADMIN_CRM_NEO_CUSTOMERS_CACHE_TAG = "admin-crm-neo-customers"

// lib/repositories/crm-tasks.ts의 listCrmTasks가 unstable_cache에 거는 태그. crm_tasks
// 테이블의 유일한 쓰기 경로(createCrmTask·applyTaskUpdate — 완료/미루기/취소/재개/재배정/편집이
// 전부 applyTaskUpdate 한 곳을 지난다)가 각각 이 태그를 revalidateTag(tag, "max")로 건다.
// 두 쓰기 경로 모두 같은 파일 안에 있어 무효화가 전량 커버된다 — TTL을 5분으로 올린 근거.
export const ADMIN_CRM_TASKS_CACHE_TAG = "admin-crm-tasks"

// lib/repositories/crm-region-map.ts의 getCrmRegionMap이 unstable_cache에 거는 태그.
// 이전엔 module-level let cache(60초)+inFlight로 손으로 구현한 캐시라 인스턴스마다 따로 놀았다.
// 무효화는 부분적이다 — lib/repositories/crm-naver-map.ts의 importCrmNaverMapSource(지도 장소
// 재수집)만 revalidateTag(tag, "max")로 건다. branch_rev_deals.region(REV 시트 동기화)과
// leads.branch(리드 쓰기) 변경은 이 태그를 무효화하지 않는다 — 각각 branch/leads 소유
// 파일이라 이번 라운드에서 배선하지 못했다(TTL을 60초에서 올리지 않은 이유이기도 하다).
export const ADMIN_CRM_REGION_MAP_CACHE_TAG = "admin-crm-region-map"

// lib/repositories/account-master.ts의 getAccountMaster가 unstable_cache에 거는 태그.
// crm_source_links의 확정/해제 쓰기(lib/repositories/crm-source-links.ts의
// updateCrmSourceLinkStatus·createManualBranchRevLinkCandidate·upsertConfirmedLeadCustomerLink·
// reattachBranchRevConfirmedLinks)와 지도 장소 확정 연결(crm-naver-map.ts의 confirmCrmNaverMapLink)
// 이 태그를 revalidateTag(tag, "max")로 건다. customers·partner_accounts·branch_rev_deals
// 원본 행 자체의 추가/수정(파트너·지사 소유 파일)은 무효화하지 않는다 — 부분 커버리지라
// TTL을 이전과 같은 60초로 유지한다.
export const ADMIN_CRM_ACCOUNT_MASTER_CACHE_TAG = "admin-crm-account-master"

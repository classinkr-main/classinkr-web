import "server-only"

import { CRM_STAFF_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane, type DeferredPrefetch } from "@/lib/admin/prefetch-budget"
import {
  CRM_WORK_ACTIVITY_SOURCE_TYPES,
  listCrmCustomerEvents,
  type ListCrmCustomerEventsResult,
} from "@/lib/repositories/crm-events"

/**
 * CRM 기록(/admin/crm/activity) 화면 첫 페이지를 서버에서 미리 만든다(P1a, CRM 홈과 같은 규약).
 *
 * `listCrmCustomerEvents`를 이 파일에서 직접(리포지토리 함수로) 부른다 — HTTP 자기호출 없음.
 * 여기서 넘기는 인자(targetType/sourceType 전체, sourceTypes=업무 스코프, sentiment 전체,
 * limit 50, offset 0)는 CrmActivityClient의 첫 마운트 기본 필터·스코프와 **정확히 같은
 * 요청**이 되도록 맞춘 것이다 — 클라이언트는 이 값들로 계산한 URL
 * (lib/crm/activity-events-url.ts의 defaultActivityEventsUrl())을 캐시 키로 써서
 * seedAdminRequestCache 한다. 두 값이 갈라지면(예: 클라이언트 기본 스코프를 바꾸면서 여기를
 * 안 맞추면) 프리페치가 조용히 캐시 미스로 떨어질 뿐 화면이 깨지지는 않는다(항상 클라이언트
 * 폴백 fetch가 있다) — 다만 그 경우 프리페치의 이점이 사라지므로, 기본값을 바꿀 때는
 * 이 파일과 CrmActivityClient의 초기 필터 상태를 함께 갱신해야 한다
 * (tests/admin/crm-activity-prefetch.test.ts가 이 인자 집합을 계약으로 고정한다).
 *
 * 보안·회복 계약은 CRM 홈 프리페치(lib/admin/crm/home-prefetch.ts)와 동일하다: admin 검증까지만
 * await하고(쿠키 확인 — ms 단위), 무거운 조회는 openPrefetchLane으로 레인만 열어 기다리지
 * 않는다. 미검증·역할 부족·검증 자체 실패면 null(레인 없음) — 페이지를 500으로 만들지 않고
 * 지금까지처럼 클라이언트 fetch로 떨어뜨린다.
 */
export interface CrmActivityInitialData {
  events: DeferredPrefetch<ListCrmCustomerEventsResult>
  generatedAt: string
}

export async function prefetchCrmActivityInitialData(): Promise<CrmActivityInitialData | null> {
  let admin: Awaited<ReturnType<typeof getVerifiedAdminContextForPage>> = null
  try {
    admin = await getVerifiedAdminContextForPage()
  } catch (error) {
    console.error("[crm activity prefetch] admin verification failed", error)
    return null
  }
  if (!admin || !hasAdminApiRole(admin.role, CRM_STAFF_ADMIN_API_ROLES)) return null

  return {
    events: openPrefetchLane(() =>
      listCrmCustomerEvents({
        targetType: "all",
        sourceType: "all",
        sourceTypes: CRM_WORK_ACTIVITY_SOURCE_TYPES,
        sentiment: "all",
        limit: 50,
        offset: 0,
      })
    ),
    generatedAt: new Date().toISOString(),
  }
}

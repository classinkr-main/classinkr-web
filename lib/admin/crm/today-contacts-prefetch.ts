import "server-only"

import { CRM_STAFF_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { currentDataOwner } from "@/lib/admin/data-owner"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane, type DeferredPrefetch } from "@/lib/admin/prefetch-budget"
import type { CrmTodayContacts } from "@/lib/crm/today-contact-types"
import { TODAY_CONTACTS_LIMIT } from "@/lib/crm/today-contacts-request"
import { getCrmTodayContacts } from "@/lib/repositories/crm-today-contacts"

/**
 * CRM 현황 "오늘 연락" 패널(C안 ①, 접속자 개인 기준 — ?owner 없음 = 내 담당)의 서버 프리페치.
 *
 * 옛 priority-queue-prefetch.ts(2026-09-25 삭제)와 같은 모양이다 — 별도 함수·별도 admin 검증으로 두어
 * home-prefetch.ts(CrmHomeInitialData 필드 집합을 고정하는 계약 테스트)를 건드리지 않는다.
 * app/admin/crm/page.tsx 가 다른 프리페치와 Promise.all 로 나란히 부르고, 결과 레인을 패널에
 * prop 으로 넘기면 패널이 React use() 로 푼다(await 하지 않는다 — TTFB 에 얹히지 않는다).
 *
 * 보안: 미검증·역할 부족이면 null(클라이언트가 GET /api/admin/crm/home/today-contacts 를 직접 불러
 * 401/403 으로 차단됨). 그 외엔 항상 레인 — 실패는 레인 promise 가 null 로 풀린다.
 */
export async function prefetchCrmTodayContactsForHome(): Promise<DeferredPrefetch<CrmTodayContacts> | null> {
  let admin: Awaited<ReturnType<typeof getVerifiedAdminContextForPage>> = null
  try {
    admin = await getVerifiedAdminContextForPage()
  } catch (error) {
    console.error("[crm home prefetch] today contacts admin verification failed", error)
    return null
  }
  if (!admin || !hasAdminApiRole(admin.role, CRM_STAFF_ADMIN_API_ROLES)) return null

  // 패널의 기본(접속자 개인) 호출 todayContactsUrl("__me") 과 정확히 같은 조건 — 담당 키는 라우트와 같은
  // currentDataOwner(검증된 계정)로 푼다(3f5f0a21: 대시보드·CRM 기본 담당 = 로그인 사용자). 담당 매핑 실패는
  // 레인 promise 가 null 로 풀려 패널이 클라이언트 조회로 떨어진다(전체로 넓히지 않는다).
  // 강등 응답(Home 필수 원천 일부 실패)도 그대로 넘긴다 — 여기서는 아무것도 캐시·시드하지 않는다. 요청 캐시에 심을지는
  // 패널이 isTodayContactsCacheable 로 정한다(강등이면 심지 않고 화면에 보인 뒤 바로 다시 받는다 — shouldSeedTodayContacts).
  return openPrefetchLane(async () =>
    getCrmTodayContacts({ limit: TODAY_CONTACTS_LIMIT, owner: null, ownerKeys: (await currentDataOwner(admin)).keys })
  )
}

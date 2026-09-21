import "server-only"

import { CRM_STAFF_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane, type DeferredPrefetch } from "@/lib/admin/prefetch-budget"
import { getCrmUnifiedCustomers } from "@/lib/repositories/crm-unified-customers"
import {
  listUrl,
  PAGE_LIMIT,
  SAVED_VIEW_FILTERS,
  type CrmUnifiedCustomers,
  type SavedViewFilter,
} from "@/components/admin/crm/unified/shared"

/**
 * 통합 고객(ClassIn 고객 DB) 목록 첫 페이지의 서버 프리페치 — 홈(home-prefetch.ts)과 같은
 * 스트리밍 레인 계약이다: admin 인증·역할 확인만 await하고, 무거운 조회(getCrmUnifiedCustomers)는
 * openPrefetchLane으로 시작만 해 두고 기다리지 않는다. 미인증·역할 부족·검증 자체가 던지면
 * null(레인 없음) — 화면은 지금까지처럼 클라이언트 마운트 후 fetch로 떨어진다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 시드 정합(P1b 핵심 제약): 이 함수가 만드는 조회 옵션은 CrmUnifiedCustomersClient.tsx의
 * `loadPage(0)`가 **실제로** 첫 렌더에 쏘는 요청과 같은 결과를 내야 한다 — 그래야
 * `seedAdminRequestCache(url, ...)`로 심은 캐시를 그 첫 요청이 그대로 적중한다.
 *
 * "같은 결과"의 기준을 URL 문자열로 잡았다 — 클라이언트도 서버도 같은 순수 함수
 * `components/admin/crm/unified/shared.ts`의 `listUrl()`을 불러 URL을 조립한다(그 파일은
 * 서버·클라이언트 양쪽에서 안전하게 import할 수 있는 순수 모듈이라 "use client"/"server-only"
 * 경계를 넘지 않는다). 클라이언트 쪽 대응 함수는
 * `components/admin/crm/CrmUnifiedCustomersClient.tsx`의 `buildUnifiedListDefaultUrl()`이며,
 * `tests/admin/crm-unified-prefetch.test.ts`가 두 함수의 출력이 문자열로 같음을 직접 고정한다.
 *
 * 기본값(검색어 없음·source=all·lifecycle=all·owner 없음·view=all·tag 없음·
 * includeUnconfirmed=false·limit=PAGE_LIMIT(50)·offset=0)은 `CrmUnifiedCustomersClient`의
 * useState 초기값 그대로다. 왜 하드코딩 기본값만 맞추면 되는가 — 그 컴포넌트의 마운트
 * `useEffect(() => loadPage(0), [loadPage])`는 URL 복원(`?view=`)·localStorage 담당자
 * 복원 이펙트보다 먼저 도는 클로저로 실행되므로(같은 커밋의 다른 이펙트가 건 setState는
 * 이 이펙트 실행 시점엔 아직 반영되지 않는다 — React가 한 커밋의 패시브 이펙트를 전부
 * 실행한 뒤에야 그 상태 갱신을 다음 렌더로 흘려보낸다), **딥링크가 없는 일반 진입의 첫
 * 네트워크 요청은 언제나 이 하드 기본값**이다. `?q=`/`?view=` 딥링크가 있으면 클라이언트가
 * 뒤이어(두 번째 커밋에서) 그 값을 반영한 두 번째 요청을 다시 쏘는데, 아래에서
 * `searchParams.q`/`searchParams.view`를 받으면 그 값도 반영해 이 두 번째 요청까지
 * 캐시가 맞도록 한다(완전한 커버는 아니다 — 아래 한계 참고).
 *
 * 한계(문서화, 코드로 닫지 않음):
 *  - `view=my_owner`는 매칭 대상에서 뺀다("all"로 취급) — my_owner는 owner를
 *    `CURRENT_OWNER_VALUE`로 바꾸는데, 그 값이 가리키는 실제 소유자 키(`ownerKeys`)를 구하려면
 *    이 프리페치가 admin-users 디렉터리까지 조회해야 한다(route.ts의 `findAdminCrmOwner`와
 *    동급 비용). 이번 범위 밖으로 남긴다 — my_owner 딥링크는 지금처럼 클라이언트 fetch로 떨어진다.
 *  - `owner`(담당자) 필터는 항상 기본값(전체)만 심는다 — 클라이언트가 `OWNER_STORAGE_KEY`
 *    localStorage에 저장된 담당자를 마운트 후 별도 이펙트로 복원하는데, 이건 서버가 알 수
 *    없는 상태다. 저장된 담당자가 있으면 클라이언트는 그 값으로 다시 요청하고, 그 요청은
 *    이 프리페치의 시드와 URL이 달라 그냥 새 fetch를 탄다(캐시 오염 없음 — 시드는 항상
 *    "기본 URL" 하나만 심으므로 다른 URL의 조회를 막거나 더럽히지 않는다).
 */
export interface CrmUnifiedInitialData {
  customers: DeferredPrefetch<CrmUnifiedCustomers>
  /** 이 레인을 연 시각의 ISO 문자열(=customers.generatedAt을 변환한 것). 참고·로그용. */
  generatedAt: string
}

/** `?view=` 원문을 알려진 저장 뷰로 검증한다 — my_owner는 위 한계 설명대로 제외한다. */
function resolveInitialSavedView(raw: string | undefined): SavedViewFilter {
  if (!raw || raw === "my_owner") return "all"
  return SAVED_VIEW_FILTERS.some((filter) => filter.key === raw) ? (raw as SavedViewFilter) : "all"
}

/**
 * 클라이언트 기본 첫 요청과 같은 URL을 만든다 — 실제 네트워크를 타지 않고 캐시 키/테스트
 * 비교용으로만 쓴다(getCrmUnifiedCustomers 호출 자체는 옵션을 직접 넘겨 URL 파싱을 거치지 않는다).
 */
export function buildUnifiedPrefetchUrl(searchParams?: { q?: string; view?: string }): string {
  return listUrl({
    query: searchParams?.q?.trim() ?? "",
    source: "all",
    lifecycle: "all",
    owner: "",
    view: resolveInitialSavedView(searchParams?.view),
    tag: "",
    includeUnconfirmed: false,
    offset: 0,
  })
}

export async function prefetchCrmUnifiedInitialData(searchParams?: {
  q?: string
  view?: string
  /** 360 드로어 딥링크 — 목록 조회 옵션에는 영향 없다(드로어는 별도 조회). 시그니처만 받는다. */
  account?: string
}): Promise<CrmUnifiedInitialData | null> {
  let admin: Awaited<ReturnType<typeof getVerifiedAdminContextForPage>> = null
  try {
    admin = await getVerifiedAdminContextForPage()
  } catch (error) {
    console.error("[crm unified prefetch] admin verification failed", error)
    return null
  }
  if (!admin || !hasAdminApiRole(admin.role, CRM_STAFF_ADMIN_API_ROLES)) return null

  const view = resolveInitialSavedView(searchParams?.view)
  const q = searchParams?.q?.trim() || undefined

  const lane = openPrefetchLane<CrmUnifiedCustomers>(() =>
    getCrmUnifiedCustomers({
      q,
      source: "all",
      lifecycle: "all",
      view,
      owner: undefined,
      tag: undefined,
      includeUnconfirmed: false,
      limit: PAGE_LIMIT,
      offset: 0,
    })
  )

  return { customers: lane, generatedAt: new Date(lane.generatedAt).toISOString() }
}

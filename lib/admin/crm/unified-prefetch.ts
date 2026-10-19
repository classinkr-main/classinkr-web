import "server-only"
import { currentDataOwner } from "@/lib/admin/data-owner"
import { branchMemberOwnerAliases } from "@/lib/branch/member-names"

import { CRM_STAFF_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane, type DeferredPrefetch } from "@/lib/admin/prefetch-budget"
import { getCrmUnifiedCustomers } from "@/lib/repositories/crm-unified-customers"
import {
  CURRENT_OWNER_VALUE,
  listUrl,
  PAGE_LIMIT,
  parseOwnerParam,
  parseTagParam,
  SAVED_VIEW_FILTERS,
  type CrmUnifiedCustomers,
  type SavedViewFilter,
} from "@/components/admin/crm/unified/shared"
import { isSegmentSpecEmpty, normalizeSegmentSpec, type CustomerSegmentSpec } from "@/lib/crm/customer-segment-spec"

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
 * 기본값(검색어 없음·source=all·lifecycle=all·owner=__me(로그인 담당)·view=all·tag 없음·
 * includeUnconfirmed=false·limit=PAGE_LIMIT(50)·offset=0)은 `CrmUnifiedCustomersClient`의
 * useState 초기값 그대로다. 왜 하드코딩 기본값만 맞추면 되는가 — 그 컴포넌트의 마운트
 * `useEffect(() => loadPage(0), [loadPage])`는 URL 복원(`?view=`) 이펙트보다 먼저 도는
 * 클로저로 실행되므로(같은 커밋의 다른 이펙트가 건 setState는
 * 이 이펙트 실행 시점엔 아직 반영되지 않는다 — React가 한 커밋의 패시브 이펙트를 전부
 * 실행한 뒤에야 그 상태 갱신을 다음 렌더로 흘려보낸다), **딥링크가 없는 일반 진입의 첫
 * 네트워크 요청은 언제나 이 하드 기본값**이다. `?q=`/`?view=` 딥링크가 있으면 클라이언트가
 * 뒤이어(두 번째 커밋에서) 그 값을 반영한 두 번째 요청을 다시 쏘는데, 아래에서
 * `searchParams.q`/`searchParams.view`를 받으면 그 값도 반영해 이 두 번째 요청까지
 * 캐시가 맞도록 한다(완전한 커버는 아니다 — 아래 한계 참고).
 * 라벨(`?tag=`, 태그 관리 화면 딥링크)은 예외로 클라이언트가 마운트 시점 URL에서 state 초기값을
 * 바로 읽으므로(`parseTagParam`) 첫 요청부터 라벨이 실린다 — 여기서도 같은 함수로 정규화해 싣는다.
 * 담당(`?owner=`, F6)·세그먼트 조건(`?expDays=` 등, SG4)도 같다 — 클라이언트가 마운트 시점 URL로
 * state 를 초기화하므로 여기서도 같은 파서(parseOwnerParam·parseSegmentSpec 결과)로 싣는다.
 * 빈 조건은 URL 에 싣지 않는다. 담당은 예외로 늘 싣는다 — 2026-10-16 기본 담당 계약(lib/admin/data-owner.ts)이
 * "생략=로그인 담당(`__me`), 명시적 빈 값(`owner=`)=전체"라 딥링크 없는 기본 URL 도 `owner=__me` 를 담는다.
 *
 * 담당 범위(2026-10-16): 인증된 접속자의 담당 범위로 첫 페이지를 프리페치한다. `__me`(생략 포함)는 검증된
 * 로그인 계정의 담당 키(currentDataOwner — 라우트 dataOwnerFromRequest 와 같은 해석)로 풀고, 담당 이름은
 * branchMemberOwnerAliases 별칭으로, 명시적 `owner=`는 전체로 조회한다. `view=my_owner`도 같은 개인 범위의
 * 기본 URL 로 시드한다(저장 뷰 자체는 "all" 로 접는다 — 클라이언트 첫 요청도 my_owner 를 아직 반영하지 않는다).
 * 예전 한계("my_owner·__me 는 서버가 로그인 담당자 키를 풀지 않아 시드하지 않는다")는 이 해석으로 닫혔다.
 *
 * 남은 한계(문서화, 코드로 닫지 않음):
 *  - OR 그룹(`or=`, 세그먼트 허브) 딥링크는 page.tsx 가 프리페치하지 않는다 — 이 함수는 AND 조건만 받는다.
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
export function buildUnifiedPrefetchUrl(searchParams?: {
  q?: string
  view?: string
  tag?: string
  owner?: string
  segment?: CustomerSegmentSpec
}): string {
  return listUrl({
    query: searchParams?.q?.trim() ?? "",
    source: "all",
    lifecycle: "all",
    // 클라이언트 owner state 초기값과 같은 파서 — 생략은 `__me`(내 담당), 빈 값은 전체(`owner=`).
    owner: parseOwnerParam(searchParams?.owner),
    view: resolveInitialSavedView(searchParams?.view),
    tag: parseTagParam(searchParams?.tag),
    includeUnconfirmed: false,
    segment: normalizeSegmentSpec(searchParams?.segment),
    offset: 0,
  })
}

export async function prefetchCrmUnifiedInitialData(searchParams?: {
  q?: string
  view?: string
  /** 태그 관리 화면 딥링크(?tag=) — 클라이언트 tagFilter 초기값과 같은 parseTagParam 정규화. */
  tag?: string
  /** 360 드로어 딥링크 — 목록 조회 옵션에는 영향 없다(드로어는 별도 조회). 시그니처만 받는다. */
  account?: string
  /** `?owner=` 담당 딥링크(F6) — 생략·`__me` 는 로그인 담당, 빈 값은 전체, 이름은 그 담당(별칭 포함). */
  owner?: string
  /** 세그먼트 조건 딥링크(SG4) — 페이지가 parseSegmentSpec 으로 푼 값. */
  segment?: CustomerSegmentSpec
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
  const tag = parseTagParam(searchParams?.tag) || undefined
  const owner = parseOwnerParam(searchParams?.owner)
  const segment = normalizeSegmentSpec(searchParams?.segment)

  const lane = openPrefetchLane<CrmUnifiedCustomers>(async () =>
    getCrmUnifiedCustomers({
      q,
      source: "all",
      lifecycle: "all",
      view,
      // 담당 범위 — 라우트(dataOwnerFromRequest)와 같은 의미: 빈 값=전체, 이름=별칭 키, `__me`=로그인 담당 키.
      ownerKeys: !owner ? undefined : owner !== CURRENT_OWNER_VALUE ? branchMemberOwnerAliases(owner) : (await currentDataOwner(admin)).keys,
      tag,
      includeUnconfirmed: false,
      // 빈 조건은 옵션에 싣지 않는다 — 기본 첫 조회와 같은 옵션 모양 유지.
      ...(isSegmentSpecEmpty(segment) ? {} : { segment }),
      limit: PAGE_LIMIT,
      offset: 0,
    })
  )

  return { customers: lane, generatedAt: new Date(lane.generatedAt).toISOString() }
}

import "server-only"
import { currentDataOwner, PERSONAL_OWNER } from "@/lib/admin/data-owner"
import { branchMemberOwnerAliases } from "@/lib/branch/member-names"

import { CRM_STAFF_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane, type DeferredPrefetch } from "@/lib/admin/prefetch-budget"
import { getCrmUnifiedCustomers } from "@/lib/repositories/crm-unified-customers"
import {
  listUrl,
  PAGE_LIMIT,
  parseTagParam,
  SAVED_VIEW_FILTERS,
  type CrmUnifiedCustomers,
  type SavedViewFilter,
} from "@/components/admin/crm/unified/shared"

/** 인증된 접속자의 담당 범위로 첫 페이지를 프리페치한다. 명시적 owner=는 전체다. */
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
export function buildUnifiedPrefetchUrl(searchParams?: { q?: string; view?: string; tag?: string; owner?: string }): string {
  return listUrl({
    query: searchParams?.q?.trim() ?? "",
    source: "all",
    lifecycle: "all",
    owner: searchParams?.owner ?? PERSONAL_OWNER,
    view: resolveInitialSavedView(searchParams?.view),
    tag: parseTagParam(searchParams?.tag),
    includeUnconfirmed: false,
    offset: 0,
  })
}

export async function prefetchCrmUnifiedInitialData(searchParams?: {
  q?: string
  owner?: string
  view?: string
  /** 태그 관리 화면 딥링크(?tag=) — 클라이언트 tagFilter 초기값과 같은 parseTagParam 정규화. */
  tag?: string
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
  const tag = parseTagParam(searchParams?.tag) || undefined

  const lane = openPrefetchLane<CrmUnifiedCustomers>(async () =>
    getCrmUnifiedCustomers({
      q,
      source: "all",
      lifecycle: "all",
      view,
      ownerKeys: searchParams?.owner === "" ? undefined : searchParams?.owner && searchParams.owner !== PERSONAL_OWNER ? branchMemberOwnerAliases(searchParams.owner) : (await currentDataOwner(admin)).keys,
      tag,
      includeUnconfirmed: false,
      limit: PAGE_LIMIT,
      offset: 0,
    })
  )

  return { customers: lane, generatedAt: new Date(lane.generatedAt).toISOString() }
}

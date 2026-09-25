import "server-only"

import type { VerifiedAdminContext } from "@/lib/admin-auth"
import { parseSegmentFilter } from "@/lib/crm/customer-segment-filter"
import {
  parseIncludeUnconfirmedParam,
  parseUnifiedLifecycle,
  parseUnifiedSavedView,
  parseUnifiedSort,
  parseUnifiedSource,
} from "@/lib/crm/unified-view-rules"
import {
  CURRENT_ADMIN_OWNER_TOKEN,
  findAdminCrmOwner,
  listAdminUserDirectory,
} from "@/lib/repositories/admin-users"
import type { CrmUnifiedCustomersOptions } from "@/lib/repositories/crm-unified-customers"

// 통합 고객 쿼리 파라미터 → 저장소 옵션 — 통합 목록(GET /api/admin/crm/customers/unified)·CSV 내보내기
// (…/export)·세그먼트 대상 미리보기가 같은 파서를 쓴다(같은 조건이면 같은 건수).
//
// 읽는 것: q · source · lifecycle · view · owner(__me 는 로그인 담당자 키로 풀기) · tag · includeUnconfirmed ·
//   세그먼트 조건(expDays · depDays · noContactDays · minBalanceCny · kinds · risk · billing · owners · regions ·
//   tagsAll · tagsAny + OR 그룹 `or`) · sort · dir. 모르는 값은 각 파서가 조용히 버린다(?view= 규약).
// 읽지 않는 것: limit · offset(페이지) · keys(선택 행) · force(캐시 우회) — 호출 라우트가 자기 계약대로 붙인다.

export type UnifiedQueryOptions = Omit<CrmUnifiedCustomersOptions, "limit" | "offset" | "keys" | "bypassCache" | "now">

/** 로그인 담당자와 매칭되는 담당 키가 없을 때 쓰는 자리표시 — 어떤 행에도 맞지 않아 "내 담당 0건"이 된다. */
const NO_CURRENT_ADMIN_OWNER_KEY = "__no_current_admin_owner__"

export async function parseUnifiedQueryOptions(
  searchParams: URLSearchParams,
  admin: Pick<VerifiedAdminContext, "userId" | "name">
): Promise<UnifiedQueryOptions> {
  const ownerParam = searchParams.get("owner") ?? undefined
  const isMine = ownerParam === CURRENT_ADMIN_OWNER_TOKEN
  const currentOwner = isMine ? findAdminCrmOwner(await listAdminUserDirectory(), admin) : null
  const ownerKeys = isMine
    ? currentOwner?.ownerKeys.length
      ? currentOwner.ownerKeys
      : [NO_CURRENT_ADMIN_OWNER_KEY]
    : undefined

  return {
    q: searchParams.get("q") ?? undefined,
    source: parseUnifiedSource(searchParams.get("source")),
    lifecycle: parseUnifiedLifecycle(searchParams.get("lifecycle")),
    view: parseUnifiedSavedView(searchParams.get("view")),
    owner: isMine ? undefined : ownerParam,
    ownerKeys,
    tag: searchParams.get("tag") ?? undefined,
    includeUnconfirmed: parseIncludeUnconfirmedParam(searchParams.get("includeUnconfirmed")),
    // 세그먼트 조건(SG4) + OR 한 단계(세그먼트 허브) — lib/crm/customer-segment-filter.ts.
    segment: parseSegmentFilter(searchParams),
    // 서버 정렬(C1) — 없거나 모르는 키면 추천순(null).
    sort: parseUnifiedSort(searchParams.get("sort"), searchParams.get("dir")),
  }
}

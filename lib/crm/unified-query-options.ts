import "server-only"

import type { VerifiedAdminContext } from "@/lib/admin-auth"
import { dataOwnerFromParams } from "@/lib/admin/data-owner"
import { parseSegmentFilter } from "@/lib/crm/customer-segment-filter"
import {
  parseIncludeUnconfirmedParam,
  parseUnifiedLifecycle,
  parseUnifiedSavedView,
  parseUnifiedSort,
  parseUnifiedSource,
} from "@/lib/crm/unified-view-rules"
import type { CrmUnifiedCustomersOptions } from "@/lib/repositories/crm-unified-customers"

// 통합 고객 쿼리 파라미터 → 저장소 옵션 — 통합 목록(GET /api/admin/crm/customers/unified)·CSV 내보내기
// (…/export)·세그먼트 대상 미리보기가 같은 파서를 쓴다(같은 조건이면 같은 건수).
//
// 읽는 것: q · source · lifecycle · view · owner · tag · includeUnconfirmed · 세그먼트 조건(expDays · depDays ·
//   noContactDays · minBalanceCny · kinds · risk · billing · owners · regions · tagsAll · tagsAny + OR 그룹 `or`) ·
//   sort · dir. 모르는 값은 각 파서가 조용히 버린다(?view= 규약).
// 담당(owner)은 10월 기본 담당 계약(lib/admin/data-owner.ts dataOwnerFromParams) 하나로 푼다 — 생략·`__me` 는
//   로그인 담당 키(별칭·userId 포함, 매핑 없으면 UNMAPPED_OWNER → 0건), 명시적 빈 값(`owner=`)은 전체, 담당 이름은
//   branchMemberOwnerAliases 별칭 키. 결과는 ownerKeys 로만 싣고 owner 문자열은 싣지 않는다(목록·CSV·미리보기가
//   같은 키 집합 → 같은 건수, 2026-10-19 09-mooni 병합).
// 읽지 않는 것: limit · offset(페이지) · keys(선택 행) · force(캐시 우회) — 호출 라우트가 자기 계약대로 붙인다.

export type UnifiedQueryOptions = Omit<CrmUnifiedCustomersOptions, "limit" | "offset" | "keys" | "bypassCache" | "now">

export async function parseUnifiedQueryOptions(
  searchParams: URLSearchParams,
  admin: VerifiedAdminContext
): Promise<UnifiedQueryOptions> {
  return {
    q: searchParams.get("q") ?? undefined,
    source: parseUnifiedSource(searchParams.get("source")),
    lifecycle: parseUnifiedLifecycle(searchParams.get("lifecycle")),
    view: parseUnifiedSavedView(searchParams.get("view")),
    ownerKeys: await dataOwnerFromParams(searchParams, admin),
    tag: searchParams.get("tag") ?? undefined,
    includeUnconfirmed: parseIncludeUnconfirmedParam(searchParams.get("includeUnconfirmed")),
    // 세그먼트 조건(SG4) + OR 한 단계(세그먼트 허브) — lib/crm/customer-segment-filter.ts.
    segment: parseSegmentFilter(searchParams),
    // 서버 정렬(C1) — 없거나 모르는 키면 추천순(null).
    sort: parseUnifiedSort(searchParams.get("sort"), searchParams.get("dir")),
  }
}

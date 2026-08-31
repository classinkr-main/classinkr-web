import "server-only"

import { CRM_STAFF_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { getAdminCrmOverview } from "@/lib/admin-crm-overview"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { settleWithinBudget } from "@/lib/admin/prefetch-budget"
import { buildCompassPipelineBand } from "@/lib/compass/home-band"
import { getLeadActionStats } from "@/lib/repositories/leads"
import type {
  AdminCrmOverview,
  CompassPipelineKpis,
  LeadActionKpis,
} from "@/components/admin/crm/home/shared"

/**
 * CRM 홈 첫 화면(스크롤 없이 보이는 리드 요약·Compass 밴드·콕핏 지표)을 서버에서 미리 만든다.
 *
 * 각 항목은 대응 라우트가 부르는 것과 **같은 lib 함수**를 직접 호출한다(HTTP 자기호출 없음):
 *  - leadActionKpis   ← /api/admin/crm/action-kpis       (getLeadActionStats)
 *  - overview         ← /api/admin/crm/overview          (getAdminCrmOverview)
 *  - compassPipeline  ← /api/admin/crm/compass-pipeline  (buildCompassPipelineBand)
 *
 * 왜 이 셋인가: 홈은 마운트에서 클라이언트 fetch 8개를 띄우는데, 그중 이 셋이 첫 화면
 * 위쪽을 그린다. 특히 overview는 서버에서 DB 왕복이 30회에 가까워 가장 늦게 도착한다.
 *
 * 보안: 이 저장소에는 middleware가 없고 app/admin/layout.tsx의 가드는 보안 경계가 아니다.
 * 실제 차단은 각 라우트의 requireVerifiedAdminContext이므로, 프리페치도 같은 검증
 * (getVerifiedAdminContextForPage)과 **같은 역할 목록**(CRM_STAFF_ADMIN_API_ROLES)을
 * 통과해야만 값을 만든다. 컨텍스트가 없거나 역할이 모자라면 전부 null로 내려보내고,
 * 클라이언트가 기존 경로대로 페치해 API가 401/403으로 차단한다 —
 * 미검증 요청에는 어떤 데이터도 실리지 않는다.
 *
 * 예산: 소스별로 settleWithinBudget(1.2초)을 건다. 느린 소스 하나가 빠른 둘을 붙잡지 않고,
 * 넘긴 소스만 null이 되어 그 항목만 클라이언트 페치로 떨어진다.
 */
export interface CrmHomeInitialData {
  leadActionKpis: LeadActionKpis | null
  overview: AdminCrmOverview | null
  compassPipeline: CompassPipelineKpis | null
}

const EMPTY_INITIAL_DATA: CrmHomeInitialData = {
  leadActionKpis: null,
  overview: null,
  compassPipeline: null,
}

export async function prefetchCrmHomeInitialData(): Promise<CrmHomeInitialData> {
  // 검증 경로 자체가 던지면(예: Supabase env 부재) 페이지를 500으로 만들지 않고
  // 프리페치 없음으로 떨어뜨린다 — 지금까지의 동작(항상 렌더 후 클라이언트 페치)과 같다.
  let admin: Awaited<ReturnType<typeof getVerifiedAdminContextForPage>> = null
  try {
    admin = await getVerifiedAdminContextForPage()
  } catch (error) {
    console.error("[crm home prefetch] admin verification failed", error)
    return EMPTY_INITIAL_DATA
  }
  if (!admin || !hasAdminApiRole(admin.role, CRM_STAFF_ADMIN_API_ROLES)) return EMPTY_INITIAL_DATA

  const [leadActionKpis, overview, compassPipeline] = await Promise.all([
    settleWithinBudget(() => getLeadActionStats()),
    settleWithinBudget(() => getAdminCrmOverview()),
    settleWithinBudget(() => buildCompassPipelineBand()),
  ])

  return { leadActionKpis, overview, compassPipeline }
}

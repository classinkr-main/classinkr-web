import "server-only"

import {
  BRANCH_READ_ADMIN_API_ROLES,
  CRM_STAFF_ADMIN_API_ROLES,
  hasAdminApiRole,
} from "@/lib/admin-auth"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { settleWithinBudget } from "@/lib/admin/prefetch-budget"
import { getAdminVisitorStats, type VisitorStatsPayload } from "@/lib/admin-visitor-stats"
import type { OverviewLeadSummary } from "@/lib/admin/overview/lead-summary"
import { getCachedOverviewLeadSummary } from "@/lib/admin/overview/lead-summary-cache"
import { getCachedOsSummary, type OsSummary } from "@/lib/admin/overview/os-summary"
import { getLeadActionStats } from "@/lib/repositories/leads"

/**
 * Overview 첫 화면(스크롤 없이 보이는 인바운드·운영 OS·흐름 지표)을 그리는 데 필요한
 * 무거운 소스를 서버에서 미리 집계한다. 각 항목은 대응 API 라우트가 부르는 것과 **같은**
 * lib 함수를 직접 호출한다(HTTP 자기호출 없음):
 *  - leadOverview   ← /api/admin/leads?scope=overview  (getCachedOverviewLeadSummary)
 *  - visitorStats   ← /api/admin/visitor-stats?range=7 (getAdminVisitorStats)
 *  - leadActionKpis ← /api/admin/crm/action-kpis       (getLeadActionStats)
 *  - osSummary      ← /api/admin/os-summary            (getCachedOsSummary)
 *
 * 보안: 이 저장소에는 middleware가 없고 app/admin/layout.tsx의 가드는 보안 경계가 아니다.
 * 실제 차단은 각 라우트의 verifyAdmin/requireVerifiedAdminContext이므로, 프리페치도
 * 같은 검증(getVerifiedAdminContextForPage)과 **같은 역할 목록**을 통과해야만 값을 만든다.
 * 컨텍스트가 없거나 역할이 모자라면 null로 내려보내고, 클라이언트가 기존 경로대로
 * 페치해 API가 401/403으로 차단한다 — 미검증 요청에는 어떤 데이터도 실리지 않는다.
 */
export interface OverviewInitialData {
  leadOverview: OverviewLeadSummary | null
  visitorStats: VisitorStatsPayload | null
  /** 화면이 실제로 소비하는 두 수치만 — 나머지 LeadActionStats 필드는 RSC 페이로드에 싣지 않는다. */
  leadActionKpis: { unrespondedCount: number; unresponded24hCount: number } | null
  /** 라우트 응답과 같은 객체 — 소스별 health를 포함해야 실패를 0으로 오인하지 않는다. */
  osSummary: OsSummary | null
}

const EMPTY_INITIAL_DATA: OverviewInitialData = {
  leadOverview: null,
  visitorStats: null,
  leadActionKpis: null,
  osSummary: null,
}

// 서버 프리페치가 첫 HTML을 붙잡지 않게 하는 상한은 lib/admin/prefetch-budget으로 공용화했다
// (하드웨어·KR Team·장부 페이지가 같은 1.2초 예산을 쓴다). 근거·동작은 그 파일 주석 참조.

export async function prefetchOverviewInitialData(): Promise<OverviewInitialData> {
  // 검증 경로 자체가 던지면(예: Supabase env 부재) 페이지를 500으로 만들지 않고
  // 프리페치 없음으로 떨어뜨린다 — 오늘까지의 동작(항상 렌더 후 클라이언트 페치)과 같다.
  let admin: Awaited<ReturnType<typeof getVerifiedAdminContextForPage>> = null
  try {
    admin = await getVerifiedAdminContextForPage()
  } catch (error) {
    console.error("[overview prefetch] admin verification failed", error)
    return EMPTY_INITIAL_DATA
  }
  if (!admin) return EMPTY_INITIAL_DATA

  // 라우트별 허용 역할과 문자 그대로 같은 목록을 쓴다.
  // - leads?scope=overview·crm/action-kpis: requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  // - visitor-stats·os-summary: verifyAdmin(req) → GET 기본값 = BRANCH_READ_ADMIN_API_ROLES
  const crmAllowed = hasAdminApiRole(admin.role, CRM_STAFF_ADMIN_API_ROLES)
  const readAllowed = hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES)

  const [leadOverview, visitorStats, leadActions, osSummary] = await Promise.all([
    crmAllowed ? settleWithinBudget(() => getCachedOverviewLeadSummary()) : null,
    // 클라이언트가 부르는 URL은 ?range=7 — parseVisitorStatsRange("7")과 같은 값을 넘긴다.
    readAllowed ? settleWithinBudget(() => getAdminVisitorStats(7)) : null,
    crmAllowed ? settleWithinBudget(() => getLeadActionStats()) : null,
    // 라우트가 부르는 것과 같은 캐시 엔트리 — 콜드 미스여도 예산을 넘기면 null로 떨어져
    // 클라이언트가 기존대로 /api/admin/os-summary를 탄다(그때는 이 계산이 이미 웜).
    readAllowed ? settleWithinBudget(() => getCachedOsSummary()) : null,
  ])

  return {
    leadOverview,
    visitorStats,
    leadActionKpis: leadActions
      ? {
          unrespondedCount: leadActions.unrespondedCount,
          unresponded24hCount: leadActions.unresponded24hCount,
        }
      : null,
    osSummary,
  }
}

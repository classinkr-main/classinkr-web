import "server-only"

import { BRANCH_READ_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { settleWithinBudget } from "@/lib/admin/prefetch-budget"
import {
  EMPTY_MARKETING_GLANCE_INITIAL_DATA,
  type MarketingGlanceInitialData,
  type MarketingInsightsResponse,
} from "@/lib/marketing/glance-initial-data"
import { buildMarketingInsight } from "@/lib/marketing/insights/input-builder"
import { getCachedIntakeToday } from "@/lib/marketing/intake-today"
import type { PerfPeriodKey } from "@/lib/marketing/perf"
import { getCachedMarketingPerf } from "@/lib/marketing/perf-assemble"
import { getLatestInsight } from "@/lib/repositories/marketing-insights"

/**
 * 마케팅 한눈에 층(/admin/campaigns 기본 탭)의 첫 화면을 서버에서 미리 집계한다.
 * 각 항목은 대응 API 라우트가 부르는 것과 **같은** lib 함수를 직접 호출한다(HTTP 자기호출 없음):
 *  - perf     ← /api/admin/marketing/perf?period=…  (getCachedMarketingPerf — Data Cache 60초 공유)
 *  - insights ← /api/admin/marketing/insights        (getLatestInsight + buildMarketingInsight 의 flags)
 *  - intake   ← /api/admin/marketing/intake-today    (getCachedIntakeToday — Data Cache 20초 공유)
 *
 * 보안: 세 라우트 모두 verifyAdmin(req) 기본값(GET = BRANCH_READ_ADMIN_API_ROLES)이라 같은 역할
 * 목록으로 가른다. 컨텍스트가 없거나 역할이 모자라면 null 로 내려보내고, 클라이언트가 기존 경로대로
 * 페치해 API 가 401/403 으로 차단한다 — 미검증 요청에는 어떤 데이터도 실리지 않는다.
 *
 * 예산: lib/admin/prefetch-budget 의 공용 1.2초. 넘긴 소스는 null 로 떨어져 클라이언트 페치 경로를
 * 그대로 탄다(그때는 서버 캐시가 이미 데워져 있다). Overview·CRM 홈과 같은 패턴.
 */
export async function prefetchMarketingGlanceInitialData(period: PerfPeriodKey): Promise<MarketingGlanceInitialData> {
  let admin: Awaited<ReturnType<typeof getVerifiedAdminContextForPage>> = null
  try {
    admin = await getVerifiedAdminContextForPage()
  } catch (error) {
    console.error("[marketing glance prefetch] admin verification failed", error)
    return EMPTY_MARKETING_GLANCE_INITIAL_DATA
  }
  if (!admin || !hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES)) {
    return EMPTY_MARKETING_GLANCE_INITIAL_DATA
  }

  const [perf, insights, intake] = await Promise.all([
    settleWithinBudget(() => getCachedMarketingPerf(period)),
    settleWithinBudget(() => loadStoredInsights()),
    settleWithinBudget(() => getCachedIntakeToday()),
  ])

  return { perf, insights, intake, generatedAt: Date.now() }
}

/**
 * insights 라우트의 기본(비 force) 경로와 같은 조립 — 저장된 최신 브리핑 + "현재" 이상 신호.
 * 이상 감지 실패는 브리핑을 죽이지 않고 error 로만 실린다(라우트와 같은 강등 규칙).
 */
async function loadStoredInsights(): Promise<MarketingInsightsResponse> {
  const [insight, anomalies] = await Promise.all([
    getLatestInsight("weekly"),
    buildMarketingInsight().then(
      (build) => ({ flags: build.flags, error: null as string | null }),
      (e: unknown) => ({ flags: [], error: `이상 감지 계산 실패: ${e instanceof Error ? e.message : String(e)}` })
    ),
  ])
  return {
    insight: insight
      ? { headline: insight.headline, created_at: insight.created_at, payload: insight.payload }
      : null,
    anomalies: anomalies.flags,
    from: insight ? "stored" : "empty",
    error: anomalies.error ?? undefined,
  }
}

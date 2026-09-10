import SalesLedgerWorkbench, { type LedgerPipelinePrefetch } from "@/components/admin/branch/SalesLedgerWorkbench"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { settleWithinBudget } from "@/lib/admin/prefetch-budget"
import { BRANCH_READ_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { resolvePeriodDate } from "@/lib/branch/fiscal"
import { readBranchPipelineRows } from "@/lib/branch/pipeline-rows"

export const dynamic = "force-dynamic"

// 워크벤치가 첫 렌더에서 부르는 URL — team/period/month 상태 초기값(ALL · Q · month 미포함)이
// 그대로 쿼리가 된다. ?team=BD 같은 딥링크는 마운트 효과가 상태를 바꾼 뒤 별도 요청으로 나가므로
// 서버가 미리 만들어야 하는 조합은 항상 이 기본형 하나다.
const INITIAL_TEAM = "ALL"
const INITIAL_PERIOD = "Q"
const INITIAL_PIPELINE_URL = `/api/admin/branch/pipeline?team=${INITIAL_TEAM}&period=${INITIAL_PERIOD}`

/**
 * 첫 화면 서버 프리페치 — GET /api/admin/branch/pipeline과 같은 검증(BRANCH_READ_ADMIN_API_ROLES)·
 * 같은 조립 함수(readBranchPipelineRows)로 rows를 만든다.
 * 컨텍스트가 없거나 역할이 허용 목록 밖이면 데이터를 만들지 않고 null을 돌려준다 —
 * 그 경우 화면은 지금까지처럼 클라이언트 페치로 떨어지고, 그 요청은 API가 401/403으로 막는다.
 */
async function prefetchLedgerPipeline(): Promise<LedgerPipelinePrefetch | null> {
  const admin = await getVerifiedAdminContextForPage()
  if (!admin || !hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES)) return null

  const rows = await readBranchPipelineRows({
    team: INITIAL_TEAM,
    period: INITIAL_PERIOD,
    periodDate: resolvePeriodDate(INITIAL_PERIOD, null),
  })
  // generatedAt(T3) — 이 프리페치가 지금 settle된 시각. staleTimes.dynamic(180초)로 클라이언트
  // 라우터 캐시가 이 RSC 응답을 재사용하면, SalesLedgerWorkbench가 받는 시점엔 이미 오래된
  // 값일 수 있다 — isPrefetchFresh(lib/admin/prefetch-freshness.ts)가 이 값으로 판정한다.
  return { url: INITIAL_PIPELINE_URL, data: { rows }, generatedAt: Date.now() }
}

export default async function BranchSalesLedgerPage() {
  // 프리페치는 공용 예산(1.2초) 안에서만 기다린다. 이 페이지는 force-dynamic이라 프리페치가
  // 끝나야 HTML이 흐르는데, readBranchPipelineRows 콜드 미스가 TTFB를 무제한 붙잡으면
  // 스켈레톤 대신 빈 탭을 오래 보게 된다. 초과·실패는 모두 null = "프리페치 없음"으로 떨어져
  // 지금까지처럼 클라이언트 페치 경로를 탄다.
  const initialPipeline: LedgerPipelinePrefetch | null = await settleWithinBudget(prefetchLedgerPipeline)

  return <SalesLedgerWorkbench initialPipeline={initialPipeline} />
}

import { Suspense } from "react"
import AdminRouteLoading from "@/components/admin/AdminRouteLoading"
import SalesLedgerWorkbench, { type LedgerPipelinePrefetch } from "@/components/admin/branch/SalesLedgerWorkbench"
import type { BranchPipelineResponse } from "@/components/admin/branch/types"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane } from "@/lib/admin/prefetch-budget"
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
 * 컨텍스트가 없거나 역할이 허용 목록 밖이면 데이터를 만들지 않고 null을 돌려준다 — 그 경우
 * (아래 openPrefetchLane이 감싸는) promise가 null로 settle되고, 화면은 지금까지처럼 클라이언트
 * 페치로 떨어지며 그 요청은 API가 401/403으로 막는다.
 *
 * 횡단 인프라 개편(2026-09-10 스트리밍 전환): 검증(getVerifiedAdminContextForPage)까지 이 함수
 * 안으로 들어왔다 — page.tsx는 이제 아무것도 기다리지 않는다(TTFB 0ms). 요청자 컨텍스트는 매
 * 요청 이 run() 콜백 안에서 새로 평가된다(캐시 밖).
 */
async function prefetchLedgerRows(): Promise<BranchPipelineResponse | null> {
  const admin = await getVerifiedAdminContextForPage()
  if (!admin || !hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES)) return null

  const rows = await readBranchPipelineRows({
    team: INITIAL_TEAM,
    period: INITIAL_PERIOD,
    periodDate: resolvePeriodDate(INITIAL_PERIOD, null),
  })
  return { rows }
}

export default function BranchSalesLedgerPage() {
  // openPrefetchLane은 run()을 기다리지 않고 즉시 {promise, generatedAt}을 돌려준다 —
  // readBranchPipelineRows 콜드 미스가 아무리 느려도 TTFB에 1ms도 얹지 않는다. 예전
  // settleWithinBudget은 1.2초 예산을 다 기다린 뒤에야 null을 반환했고, 그 null을 받은
  // 클라이언트가 다시 같은 데이터를 요청해 "1.2초 낭비 + 클라이언트 왕복"의 이중비용이 났다
  // (tmp/admin-overhaul-2026-09-10/platform.md §2.0). 이제 그 대기 자체가 없다.
  const lane = openPrefetchLane(prefetchLedgerRows)
  const initialPipeline: LedgerPipelinePrefetch = {
    url: INITIAL_PIPELINE_URL,
    promise: lane.promise,
    generatedAt: lane.generatedAt,
  }

  // SalesLedgerWorkbench는 pipelineSeedCandidate(URL이 기본 조합과 일치할 때만)에서만 React
  // use()로 이 promise를 푼다 — 딥링크·필터 변경은 애초에 이 promise를 기다리지 않으므로
  // Suspense가 걸리지 않는다. fallback은 이 라우트의 기존 loading.tsx와 같은 AdminRouteLoading을
  // 재사용해 새 로딩 UI를 만들지 않는다. 장부 RSC 페이로드 비대화(비압축 2.4MB, gzip 21KB —
  // §플랫폼 보고서 2.2(b))는 이 Suspense 경계 도입과 독립적인 이슈라 여기서 함께 손대지
  // 않는다 — 385행 pipeline은 여전히 이 경계 안(promise resolve 값)에 담겨 스트리밍된다.
  return (
    <Suspense fallback={<AdminRouteLoading />}>
      <SalesLedgerWorkbench initialPipeline={initialPipeline} />
    </Suspense>
  )
}

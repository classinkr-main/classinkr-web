import { Suspense } from "react"
import AdminRouteLoading from "@/components/admin/AdminRouteLoading"
import BranchDashboardClient, { type BranchSummaryPrefetch } from "@/components/admin/branch/BranchDashboardClient"
import type { BranchSummaryResponse } from "@/components/admin/branch/types"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { openPrefetchLane } from "@/lib/admin/prefetch-budget"
import { BRANCH_READ_ADMIN_API_ROLES, hasAdminApiRole } from "@/lib/admin-auth"
import { resolvePeriodDate } from "@/lib/branch/fiscal"
import { buildBranchSummaryPayload } from "@/lib/branch/summary-payload"

export const dynamic = "force-dynamic"

// 대시보드가 첫 렌더에서 부르는 URL — team/period/tab 상태 초기값(ALL · Q · 개요, month 미포함)이
// 그대로 쿼리가 된다. 개요 탭은 타임라인 projection(view=overview)을 함께 요청한다.
// ?tab=pipeline 같은 딥링크는 마운트 시 초기 상태가 달라져 다른 URL을 만들므로 시드가 버려지고
// 기존 클라이언트 페치로 떨어진다 — 서버가 미리 만들어야 하는 조합은 항상 이 기본형 하나다.
const INITIAL_TEAM = "ALL"
const INITIAL_PERIOD = "Q"
const INITIAL_SUMMARY_URL = `/api/admin/branch/summary?team=${INITIAL_TEAM}&period=${INITIAL_PERIOD}&view=overview`

/**
 * 첫 화면 서버 프리페치 — GET /api/admin/branch/summary와 같은 검증(BRANCH_READ_ADMIN_API_ROLES)·
 * 같은 조립 함수(buildBranchSummaryPayload)로 페이로드를 만든다.
 * 컨텍스트가 없거나 역할이 허용 목록 밖이면 데이터를 만들지 않고 null을 돌려준다 — 그 경우
 * (아래 openPrefetchLane이 감싸는) promise가 null로 settle되고, 화면은 지금까지처럼 클라이언트
 * 페치로 떨어지며 그 요청은 API가 401/403으로 막는다.
 *
 * skipSheetFreshness=true — 시트 신선도(Google Drive modifiedTime 2회)는 HTML TTFB에 얹지 않는다.
 * sheetModifiedAt은 null이 되고 SyncStatusBar의 "시트가 DB보다 앞섬" 경고만 첫 렌더에서 빠진다
 * (Drive 조회 실패 때와 동일한 fail-soft 값). 새로고침·필터 변경 이후의 요청은 라우트를 타므로
 * 그때부터는 기존과 동일하게 채워진다.
 *
 * 횡단 인프라 개편(2026-09-10 스트리밍 전환): 검증(getVerifiedAdminContextForPage)까지 이 함수
 * 안으로 들어왔다 — page.tsx는 이제 아무것도 기다리지 않는다(TTFB 0ms). 요청자 컨텍스트는 매
 * 요청 이 run() 콜백 안에서 새로 평가된다(캐시 밖).
 */
async function prefetchBranchSummary(): Promise<BranchSummaryResponse | null> {
  const admin = await getVerifiedAdminContextForPage()
  if (!admin || !hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES)) return null

  const now = new Date()
  const periodDate = resolvePeriodDate(INITIAL_PERIOD, null, now)
  if (!periodDate) return null

  return buildBranchSummaryPayload({
    team: INITIAL_TEAM,
    period: INITIAL_PERIOD,
    periodDate,
    includeBreakdown: false,
    overviewView: true,
    now,
    skipSheetFreshness: true,
  })
}

export default function BranchDashboardPage() {
  // openPrefetchLane은 run()을 기다리지 않고 즉시 {promise, generatedAt}을 돌려준다 —
  // buildBranchSummaryPayload 콜드 미스가 아무리 느려도 TTFB에 1ms도 얹지 않는다. 예전
  // settleWithinBudget은 1.2초 예산을 다 기다린 뒤에야 null을 반환했고, 그 null을 받은
  // 클라이언트가 다시 같은 데이터를 요청해 "1.2초 낭비 + 클라이언트 왕복"의 이중비용이 났다
  // (tmp/admin-overhaul-2026-09-10/platform.md §2.0). 이제 그 대기 자체가 없다.
  const lane = openPrefetchLane(prefetchBranchSummary)
  const initialData: BranchSummaryPrefetch = {
    url: INITIAL_SUMMARY_URL,
    promise: lane.promise,
    generatedAt: lane.generatedAt,
  }

  // BranchDashboardClient는 summarySeedCandidate(URL이 기본 조합과 일치할 때만)에서만 React
  // use()로 이 promise를 푼다 — 딥링크(?team=BD 등)는 애초에 이 promise를 기다리지 않으므로
  // Suspense가 걸리지 않는다. fallback은 이 라우트의 기존 loading.tsx와 같은 AdminRouteLoading을
  // 재사용해 새 로딩 UI를 만들지 않는다.
  return (
    <Suspense fallback={<AdminRouteLoading />}>
      <BranchDashboardClient initialData={initialData} />
    </Suspense>
  )
}

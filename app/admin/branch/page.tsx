import BranchDashboardClient, { type BranchSummaryPrefetch } from "@/components/admin/branch/BranchDashboardClient"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
import { settleWithinBudget } from "@/lib/admin/prefetch-budget"
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
 * 컨텍스트가 없거나 역할이 허용 목록 밖이면 데이터를 만들지 않고 null을 돌려준다 —
 * 그 경우 화면은 지금까지처럼 클라이언트 페치로 떨어지고, 그 요청은 API가 401/403으로 막는다.
 *
 * skipSheetFreshness=true — 시트 신선도(Google Drive modifiedTime 2회)는 HTML TTFB에 얹지 않는다.
 * sheetModifiedAt은 null이 되고 SyncStatusBar의 "시트가 DB보다 앞섬" 경고만 첫 렌더에서 빠진다
 * (Drive 조회 실패 때와 동일한 fail-soft 값). 새로고침·필터 변경 이후의 요청은 라우트를 타므로
 * 그때부터는 기존과 동일하게 채워진다.
 */
async function prefetchBranchSummary(): Promise<BranchSummaryPrefetch | null> {
  const admin = await getVerifiedAdminContextForPage()
  if (!admin || !hasAdminApiRole(admin.role, BRANCH_READ_ADMIN_API_ROLES)) return null

  const now = new Date()
  const periodDate = resolvePeriodDate(INITIAL_PERIOD, null, now)
  if (!periodDate) return null

  const data = await buildBranchSummaryPayload({
    team: INITIAL_TEAM,
    period: INITIAL_PERIOD,
    periodDate,
    includeBreakdown: false,
    overviewView: true,
    now,
    skipSheetFreshness: true,
  })
  return { url: INITIAL_SUMMARY_URL, data }
}

export default async function BranchDashboardPage() {
  // 프리페치는 공용 예산(1.2초) 안에서만 기다린다. 이 페이지는 force-dynamic이라 프리페치가
  // 끝나야 HTML이 흐르는데, buildBranchSummaryPayload 콜드 미스가 TTFB를 무제한 붙잡으면
  // 스켈레톤 대신 빈 탭을 오래 보게 된다. 초과·실패는 모두 null = "프리페치 없음"으로 떨어져
  // 지금까지처럼 클라이언트 페치 경로를 탄다.
  const initialData: BranchSummaryPrefetch | null = await settleWithinBudget(prefetchBranchSummary)

  return <BranchDashboardClient initialData={initialData} />
}

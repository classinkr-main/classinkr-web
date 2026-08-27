import SalesLedgerWorkbench, { type LedgerPipelinePrefetch } from "@/components/admin/branch/SalesLedgerWorkbench"
import { getVerifiedAdminContextForPage } from "@/lib/admin/page-auth"
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
  return { url: INITIAL_PIPELINE_URL, data: { rows } }
}

export default async function BranchSalesLedgerPage() {
  let initialPipeline: LedgerPipelinePrefetch | null = null
  try {
    initialPipeline = await prefetchLedgerPipeline()
  } catch {
    // 프리페치 실패는 화면을 죽이지 않는다 — 데이터 없이 렌더하고 클라이언트가 다시 받아온다.
    initialPipeline = null
  }

  return <SalesLedgerWorkbench initialPipeline={initialPipeline} />
}

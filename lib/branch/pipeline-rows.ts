import "server-only"

import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { readRevDealsFromActiveImport } from "@/lib/repositories/sales-ledger-imports"
import { listRevRevenue, type RevRevenueRow } from "@/lib/branch/computations/pipeline"
import { fyOf } from "@/lib/branch/fiscal"

export type BranchPipelineTeam = "ALL" | "BD" | "MKT" | "CSM"
export type BranchPipelinePeriod = "M" | "Q" | "Y"

export interface BranchPipelineRowsQuery {
  team?: BranchPipelineTeam
  period?: BranchPipelinePeriod
  /** resolvePeriodDate(period, month, now)의 결과. period가 없으면 null. */
  periodDate?: Date | null
  manager?: string
  region?: string
}

/**
 * GET /api/admin/branch/pipeline 응답의 rows를 만드는 조립 로직.
 *
 * 라우트(app/api/admin/branch/pipeline/route.ts)와 페이지 서버 프리페치
 * (app/admin/branch/ledger/page.tsx)가 같은 함수를 써야 두 경로의 rows shape이 갈라지지 않는다.
 * 쿼리 파싱·검증(team/period/month 400)과 인증은 각 호출부가 담당한다.
 */
export async function readBranchPipelineRows(
  query: BranchPipelineRowsQuery = {}
): Promise<RevRevenueRow[]> {
  const { team, period, periodDate = null, manager, region } = query
  const fy = fyOf(periodDate ?? new Date())
  // listRevRevenue가 deal.raw(weeklyPayments/row)로 주차 프로젝션을 계산하므로
  // 미러 폴백에서는 raw를 명시적으로 opt-in한다(branch-deals.ts 기본값은 raw 제외).
  const deals =
    (await readRevDealsFromActiveImport(fy, { team })) ??
    (await listBranchRevDeals({ team }, { withRaw: true }))
  return listRevRevenue(
    deals,
    { team, manager, region },
    period && periodDate ? { period, now: periodDate } : undefined
  )
}

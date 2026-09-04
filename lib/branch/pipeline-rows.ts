import "server-only"

import { unstable_cache } from "next/cache"
import { shareInFlightByArgs } from "@/lib/server/share-in-flight"

import { listBranchRevDeals, BRANCH_REV_DEALS_CACHE_TAG } from "@/lib/repositories/branch-deals"
import {
  readRevDealsFromActiveImport,
  SALES_LEDGER_IMPORTS_CACHE_TAG,
} from "@/lib/repositories/sales-ledger-imports"
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
 * 콜드 Fluid 인스턴스 재계산 방지 — 하위 소스(readRevDealsFromActiveImport/
 * listBranchRevDeals)는 이미 각자 unstable_cache지만, 이 조립(listRevRevenue: 필터·월별
 * 확정액 산정·weeklyPaymentsFromRaw raw 파싱·정렬)엔 캐시가 없어 소스가 전부 캐시 히트여도
 * CPU 재계산이 매 요청 실행됐다 — 콜드 인스턴스는 이 재계산에 더해 소스 캐시 조회 왕복까지
 * 겹친다. 인자는 team/manager/region을 원래 호출과 한 글자도 다르지 않게 그대로 넘긴다
 * (undefined 포함) — 정규화하면 미러 폴백 회귀 가드(tests/api/branch-pipeline-weekly-
 * payments.test.ts)가 보는 호출 인자가 달라진다. periodDate(Date)만 ISO 문자열로 낮춰
 * 캐시 키 인자로 쓰고, 캐시된 함수 안에서 복원한다 — Date 참조는 매번 달라 보여 캐시 키가
 * 안정적이지 않다.
 *
 * 태그는 새로 만들지 않고 하위 소스가 이미 쓰는 두 태그를 재사용한다 — 액티브 임포트
 * 재캡처(activateRevImportRun → revalidateTag(SALES_LEDGER_IMPORTS_CACHE_TAG,"max"))나
 * REV 미러 교체(replaceBranchRevDeals → revalidateTag(BRANCH_REV_DEALS_CACHE_TAG,"max"))가
 * 일어나면 이 조립 캐시도 함께 무효화된다 — 새 태그를 걸면 소스가 갱신돼도 이 레이어만
 * 60초간 stale로 남는다.
 *
 * 페이로드 실측(2026-09-04, 프로덕션 Supabase 읽기전용 프로브): REV 미러 385행(raw 포함)
 * 이 417KB — 이 함수의 출력(RevRevenueRow[])은 raw 전체를 들고 있지 않고 weeklyPayments만
 * 추출하므로 이보다 작다. 1MB 한도에 여유가 있어 중간 산출물이 아닌 조립 결과 전체를 캐시한다.
 */
async function assembleBranchPipelineRows(
  team: BranchPipelineTeam | undefined,
  period: BranchPipelinePeriod | undefined,
  periodDateIso: string | null,
  manager: string | undefined,
  region: string | undefined,
): Promise<RevRevenueRow[]> {
  const periodDate = periodDateIso ? new Date(periodDateIso) : null
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

const getCachedBranchPipelineRows = unstable_cache(
  // 같은 인스턴스의 동시 미스·재검증은 shareInFlightByArgs 로 한 번만 계산한다(unstable_cache 는 인스턴스 안 동시 호출을 합치지 않는다).
  shareInFlightByArgs("branch-pipeline-rows-v1", assembleBranchPipelineRows),
  ["branch-pipeline-rows-v1"],
  { revalidate: 60, tags: [SALES_LEDGER_IMPORTS_CACHE_TAG, BRANCH_REV_DEALS_CACHE_TAG] },
)

/**
 * GET /api/admin/branch/pipeline 응답의 rows를 만드는 조립 로직.
 *
 * 라우트(app/api/admin/branch/pipeline/route.ts)와 페이지 서버 프리페치
 * (app/admin/branch/ledger/page.tsx)가 같은 함수를 써야 두 경로의 rows shape이 갈라지지 않는다.
 * 두 소비처가 같은 Data Cache 엔트리를 공유한다 — 프리페치가 1.2초 예산 안에서 콜드 미스를
 * 기다리는 동안 다른 인스턴스가 이미 데워 둔 값이 있으면 그 값을 바로 받는다.
 * 쿼리 파싱·검증(team/period/month 400)과 인증은 각 호출부가 담당한다.
 */
export async function readBranchPipelineRows(
  query: BranchPipelineRowsQuery = {}
): Promise<RevRevenueRow[]> {
  const { team, period, periodDate = null, manager, region } = query
  return getCachedBranchPipelineRows(
    team,
    period,
    periodDate ? periodDate.toISOString() : null,
    manager,
    region,
  )
}

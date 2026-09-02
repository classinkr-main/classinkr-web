import { NextRequest, NextResponse } from "next/server"
import { unstable_cache } from "next/cache"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { ADMIN_CRM_COVERAGE_CACHE_TAG, ADMIN_OS_SUMMARY_CACHE_TAG } from "@/lib/admin/crm/cache-tags"
import { getCrmSourceLinkCoverage } from "@/lib/repositories/crm-source-links"
import { getRevAccountCoverage, type RevAccountCoverage } from "@/lib/repositories/rev-account-coverage"

function buildCoverageHealth(coverage: {
  total: number
  linked: number
  needsReview: number
  coveragePct: number
}) {
  if (coverage.total <= 0) {
    return {
      state: "no_data",
      label: "연동 데이터 없음",
      detail: "ClassIn 고객 DB와 연결된 외부 원천이 아직 없습니다.",
    } as const
  }

  if (coverage.needsReview > 0 || coverage.coveragePct < 70) {
    return {
      state: "partial",
      label: "검토 필요",
      detail: "현재 저장된 매칭 링크 중 관리자 검토와 연결 확정이 필요한 항목이 있습니다.",
    } as const
  }

  return {
    state: "ready",
    label: "정상",
    detail: "현재 저장된 매칭 링크가 ClassIn 고객 DB에 모두 확정됐습니다.",
  } as const
}

interface CrmCoverageBundle {
  coverage: Awaited<ReturnType<typeof getCrmSourceLinkCoverage>>
  revAccounts: RevAccountCoverage | null
}

// getCrmSourceLinkCoverage(fetchSupabasePages ×3)와 getRevAccountCoverage(REV 시트 풀스캔 +
// fetchSupabasePages ×2)를 조합하는 무거운 합성이라 60초 캐시한다.
// "admin-os-summary"는 lib/admin/overview/os-summary.ts의 getCachedOsSummary가 같은 원천
// (getCrmSourceLinkCoverage)을 감싸며 쓰는 태그 — 함께 걸어 두면 그 경로로 무효화가 생길 때
// coverage도 같이 신선해진다. 소스 링크 확정/해제/생성 뮤테이션(source-links/[id], bulk,
// manual, generate)이 두 태그를 revalidateTag로 무효화한다(lib/admin/crm/cache-tags.ts).
const CRM_COVERAGE_CACHE_TAG = ADMIN_CRM_COVERAGE_CACHE_TAG

const getCachedCrmCoverageBundle = unstable_cache(
  async (): Promise<CrmCoverageBundle> => {
    const [coverage, revAccounts] = await Promise.all([
      getCrmSourceLinkCoverage(),
      getRevAccountCoverage().catch((): RevAccountCoverage | null => null),
    ])
    return { coverage, revAccounts }
  },
  [CRM_COVERAGE_CACHE_TAG],
  { revalidate: 60, tags: [CRM_COVERAGE_CACHE_TAG, ADMIN_OS_SUMMARY_CACHE_TAG] }
)

// 현황 홈 키스톤 위젯용 경량 커버리지. os-summary(무거운 합성)와 분리.
// revAccounts = 매출보유 계정 기준 커버리지(스파인 키스톤) — 링크 행 수 기준(기존)과 달리
// 후보조차 없는 REV 고객의 매출 누락을 드러낸다. 실패해도 기존 지표는 살린다(부분 격리).
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { coverage, revAccounts } = await getCachedCrmCoverageBundle()
  return adminCachedJson({
    ...coverage,
    health: buildCoverageHealth(coverage),
    revAccounts,
  })
}

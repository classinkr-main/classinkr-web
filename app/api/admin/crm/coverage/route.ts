import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCrmSourceLinkCoverage } from "@/lib/repositories/crm-source-links"

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
      detail: "외부 원천은 참고용이며 ClassIn 고객 DB 연결 확정이 필요합니다.",
    } as const
  }

  return {
    state: "ready",
    label: "정상",
    detail: "ClassIn 고객 DB 기준 연결 상태입니다.",
  } as const
}

// 현황 홈 키스톤 위젯용 경량 커버리지. os-summary(무거운 합성)와 분리.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const coverage = await getCrmSourceLinkCoverage()
  return adminCachedJson({
    ...coverage,
    health: buildCoverageHealth(coverage),
  })
}

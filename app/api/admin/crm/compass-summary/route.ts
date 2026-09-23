import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { buildCompassSummary } from "@/lib/compass/summary"
import { COMPASS_SUMMARY_DEFAULT_PERIOD, isCompassSummaryPeriodKey } from "@/lib/compass/summary-contract"

// Compass(mkt.classin.co.kr) 정리 대시보드 요약(§13 D1) — 조립 정본은 lib/compass/summary.ts.
// 홈 밴드(compass-pipeline)와 별개 엔드포인트다: 이쪽은 기간 선택형 퍼널·담당별·이탈 사유·
// 다음 액션 목록까지 묶은 무거운 집계라 캐시 계약(adminCachedJson)만 공유한다.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const rawPeriod = req.nextUrl.searchParams.get("period") ?? COMPASS_SUMMARY_DEFAULT_PERIOD
  if (!isCompassSummaryPeriodKey(rawPeriod)) {
    return NextResponse.json(
      { error: "유효하지 않은 period — 7d|30d|90d 중 하나여야 합니다" },
      { status: 400 }
    )
  }

  try {
    return adminCachedJson(await buildCompassSummary(rawPeriod))
  } catch (error) {
    console.error("[GET /api/admin/crm/compass-summary]", error)
    return NextResponse.json({ error: "Failed to fetch Compass summary" }, { status: 500 })
  }
}

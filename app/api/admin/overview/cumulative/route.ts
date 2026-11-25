import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getOverviewCumulative } from "@/lib/admin/overview/cumulative"

// GET /api/admin/overview/cumulative — Overview 히어로의 누적 고객(REV 장부) · 누적 판매 대수(하드웨어 원장).
// 읽기 전용. 원천별 실패는 응답 안에서 status:"error"로 격리한다(부분 실패를 영속 캐시하지 않는다).
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const summary = await getOverviewCumulative(new Date())
  return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } })
}

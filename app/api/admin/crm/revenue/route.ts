import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getAdminCrmRevenueDashboard } from "@/lib/admin-crm-revenue"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    // months=abc면 NaN이 되고, 하위 clamp(Math.min/max)도 NaN을 통과시켜 월 목록이 빈 배열이 된다.
    // 그러면 오류 없이 월별 흐름 차트만 텅 빈 화면이 나간다. 숫자가 아니면 기본값으로 되돌린다.
    const rawMonths = Number(req.nextUrl.searchParams.get("months") ?? 6)
    const months = Number.isFinite(rawMonths) ? rawMonths : 6
    const dashboard = await getAdminCrmRevenueDashboard(months)
    const response = NextResponse.json(dashboard)

    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120")

    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/revenue]", error)
    return NextResponse.json({ error: "Failed to fetch CRM revenue dashboard" }, { status: 500 })
  }
}

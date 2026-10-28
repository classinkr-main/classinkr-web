import { NextRequest, NextResponse } from "next/server"

import { BRANCH_READ_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getHardwareSalesDashboard, parseSalesDashboardFy } from "@/lib/repositories/hardware-sales-dashboard"

// GET /api/admin/hardware/sales-dashboard?fy=2026 — FY(4월 시작) 품목 × 월 판매 집계.
// 규칙은 lib/repositories/hardware-sales-dashboard.ts(갭 문서 §6 D10). fy 를 빼면 현재 FY.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const fy = parseSalesDashboardFy(req.nextUrl.searchParams.get("fy"), new Date())
  if (fy == null) {
    return NextResponse.json({ error: "fy 는 회계연도 시작 연도(예: 2026)여야 합니다." }, { status: 400 })
  }

  try {
    return adminCachedJson(await getHardwareSalesDashboard(fy))
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "판매대시보드를 읽지 못했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

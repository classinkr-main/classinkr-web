import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCrmRevenuePerformance } from "@/lib/crm/revenue-performance"

// 현황 성과 분석 — CRM 매출 데이터(rev 딜)를 팀/개인/월로 집계. deals 탭과 독립.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const months = Number(new URL(req.url).searchParams.get("months") ?? 6)
    return adminCachedJson(await getCrmRevenuePerformance(months))
  } catch (error) {
    console.error("[GET /api/admin/crm/performance]", error)
    return NextResponse.json({ error: "Failed to load CRM revenue performance" }, { status: 500 })
  }
}

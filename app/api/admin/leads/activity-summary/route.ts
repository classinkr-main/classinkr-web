import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getLeadsActivitySummary } from "@/lib/repositories/lead-activity"

// 리드 보드 한눈 표시용 — 리드별 로그인/다운로드 배지 맵 (1회 호출).
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const summary = await getLeadsActivitySummary()
    return adminCachedJson({ summary })
  } catch (error) {
    console.error("[GET /api/admin/leads/activity-summary] error:", error)
    return NextResponse.json({ error: "Failed to fetch lead activity summary" }, { status: 500 })
  }
}

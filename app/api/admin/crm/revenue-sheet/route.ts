import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getAdminCrmRevenueSheetWorkspace } from "@/lib/admin-crm-revenue-sheet"

// 읽기(GET)도 CRM 스태프 롤로 제한한다. 인자 없는 verifyAdmin은 GET에
// BRANCH_READ_ADMIN_API_ROLES(= VIEWER 포함)를 적용해, /admin/crm/deals에서 막히는 VIEWER가
// 같은 매출 원천인 REV 시트는 그대로 열람할 수 있었다. 형제 CRM 라우트와 기준을 맞춘다.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const workspace = await getAdminCrmRevenueSheetWorkspace()
    const response = NextResponse.json(workspace)
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120")
    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/revenue-sheet]", error)
    return NextResponse.json({ error: "Failed to fetch CRM revenue sheet workspace" }, { status: 500 })
  }
}

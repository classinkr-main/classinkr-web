import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getAdminCrmOverview } from "@/lib/admin-crm-overview"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const overview = await getAdminCrmOverview({ force: req.nextUrl.searchParams.has("force") })
    const response = NextResponse.json(overview)
    // 서버 프로세스 캐시(ADMIN_CRM_OVERVIEW_CACHE_TTL_MS)·클라이언트 TTL(CRM_CACHE_TTL_MS)과 같은 120초.
    response.headers.set("Cache-Control", "private, max-age=120, stale-while-revalidate=600")
    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/overview]", error)
    const message = error instanceof Error ? error.message : "Failed to fetch CRM overview"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

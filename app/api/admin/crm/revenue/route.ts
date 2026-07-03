import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getAdminCrmRevenueDashboard } from "@/lib/admin-crm-revenue"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const months = Number(req.nextUrl.searchParams.get("months") ?? 6)
    const dashboard = await getAdminCrmRevenueDashboard(months)
    const response = NextResponse.json(dashboard)

    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120")

    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/revenue]", error)
    return NextResponse.json({ error: "Failed to fetch CRM revenue dashboard" }, { status: 500 })
  }
}

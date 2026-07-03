import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCrmInsights } from "@/lib/repositories/crm-insights"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    return adminCachedJson(await getCrmInsights())
  } catch (error) {
    console.error("[GET /api/admin/crm/insights]", error)
    return NextResponse.json({ error: "Failed to load CRM insights" }, { status: 500 })
  }
}

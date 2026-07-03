import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getLeadActionStats } from "@/lib/repositories/leads"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    return adminCachedJson({ leads: await getLeadActionStats() })
  } catch (error) {
    console.error("[GET /api/admin/crm/action-kpis]", error)
    return NextResponse.json({ error: "Failed to fetch CRM action KPIs" }, { status: 500 })
  }
}

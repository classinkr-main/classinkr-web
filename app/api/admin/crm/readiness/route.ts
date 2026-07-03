import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getAdminCrmReadinessReport } from "@/lib/admin-crm-readiness"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const report = await getAdminCrmReadinessReport()
    return NextResponse.json(report)
  } catch (error) {
    console.error("[GET /api/admin/crm/readiness]", error)
    const message = error instanceof Error ? error.message : "Failed to check CRM readiness"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

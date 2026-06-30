import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getAllEventAttendanceMatrices } from "@/lib/repositories/event-attendance"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const matrices = await getAllEventAttendanceMatrices()
    return NextResponse.json({ matrices })
  } catch (error) {
    console.error("[GET /api/admin/crm/event-attendance]", error)
    return NextResponse.json({ error: "Failed to load event attendance" }, { status: 500 })
  }
}

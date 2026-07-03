import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getAdminCrmMatchingInbox } from "@/lib/admin-crm-matching"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const inbox = await getAdminCrmMatchingInbox()
    return NextResponse.json(inbox)
  } catch (error) {
    console.error("[GET /api/admin/crm/matching]", error)
    return NextResponse.json({ error: "Failed to load CRM matching inbox" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getNeoCrmCustomers } from "@/lib/admin-crm-customers-neo"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const list = await getNeoCrmCustomers()
    return NextResponse.json(list)
  } catch (error) {
    console.error("[GET /api/admin/crm/customers-neo]", error)
    return NextResponse.json({ error: "Failed to load Neo CRM customers" }, { status: 500 })
  }
}

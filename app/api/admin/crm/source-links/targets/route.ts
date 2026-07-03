import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { searchManualCrmLinkTargets } from "@/lib/repositories/crm-source-links"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const query = req.nextUrl.searchParams.get("query")?.trim() ?? ""
    const sourceKey = req.nextUrl.searchParams.get("sourceKey")?.trim() || undefined
    const targets = await searchManualCrmLinkTargets(query, sourceKey)

    return NextResponse.json({ targets })
  } catch (error) {
    console.error("[GET /api/admin/crm/source-links/targets]", error)
    return NextResponse.json({ error: "Failed to search CRM link targets" }, { status: 500 })
  }
}

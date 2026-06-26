import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { listAdminUserDirectory } from "@/lib/repositories/admin-users"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, CRM_STAFF_ADMIN_API_ROLES)
  if (err) return err

  try {
    const directory = await listAdminUserDirectory()
    return adminCachedJson({
      generatedAt: directory.generatedAt,
      source: directory.source,
      health: directory.health,
      owners: directory.crmOwners,
      summary: {
        total: directory.crmOwners.length,
        branchDirectors: directory.crmOwners.filter((owner) => owner.teamRole === "branch_director").length,
        managers: directory.crmOwners.filter((owner) => owner.teamRole === "manager").length,
      },
    })
  } catch (error) {
    console.error("[GET /api/admin/crm/owners]", error)
    return NextResponse.json({ error: "Failed to load CRM owners" }, { status: 500 })
  }
}

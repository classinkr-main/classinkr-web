import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { findAdminCrmOwner, listAdminUserDirectory } from "@/lib/repositories/admin-users"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const directory = await listAdminUserDirectory()
    const current = findAdminCrmOwner(directory, admin)
    return adminCachedJson({
      generatedAt: directory.generatedAt,
      source: directory.source,
      health: directory.health,
      owners: directory.crmOwners,
      currentOwner: current.owner,
      currentOwnerKeys: current.ownerKeys,
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

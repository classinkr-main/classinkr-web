import { NextRequest, NextResponse } from "next/server"

import {
  readRequestBody,
  toErrorResponse,
} from "@/app/api/admin/hardware/_validation"
import {
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { syncHw } from "@/lib/branch/sync/sync-hw"
import { importHardwareFromBranchSheets } from "@/lib/repositories/hardware-inventory"

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    await readRequestBody(req)
    const syncResult = await syncHw()
    const actor = admin.name ?? admin.userId ?? admin.role
    const importResult = await importHardwareFromBranchSheets({ actor })

    return NextResponse.json({
      ok: true,
      sync: syncResult,
      import: importResult,
    })
  } catch (error) {
    return toErrorResponse(error, "Failed to import hardware sheet")
  }
}

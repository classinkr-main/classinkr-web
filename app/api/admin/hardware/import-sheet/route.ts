import { NextRequest, NextResponse } from "next/server"

import {
  readOptionalBoolean,
  readRequestBody,
  toErrorResponse,
} from "@/app/api/admin/hardware/_validation"
import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { syncHw } from "@/lib/branch/sync/sync-hw"
import { importHardwareFromBranchSheets } from "@/lib/repositories/hardware-inventory"

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  try {
    const body = await readRequestBody(req)
    const sync = readOptionalBoolean(body, "sync", "시트 동기화") ?? false
    const syncResult = sync ? await syncHw() : null
    const importResult = await importHardwareFromBranchSheets()

    return NextResponse.json({
      ok: true,
      sync: syncResult,
      import: importResult,
    })
  } catch (error) {
    return toErrorResponse(error, "Failed to import hardware sheet")
  }
}

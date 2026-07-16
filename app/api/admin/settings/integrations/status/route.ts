import { NextRequest, NextResponse } from "next/server"

import { isAdminAuthBypassEnabled } from "@/lib/admin-env"

async function verifyStatusRequest(req: NextRequest) {
  if (isAdminAuthBypassEnabled()) return null

  const { STAFF_ADMIN_API_ROLES, verifyAdmin } = await import("@/lib/admin-auth")
  return verifyAdmin(req, STAFF_ADMIN_API_ROLES)
}

export async function GET(req: NextRequest) {
  const err = await verifyStatusRequest(req)
  if (err) return err

  const { getAdminIntegrationStatusResponse } = await import("@/lib/admin-integrations/status")
  return NextResponse.json(await getAdminIntegrationStatusResponse())
}

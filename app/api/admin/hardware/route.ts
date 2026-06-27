import { NextRequest, NextResponse } from "next/server"

import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getHardwareDashboard } from "@/lib/repositories/hardware-inventory"

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return "Failed to read hardware inventory"
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES)
  if (err) return err

  try {
    const dashboard = await getHardwareDashboard()
    return adminCachedJson(dashboard)
  } catch (error) {
    return NextResponse.json({
      error: getErrorMessage(error),
    }, { status: 500 })
  }
}

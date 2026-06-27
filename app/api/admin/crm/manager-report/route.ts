import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getCrmManagerReport } from "@/lib/repositories/crm-manager-report"

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const report = await getCrmManagerReport({
      windowDays: parseBoundedInt(url.searchParams.get("windowDays"), 7, 1, 90),
    })
    return adminCachedJson(report)
  } catch (error) {
    console.error("[GET /api/admin/crm/manager-report]", error)
    return NextResponse.json({ error: "Failed to load manager report" }, { status: 500 })
  }
}

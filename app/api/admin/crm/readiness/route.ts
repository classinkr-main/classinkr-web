import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getAdminCrmReadinessReport } from "@/lib/admin-crm-readiness"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const report = await getAdminCrmReadinessReport()
    return NextResponse.json(report)
  } catch (error) {
    console.error("[GET /api/admin/crm/readiness]", error)
    const message = error instanceof Error ? error.message : "Failed to check CRM readiness"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getAdminCrmOverview } from "@/lib/admin-crm-overview"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const overview = await getAdminCrmOverview()
    const response = NextResponse.json(overview)
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120")
    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/overview]", error)
    const message = error instanceof Error ? error.message : "Failed to fetch CRM overview"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

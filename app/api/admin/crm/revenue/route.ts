import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getAdminCrmRevenueDashboard } from "@/lib/admin-crm-revenue"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const months = Number(req.nextUrl.searchParams.get("months") ?? 6)
    const dashboard = await getAdminCrmRevenueDashboard(months)
    const response = NextResponse.json(dashboard)

    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120")

    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/revenue]", error)
    return NextResponse.json({ error: "Failed to fetch CRM revenue dashboard" }, { status: 500 })
  }
}

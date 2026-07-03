import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getAdminCrmRevenueSheetWorkspace } from "@/lib/admin-crm-revenue-sheet"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const workspace = await getAdminCrmRevenueSheetWorkspace()
    const response = NextResponse.json(workspace)
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120")
    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/revenue-sheet]", error)
    return NextResponse.json({ error: "Failed to fetch CRM revenue sheet workspace" }, { status: 500 })
  }
}

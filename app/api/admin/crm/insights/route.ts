import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCrmInsights } from "@/lib/repositories/crm-insights"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    return adminCachedJson(await getCrmInsights())
  } catch (error) {
    console.error("[GET /api/admin/crm/insights]", error)
    return NextResponse.json({ error: "Failed to load CRM insights" }, { status: 500 })
  }
}

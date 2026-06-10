import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { searchManualCrmLinkTargets } from "@/lib/repositories/crm-source-links"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const query = req.nextUrl.searchParams.get("query")?.trim() ?? ""
    const sourceKey = req.nextUrl.searchParams.get("sourceKey")?.trim() || undefined
    const targets = await searchManualCrmLinkTargets(query, sourceKey)

    return NextResponse.json({ targets })
  } catch (error) {
    console.error("[GET /api/admin/crm/source-links/targets]", error)
    return NextResponse.json({ error: "Failed to search CRM link targets" }, { status: 500 })
  }
}

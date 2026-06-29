import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getLeadChannelStats } from "@/lib/repositories/leads"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    return adminCachedJson({ channels: await getLeadChannelStats() })
  } catch (error) {
    console.error("[GET /api/admin/crm/lead-channels]", error)
    return NextResponse.json({ error: "Failed to fetch lead channels" }, { status: 500 })
  }
}

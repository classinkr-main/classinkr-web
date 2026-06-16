import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getLeadActionStats } from "@/lib/repositories/leads"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    return adminCachedJson({ leads: await getLeadActionStats() })
  } catch (error) {
    console.error("[GET /api/admin/crm/action-kpis]", error)
    return NextResponse.json({ error: "Failed to fetch CRM action KPIs" }, { status: 500 })
  }
}

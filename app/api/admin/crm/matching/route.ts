import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getAdminCrmMatchingInbox } from "@/lib/admin-crm-matching"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const inbox = await getAdminCrmMatchingInbox()
    return NextResponse.json(inbox)
  } catch (error) {
    console.error("[GET /api/admin/crm/matching]", error)
    return NextResponse.json({ error: "Failed to load CRM matching inbox" }, { status: 500 })
  }
}

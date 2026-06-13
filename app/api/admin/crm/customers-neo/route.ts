import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getNeoCrmCustomers } from "@/lib/admin-crm-customers-neo"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const list = await getNeoCrmCustomers()
    return NextResponse.json(list)
  } catch (error) {
    console.error("[GET /api/admin/crm/customers-neo]", error)
    return NextResponse.json({ error: "Failed to load Neo CRM customers" }, { status: 500 })
  }
}

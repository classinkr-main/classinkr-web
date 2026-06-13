import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getNeoCrmCustomerDetail } from "@/lib/admin-crm-customers-neo"

type RouteContext = {
  params: Promise<{ accountId: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const err = await verifyAdmin(req)
  if (err) return err

  const { accountId } = await context.params
  if (!accountId?.trim() || !/^\d+$/.test(accountId.trim())) {
    return NextResponse.json({ error: "Invalid account id" }, { status: 400 })
  }

  try {
    const detail = await getNeoCrmCustomerDetail(accountId.trim())
    return NextResponse.json(detail, { status: detail.ok ? 200 : detail.account === null ? 404 : 500 })
  } catch (error) {
    console.error("[GET /api/admin/crm/customers-neo/[accountId]]", error)
    return NextResponse.json({ error: "Failed to load Neo CRM customer detail" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { parseUnifiedCustomerKey } from "@/lib/repositories/crm-customer-360"
import { getCrmCustomerTimeline } from "@/lib/repositories/crm-customer-timeline"

export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const customer = parseUnifiedCustomerKey((await params).key)
  if (!customer) return NextResponse.json({ error: "Invalid customer key" }, { status: 400 })
  const query = req.nextUrl.searchParams
  const crmOffset = Number(query.get("crmOffset") ?? 0)
  const compassOffset = Number(query.get("compassOffset") ?? 0)
  const rawBefore = query.get("before")
  if (![crmOffset, compassOffset].every((value) => Number.isInteger(value) && value >= 0 && value <= 100_000)
    || (rawBefore != null && !Number.isFinite(Date.parse(rawBefore)))) {
    return NextResponse.json({ error: "Invalid timeline pagination" }, { status: 400 })
  }
  try {
    const result = await getCrmCustomerTimeline(customer, { crmOffset, compassOffset, before: rawBefore ? new Date(rawBefore).toISOString() : undefined })
    if (!result) return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "고객 기록을 불러오지 못했습니다." }, { status: 503 })
  }
}

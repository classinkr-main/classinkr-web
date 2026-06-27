import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getCrmCustomer360, parseUnifiedCustomerKey } from "@/lib/repositories/crm-customer-360"

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { key } = await params
  const parsed = parseUnifiedCustomerKey(key)
  if (!parsed) {
    return NextResponse.json({ error: "Invalid customer key" }, { status: 400 })
  }

  try {
    const url = new URL(req.url)
    const result = await getCrmCustomer360(parsed, {
      eventsLimit: parseBoundedInt(url.searchParams.get("eventsLimit"), 20, 1, 50),
      tasksLimit: parseBoundedInt(url.searchParams.get("tasksLimit"), 50, 1, 50),
    })

    if (!result.found) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    return adminCachedJson(result)
  } catch (error) {
    console.error(`[GET /api/admin/crm/customers/${key}/360]`, error)
    return NextResponse.json({ error: "Failed to load customer 360" }, { status: 500 })
  }
}

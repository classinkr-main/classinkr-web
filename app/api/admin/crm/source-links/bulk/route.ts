import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  type CrmSourceLinkAction,
  bulkUpdateCrmSourceLinkStatus,
} from "@/lib/repositories/crm-source-links"

function isCrmSourceLinkAction(value: unknown): value is CrmSourceLinkAction {
  return value === "confirm" || value === "reject" || value === "stale"
}

export async function PATCH(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as { ids?: unknown; action?: unknown } | null
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : []

  if (!isCrmSourceLinkAction(body?.action)) {
    return NextResponse.json({ error: "Invalid source link action" }, { status: 400 })
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: "No source link ids provided" }, { status: 400 })
  }

  try {
    const result = await bulkUpdateCrmSourceLinkStatus(ids, body.action, admin.userId)
    return NextResponse.json({ ok: result.failed.length === 0, ...result })
  } catch (error) {
    console.error("[PATCH /api/admin/crm/source-links/bulk]", error)
    return NextResponse.json({ error: "Failed to bulk update CRM source links" }, { status: 500 })
  }
}

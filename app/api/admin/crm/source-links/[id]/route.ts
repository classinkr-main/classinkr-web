import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  type CrmSourceLinkAction,
  updateCrmSourceLinkStatus,
} from "@/lib/repositories/crm-source-links"

type RouteContext = {
  params: Promise<{ id: string }>
}

function isCrmSourceLinkAction(value: unknown): value is CrmSourceLinkAction {
  return value === "confirm" || value === "reject" || value === "stale"
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { id } = await context.params
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null

  if (!isCrmSourceLinkAction(body?.action)) {
    return NextResponse.json({ error: "Invalid source link action" }, { status: 400 })
  }

  try {
    const result = await updateCrmSourceLinkStatus(id, body.action, admin.userId)
    return NextResponse.json({ ok: true, link: result })
  } catch (error) {
    console.error("[PATCH /api/admin/crm/source-links/[id]]", error)
    const message = error instanceof Error ? error.message : "Failed to update CRM source link"
    const status = message.includes("not found") ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

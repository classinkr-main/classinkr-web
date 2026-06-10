import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { upsertConfirmedLeadCustomerLink } from "@/lib/repositories/crm-source-links"

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as {
    leadId?: unknown
    sourceLabel?: unknown
    customerId?: unknown
    customerLabel?: unknown
    metadata?: unknown
  } | null

  if (
    typeof body?.leadId !== "string" ||
    !body.leadId.trim() ||
    typeof body.sourceLabel !== "string" ||
    !body.sourceLabel.trim() ||
    typeof body.customerId !== "string" ||
    !body.customerId.trim() ||
    typeof body.customerLabel !== "string" ||
    !body.customerLabel.trim()
  ) {
    return NextResponse.json({ error: "Invalid lead conversion source link payload" }, { status: 400 })
  }

  try {
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : undefined

    const link = await upsertConfirmedLeadCustomerLink({
      leadId: body.leadId,
      sourceLabel: body.sourceLabel,
      customerId: body.customerId,
      customerLabel: body.customerLabel,
      actorUserId: admin.userId,
      metadata,
    })

    return NextResponse.json({ ok: true, link })
  } catch (error) {
    console.error("[POST /api/admin/crm/source-links/lead-conversion]", error)
    const message = error instanceof Error ? error.message : "Failed to create lead conversion source link"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

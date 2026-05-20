import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getAdminRecipientSelectors } from "@/lib/notifications/recipient-selectors"
import {
  deleteNotificationForRecipients,
  markNotificationReadForRecipients,
} from "@/lib/notifications/repository"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const selectors = getAdminRecipientSelectors(admin)
  const notification = await markNotificationReadForRecipients(id, selectors)

  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ notification })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const selectors = getAdminRecipientSelectors(admin)
  const deleted = await deleteNotificationForRecipients(id, selectors)

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

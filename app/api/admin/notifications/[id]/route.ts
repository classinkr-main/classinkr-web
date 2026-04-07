import { NextRequest, NextResponse } from "next/server"

import { getVerifiedAdminContext } from "@/lib/admin-auth"
import { getAdminRecipientSelectors } from "@/lib/notifications/recipient-selectors"
import { markNotificationReadForRecipients } from "@/lib/notifications/repository"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getVerifiedAdminContext(req)
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const selectors = getAdminRecipientSelectors(admin)
  const notification = await markNotificationReadForRecipients(id, selectors)

  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ notification })
}

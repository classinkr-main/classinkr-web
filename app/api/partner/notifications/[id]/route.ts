import { NextRequest, NextResponse } from "next/server"

import { getPartnerRecipientSelectors } from "@/lib/notifications/recipient-selectors"
import { markNotificationReadForRecipients } from "@/lib/notifications/repository"
import { resolvePartnerAccountContext } from "@/lib/partner-portal/context"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const partner = await resolvePartnerAccountContext(req)
  if (!partner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const selectors = getPartnerRecipientSelectors(partner)
  const notification = await markNotificationReadForRecipients(id, selectors)

  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ notification })
}

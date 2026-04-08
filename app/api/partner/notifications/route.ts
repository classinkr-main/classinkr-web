import { NextRequest, NextResponse } from "next/server"

import { getPartnerRecipientSelectors } from "@/lib/notifications/recipient-selectors"
import {
  countUnreadNotificationsForRecipients,
  listNotificationsForRecipients,
  markAllNotificationsReadForRecipients,
} from "@/lib/notifications/repository"
import { resolvePartnerAccountContext } from "@/lib/partner-portal/context"

export async function GET(req: NextRequest) {
  const partner = await resolvePartnerAccountContext(req)
  if (!partner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rawLimit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10)
  const limit = Number.isFinite(rawLimit) ? rawLimit : 20
  const selectors = getPartnerRecipientSelectors(partner)
  const [items, unreadCount] = await Promise.all([
    listNotificationsForRecipients(selectors, { limit }),
    countUnreadNotificationsForRecipients(selectors),
  ])

  return NextResponse.json({ items, unreadCount })
}

export async function PATCH(req: NextRequest) {
  const partner = await resolvePartnerAccountContext(req)
  if (!partner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const selectors = getPartnerRecipientSelectors(partner)
  const updatedCount = await markAllNotificationsReadForRecipients(selectors)

  return NextResponse.json({ ok: true, updatedCount })
}

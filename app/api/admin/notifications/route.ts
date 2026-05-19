import { NextRequest, NextResponse } from "next/server"

import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getAdminRecipientSelectors } from "@/lib/notifications/recipient-selectors"
import {
  countUnreadNotificationsForRecipients,
  listNotificationsForRecipients,
  markAllNotificationsReadForRecipients,
} from "@/lib/notifications/repository"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const rawLimit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10)
  const limit = Number.isFinite(rawLimit) ? rawLimit : 20
  const selectors = getAdminRecipientSelectors(admin)
  const [items, unreadCount] = await Promise.all([
    listNotificationsForRecipients(selectors, { limit }),
    countUnreadNotificationsForRecipients(selectors),
  ])

  return NextResponse.json({ items, unreadCount })
}

export async function PATCH(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  const selectors = getAdminRecipientSelectors(admin)
  const updatedCount = await markAllNotificationsReadForRecipients(selectors)

  return NextResponse.json({ ok: true, updatedCount })
}

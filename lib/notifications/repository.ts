import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationIconKey,
  NotificationInboxItem,
  NotificationRecipientTarget,
  NotificationScope,
  NotificationSeverity,
  NotificationStatus,
  NotificationTone,
  NotificationType,
} from "@/lib/notifications/types"

const sb = () => createSupabaseAdminClient()

interface CreateNotificationEventInput {
  eventType: string
  notificationType: NotificationType
  categoryTag: NotificationCategory
  scopeTag: NotificationScope
  severity: NotificationSeverity
  title: string
  message: string
  routeUrl?: string
  source?: string
  sourceId?: string
  payload?: Record<string, unknown>
}

interface CreateInAppNotificationInput {
  eventId?: string | null
  recipientType: NotificationRecipientTarget["recipientType"]
  recipientId: string
  eventType: string
  notificationType: NotificationType
  categoryTag: NotificationCategory
  scopeTag: NotificationScope
  severity: NotificationSeverity
  title: string
  message: string
  routeUrl?: string
  iconKey: NotificationIconKey
  tone: NotificationTone
  metadata?: Record<string, unknown>
}

interface DeliveryLogInput {
  eventId?: string | null
  notificationId?: string | null
  channel: NotificationChannel
  recipientType?: string | null
  recipientId?: string | null
  status: "pending" | "sent" | "failed" | "skipped"
  requestPayload?: Record<string, unknown>
  responsePayload?: Record<string, unknown>
  errorMessage?: string
  deliveredAt?: string
}

function matchRecipient(
  row: { recipient_type: string; recipient_id: string },
  selectors: NotificationRecipientTarget[]
) {
  return selectors.some(
    (selector) =>
      selector.recipientType === row.recipient_type &&
      selector.recipientId === row.recipient_id
  )
}

function rowToNotification(row: Record<string, unknown>): NotificationInboxItem {
  return {
    id: String(row.id),
    eventId: row.event_id ? String(row.event_id) : null,
    recipientType: row.recipient_type as NotificationInboxItem["recipientType"],
    recipientId: String(row.recipient_id),
    channel: row.channel as NotificationChannel,
    eventType: String(row.event_type),
    notificationType: row.notification_type as NotificationType,
    categoryTag: row.category_tag as NotificationCategory,
    scopeTag: row.scope_tag as NotificationScope,
    severity: row.severity as NotificationSeverity,
    title: String(row.title),
    message: String(row.message),
    routeUrl: row.route_url ? String(row.route_url) : undefined,
    iconKey: row.icon_key as NotificationIconKey,
    tone: row.tone as NotificationTone,
    status: row.status as NotificationStatus,
    metadata: (row.metadata_json as Record<string, unknown> | null) ?? {},
    readAt: row.read_at ? String(row.read_at) : undefined,
    createdAt: String(row.created_at),
  }
}

async function listNotificationIdsForRecipients(
  selectors: NotificationRecipientTarget[],
  status?: NotificationStatus
) {
  if (!selectors.length) return [] as string[]

  const recipientIds = [...new Set(selectors.map((selector) => selector.recipientId))]
  const recipientTypes = [
    ...new Set(selectors.map((selector) => selector.recipientType)),
  ]

  let query = sb()
    .from("notifications")
    .select("id, recipient_type, recipient_id, status")
    .in("recipient_id", recipientIds)
    .in("recipient_type", recipientTypes)

  if (status) {
    query = query.eq("status", status)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`[notifications] list ids failed: ${error.message}`)
  }

  return (data ?? [])
    .filter((row) => matchRecipient(row, selectors))
    .map((row) => String(row.id))
}

export async function createNotificationEvent(input: CreateNotificationEventInput) {
  const { data, error } = await sb()
    .from("notification_events")
    .insert({
      event_type: input.eventType,
      notification_type: input.notificationType,
      category_tag: input.categoryTag,
      scope_tag: input.scopeTag,
      severity: input.severity,
      title: input.title,
      message: input.message,
      route_url: input.routeUrl ?? null,
      source: input.source ?? null,
      source_id: input.sourceId ?? null,
      payload_json: input.payload ?? {},
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`[notifications] create event failed: ${error?.message}`)
  }

  return data
}

export async function createInAppNotifications(
  inputs: CreateInAppNotificationInput[]
) {
  if (!inputs.length) return []

  const { data, error } = await sb()
    .from("notifications")
    .insert(
      inputs.map((input) => ({
        event_id: input.eventId ?? null,
        recipient_type: input.recipientType,
        recipient_id: input.recipientId,
        channel: "in_app",
        event_type: input.eventType,
        notification_type: input.notificationType,
        category_tag: input.categoryTag,
        scope_tag: input.scopeTag,
        severity: input.severity,
        title: input.title,
        message: input.message,
        route_url: input.routeUrl ?? null,
        icon_key: input.iconKey,
        tone: input.tone,
        status: "unread",
        metadata_json: input.metadata ?? {},
      }))
    )
    .select("*")

  if (error) {
    throw new Error(`[notifications] create notifications failed: ${error.message}`)
  }

  return (data ?? []).map((row) => rowToNotification(row))
}

export async function createDeliveryLog(input: DeliveryLogInput) {
  const { error } = await sb().from("notification_delivery_logs").insert({
    event_id: input.eventId ?? null,
    notification_id: input.notificationId ?? null,
    channel: input.channel,
    recipient_type: input.recipientType ?? null,
    recipient_id: input.recipientId ?? null,
    status: input.status,
    request_payload: input.requestPayload ?? {},
    response_payload: input.responsePayload ?? {},
    error_message: input.errorMessage ?? null,
    delivered_at: input.deliveredAt ?? null,
  })

  if (error) {
    throw new Error(`[notifications] create delivery log failed: ${error.message}`)
  }
}

export async function listNotificationsForRecipients(
  selectors: NotificationRecipientTarget[],
  options?: { limit?: number }
) {
  if (!selectors.length) {
    return [] as NotificationInboxItem[]
  }

  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50)
  const fetchLimit = Math.min(Math.max(limit * 3, 50), 200)
  const recipientIds = [...new Set(selectors.map((selector) => selector.recipientId))]
  const recipientTypes = [
    ...new Set(selectors.map((selector) => selector.recipientType)),
  ]

  const { data, error } = await sb()
    .from("notifications")
    .select("*")
    .in("recipient_id", recipientIds)
    .in("recipient_type", recipientTypes)
    .order("created_at", { ascending: false })
    .limit(fetchLimit)

  if (error) {
    throw new Error(`[notifications] list failed: ${error.message}`)
  }

  return (data ?? [])
    .filter((row) => matchRecipient(row, selectors))
    .slice(0, limit)
    .map((row) => rowToNotification(row))
}

export async function countUnreadNotificationsForRecipients(
  selectors: NotificationRecipientTarget[]
) {
  if (!selectors.length) return 0

  const uniqueSelectors = Array.from(
    new Map(
      selectors.map((selector) => [
        `${selector.recipientType}:${selector.recipientId}`,
        selector,
      ])
    ).values()
  )

  const counts = await Promise.all(
    uniqueSelectors.map(async (selector) => {
      const { count, error } = await sb()
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_type", selector.recipientType)
        .eq("recipient_id", selector.recipientId)
        .eq("status", "unread")

      if (error) {
        throw new Error(`[notifications] count unread failed: ${error.message}`)
      }

      return count ?? 0
    })
  )

  return counts.reduce((total, count) => total + count, 0)
}

export async function markAllNotificationsReadForRecipients(
  selectors: NotificationRecipientTarget[]
) {
  const ids = await listNotificationIdsForRecipients(selectors, "unread")
  if (!ids.length) return 0

  const { error } = await sb()
    .from("notifications")
    .update({
      status: "read",
      read_at: new Date().toISOString(),
    })
    .in("id", ids)

  if (error) {
    throw new Error(`[notifications] mark all read failed: ${error.message}`)
  }

  return ids.length
}

export async function deleteNotificationForRecipients(
  id: string,
  selectors: NotificationRecipientTarget[]
): Promise<boolean> {
  const { data, error } = await sb()
    .from("notifications")
    .select("id, recipient_type, recipient_id")
    .eq("id", id)
    .single()

  if (error || !data) return false
  if (!matchRecipient(data, selectors)) return false

  const { error: deleteError } = await sb()
    .from("notifications")
    .delete()
    .eq("id", id)

  if (deleteError) {
    throw new Error(`[notifications] delete failed: ${deleteError.message}`)
  }

  return true
}

export async function markNotificationReadForRecipients(
  id: string,
  selectors: NotificationRecipientTarget[]
) {
  const { data, error } = await sb()
    .from("notifications")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !data) return null
  if (!matchRecipient(data, selectors)) return null

  const { data: updated, error: updateError } = await sb()
    .from("notifications")
    .update({
      status: "read",
      read_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single()

  if (updateError || !updated) {
    throw new Error(
      `[notifications] mark single read failed: ${updateError?.message}`
    )
  }

  return rowToNotification(updated)
}

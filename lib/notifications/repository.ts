import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { shareInFlightByArgs } from "@/lib/server/share-in-flight"
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

/**
 * admin-performance-round3-2026-09-10.md §3.3 — 사이드바 벨(모든 어드민 페이지가
 * ?countOnly=1로 부르는 GET /api/admin/notifications)이 콜드 1,207ms였다. 캐시가 전혀
 * 없어 매 네비게이션마다 Supabase count 왕복 2~3회(수신자 셀렉터당 1회)를 다시 태웠다.
 *
 * 수신자별로 태그를 쪼개지 않고 전역 단일 태그로 둔다 — 알림은 admin_role 브로드캐스트로도
 * 생성되므로(예: 전체 ADMIN 롤 앞) 특정 유저 스코프로 좁히면 "내 알림은 그대로인데 캐시가
 * 안 깨진다" 케이스가 생긴다. 전역 무효화는 쓰기 빈도가 낮아(사람이 벨을 클릭하거나 시스템이
 * 알림을 만들 때뿐) 과도한 미스를 만들지 않는다 — marketing-perf 등 기존 태그들과 같은 절충.
 */
export const ADMIN_NOTIFICATIONS_CACHE_TAG = "admin-notifications"

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

  // 새 알림은 시스템/다른 관리자의 행동으로 생성되는 경우가 대부분이라(크론·리드 이벤트 등)
  // 이 요청을 보낸 주체가 직접 다음 화면에서 확인하는 게 아니다 — "max"(SWR)로 충분하다.
  revalidateTag(ADMIN_NOTIFICATIONS_CACHE_TAG, "max")
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

async function listNotificationsForRecipientsUncached(
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

async function countUnreadNotificationsForRecipientsUncached(
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

// 사이드바 벨은 모든 어드민 페이지 진입마다 부른다 — TTL은 30초로 짧게 잡아 "방금 읽음
// 처리했는데 아직 안 지워짐" 체감을 줄인다(쓰기 경로가 아래에서 {expire:0}으로 즉시 하드
// 만료하므로 이 TTL은 "아무 일도 없을 때의 상한"일 뿐). shareInFlightByArgs가 콜드
// 인스턴스의 동시 미스를 합치고(dev·test에서 JSON 안전성도 함께 검사) selectors 배열은
// getAdminRecipientSelectors가 admin.role/userId로부터 매번 같은 내용으로 재구성하므로
// JSON 키가 안정적이다.
export const listNotificationsForRecipients = unstable_cache(
  shareInFlightByArgs("admin-notifications-list-v1", listNotificationsForRecipientsUncached),
  ["admin-notifications-list-v1"],
  { revalidate: 30, tags: [ADMIN_NOTIFICATIONS_CACHE_TAG] }
)

export const countUnreadNotificationsForRecipients = unstable_cache(
  shareInFlightByArgs(
    "admin-notifications-count-v1",
    countUnreadNotificationsForRecipientsUncached
  ),
  ["admin-notifications-count-v1"],
  { revalidate: 30, tags: [ADMIN_NOTIFICATIONS_CACHE_TAG] }
)

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

  // 관리자 본인이 벨을 클릭해 방금 일으킨 쓰기다 — 다음 조회(같은 요청 직후의 재조회 포함)가
  // 반드시 0을 보도록 {expire:0}으로 즉시 하드 만료한다("max"면 SWR이라 배경 재검증이 끝나기
  // 전까지 옛 카운트가 한 번 더 보일 수 있다 — leads.ts의 invalidateLeadReadCaches와 같은 톤).
  revalidateTag(ADMIN_NOTIFICATIONS_CACHE_TAG, { expire: 0 })
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

  // 관리자 본인의 즉시 조작 — 위 markAllNotificationsReadForRecipients와 같은 이유로 하드 만료.
  revalidateTag(ADMIN_NOTIFICATIONS_CACHE_TAG, { expire: 0 })
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

  // 관리자 본인의 즉시 조작 — 위 markAllNotificationsReadForRecipients와 같은 이유로 하드 만료.
  revalidateTag(ADMIN_NOTIFICATIONS_CACHE_TAG, { expire: 0 })
  return rowToNotification(updated)
}

import "server-only"

import { getResolvedSettings } from "@/lib/repositories/settings"
import { postJson } from "@/lib/server/post-json"
import { resolveNotificationPresentation } from "@/lib/notifications/presentation"
import {
  createDeliveryLog,
  createInAppNotifications,
  createNotificationEvent,
} from "@/lib/notifications/repository"
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationRecipientTarget,
  NotificationScope,
  NotificationSeverity,
  NotificationType,
} from "@/lib/notifications/types"

const DEFAULT_ADMIN_RECIPIENTS: NotificationRecipientTarget[] = [
  { recipientType: "admin_role", recipientId: "SUPER_ADMIN" },
  { recipientType: "admin_role", recipientId: "ADMIN" },
]

interface EmitNotificationEventInput {
  eventType: string
  notificationType: NotificationType
  categoryTag: NotificationCategory
  scopeTag?: NotificationScope
  severity?: NotificationSeverity
  title: string
  message: string
  routeUrl?: string
  source?: string
  sourceId?: string
  payload?: Record<string, unknown>
  recipients?: NotificationRecipientTarget[]
  channels?: NotificationChannel[]
}

function uniqueRecipients(recipients: NotificationRecipientTarget[]) {
  const seen = new Set<string>()

  return recipients.filter((recipient) => {
    const key = `${recipient.recipientType}:${recipient.recipientId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildWecomText(input: EmitNotificationEventInput) {
  const lines = [
    `[${input.severity?.toUpperCase() ?? "INFO"}] ${input.title}`,
    input.message,
    input.routeUrl ? `Open: ${input.routeUrl}` : undefined,
  ].filter(Boolean)

  return {
    msgtype: "text",
    text: {
      content: lines.join("\n"),
    },
  }
}

function buildExternalPayload(
  channel: Exclude<NotificationChannel, "in_app">,
  input: EmitNotificationEventInput
) {
  if (channel === "wecom_webhook") {
    return buildWecomText(input)
  }

  return {
    kind: "notification",
    eventType: input.eventType,
    notificationType: input.notificationType,
    categoryTag: input.categoryTag,
    severity: input.severity ?? "info",
    title: input.title,
    message: input.message,
    routeUrl: input.routeUrl,
    payload: input.payload ?? {},
    sentAt: new Date().toISOString(),
  }
}

function getWebhookUrl(
  channel: Exclude<NotificationChannel, "in_app">,
  severity: NotificationSeverity,
  settings: Awaited<ReturnType<typeof getResolvedSettings>>
) {
  if (channel === "wecom_webhook") {
    return severity === "critical"
      ? settings.wecomCriticalWebhookUrl ?? settings.wecomOpsWebhookUrl
      : settings.wecomOpsWebhookUrl ?? settings.wecomCriticalWebhookUrl
  }

  if (channel === "channel_talk_webhook") {
    return settings.channelTalkWebhookUrl
  }

  if (channel === "kakao_alimtalk") {
    return settings.kakaoAlimtalkWebhookUrl
  }

  if (channel === "email") {
    return settings.emailWebhookUrl
  }

  return undefined
}

async function deliverChannel(
  channel: Exclude<NotificationChannel, "in_app">,
  input: EmitNotificationEventInput,
  eventId: string
) {
  const severity = input.severity ?? "info"
  const settings = await getResolvedSettings()
  const payload = buildExternalPayload(channel, input)
  const url = getWebhookUrl(channel, severity, settings)

  if (channel === "email" && !settings.notificationDigestEmailList.length) {
    await createDeliveryLog({
      eventId,
      channel,
      status: "skipped",
      requestPayload: payload,
      errorMessage: "Notification digest email list is empty.",
    })
    return
  }

  if (!url) {
    await createDeliveryLog({
      eventId,
      channel,
      status: "skipped",
      requestPayload: payload,
      errorMessage: "Notification channel is not configured.",
    })
    return
  }

  const requestPayload =
    channel === "email"
      ? {
          ...payload,
          recipients: settings.notificationDigestEmailList,
        }
      : payload

  try {
    const response = await postJson(url, requestPayload)
    const responsePayload = {
      ok: response.ok,
      status: response.status,
    }

    if (!response.ok) {
      await createDeliveryLog({
        eventId,
        channel,
        status: "failed",
        requestPayload,
        responsePayload,
        errorMessage: `HTTP ${response.status}`,
      })
      return
    }

    await createDeliveryLog({
      eventId,
      channel,
      status: "sent",
      requestPayload,
      responsePayload,
      deliveredAt: new Date().toISOString(),
    })
  } catch (error) {
    await createDeliveryLog({
      eventId,
      channel,
      status: "failed",
      requestPayload,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

export async function emitNotificationEvent(input: EmitNotificationEventInput) {
  const recipients = uniqueRecipients(
    input.recipients?.length ? input.recipients : DEFAULT_ADMIN_RECIPIENTS
  )
  const severity = input.severity ?? "info"
  const scopeTag = input.scopeTag ?? "org_admin"
  const settings = await getResolvedSettings()
  const presentation = resolveNotificationPresentation({
    notificationType: input.notificationType,
    categoryTag: input.categoryTag,
    severity,
    appearance: settings.notificationAppearance,
  })

  const event = await createNotificationEvent({
    eventType: input.eventType,
    notificationType: input.notificationType,
    categoryTag: input.categoryTag,
    scopeTag,
    severity,
    title: input.title,
    message: input.message,
    routeUrl: input.routeUrl,
    source: input.source,
    sourceId: input.sourceId,
    payload: input.payload,
  })

  if (recipients.length) {
    await createInAppNotifications(
      recipients.map((recipient) => ({
        eventId: String(event.id),
        recipientType: recipient.recipientType,
        recipientId: recipient.recipientId,
        eventType: input.eventType,
        notificationType: input.notificationType,
        categoryTag: input.categoryTag,
        scopeTag,
        severity,
        title: input.title,
        message: input.message,
        routeUrl: input.routeUrl,
        iconKey: presentation.iconKey,
        tone: presentation.tone,
        metadata: input.payload,
      }))
    )
  }

  const channels = (input.channels ?? []).filter(
    (channel): channel is Exclude<NotificationChannel, "in_app"> =>
      channel !== "in_app"
  )

  await Promise.all(channels.map((channel) => deliverChannel(channel, input, String(event.id))))

  return event
}

import "server-only"

import { getResolvedSettings } from "@/lib/repositories/settings"
import { postJson } from "@/lib/server/post-json"
import { sendInternalNotification, wrapNotificationHtml } from "@/lib/email"
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

function normalizeWebhookValue(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const normalized = String(value).replace(/\s+/g, " ").trim()
  if (!normalized) return undefined
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized
}

function getPayloadValue(
  input: EmitNotificationEventInput,
  key: string
) {
  return normalizeWebhookValue(input.payload?.[key])
}

function getLeadSourceLabel(source?: string) {
  if (source === "meta_lead_ads") return "Meta 광고"
  if (source === "newsletter") return "뉴스레터"
  return "홈페이지"
}

function formatRouteUrl(routeUrl?: string) {
  if (!routeUrl) return undefined

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://classin.co.kr"
    return new URL(routeUrl, baseUrl).toString()
  } catch {
    return routeUrl
  }
}

function compactLines(lines: Array<string | undefined>) {
  return lines.filter((line): line is string => line !== undefined)
}

function labeledLine(label: string, value?: string) {
  return value ? `${label}: ${value}` : undefined
}

function countLabel(value?: string) {
  return `${value ?? "0"}개`
}

function formatDigestDelta(value?: string) {
  if (!value) return "0"
  const delta = Number(value)
  if (!Number.isFinite(delta) || delta === 0) return "0"
  return delta > 0 ? `+${delta}` : String(delta)
}

function buildLeadCreatedWecomText(input: EmitNotificationEventInput) {
  const source = getPayloadValue(input, "source")
  const sourceLabel = getLeadSourceLabel(source)
  const sourceDetail = getPayloadValue(input, "sourceDetail") ?? source

  return compactLines([
    `${sourceLabel}에 리드가 1개 들어왔습니다`,
    "",
    labeledLine("학원", getPayloadValue(input, "org")),
    labeledLine("이름", getPayloadValue(input, "name")),
    labeledLine("연락처", getPayloadValue(input, "phone")),
    labeledLine("이메일", getPayloadValue(input, "email")),
    labeledLine("경로", sourceDetail),
    labeledLine("문의 내용", getPayloadValue(input, "message")),
    labeledLine("확인", formatRouteUrl(input.routeUrl)),
  ]).join("\n")
}

function buildLeadAgeWecomText(input: EmitNotificationEventInput) {
  const thresholdHours = input.eventType.endsWith("unresponded_48h") ? 48 : 24
  const ageHours = getPayloadValue(input, "ageHours")
  const leadName =
    getPayloadValue(input, "org") ??
    getPayloadValue(input, "name") ??
    normalizeWebhookValue(input.sourceId)
  const assignedTo = getPayloadValue(input, "assignedTo") ?? "미배정"
  const sourceLabel = getLeadSourceLabel(getPayloadValue(input, "source"))

  return compactLines([
    `${sourceLabel} 리드가 ${thresholdHours}시간째 반응이 없습니다`,
    "",
    labeledLine("리드", leadName),
    labeledLine("담당자", assignedTo),
    labeledLine("경과", ageHours ? `${ageHours}시간` : undefined),
    labeledLine("확인", formatRouteUrl(input.routeUrl)),
  ]).join("\n")
}

function buildLeadAggregateWecomText(input: EmitNotificationEventInput) {
  const count = getPayloadValue(input, "unrespondedCount")
  const over24h = getPayloadValue(input, "over24h")
  const over48h = getPayloadValue(input, "over48h")

  return compactLines([
    `홈페이지 미응답 리드가 ${count ?? "여러"}개 쌓였습니다`,
    "",
    labeledLine("24시간 초과", over24h ? `${over24h}개` : undefined),
    labeledLine("48시간 초과", over48h ? `${over48h}개` : undefined),
    input.message,
    labeledLine("확인", formatRouteUrl(input.routeUrl)),
  ]).join("\n")
}

function buildLeadDigestWecomCard(input: EmitNotificationEventInput) {
  const period = getPayloadValue(input, "period") === "monthly" ? "monthly" : "weekly"
  const routeUrl = formatRouteUrl(input.routeUrl) ?? "https://classin.co.kr/admin/crm"
  const totalLeads = getPayloadValue(input, "totalLeads") ?? "0"
  const contactPageLeadCount = getPayloadValue(input, "contactPageLeadCount")
  const demoModalLeadCount = getPayloadValue(input, "demoModalLeadCount")
  const channelTalkInquiryCount = getPayloadValue(input, "channelTalkInquiryCount")
  const chatbotHandoffCount = getPayloadValue(input, "chatbotHandoffCount")
  const chatbotHandoffSentCount = getPayloadValue(input, "chatbotHandoffSentCount")
  const delta = formatDigestDelta(getPayloadValue(input, "deltaLeads"))
  const unrespondedCount = getPayloadValue(input, "unrespondedCount")
  const convertedCount = getPayloadValue(input, "convertedCount")
  const topSourceLabel = getPayloadValue(input, "topSourceLabel") ?? "없음"
  const topSourceCount = getPayloadValue(input, "topSourceCount")
  const periodLabel = getPayloadValue(input, "periodLabel")
  const previousLabel = period === "monthly" ? "전월 대비" : "전주 대비"
  const handoffLabel = chatbotHandoffCount
    ? `${countLabel(chatbotHandoffSentCount)} / ${countLabel(chatbotHandoffCount)}`
    : countLabel(chatbotHandoffSentCount)

  return {
    msgtype: "template_card",
    template_card: {
      card_type: "text_notice",
      source: {
        desc: "Classin CRM",
        desc_color: 3,
      },
      main_title: {
        title: input.title,
        desc: periodLabel,
      },
      emphasis_content: {
        title: totalLeads,
        desc: "신규 리드",
      },
      sub_title_text: `${previousLabel} ${delta}개 / 미응답 ${countLabel(unrespondedCount)}`,
      horizontal_content_list: [
        {
          keyname: "홈페이지 문의",
          value: countLabel(contactPageLeadCount),
        },
        {
          keyname: "데모 신청",
          value: countLabel(demoModalLeadCount),
        },
        {
          keyname: "채널톡 문의",
          value: countLabel(channelTalkInquiryCount),
        },
        {
          keyname: "챗봇→채널톡",
          value: handoffLabel,
        },
        {
          keyname: "전환",
          value: countLabel(convertedCount),
        },
        {
          keyname: "주요 경로",
          value: topSourceCount
            ? `${topSourceLabel} (${countLabel(topSourceCount)})`
            : topSourceLabel,
        },
      ],
      jump_list: [
        {
          type: 1,
          title: "CRM 보기",
          url: routeUrl,
        },
      ],
      card_action: {
        type: 1,
        url: routeUrl,
      },
    },
  }
}

function buildLeadWecomText(input: EmitNotificationEventInput) {
  if (input.eventType === "lead.created") return buildLeadCreatedWecomText(input)

  if (
    input.eventType === "lead.unresponded_24h" ||
    input.eventType === "lead.unresponded_48h"
  ) {
    return buildLeadAgeWecomText(input)
  }

  if (
    input.eventType === "lead.unresponded_count_3" ||
    input.eventType === "lead.unresponded_count_5"
  ) {
    return buildLeadAggregateWecomText(input)
  }

  return null
}

function buildCsNoticeWecomText(input: EmitNotificationEventInput) {
  if (input.eventType === "channel_talk.message") {
    return compactLines([
      "CS 알림: 채널톡 새 상담 메시지가 도착했습니다.",
      "",
      input.message,
      labeledLine("채팅 ID", getPayloadValue(input, "chatId")),
      labeledLine("확인", formatRouteUrl(input.routeUrl)),
    ]).join("\n")
  }

  if (input.eventType === "channel_talk.synced") {
    return compactLines([
      "CS 알림: 채널톡 신규 상담이 동기화되었습니다.",
      "",
      labeledLine("신규 상담", countLabel(getPayloadValue(input, "created"))),
      labeledLine("CRM 매칭", countLabel(getPayloadValue(input, "matchedLeads"))),
      labeledLine("확인", formatRouteUrl(input.routeUrl)),
    ]).join("\n")
  }

  if (input.eventType === "chatbot.channel_talk_handoff") {
    return compactLines([
      "CS 알림: 긴급 상담 요청이 채널톡으로 넘어왔습니다.",
      "",
      labeledLine("상담 목적", getPayloadValue(input, "handoffIntent")),
      labeledLine("문의 유형", getPayloadValue(input, "detectedCategory")),
      labeledLine("답변 모드", getPayloadValue(input, "answerMode")),
      labeledLine("질문", getPayloadValue(input, "question")),
      labeledLine("확인", formatRouteUrl(input.routeUrl)),
    ]).join("\n")
  }

  return null
}

function buildWecomPayload(input: EmitNotificationEventInput) {
  if (
    input.eventType === "lead.digest.weekly" ||
    input.eventType === "lead.digest.monthly"
  ) {
    return buildLeadDigestWecomCard(input)
  }

  const csNoticeText = input.source === "channel_talk" || input.source === "chatbot"
    ? buildCsNoticeWecomText(input)
    : null
  if (csNoticeText) {
    return {
      msgtype: "text",
      text: {
        content: csNoticeText,
      },
    }
  }

  const leadText = input.categoryTag === "lead" ? buildLeadWecomText(input) : null
  if (leadText) {
    return {
      msgtype: "text",
      text: {
        content: leadText,
      },
    }
  }

  const lines = [
    `[${input.severity?.toUpperCase() ?? "INFO"}] ${input.title}`,
    input.message,
    input.routeUrl ? `Open: ${formatRouteUrl(input.routeUrl)}` : undefined,
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
  if (channel === "wecom_webhook" || channel === "wecom_cs_webhook") {
    return buildWecomPayload(input)
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

  if (channel === "wecom_cs_webhook") {
    return settings.wecomCsWebhookUrl
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

async function deliverEmailChannel(
  input: EmitNotificationEventInput,
  eventId: string,
) {
  const settings = await getResolvedSettings()
  const recipients = settings.notificationDigestEmailList

  if (!recipients.length) {
    await createDeliveryLog({
      eventId,
      channel: "email",
      status: "skipped",
      requestPayload: { title: input.title },
      errorMessage: "Notification digest email list is empty.",
    })
    return
  }

  const html = wrapNotificationHtml(input.title, input.message, input.routeUrl)
  const subjectPrefix =
    input.severity === "critical" ? "[긴급] " : input.severity === "warning" ? "[주의] " : ""

  try {
    const result = await sendInternalNotification({
      to: recipients,
      subject: `${subjectPrefix}${input.title}`,
      html,
      routeUrl: input.routeUrl,
    })

    await createDeliveryLog({
      eventId,
      channel: "email",
      status: result.failed === recipients.length ? "failed" : "sent",
      requestPayload: { to: recipients, provider: result.provider },
      responsePayload: { sent: result.sent, failed: result.failed },
      ...(result.sent > 0 ? { deliveredAt: new Date().toISOString() } : {}),
      ...(result.errors?.length ? { errorMessage: result.errors.join("; ") } : {}),
    })
  } catch (error) {
    await createDeliveryLog({
      eventId,
      channel: "email",
      status: "failed",
      requestPayload: { to: recipients },
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

async function deliverWebhookChannel(
  channel: Exclude<NotificationChannel, "in_app" | "email">,
  input: EmitNotificationEventInput,
  eventId: string,
) {
  const severity = input.severity ?? "info"
  const settings = await getResolvedSettings()
  const payload = buildExternalPayload(channel, input)
  const url = getWebhookUrl(channel, severity, settings)

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

  try {
    const response = await postJson(url, payload)
    const responsePayload = {
      ok: response.ok,
      status: response.status,
    }

    if (!response.ok) {
      await createDeliveryLog({
        eventId,
        channel,
        status: "failed",
        requestPayload: payload,
        responsePayload,
        errorMessage: `HTTP ${response.status}`,
      })
      return
    }

    await createDeliveryLog({
      eventId,
      channel,
      status: "sent",
      requestPayload: payload,
      responsePayload,
      deliveredAt: new Date().toISOString(),
    })
  } catch (error) {
    await createDeliveryLog({
      eventId,
      channel,
      status: "failed",
      requestPayload: payload,
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

  await Promise.all(
    channels.map((channel) =>
      channel === "email"
        ? deliverEmailChannel(input, String(event.id))
        : deliverWebhookChannel(channel, input, String(event.id))
    )
  )

  return event
}

import "server-only"

import { getResolvedSettings } from "@/lib/repositories/settings"
import {
  isWebhookEnabled,
  type WebhookSettingKey,
} from "@/lib/webhook-settings"
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
  /** 예약 리포트처럼 실제 외부 전달 성공이 완료 조건인 호출에서만 사용한다. */
  requireSuccessfulDelivery?: boolean
}

interface NotificationDeliveryResult {
  channel: Exclude<NotificationChannel, "in_app">
  status: "sent" | "failed" | "skipped"
  errorMessage?: string
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

/** 배열 payload(품목 라인 등)를 줄 단위로 꺼낸다 — 한 줄씩 120자 규칙을 적용한다. */
function getPayloadLines(input: EmitNotificationEventInput, key: string) {
  const raw = input.payload?.[key]
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => normalizeWebhookValue(entry))
    .filter((line): line is string => Boolean(line))
}

function getPayloadCount(input: EmitNotificationEventInput, key: string) {
  const parsed = Number(getPayloadValue(input, key))
  return Number.isFinite(parsed) ? parsed : 0
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

/** 사람 수 단위. countLabel 은 "개"라 인원에는 쓸 수 없다. */
function peopleLabel(value?: string) {
  return value ? `${value}명` : undefined
}

/**
 * 리드 보고 카드의 강조 숫자 설명 — 합계에 재문의(재유입)가 섞였을 때만 "신규 N · 재유입 M"으로 가른다.
 * 재유입이 없거나 payload 에 없으면(옛 발송 경로) 원래 설명을 그대로 쓴다. 위컴 강조 설명은 짧아야 하므로
 * 단위 없이 숫자만 싣는다(오늘 유입 카드와 같은 표기).
 */
function leadInflowSplitDesc(input: EmitNotificationEventInput, fallback: string) {
  const reinflow = getPayloadCount(input, "reinflowLeadCount")
  if (reinflow <= 0) return fallback
  return `신규 ${getPayloadCount(input, "newLeadCount")} · 재유입 ${reinflow}`
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

function buildLeadDigestWecomCard(input: EmitNotificationEventInput) {
  const period = getPayloadValue(input, "period") === "monthly" ? "monthly" : "weekly"
  const routeUrl = formatRouteUrl(input.routeUrl) ?? "https://classin.co.kr/admin/crm"
  const totalLeads = getPayloadValue(input, "totalLeads") ?? "0"
  const contactPageLeadCount = getPayloadValue(input, "contactPageLeadCount")
  const demoModalLeadCount = getPayloadValue(input, "demoModalLeadCount")
  const metaLeadAdsLeadCount = getPayloadValue(input, "metaLeadAdsLeadCount")
  const channelTalkInquiryCount = getPayloadValue(input, "channelTalkInquiryCount")
  const chatbotHandoffCount = getPayloadValue(input, "chatbotHandoffCount")
  const chatbotHandoffSentCount = getPayloadValue(input, "chatbotHandoffSentCount")
  const delta = formatDigestDelta(getPayloadValue(input, "deltaLeads"))
  const unrespondedCount = getPayloadValue(input, "unrespondedCount")
  const convertedCount = getPayloadValue(input, "convertedCount")
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
        // 합계는 신규 + 재문의(재유입)다 — 재유입이 섞이면 "신규 리드"라고 부르지 않는다.
        desc: leadInflowSplitDesc(input, "신규 리드"),
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
          keyname: "Meta 광고",
          value: countLabel(metaLeadAdsLeadCount),
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

/**
 * 아침 리드 카드 — Meta 광고와 홈페이지를 한 장으로 합친다(2026-09-07).
 * 강조 숫자는 두 축 합계, 홈페이지는 "홈페이지 " 접두 행 셋으로 Meta 아래 서브 요소로 붙는다.
 * horizontal_content_list 는 위컴이 6행까지만 그리므로 응대 상태는 sub_title_text 로 뺀다.
 */
function buildLeadMorningWecomCard(input: EmitNotificationEventInput) {
  const routeUrl = formatRouteUrl(input.routeUrl) ?? "https://classin.co.kr/admin/crm"
  const unresponded = countLabel(getPayloadValue(input, "unrespondedCount"))
  const contacted = countLabel(getPayloadValue(input, "contactedCount"))
  const converted = countLabel(getPayloadValue(input, "convertedCount"))

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
        desc: getPayloadValue(input, "periodLabel"),
      },
      emphasis_content: {
        title: getPayloadValue(input, "totalLeads") ?? "0",
        desc: leadInflowSplitDesc(input, "전체 접수"),
      },
      sub_title_text: `미응대 ${unresponded} / 상담 진행 ${contacted} / 전환 ${converted}`,
      horizontal_content_list: [
        {
          keyname: "Meta 광고 리드",
          value: countLabel(getPayloadValue(input, "metaLeadAdsLeadCount")),
        },
        {
          keyname: "주요 캠페인",
          value: getPayloadValue(input, "topCampaignLabel") ?? "없음",
        },
        {
          keyname: "홈페이지 문의",
          value: countLabel(getPayloadValue(input, "contactPageLeadCount")),
        },
        {
          keyname: "홈페이지 데모 신청",
          value: countLabel(getPayloadValue(input, "demoModalLeadCount")),
        },
        {
          keyname: "홈페이지 Meta 경유",
          value: countLabel(getPayloadValue(input, "metaAttributedWebsiteLeadCount")),
        },
      ],
      jump_list: [
        {
          type: 1,
          title: "리드 보드 보기",
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

  return null
}

/**
 * 결제창 무결제 도입 신청(checkout.request_created) — 결제가 아니라 "연락해서 진행할 건"
 * 이므로 담당자가 창을 열지 않고도 바로 전화할 수 있게 품목·금액·희망 날짜·연락처를 다 편다.
 */
function buildCheckoutRequestWecomText(input: EmitNotificationEventInput) {
  const kindLabel = getPayloadValue(input, "kindLabel")
  const itemLines = getPayloadLines(input, "itemLines")
  const overflowCount = getPayloadCount(input, "itemOverflowCount")

  return compactLines([
    `${kindLabel ? `${kindLabel} ` : ""}도입 신청이 1건 들어왔습니다 (결제 없이 접수 — 연락 필요)`,
    "",
    labeledLine("학원", getPayloadValue(input, "org")),
    labeledLine("담당자", getPayloadValue(input, "name")),
    labeledLine("연락처", getPayloadValue(input, "phone")),
    labeledLine("이메일", getPayloadValue(input, "email")),
    labeledLine("설치 유형", getPayloadValue(input, "installTypeLabel")),
    labeledLine("설치/배송 주소", getPayloadValue(input, "address")),
    labeledLine("희망 날짜", getPayloadValue(input, "desiredDate")),
    itemLines.length ? "" : undefined,
    itemLines.length ? `품목 ${countLabel(getPayloadValue(input, "itemCount"))}` : undefined,
    ...itemLines.map((line) => `- ${line}`),
    overflowCount > 0 ? `- 외 ${overflowCount}건` : undefined,
    labeledLine("합계", getPayloadValue(input, "totalLabel")),
    labeledLine("메모", getPayloadValue(input, "memo")),
    labeledLine("신청 경로", getPayloadValue(input, "sourcePage")),
    labeledLine("신청 번호", getPayloadValue(input, "requestId")),
    labeledLine("확인", formatRouteUrl(input.routeUrl)),
  ]).join("\n")
}

/**
 * 쇼룸 방문 예약 접수(showroom.booking_requested) — 1차는 요청형이라 담당자가 확정
 * 연락을 해야 끝난다. 창을 열지 않고도 바로 전화할 수 있게 일시·연락처·관심사를 다 편다.
 */
function buildShowroomBookingWecomText(input: EmitNotificationEventInput) {
  const role = getPayloadValue(input, "role")
  const name = getPayloadValue(input, "name")

  return compactLines([
    "목동 쇼룸 방문 예약이 1건 들어왔습니다 (확정 연락 필요)",
    "",
    labeledLine("희망 일시", getPayloadValue(input, "visitLabel")),
    labeledLine("학원", getPayloadValue(input, "org")),
    labeledLine("담당자", name && role ? `${name} (${role})` : name),
    labeledLine("연락처", getPayloadValue(input, "phone")),
    labeledLine("이메일", getPayloadValue(input, "email")),
    labeledLine("방문 인원", peopleLabel(getPayloadValue(input, "visitorCount"))),
    labeledLine("학원 규모", getPayloadValue(input, "academySize")),
    labeledLine("보고 싶은 것", getPayloadValue(input, "interests")),
    labeledLine("메모", getPayloadValue(input, "memo")),
    labeledLine("접수 경로", getPayloadValue(input, "sourcePage")),
    labeledLine("접수 번호", getPayloadValue(input, "bookingId")),
    labeledLine("확인", formatRouteUrl(input.routeUrl)),
  ]).join("\n")
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
  if (input.eventType === "lead.digest.daily") {
    return buildLeadMorningWecomCard(input)
  }

  if (
    input.eventType === "lead.digest.weekly" ||
    input.eventType === "lead.digest.monthly"
  ) {
    return buildLeadDigestWecomCard(input)
  }

  if (input.eventType === "checkout.request_created") {
    return {
      msgtype: "text",
      text: {
        content: buildCheckoutRequestWecomText(input),
      },
    }
  }

  if (input.eventType === "showroom.booking_requested") {
    return {
      msgtype: "text",
      text: {
        content: buildShowroomBookingWecomText(input),
      },
    }
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
  if (
    channel === "wecom_webhook" ||
    channel === "wecom_cs_webhook" ||
    channel === "wecom_lead_report_webhook"
  ) {
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

export const WEBHOOK_DISABLED_REASON = "관리자가 끈 채널입니다."
const WEBHOOK_NOT_CONFIGURED_REASON = "Notification channel is not configured."

/**
 * 목적지별 정본 키. 미설정·비활성이어도 다른 용도의 방으로 우회하지 않는다.
 */
function webhookKeysForChannel(
  channel: Exclude<NotificationChannel, "in_app">,
  severity: NotificationSeverity
): WebhookSettingKey[] {
  switch (channel) {
    case "wecom_webhook":
      return severity === "critical"
        ? ["wecomCriticalWebhookUrl"]
        : ["wecomOpsWebhookUrl"]
    case "wecom_cs_webhook":
      return ["wecomCsWebhookUrl"]
    case "wecom_lead_report_webhook":
      return ["wecomLeadReportWebhookUrl"]
    case "channel_talk_webhook":
      return ["channelTalkWebhookUrl"]
    case "kakao_alimtalk":
      return ["kakaoAlimtalkWebhookUrl"]
    case "email":
      return ["emailWebhookUrl"]
    default:
      return []
  }
}

type WebhookTarget =
  | { url: string; reason?: undefined }
  | { url?: undefined; reason: string }

/**
 * 끄기는 폴백으로 새지 않는다 — 정본 채널이 꺼져 있으면 거기서 멈춘다.
 * 새게 두면 운영 방을 껐을 때 일상 알림이 통째로 긴급 방으로 쏟아진다.
 * URL 유무보다 먼저 활성 상태를 판정해 비활성 사유도 보존한다.
 */
function resolveWebhookTarget(
  channel: Exclude<NotificationChannel, "in_app">,
  severity: NotificationSeverity,
  settings: Awaited<ReturnType<typeof getResolvedSettings>>
): WebhookTarget {
  for (const key of webhookKeysForChannel(channel, severity)) {
    if (!isWebhookEnabled(settings.webhookEnabled, key)) {
      return { url: undefined, reason: WEBHOOK_DISABLED_REASON }
    }
    const url = settings[key]?.trim()
    if (url) return { url }
  }

  return { url: undefined, reason: WEBHOOK_NOT_CONFIGURED_REASON }
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
    return {
      channel: "email",
      status: "skipped",
      errorMessage: "Notification digest email list is empty.",
    } satisfies NotificationDeliveryResult
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

    const status = result.failed === recipients.length ? "failed" : "sent"
    await createDeliveryLog({
      eventId,
      channel: "email",
      status,
      requestPayload: { to: recipients, provider: result.provider },
      responsePayload: { sent: result.sent, failed: result.failed },
      ...(result.sent > 0 ? { deliveredAt: new Date().toISOString() } : {}),
      ...(result.errors?.length ? { errorMessage: result.errors.join("; ") } : {}),
    })
    return {
      channel: "email",
      status,
      ...(result.errors?.length ? { errorMessage: result.errors.join("; ") } : {}),
    } satisfies NotificationDeliveryResult
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    await createDeliveryLog({
      eventId,
      channel: "email",
      status: "failed",
      requestPayload: { to: recipients },
      errorMessage,
    })
    return {
      channel: "email",
      status: "failed",
      errorMessage,
    } satisfies NotificationDeliveryResult
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
  const target = resolveWebhookTarget(channel, severity, settings)

  if (!target.url) {
    await createDeliveryLog({
      eventId,
      channel,
      status: "skipped",
      requestPayload: payload,
      errorMessage: target.reason,
    })
    return {
      channel,
      status: "skipped",
      errorMessage: target.reason,
    } satisfies NotificationDeliveryResult
  }

  const url = target.url

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
      return {
        channel,
        status: "failed",
        errorMessage: `HTTP ${response.status}`,
      } satisfies NotificationDeliveryResult
    }

    await createDeliveryLog({
      eventId,
      channel,
      status: "sent",
      requestPayload: payload,
      responsePayload,
      deliveredAt: new Date().toISOString(),
    })
    return { channel, status: "sent" } satisfies NotificationDeliveryResult
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    await createDeliveryLog({
      eventId,
      channel,
      status: "failed",
      requestPayload: payload,
      errorMessage,
    })
    return {
      channel,
      status: "failed",
      errorMessage,
    } satisfies NotificationDeliveryResult
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

  const deliveryResults = await Promise.all(
    channels.map((channel) =>
      channel === "email"
        ? deliverEmailChannel(input, String(event.id))
        : deliverWebhookChannel(channel, input, String(event.id))
    )
  )

  const unsuccessful = deliveryResults.filter((result) => result.status !== "sent")
  if (input.requireSuccessfulDelivery && unsuccessful.length > 0) {
    throw new Error(
      unsuccessful
        .map(
          (result) =>
            `${result.channel}: ${result.errorMessage ?? result.status}`
        )
        .join("; ")
    )
  }

  return { ...event, deliveryResults }
}

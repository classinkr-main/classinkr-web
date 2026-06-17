import { createHmac, timingSafeEqual } from "crypto"

import { NextRequest, NextResponse } from "next/server"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"

interface ChannelWebhookEntity {
  personType?: string
  plainText?: string
  chatId?: string
  chatType?: string
}

interface ChannelWebhookPayload {
  event?: string
  type?: string
  entity?: ChannelWebhookEntity
}

function verifySignature(raw: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac("sha256", secret).update(raw).digest("hex")
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== actualBuffer.length) return false
  return timingSafeEqual(expectedBuffer, actualBuffer)
}

function safeEquals(actual: string | null | undefined, expected: string | null | undefined): boolean {
  if (!actual || !expected) return false
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function verifyUrlToken(req: NextRequest, expectedToken?: string): boolean {
  if (!expectedToken) return false
  const token = firstNonEmpty(
    req.nextUrl.searchParams.get("token") ?? undefined,
    req.headers.get("x-webhook-token") ?? undefined
  )
  return safeEquals(token, expectedToken)
}

/**
 * 채널톡 인바운드 웹훅 — 고객 신규 메시지를 실시간 알림으로 연결한다.
 * 채널톡 일반 Webhook은 custom header를 넣을 수 없어 URL token을 우선 지원한다.
 * HMAC 서명을 제공하는 통합은 CHANNEL_TALK_WEBHOOK_SECRET으로도 검증할 수 있다.
 * 전체 대화 본문은 크론/수동 동기화가 채우고, 여기서는 알림만 발행한다(저FS 부하).
 */
export async function POST(req: NextRequest) {
  const urlToken = firstNonEmpty(
    process.env.CHANNEL_TALK_WEBHOOK_URL_TOKEN,
    process.env.CHANNEL_WEBHOOK_URL_TOKEN
  )
  const secret = firstNonEmpty(
    process.env.CHANNEL_TALK_WEBHOOK_SECRET,
    process.env.CHANNEL_WEBHOOK_SECRET
  )
  if (!urlToken && !secret) {
    return NextResponse.json({ error: "Webhook auth not configured." }, { status: 503 })
  }

  const raw = await req.text()
  const isAuthorized =
    verifyUrlToken(req, urlToken) ||
    (secret ? verifySignature(raw, req.headers.get("x-signature"), secret) : false)
  if (!isAuthorized) {
    return NextResponse.json({ error: "Invalid webhook authentication." }, { status: 401 })
  }

  let payload: ChannelWebhookPayload
  try {
    payload = JSON.parse(raw) as ChannelWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  const entity = payload.entity
  const isUserMessage =
    (payload.type === "message" || payload.event === "push") && entity?.personType === "user"

  if (isUserMessage) {
    const text =
      typeof entity?.plainText === "string" && entity.plainText.trim()
        ? entity.plainText.trim().slice(0, 140)
        : "새 상담 메시지가 도착했습니다."

    void emitNotificationEvent({
      eventType: "channel_talk.message",
      notificationType: "action_required",
      categoryTag: "lead",
      severity: "info",
      scopeTag: "org_admin",
      title: "채널톡 새 상담 메시지",
      message: text,
      routeUrl: "/admin/channel-talk",
      source: "channel_talk",
      sourceId: typeof entity?.chatId === "string" ? entity.chatId : undefined,
      payload: { chatId: entity?.chatId ?? null },
      channels: ["wecom_cs_webhook"],
    }).catch((error) => {
      console.error("[webhook/channel-talk] notification emit failed:", error)
    })
  }

  return NextResponse.json({ ok: true })
}

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

/**
 * 채널톡 인바운드 웹훅 — 고객 신규 메시지를 실시간 알림으로 연결한다.
 * 서명은 CHANNEL_WEBHOOK_SECRET 으로 HMAC-SHA256 검증한다(미설정 시 503).
 * 전체 대화 본문은 크론/수동 동기화가 채우고, 여기서는 알림만 발행한다(저FS 부하).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CHANNEL_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 })
  }

  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get("x-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 })
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
    }).catch((error) => {
      console.error("[webhook/channel-talk] notification emit failed:", error)
    })
  }

  return NextResponse.json({ ok: true })
}

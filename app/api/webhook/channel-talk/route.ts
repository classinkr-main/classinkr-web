import { createHmac, timingSafeEqual } from "crypto"

import { after, NextRequest, NextResponse } from "next/server"

import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { getOrCreateCrmCustomerEventBySource } from "@/lib/repositories/crm-events"

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
 * 응답 뒤에 돌 작업을 응답이 닫히기 전에 등록한다(R9). 예전에는 void 로 띄워 Vercel 함수가 200 직후 멈추면 WeCom 알림·CRM 기록이
 * 잘렸다. after 는 핸들러가 응답을 돌려주기 전에 불러야 실행이 보장된다 — 응답을 만든 뒤 등록하면 이미 닫힌 응답에 걸려
 * 돌지 않는다. 요청 밖(스크립트·시험)에서는 after 가 던지므로 그대로 돌린다.
 */
function runAfterResponse(task: () => Promise<unknown>) {
  try {
    after(task)
  } catch {
    void task()
  }
}

/**
 * 채널톡 인바운드 웹훅 — 고객 신규 메시지를 실시간 알림으로 연결한다.
 * 채널톡 일반 Webhook은 custom header를 넣을 수 없어 URL token을 우선 지원한다.
 * HMAC 서명을 제공하는 통합은 CHANNEL_TALK_WEBHOOK_SECRET으로도 검증할 수 있다.
 * 전체 대화 본문은 크론/수동 동기화가 채우고, 여기서는 알림·CRM 완결 기록만 응답 뒤 작업(after)으로 남긴다.
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

  const tasks: Array<() => Promise<unknown>> = []

  if (isUserMessage) {
    const text =
      typeof entity?.plainText === "string" && entity.plainText.trim()
        ? entity.plainText.trim().slice(0, 140)
        : "새 상담 메시지가 도착했습니다."

    tasks.push(() =>
      emitNotificationEvent({
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
    )
  }

  const isChatClosed =
    payload.type === "chat.closed" ||
    payload.event === "userChat.closed" ||
    payload.type === "userChat.closed"

  if (isChatClosed) {
    const chatId = typeof entity?.chatId === "string" ? entity.chatId : null
    if (chatId) {
      // 같은 상담(chatId)이 여러 번 닫혀도 기록은 하나, 다른 상담은 본문이 같아도(대개 null) 따로 남는다 —
      // 출처 id(channel:{chatId}) 기준으로 찾고 없을 때만 만든다. 예전 createCrmCustomerEvent 는 10초 안의 같은 제목·본문을
      // 출처 id 없이 중복으로 봐서 서로 다른 상담이 하나로 뭉개졌다.
      tasks.push(() =>
        getOrCreateCrmCustomerEventBySource({
          targetType: "customer",
          targetId: null,
          sourceType: "site_inflow",
          sourceId: `channel:${chatId}`,
          occurredAt: new Date().toISOString(),
          title: "채널톡 실시간 상담 완결",
          summary: `채널톡 대화(${chatId})가 완결되어 CRM 타임라인에 실시간 스탬프되었습니다.`,
          body: typeof entity?.plainText === "string" ? entity.plainText : null,
          sentiment: "neutral",
          tags: ["channel_talk", "cs_inquiry", "realtime_webhook"],
        }).catch((error) => {
          console.error("[webhook/channel-talk] crm event emission failed:", error)
        })
      )
    }
  }

  if (tasks.length > 0) {
    runAfterResponse(() => Promise.allSettled(tasks.map((task) => task())))
  }

  return NextResponse.json({ ok: true })
}

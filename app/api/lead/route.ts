/**
 * ─────────────────────────────────────────────────────────────
 * /api/lead  —  리드 수집 API (기존 + 마케팅 구독자 자동 등록)
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-24] 리드 → 구독자 자동 연동
 *   데모 신청 또는 문의 시 이메일이 포함되어 있으면
 *   자동으로 구독자 DB에도 등록 (옵트인 처리).
 */
import { NextRequest, NextResponse } from "next/server"
import { saveLead } from "@/lib/repositories/leads"
import { upsertSubscriber } from "@/lib/repositories/marketing"

export interface LeadPayload {
  source: "demo_modal" | "contact_page" | "newsletter"
  name?: string
  org?: string
  role?: string
  size?: string
  email?: string
  phone?: string
  message?: string
  timestamp: string
  /** [NOTE-24] 마케팅 이메일 수신 동의 여부 */
  marketingConsent?: boolean
}

export async function POST(req: NextRequest) {
  try {
    const body: LeadPayload = await req.json()
    body.timestamp = new Date().toISOString()

    try {
      await saveLead({ ...body })
    } catch (e) {
      console.error("[POST /api/lead] saveLead error:", e)
      // DB 저장 실패해도 외부 연동은 계속
    }

    const results = await Promise.allSettled([
      sendToGoogleSheet(body),
      sendToWebhook(body),
      sendToChannelTalk(body),
      /** [NOTE-24] 이메일 있고 수신 동의 시 구독자 DB 자동 등록 */
      body.email && body.marketingConsent !== false
        ? syncToSubscriberDB(body)
        : Promise.resolve(),
    ])

    const errors = results
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason?.message)

    if (errors.length === results.length) {
      return NextResponse.json(
        { ok: false, error: "All integrations failed", details: errors },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, errors: errors.length > 0 ? errors : undefined })
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })
  }
}

async function sendToGoogleSheet(data: LeadPayload) {
  const url = process.env.GOOGLE_SHEET_WEBHOOK_URL
  if (!url) return

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  if (!res.ok) throw new Error(`Google Sheet: ${res.status}`)
}

async function sendToWebhook(data: LeadPayload) {
  const url = process.env.LEAD_WEBHOOK_URL
  if (!url) return

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  if (!res.ok) throw new Error(`Webhook: ${res.status}`)
}

async function sendToChannelTalk(data: LeadPayload) {
  const url = process.env.CHANNEL_TALK_WEBHOOK_URL
  if (!url) return

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "new_lead",
      source: data.source,
      name: data.name || data.email,
      org: data.org,
      phone: data.phone,
      email: data.email,
      message: data.message || `${data.role} / 원생 ${data.size}`,
      timestamp: data.timestamp,
    }),
  })

  if (!res.ok) throw new Error(`ChannelTalk: ${res.status}`)
}

/**
 * [NOTE-24] 리드 → 구독자 DB 자동 동기화
 * 데모 신청자 / 문의자의 이메일을 구독자 목록에 등록.
 * 유입 경로(source)를 그대로 전달하여 추적 가능.
 */
async function syncToSubscriberDB(data: LeadPayload) {
  if (!data.email) return

  try {
    await upsertSubscriber({
      name: data.name || data.email.split("@")[0],
      email: data.email,
      org: data.org,
      role: data.role,
      size: data.size,
      phone: data.phone,
      tags: data.source === "demo_modal" ? ["데모신청"] : [],
      source: data.source,
    })
  } catch (err) {
    console.error("[syncToSubscriberDB] 구독자 자동 등록 실패:", err)
  }
}

import { NextRequest, NextResponse } from "next/server"

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
}

export async function POST(req: NextRequest) {
  try {
    const body: LeadPayload = await req.json()
    body.timestamp = new Date().toISOString()

    const results = await Promise.allSettled([
      sendToGoogleSheet(body),
      sendToWebhook(body),
      sendToChannelTalk(body),
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

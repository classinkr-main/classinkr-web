import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const ALLOWED_EVENTS = new Set([
  "page_view",
  "click_cta",
  "submit_demo_request",
  "submit_newsletter",
  "download_materials",
  "view_demo_video",
  "begin_checkout",
])

interface TrackEventBody {
  event?: string
  page?: string
  params?: Record<string, string | number | boolean | null | undefined>
}

export async function POST(req: NextRequest) {
  let body: TrackEventBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const eventName = body.event?.trim()
  if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const params = (body.params ?? {}) as Record<string, unknown>
  const buttonRaw = params.button
  const button = typeof buttonRaw === "string" ? buttonRaw.slice(0, 80) : null
  const page = typeof body.page === "string" ? body.page.slice(0, 200) : null

  const referrer = req.headers.get("referer")?.slice(0, 500) ?? null
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null

  try {
    const sb = createSupabaseAdminClient()
    await sb.from("client_events").insert({
      event_name: eventName,
      button,
      page,
      params,
      referrer,
      user_agent: userAgent,
    })
  } catch {
    // 추적은 사용자 경험을 막지 않는다 — 실패해도 200 반환
  }

  return NextResponse.json({ ok: true })
}

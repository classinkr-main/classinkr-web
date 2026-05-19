import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"

const ALLOWED_EVENTS = new Set([
  "page_view",
  "click_cta",
  "submit_demo_request",
  "submit_newsletter",
  "download_materials",
  "view_demo_video",
  "begin_checkout",
  "purchase",
])

interface TrackEventBody {
  event?: string
  page?: string
  params?: Record<string, string | number | boolean | null | undefined>
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "track-event", {
    windowMs: 60_000,
    max: 120,
  })

  if (!allowed) {
    return NextResponse.json({ ok: false }, { status: 429 })
  }

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

  const params = sanitizeParams(body.params ?? {})
  const buttonRaw = params.button
  const button = typeof buttonRaw === "string" ? buttonRaw.slice(0, 80) : null
  const page = typeof body.page === "string" ? body.page.slice(0, 200) : null

  const referrer = req.headers.get("referer")?.slice(0, 500) ?? null
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null

  try {
    const sb = createSupabaseAdminClient()
    const { error } = await sb.from("client_events").insert({
      event_name: eventName,
      button,
      page,
      params,
      referrer,
      user_agent: userAgent,
    })
    if (error) {
      console.warn("[track/event] client_events insert failed:", error.message)
      return NextResponse.json({ ok: true, stored: false })
    }
  } catch {
    // 추적은 사용자 경험을 막지 않는다 — 실패해도 200 반환
    return NextResponse.json({ ok: true, stored: false })
  }

  return NextResponse.json({ ok: true, stored: true })
}

function sanitizeParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params)
      .slice(0, 20)
      .map(([key, value]) => {
        const safeKey = key.slice(0, 60)

        if (typeof value === "string") return [safeKey, value.slice(0, 500)]
        if (typeof value === "number" && Number.isFinite(value)) return [safeKey, value]
        if (typeof value === "boolean" || value == null) return [safeKey, value]
        return [safeKey, String(value).slice(0, 500)]
      })
  )
}

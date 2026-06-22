import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import { isCrossOriginRequest } from "@/lib/server/same-origin"

const ALLOWED_EVENTS = new Set([
  "page_view",
  "click_cta",
  "submit_demo_request",
  "submit_newsletter",
  "download_materials",
  "view_resource_card",
  "view_resource",
  "view_demo_video",
  "begin_checkout",
])

const ALLOWED_PARAM_KEYS: Record<string, Set<string>> = {
  page_view: new Set(["path", "title", "referrer"]),
  click_cta: new Set([
    "button",
    "page",
    "destination",
    "model",
    "source",
    "lead_magnet",
    "gate",
    "slug",
    "event_slug",
    "event_id",
  ]),
  submit_demo_request: new Set(["source", "lead_id", "stored", "event_slug"]),
  submit_newsletter: new Set(["source", "lead_magnet", "post_slug", "gate"]),
  download_materials: new Set(["asset_id", "page", "source", "lead_magnet", "post_slug", "gate"]),
  view_resource_card: new Set(["source", "lead_magnet", "gate", "tier", "category"]),
  view_resource: new Set(["source", "lead_magnet", "gate", "tier", "category"]),
  view_demo_video: new Set(["button", "page"]),
  begin_checkout: new Set([
    "button",
    "page",
    "mode",
    "plan_id",
    "billing_cycle",
    "account_count",
    "amount_cny",
    "quote_code",
    "promo_code",
    "value",
    "currency",
  ]),
}

const PII_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\b\d{3}[-\s]?\d{2}[-\s]?\d{5}\b/g,
  /\b\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g,
]

interface TrackEventBody {
  event?: string
  page?: string
  anonymousId?: string | null
  params?: Record<string, string | number | boolean | null | undefined>
}

export async function POST(req: NextRequest) {
  if (isCrossOriginRequest(req)) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

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

  const params = sanitizeParams(eventName, body.params ?? {})
  const buttonRaw = params.button
  const button = typeof buttonRaw === "string" ? buttonRaw.slice(0, 80) : null
  const page = typeof body.page === "string" ? redactPii(body.page).slice(0, 200) : null

  const referrer = redactPii(req.headers.get("referer") ?? "").slice(0, 500) || null
  const userAgent = redactPii(req.headers.get("user-agent") ?? "").slice(0, 500) || null
  const anonymousId =
    typeof body.anonymousId === "string" ? body.anonymousId.slice(0, 100) : null

  try {
    const sb = createSupabaseAdminClient()
    const { error } = await sb.from("client_events").insert({
      event_name: eventName,
      button,
      page,
      params,
      referrer,
      user_agent: userAgent,
      anonymous_id: anonymousId,
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

function redactPii(value: string) {
  return PII_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, "[redacted]"),
    value
  )
}

function sanitizeParams(eventName: string, params: Record<string, unknown>) {
  const allowedKeys = ALLOWED_PARAM_KEYS[eventName] ?? new Set<string>()

  return Object.fromEntries(
    Object.entries(params)
      .filter(([key]) => allowedKeys.has(key))
      .map(([key, value]) => {
        if (typeof value === "string") return [key, redactPii(value).slice(0, 500)]
        if (typeof value === "number" && Number.isFinite(value)) return [key, value]
        if (typeof value === "boolean" || value == null) return [key, value]
        return [key, redactPii(String(value)).slice(0, 500)]
      })
  )
}

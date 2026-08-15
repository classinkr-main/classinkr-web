import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  ANONYMOUS_ID_COOKIE,
  CONSENT_COOKIE,
  parseConsent,
} from "@/lib/consent/consent"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { isCrossOriginRequest } from "@/lib/server/same-origin"
import { resolveLeadIdForAnonymousId } from "@/lib/identity/stitch"

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
  "purchase",
  "page_exit",
  "chatbot_teaser_shown",
  "chatbot_teaser_clicked",
  "chatbot_teaser_dismissed",
  "chatbot_opened",
  "chatbot_first_question",
])

const ALLOWED_PARAM_KEYS: Record<string, Set<string>> = {
  page_view: new Set(["path", "title", "referrer", "event_id"]),
  click_cta: new Set([
    "event_id",
    "button",
    "page",
    "destination",
    "model",
    "source",
    "lead_magnet",
    "gate",
    "slug",
    "event_slug",
  ]),
  submit_demo_request: new Set(["event_id", "source", "lead_id", "stored", "event_slug", "lead_magnet"]),
  submit_newsletter: new Set(["event_id", "source", "lead_magnet", "post_slug", "gate"]),
  download_materials: new Set(["event_id", "asset_id", "page", "source", "lead_magnet", "post_slug", "gate"]),
  view_resource_card: new Set(["event_id", "source", "lead_magnet", "gate", "tier", "category"]),
  view_resource: new Set(["event_id", "source", "lead_magnet", "gate", "tier", "category"]),
  view_demo_video: new Set(["event_id", "button", "page", "source", "seminar"]),
  begin_checkout: new Set([
    "event_id",
    "button",
    "page",
    "mode",
    "plan_id",
    "billing_cycle",
    "account_count",
    "quote_code",
    "promo_code",
    "value",
    "currency",
  ]),
  purchase: new Set(["event_id", "transaction_id", "value", "currency"]),
  page_exit: new Set([
    "event_id",
    "path",
    "title",
    "duration_ms",
    "exit_type",
    "next_path",
  ]),
  chatbot_teaser_shown: new Set(["event_id", "path"]),
  chatbot_teaser_clicked: new Set(["event_id", "path"]),
  chatbot_teaser_dismissed: new Set(["event_id", "path"]),
  chatbot_opened: new Set(["event_id", "source"]),
  chatbot_first_question: new Set(["event_id", "path"]),
}

const PII_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\b\d{3}[-\s]?\d{2}[-\s]?\d{5}\b/g,
  /\b\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g,
]

interface TrackEventBody {
  event?: string
  page?: string
  /** 클라이언트가 여전히 보내지만 **서버는 무시한다** — cln_aid 쿠키만 신뢰한다. */
  anonymousId?: string | null
  params?: Record<string, string | number | boolean | null | undefined>
}

export async function POST(req: NextRequest) {
  if (isCrossOriginRequest(req)) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "track-event", {
    windowMs: 60_000,
    max: 120,
  })

  if (!allowed) {
    return NextResponse.json({ ok: false }, { status: 429 })
  }

  // 서버측 분석 동의 검증. 지금까지는 lib/analytics.ts의 클라이언트 게이트가 유일한
  // 방어였는데 브라우저 코드라 우회가 자명하고, Origin 헤더가 없는 비브라우저 요청은
  // isCrossOriginRequest 도 통과한다. lib/marketing/server-conversions.ts 가 이미
  // 같은 방식으로 서버에서 동의를 확인하므로 그 패턴을 그대로 따른다.
  // 추적 실패는 사용자 경험을 막지 않는다는 이 라우트의 계약대로 200을 유지한다.
  const consent = parseConsent(req.cookies.get(CONSENT_COOKIE)?.value ?? null)
  if (!consent?.analytics) {
    return NextResponse.json({ ok: true, stored: false, reason: "no_consent" })
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
  // 익명 식별자는 **쿠키에서만** 읽는다. 본문 값을 신뢰하면 남의 cln_aid 를 알아낸
  // 호출자가 아래 resolveLeadIdForAnonymousId 를 통해 **타인의 리드에 임의 이벤트를
  // 귀속**시킬 수 있다. cln_aid 는 분석 동의 시에만 발급되므로(app/api/consent/route.ts)
  // 위 동의 게이트와 자연스럽게 맞물린다.
  const anonymousId = req.cookies.get(ANONYMOUS_ID_COOKIE)?.value?.trim() || null

  // 이미 리드로 전환된 방문자면 이벤트에 lead_id 를 붙인다. 이게 있어야 "연락 후 재방문"
  // 같은 반응 신호가 잡힌다 — 없으면 전환 이후의 활동이 영영 익명으로 남는다.
  // 조회 실패는 익명 적재로 떨어질 뿐 추적을 막지 않는다.
  const leadId = anonymousId ? await resolveLeadIdForAnonymousId(anonymousId) : null

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
      lead_id: leadId,
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

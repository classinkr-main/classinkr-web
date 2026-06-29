import { createHash, randomUUID } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"

import {
  ANONYMOUS_ID_COOKIE,
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  CONSENT_POLICY_VERSION,
  type ConsentRecord,
} from "@/lib/consent/consent"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { isCrossOriginRequest } from "@/lib/server/same-origin"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

interface ConsentBody {
  analytics?: boolean
  marketing?: boolean
  policy_version?: string
  anonymous_id?: string | null
}

function sanitizeAnonymousId(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim().slice(0, 100)
  return /^[A-Za-z0-9._:-]{8,100}$/.test(trimmed) ? trimmed : null
}

function isSecureRequest(req: NextRequest) {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https"
}

function createConsentResponse({
  req,
  record,
  anonymousId,
  stored,
}: {
  req: NextRequest
  record: ConsentRecord
  anonymousId: string | null
  stored: boolean
}) {
  const secure = isSecureRequest(req)
  const response = NextResponse.json({ ok: true, stored, record, anonymous_id: anonymousId })

  response.cookies.set(CONSENT_COOKIE, JSON.stringify(record), {
    httpOnly: false,
    maxAge: CONSENT_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure,
  })

  if (record.analytics && anonymousId) {
    response.cookies.set(ANONYMOUS_ID_COOKIE, anonymousId, {
      httpOnly: false,
      maxAge: CONSENT_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure,
    })
  } else {
    response.cookies.set(ANONYMOUS_ID_COOKIE, "", {
      httpOnly: false,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure,
    })
  }

  return response
}

/**
 * 쿠키 동의 저장 + 감사 로그. PIPA/GDPR 입증용으로 "언제/무엇에 동의했는지"를 기록한다.
 * 감사 로그 실패는 쿠키 저장을 막지 않는다(best-effort).
 */
export async function POST(req: NextRequest) {
  if (isCrossOriginRequest(req)) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "consent", { windowMs: 60_000, max: 30 })
  if (!allowed) {
    return NextResponse.json({ ok: false }, { status: 429 })
  }

  let body: ConsentBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const policyVersion =
    typeof body.policy_version === "string" ? body.policy_version.slice(0, 40) : null
  if (!policyVersion || policyVersion !== CONSENT_POLICY_VERSION) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const analytics = Boolean(body.analytics)
  const marketing = Boolean(body.marketing)
  const anonymousId = analytics
    ? sanitizeAnonymousId(body.anonymous_id) ??
      sanitizeAnonymousId(req.cookies.get(ANONYMOUS_ID_COOKIE)?.value) ??
      randomUUID()
    : null
  const record: ConsentRecord = {
    v: CONSENT_POLICY_VERSION,
    analytics,
    marketing,
    ts: Date.now(),
  }

  // IP는 원본을 저장하지 않고 해시만 보관한다.
  const ipHash = ip ? createHash("sha256").update(ip).digest("hex") : null
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500) || null

  try {
    const sb = createSupabaseAdminClient()
    const { error } = await sb.from("consent_logs").insert({
      anonymous_id: anonymousId,
      categories: {
        necessary: true,
        analytics,
        marketing,
      },
      policy_version: record.v,
      user_agent: userAgent,
      ip_hash: ipHash,
    })
    if (error) {
      console.warn("[consent] consent_logs insert failed:", error.message)
      return createConsentResponse({ req, record, anonymousId, stored: false })
    }
  } catch {
    return createConsentResponse({ req, record, anonymousId, stored: false })
  }

  return createConsentResponse({ req, record, anonymousId, stored: true })
}

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
  // 감사 로그가 남지 않았으면 s:0으로 표시해 다음 방문에 클라이언트가 재동기화하도록 한다.
  const storedRecord: ConsentRecord = { ...record, s: stored ? 1 : 0 }
  const response = NextResponse.json({
    ok: true,
    stored,
    record: storedRecord,
    anonymous_id: anonymousId,
  })

  response.cookies.set(CONSENT_COOKIE, JSON.stringify(storedRecord), {
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

  let body: ConsentBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  // 정책 버전이 어긋나도 **거부하지 않는다**. 과거에는 400을 반환했는데, 구버전
  // 클라이언트 번들(롤링 배포 중)이나 env drift 상황에서 동의가 영영 저장되지 않고
  // 배너가 무한 재노출되는 막다른 길이었다. 서버 정본 버전으로 기록하고 그대로 돌려준다.
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

  // 레이트리밋은 **감사 로그 insert만** 막는다. 동의 쿠키 발급까지 막으면
  // 학교/학원처럼 NAT 뒤에서 IP를 공유하는 환경에서 동의가 저장되지 않아
  // 배너가 계속 다시 뜬다. 쿠키는 항상 내려준다.
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "consent", { windowMs: 60_000, max: 60 })
  if (!allowed) {
    return createConsentResponse({ req, record, anonymousId, stored: false })
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

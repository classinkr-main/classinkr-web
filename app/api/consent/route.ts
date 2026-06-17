import { createHash } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"

import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import { isCrossOriginRequest } from "@/lib/server/same-origin"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

interface ConsentBody {
  analytics?: boolean
  marketing?: boolean
  policy_version?: string
  anonymous_id?: string | null
}

/**
 * 쿠키 동의 감사 로그. PIPA/GDPR 입증용으로 "언제/무엇에 동의했는지"를 기록한다.
 * 실패해도 사용자 경험을 막지 않는다(best-effort).
 */
export async function POST(req: NextRequest) {
  if (isCrossOriginRequest(req)) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "consent", { windowMs: 60_000, max: 30 })
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
  if (!policyVersion) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const anonymousId =
    (typeof body.anonymous_id === "string" ? body.anonymous_id.slice(0, 100) : null) ??
    req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ??
    null

  // IP는 원본을 저장하지 않고 해시만 보관한다.
  const ipHash = ip ? createHash("sha256").update(ip).digest("hex") : null
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500) || null

  try {
    const sb = createSupabaseAdminClient()
    const { error } = await sb.from("consent_logs").insert({
      anonymous_id: anonymousId,
      categories: {
        necessary: true,
        analytics: Boolean(body.analytics),
        marketing: Boolean(body.marketing),
      },
      policy_version: policyVersion,
      user_agent: userAgent,
      ip_hash: ipHash,
    })
    if (error) {
      console.warn("[consent] consent_logs insert failed:", error.message)
      return NextResponse.json({ ok: true, stored: false })
    }
  } catch {
    return NextResponse.json({ ok: true, stored: false })
  }

  return NextResponse.json({ ok: true, stored: true })
}

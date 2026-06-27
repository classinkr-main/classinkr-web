import { type NextRequest, NextResponse } from "next/server"

import { getPublicUserContext } from "@/lib/auth/public-user"
import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { stitchIdentity } from "@/lib/identity/stitch"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { isCrossOriginRequest } from "@/lib/server/same-origin"

export async function POST(req: NextRequest) {
  if (isCrossOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "identify", { windowMs: 60_000, max: 20 })
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  const context = await getPublicUserContext()
  if (!context) {
    return NextResponse.json(
      { error: "로그인이 필요합니다.", code: "login_required" },
      { status: 401 }
    )
  }

  const result = await stitchIdentity({
    anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
    userId: context.user.id,
    leadId: context.profile.lead_id,
    email: context.user.email ?? context.profile.email,
    emailVerified: Boolean(context.user.email_confirmed_at),
  })

  return NextResponse.json(result)
}

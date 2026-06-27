import { type NextRequest, NextResponse } from "next/server"

import { getPublicUserContext } from "@/lib/auth/public-user"
import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { getSeminarBySlug } from "@/lib/seminars/catalog"
import { recordSeminarView } from "@/lib/seminars/record-view"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"
import { isCrossOriginRequest } from "@/lib/server/same-origin"

interface RouteContext {
  params: Promise<{ slug: string }>
}

function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  if (isCrossOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "seminar-view", { windowMs: 60_000, max: 30 })
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  const { slug: rawSlug } = await params
  const slug = decodeSlug(rawSlug)

  const seminar = getSeminarBySlug(slug)
  if (!seminar) {
    return NextResponse.json({ error: "행사 영상을 찾을 수 없습니다." }, { status: 404 })
  }

  const userContext = await getPublicUserContext()
  if (!userContext) {
    return NextResponse.json(
      { error: "로그인이 필요합니다.", code: "login_required" },
      { status: 401 }
    )
  }

  await recordSeminarView({
    slug,
    userId: userContext.user.id,
    leadId: userContext.profile.lead_id,
    anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
  })

  return NextResponse.json({ ok: true })
}

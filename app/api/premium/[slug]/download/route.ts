import { type NextRequest, NextResponse } from "next/server"

import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { recordPremiumAccessEvent } from "@/lib/premium/access-log"
import { authorizePremiumContentAccess } from "@/lib/premium/authorize"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { isCrossOriginRequest } from "@/lib/server/same-origin"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

interface RouteContext {
  params: Promise<{ slug: string }>
}

const DEFAULT_PREMIUM_BUCKET = process.env.PREMIUM_CONTENT_STORAGE_BUCKET?.trim() || "premium-content"

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
  const { allowed } = await checkRateLimitDistributed(ip, "premium-download", {
    windowMs: 60_000,
    max: 20,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  const { slug: rawSlug } = await params
  const slug = decodeSlug(rawSlug)
  const page = `/premium/${encodeURIComponent(slug)}`
  const referrer = req.headers.get("referer") ?? null
  const userAgent = req.headers.get("user-agent") ?? null
  const anonymousId = req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null

  const access = await authorizePremiumContentAccess(slug, {
    anonymous_id: anonymousId,
    page,
    referrer,
    user_agent: userAgent,
  })

  if (access.status === "not_found" || access.status === "unpublished") {
    return NextResponse.json({ error: "Premium content not found." }, { status: 404 })
  }

  if (access.status === "login_required") {
    return NextResponse.json(
      { error: "로그인이 필요합니다.", code: "login_required" },
      { status: 401 }
    )
  }

  if (access.status === "forbidden") {
    return NextResponse.json(
      { error: "프리미엄 콘텐츠 접근 권한이 없습니다.", code: "premium_required" },
      { status: 403 }
    )
  }

  const { content, entitlement } = access
  if (content.content_type !== "file" || !content.storage_path) {
    return NextResponse.json(
      { error: "다운로드 가능한 프리미엄 파일이 아닙니다.", code: "not_downloadable" },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage
    .from(content.storage_bucket ?? DEFAULT_PREMIUM_BUCKET)
    .createSignedUrl(content.storage_path, 60, { download: true })

  if (error || !data?.signedUrl) {
    console.warn("[premium/download] signed URL failed:", error?.message)
    return NextResponse.json(
      { error: "프리미엄 파일 다운로드를 준비하지 못했습니다." },
      { status: 500 }
    )
  }

  await recordPremiumAccessEvent({
    content_id: content.id,
    content_slug: content.slug,
    user_id: entitlement.user_id,
    anonymous_id: anonymousId,
    action: "download_issued",
    reason: "signed_url_issued",
    provider: "premium",
    page,
    referrer,
    user_agent: userAgent,
  })

  return NextResponse.json({
    ok: true,
    url: data.signedUrl,
    signed: true,
  })
}

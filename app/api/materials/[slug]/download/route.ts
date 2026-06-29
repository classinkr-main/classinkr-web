import { type NextRequest, NextResponse } from "next/server"

import { getPublicUserContext } from "@/lib/auth/public-user"
import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { prepareMaterialDownload } from "@/lib/materials"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { isCrossOriginRequest } from "@/lib/server/same-origin"

interface RouteContext {
  params: Promise<{ slug: string }>
}

interface DownloadBody {
  email?: string
  anonymousId?: string
  source?: string
  postSlug?: string
}

function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

async function parseBody(req: NextRequest): Promise<DownloadBody> {
  if (req.method === "GET") return {}
  return (await req.json().catch(() => ({}))) as DownloadBody
}

function readAnonymousId(req: NextRequest, body: DownloadBody) {
  return req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? body.anonymousId ?? null
}

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase()
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  if (isCrossOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const ip = getClientIp(req)
  const { allowed } = await checkRateLimitDistributed(ip, "material-download", {
    windowMs: 60_000,
    max: 20,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  const { slug: rawSlug } = await params
  const slug = decodeSlug(rawSlug)
  const body = await parseBody(req)
  const userContext = await getPublicUserContext()
  const requestEmail = normalizeEmail(body.email)
  const userEmail = normalizeEmail(userContext?.user.email)

  const preview = await prepareMaterialDownloadPreview(slug)
  if (!preview) {
    return NextResponse.json({ error: "자료를 찾을 수 없습니다." }, { status: 404 })
  }

  if (preview.gate === "login" && !userContext) {
    return NextResponse.json(
      { error: "로그인이 필요합니다.", code: "login_required" },
      { status: 401 }
    )
  }

  if (preview.gate === "email" && !requestEmail && !userEmail) {
    return NextResponse.json(
      { error: "이메일 확인이 필요합니다.", code: "email_required" },
      { status: 400 }
    )
  }

  try {
    const result = await prepareMaterialDownload({
      slug,
      email: requestEmail ?? userEmail,
      anonymousId: readAnonymousId(req, body),
      source: body.source ?? "materials_api",
      postSlug: body.postSlug ?? null,
      userId: userContext?.user.id ?? null,
      leadId: userContext?.profile.lead_id ?? null,
    })

    if (!result) {
      return NextResponse.json({ error: "자료를 찾을 수 없습니다." }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      url: result.destinationUrl,
      signed: result.signed,
      stored: result.stored,
      gate: result.magnet.gate,
    })
  } catch (error) {
    console.error("[materials/download] failed:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "자료 다운로드를 준비하지 못했습니다." },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { slug: rawSlug } = await context.params
  const slug = decodeSlug(rawSlug)
  const userContext = await getPublicUserContext()
  const preview = await prepareMaterialDownloadPreview(slug)

  if (!preview) {
    return NextResponse.json({ error: "자료를 찾을 수 없습니다." }, { status: 404 })
  }

  if (preview.gate === "login" && !userContext) {
    return NextResponse.redirect(
      new URL(`/resources/${encodeURIComponent(slug)}?resume=download`, req.url)
    )
  }

  if (preview.gate === "email" && !userContext?.user.email) {
    // 이메일 게이트는 폼 입력이 필요하므로 자동 재개(resume) 마커 없이 자료 상세로만 보낸다.
    return NextResponse.redirect(
      new URL(`/resources/${encodeURIComponent(slug)}`, req.url)
    )
  }

  const result = await prepareMaterialDownload({
    slug,
    email: userContext?.user.email ?? null,
    anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
    source: "materials_direct",
    userId: userContext?.user.id ?? null,
    leadId: userContext?.profile.lead_id ?? null,
  })

  if (!result) {
    return NextResponse.json({ error: "자료를 찾을 수 없습니다." }, { status: 404 })
  }

  return NextResponse.redirect(new URL(result.destinationUrl, req.url))
}

async function prepareMaterialDownloadPreview(slug: string) {
  const { getLeadMagnetBySlugFromStore } = await import("@/lib/repositories/lead-magnets")
  const magnet = await getLeadMagnetBySlugFromStore(slug)
  if (!magnet || !magnet.published) return null
  return { gate: magnet.gate }
}

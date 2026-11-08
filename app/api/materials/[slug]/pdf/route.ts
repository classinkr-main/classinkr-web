// 공개 자료 PDF — 저장소(lead_magnets)의 현재 내용으로 그때그때 그린다.
// 어드민에서 고친 내용이 CDN 캐시(5분) 뒤 바로 PDF 에 반영된다. 예전 오프라인 생성본(public/)은
// 렌더가 실패했을 때만 쓰는 폴백이다. 자료 게이트(이메일·로그인)는 /api/materials/[slug]/download 가
// 맡고, 이 경로는 예전 정적 PDF 와 같은 공개 범위다.
//
// 응답은 예전 정적 PDF(/materials/*, next.config.ts 의 attachment 헤더)처럼 내려받기다 — 자료 페이지에서
// <a download> 로 그 자리에서 받고, 어카운트 「다시 받기」·메일 링크처럼 주소로 바로 들어와도 뷰어 탭이 열리지 않는다(#81).
// 브라우저 뷰어로 여는 것은 어드민 「저장된 PDF」 보기(?inline=1)뿐이다.
// 따로 만든 PDF(워크북 등, isHandcraftedLeadMagnetPdf)는 서버 생성본으로 바꾸지 않고 정적 파일로 보낸다.
import { access } from "fs/promises"
import path from "path"

import { type NextRequest, NextResponse } from "next/server"

import type { LeadMagnet } from "@/lib/lead-magnets"
import {
  isHandcraftedLeadMagnetPdf,
  isSafeLeadMagnetSlug,
  LEAD_MAGNET_PDF_INLINE_PARAM,
  legacyLeadMagnetPdfPath,
  pdfContentDisposition,
} from "@/lib/lead-magnet-pdf/links"
import { renderLeadMagnetPdf } from "@/lib/lead-magnet-pdf/render"
import { getAllLeadMagnets } from "@/lib/repositories/lead-magnets"
import { SITE_URL } from "@/lib/seo"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
// 실측: 자료 1건 0.1~0.5초(콜드 스타트 포함), 비정상적으로 긴 초안도 1초 안팎.
export const maxDuration = 30

interface RouteContext {
  params: Promise<{ slug: string }>
}

const NO_STORE = { "Cache-Control": "no-store" }

// 렌더 함수 호출 상한(IP 당 1분). 같은 주소는 CDN(5분)이 받으므로 여기 닿는 것은 캐시 미스뿐이다 —
// 질의를 바꿔 캐시를 피하는 반복 요청이 렌더(자료 1건 0.1~0.5초)와 저장소 읽기를 끝없이 부르지 못하게 묶는다.
const RENDER_RATE_LIMIT = { windowMs: 60_000, max: 30 }

function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** public/ 에 예전 생성본이 있으면 그 공개 경로를 돌려준다. */
async function findLegacyStaticPdf(slug: string) {
  if (!isSafeLeadMagnetSlug(slug)) return null
  const publicPath = legacyLeadMagnetPdfPath(slug)
  try {
    // 무시 주석이 없으면 경로가 동적이라 Turbopack 이 public/ 전체(약 400MB)를 함수 번들에 넣어
    // Vercel 함수 용량 상한(250MB)을 넘긴다. 확인할 생성본은 next.config.ts 의 outputFileTracingIncludes 가 넣는다.
    await access(path.join(/* turbopackIgnore: true */ process.cwd(), "public", publicPath))
    return publicPath
  } catch {
    return null
  }
}

async function legacyFallback(req: NextRequest, slug: string, status: 500 | 503) {
  const legacyPath = await findLegacyStaticPdf(slug)
  if (legacyPath) {
    return NextResponse.redirect(new URL(legacyPath, req.url), { status: 302, headers: NO_STORE })
  }
  return NextResponse.json({ error: "자료 PDF를 만들지 못했습니다." }, { status, headers: NO_STORE })
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { allowed } = await checkRateLimitDistributed(getClientIp(req), "material-pdf", RENDER_RATE_LIMIT)
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } }
    )
  }

  const { slug: rawSlug } = await params
  const slug = decodeSlug(rawSlug)

  let magnets: LeadMagnet[]
  try {
    magnets = await getAllLeadMagnets()
  } catch (error) {
    // 저장소 장애 — 예전 공개 정적본이 있으면 그쪽으로(그 파일은 원래 공개 경로다).
    console.error("[materials/pdf] lead magnet store read failed:", error)
    return legacyFallback(req, slug, 503)
  }

  const magnet = magnets.find((item) => item.slug === slug)
  if (!magnet || !magnet.published) {
    return NextResponse.json({ error: "자료를 찾을 수 없습니다." }, { status: 404, headers: NO_STORE })
  }

  // 따로 만든 PDF 는 그 파일 그대로(정적 파일도 attachment). 파일이 없을 때만 아래에서 그린다.
  if (isHandcraftedLeadMagnetPdf(magnet.slug)) {
    const handcraftedPath = await findLegacyStaticPdf(magnet.slug)
    if (handcraftedPath) {
      return NextResponse.redirect(new URL(handcraftedPath, req.url), { status: 302, headers: NO_STORE })
    }
  }

  const disposition = req.nextUrl.searchParams.get(LEAD_MAGNET_PDF_INLINE_PARAM) === "1" ? "inline" : "attachment"

  try {
    const bytes = await renderLeadMagnetPdf(magnet, {
      magnetsBySlug: new Map(magnets.map((item) => [item.slug, item])),
      siteUrl: SITE_URL,
    })
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfContentDisposition(magnet.slug, disposition, magnet.title),
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    console.error(`[materials/pdf] render failed for ${slug}:`, error)
    return legacyFallback(req, slug, 500)
  }
}

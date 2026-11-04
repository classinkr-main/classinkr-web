// 공개 자료 PDF — 저장소(lead_magnets)의 현재 내용으로 그때그때 그린다.
// 어드민에서 고친 내용이 CDN 캐시(5분) 뒤 바로 PDF 에 반영된다. 예전 오프라인 생성본(public/)은
// 렌더가 실패했을 때만 쓰는 폴백이다. 자료 게이트(이메일·로그인)는 /api/materials/[slug]/download 가
// 맡고, 이 경로는 예전 정적 PDF 와 같은 공개 범위다.
import { access } from "fs/promises"
import path from "path"

import { type NextRequest, NextResponse } from "next/server"

import type { LeadMagnet } from "@/lib/lead-magnets"
import {
  isSafeLeadMagnetSlug,
  legacyLeadMagnetPdfPath,
  pdfContentDisposition,
} from "@/lib/lead-magnet-pdf/links"
import { renderLeadMagnetPdf } from "@/lib/lead-magnet-pdf/render"
import { getAllLeadMagnets } from "@/lib/repositories/lead-magnets"
import { SITE_URL } from "@/lib/seo"

export const runtime = "nodejs"
// 실측: 자료 1건 0.1~0.5초(콜드 스타트 포함), 비정상적으로 긴 초안도 1초 안팎.
export const maxDuration = 30

interface RouteContext {
  params: Promise<{ slug: string }>
}

const NO_STORE = { "Cache-Control": "no-store" }

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

  try {
    const bytes = await renderLeadMagnetPdf(magnet, {
      magnetsBySlug: new Map(magnets.map((item) => [item.slug, item])),
      siteUrl: SITE_URL,
    })
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfContentDisposition(magnet.slug),
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    console.error(`[materials/pdf] render failed for ${slug}:`, error)
    return legacyFallback(req, slug, 500)
  }
}

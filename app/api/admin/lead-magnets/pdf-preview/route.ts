// 어드민 「PDF 미리보기」 — 저장하지 않은 편집 초안을 공개 PDF 와 같은 렌더러로 그린다.
// 계약: POST { leadMagnet: <LeadMagnet 모양 객체> } → 200 application/pdf(inline).
// 잘못된 JSON·모양은 400, 본문이 너무 크면 413. 저장소에는 쓰지 않는다.
import { type NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import type { LeadMagnet } from "@/lib/lead-magnets"
import { pdfContentDisposition } from "@/lib/lead-magnet-pdf/links"
import { renderLeadMagnetPdf } from "@/lib/lead-magnet-pdf/render"
import { getAllLeadMagnets, normalizeLeadMagnet } from "@/lib/repositories/lead-magnets"
import { SITE_URL } from "@/lib/seo"

export const runtime = "nodejs"
export const maxDuration = 30

/** 가장 큰 자료 문서가 약 27KB 다 — 10배 가까이 여유를 둔다. */
const MAX_BODY_BYTES = 256 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function tooLarge() {
  return NextResponse.json({ error: "미리보기 본문이 너무 큽니다." }, { status: 413 })
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const contentLength = Number(req.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return tooLarge()

  const raw = await req.text().catch(() => null)
  if (raw === null) return NextResponse.json({ error: "요청 본문을 읽지 못했습니다." }, { status: 400 })
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return tooLarge()

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "JSON 본문이 올바르지 않습니다." }, { status: 400 })
  }
  if (!isRecord(body) || !isRecord(body.leadMagnet)) {
    return NextResponse.json({ error: "leadMagnet 객체가 필요합니다." }, { status: 400 })
  }

  const magnet = normalizeLeadMagnet(body.leadMagnet)

  // 관련 자료 링크용 목록 — 읽기 실패는 미리보기를 막지 않는다(관련 자료 링크만 빠진다).
  let magnets: LeadMagnet[] = []
  try {
    magnets = await getAllLeadMagnets()
  } catch (error) {
    console.warn("[admin/lead-magnets/pdf-preview] lead magnet list read failed:", error)
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
        "Content-Disposition": pdfContentDisposition(magnet.slug, "inline"),
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    console.error("[admin/lead-magnets/pdf-preview] render failed:", error)
    return NextResponse.json({ error: "PDF 미리보기를 만들지 못했습니다." }, { status: 500 })
  }
}

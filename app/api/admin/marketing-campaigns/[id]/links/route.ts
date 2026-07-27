import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { addLink, removeLink } from "@/lib/repositories/marketing-campaigns"
import { sanitizeLinkInput } from "@/lib/marketing/campaign-sanitize"

// sanitizer 를 라우트에서 re-export → 단위테스트가 라우트 파일에서 가져온다.
export { sanitizeLinkInput }

/**
 * POST /api/admin/marketing-campaigns/[id]/links
 * 캠페인에 채널 실행 링크 추가. 본문 { refType, refId } sanitize → 유효하지 않으면 400.
 * addLink 는 (campaign_id, ref_type, ref_id) UNIQUE 로 idempotent(중복은 기존 링크 반환).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const body = await req.json().catch(() => null)
    const input = sanitizeLinkInput(body)
    if (!input) {
      return NextResponse.json(
        { error: "링크 입력이 유효하지 않습니다(refType/refId 확인)." },
        { status: 400 },
      )
    }
    const link = await addLink(id, input.refType, input.refId)
    return NextResponse.json({ link }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/marketing-campaigns/[id]/links
 * 링크 해제. 본문 { linkId }. (경로 [id] 는 라우트 위치 식별용 — 삭제는 linkId 기준.)
 */
export async function DELETE(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json().catch(() => null)
    const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : null
    const linkId = raw && typeof raw.linkId === "string" ? raw.linkId.trim() : ""
    if (!linkId) {
      return NextResponse.json({ error: "linkId 가 필요합니다." }, { status: 400 })
    }
    await removeLink(linkId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

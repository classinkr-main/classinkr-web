import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  listCampaignUpdates,
  createCampaignUpdate,
  deleteCampaignUpdate,
} from "@/lib/repositories/campaign-updates"
import { CAMPAIGN_UPDATE_KINDS, type CampaignUpdateKind } from "@/lib/types/marketing-campaign"

// sanitizer 를 라우트에서 export → 형제 라우트(marketing-campaigns/*)와 동일 관례
// (단위테스트가 라우트 파일에서 sanitizer 를 가져온다).
//
// POST 본문을 검증·정규화한다. 유효하지 않으면 null.
//   kind      — 미지정이면 note(DB 기본값과 동일), 제공됐는데 미허용이면 거부.
//   body      — 트림 후 1~2000자. 빈 문자열/과다 길이는 거부(무의미 로그·폭주 방지).
//   createdBy — 이 라우트 계열은 verifyAdmin 만 써서 세션에서 어드민 표시명을 얻지
//     않는다(형제 라우트에 그런 관례가 없음) — 본문에 실려 오면 트림해 저장, 없으면 null.
export function sanitizeCampaignUpdateInput(
  body: unknown
): { kind: CampaignUpdateKind; body: string; createdBy: string | null } | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>

  let kind: CampaignUpdateKind = "note"
  if (b.kind !== undefined && b.kind !== null) {
    if (typeof b.kind !== "string" || !(CAMPAIGN_UPDATE_KINDS as string[]).includes(b.kind)) {
      return null
    }
    kind = b.kind as CampaignUpdateKind
  }

  const text = typeof b.body === "string" ? b.body.trim() : ""
  if (!text || text.length > 2000) return null

  const createdBy = typeof b.createdBy === "string" && b.createdBy.trim() ? b.createdBy.trim() : null

  return { kind, body: text, createdBy }
}

/**
 * GET /api/admin/marketing-campaigns/[id]/updates
 * 캠페인 1건의 진행상황 로그 최신순 목록.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const updates = await listCampaignUpdates(id)
    return NextResponse.json({ updates })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * POST /api/admin/marketing-campaigns/[id]/updates
 * 진행상황 로그 1건 추가. 본문 { kind?, body, createdBy? } sanitize → 유효하지 않으면 400.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const body = await req.json().catch(() => null)
    const input = sanitizeCampaignUpdateInput(body)
    if (!input) {
      return NextResponse.json(
        { error: "업데이트 입력이 유효하지 않습니다(kind 확인, body 1~2000자)." },
        { status: 400 },
      )
    }
    const update = await createCampaignUpdate({ campaignId: id, ...input })
    return NextResponse.json({ update }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/marketing-campaigns/[id]/updates?updateId=...
 * 로그 1건 삭제. 경로 [id] 의 캠페인 소속을 함께 검증한다(links DELETE 와 동일 패턴).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const updateId = req.nextUrl.searchParams.get("updateId")?.trim() || ""
    if (!updateId) {
      return NextResponse.json({ error: "updateId 가 필요합니다." }, { status: 400 })
    }
    await deleteCampaignUpdate(id, updateId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

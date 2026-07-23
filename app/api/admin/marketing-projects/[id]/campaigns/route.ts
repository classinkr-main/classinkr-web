import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { assignCampaignToProject } from "@/lib/repositories/marketing-projects"

// 본문 { campaignId } 에서 캠페인 id 를 트림해 읽는다(공백·비문자·누락은 빈 문자열).
function readCampaignId(body: unknown): string {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : null
  return raw && typeof raw.campaignId === "string" ? raw.campaignId.trim() : ""
}

/**
 * POST /api/admin/marketing-projects/[id]/campaigns
 * 캠페인을 이 프로젝트에 배정. 본문 { campaignId }.
 * assignCampaignToProject 는 marketing_campaigns.project_id 단일 컬럼만 갱신한다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const body = await req.json().catch(() => null)
    const campaignId = readCampaignId(body)
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId 가 필요합니다." }, { status: 400 })
    }
    await assignCampaignToProject(campaignId, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/marketing-projects/[id]/campaigns
 * 캠페인의 프로젝트 소속 해제(무소속). 본문 { campaignId }.
 * (경로 [id] 는 라우트 위치 식별용 — 해제는 project_id=null 로, campaignId 기준.)
 */
export async function DELETE(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json().catch(() => null)
    const campaignId = readCampaignId(body)
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId 가 필요합니다." }, { status: 400 })
    }
    await assignCampaignToProject(campaignId, null)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

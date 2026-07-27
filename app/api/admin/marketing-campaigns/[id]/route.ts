import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  getCampaign,
  updateCampaign,
  deleteCampaign,
} from "@/lib/repositories/marketing-campaigns"
import { sanitizeCampaignPatch } from "@/lib/marketing/campaign-sanitize"
import { computeCampaignRollup } from "@/lib/marketing/campaign-rollup"
import { gatherRollupSources } from "@/lib/marketing/campaign-rollup-sources"
import { withLinkLabels } from "@/lib/marketing/campaign-labels"

// sanitizer 를 라우트에서 re-export → 단위테스트가 라우트 파일에서 가져온다.
export { sanitizeCampaignPatch }

/**
 * GET /api/admin/marketing-campaigns/[id]
 * 캠페인 1건 + links(라벨 포함) + 읽기시점 롤업. 링크된 실행의 가용 지표만 정직하게 집계한다.
 * 소스 수집(채널당 1회 조회 · 실패 격리 · 정직 규칙)은 lib/marketing/campaign-rollup-sources.ts —
 * 목록 라우트와 같은 구현을 공유한다.
 * (getCampaign 은 오류/부재를 null 로 흡수 → 여기선 404 로 강등, 크래시 없음.)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const campaign = await getCampaign(id)
    if (!campaign) {
      return NextResponse.json({ error: "캠페인을 찾을 수 없습니다." }, { status: 404 })
    }
    const { sources, labels } = await gatherRollupSources(campaign.links)
    const links = withLinkLabels(campaign.links, labels)
    const rollup = computeCampaignRollup(links, sources)
    return NextResponse.json({ campaign: { ...campaign, links }, rollup })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/marketing-campaigns/[id]
 * 부분 수정. sanitize → 유효하지 않으면 400. 변경 필드가 없으면 400(무의미 update 방지).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const body = await req.json().catch(() => null)
    const patch = sanitizeCampaignPatch(body)
    if (!patch) {
      return NextResponse.json(
        { error: "수정 입력이 유효하지 않습니다(status/budget/name 확인)." },
        { status: 400 },
      )
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "변경할 필드가 없습니다." }, { status: 400 })
    }
    const campaign = await updateCampaign(id, patch)
    return NextResponse.json({ campaign })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/marketing-campaigns/[id]
 * 캠페인 삭제(campaign_links 는 FK ON DELETE CASCADE 로 함께 제거).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    await deleteCampaign(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

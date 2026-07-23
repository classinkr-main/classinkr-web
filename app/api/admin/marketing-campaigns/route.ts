import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { listCampaigns, createCampaign } from "@/lib/repositories/marketing-campaigns"
import { sanitizeCampaignInput } from "@/lib/marketing/campaign-sanitize"

// sanitizer 를 라우트에서 re-export → 단위테스트가 라우트 파일에서 가져온다
// (repo 관행: channel-budgets/route.ts, event-metrics/[id]/route.ts 동일).
export { sanitizeCampaignInput }

/**
 * GET /api/admin/marketing-campaigns
 * 캠페인 목록(각 캠페인에 links[] 포함). 롤업은 여기서 계산하지 않는다(리스트는 경량).
 *
 * 그레이스풀 강등: listCampaigns 는 DB 오류 시 throw 한다(마이그레이션 미적용이면
 * relation 부재로 throw). 라우트가 크래시하지 않도록 try/catch 로 500 강등 →
 * UI 레이어가 빈/에러 상태를 렌더한다.
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const campaigns = await listCampaigns()
    return NextResponse.json({ campaigns })
  } catch (err) {
    return NextResponse.json(
      { error: `캠페인 목록을 불러오지 못했습니다: ${String(err)}` },
      { status: 500 },
    )
  }
}

/**
 * POST /api/admin/marketing-campaigns
 * 캠페인 생성. 본문 sanitize → 유효하지 않으면 400.
 */
export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json().catch(() => null)
    const input = sanitizeCampaignInput(body)
    if (!input) {
      return NextResponse.json(
        { error: "캠페인 입력이 유효하지 않습니다(name 필수, status/budget 확인)." },
        { status: 400 },
      )
    }
    const campaign = await createCampaign(input)
    return NextResponse.json({ campaign }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

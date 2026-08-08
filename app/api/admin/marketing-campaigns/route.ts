import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { listCampaigns, createCampaign } from "@/lib/repositories/marketing-campaigns"
import { sanitizeCampaignInput } from "@/lib/marketing/campaign-sanitize"
import { computeCampaignRollup } from "@/lib/marketing/campaign-rollup"
import { gatherRollupSources } from "@/lib/marketing/campaign-rollup-sources"
import { withLinkLabels } from "@/lib/marketing/campaign-labels"

// sanitizer 를 라우트에서 re-export → 단위테스트가 라우트 파일에서 가져온다
// (repo 관행: channel-budgets/route.ts, event-metrics/[id]/route.ts 동일).
export { sanitizeCampaignInput }

/**
 * GET /api/admin/marketing-campaigns
 * 캠페인 목록 — 각 캠페인에 links[](라벨 포함) + 읽기시점 rollup 을 함께 실어 보낸다.
 * 목록 UI 가 성과 한 줄을 보려고 캠페인마다 상세를 호출하지 않도록.
 *
 * N+1 금지: 소스 수집은 "모든 캠페인의 링크를 합쳐" 1회만 한다(채널당 최대 1 쿼리·Meta 최대 1콜).
 * 캠페인 수가 늘어도 쿼리 수는 그대로고, 캠페인별 집계는 수집된 sources 로 메모리에서 계산한다.
 * 롤업/라벨 규칙은 상세 라우트와 같은 구현을 공유한다(lib/marketing/campaign-rollup-sources.ts).
 *
 * ?rollup=0 (또는 rollup=none): 롤업·라벨을 생략하는 경량 모드 — 소스 조회를 아예 건너뛴다
 * (Meta Graph 콜 0회). 캠페인 이름/멤버십만 필요한 호출자(예: 프로젝트 패널의 멤버 해석)가
 * 쓰지도 않을 지표 때문에 라이브 광고 API 를 때리지 않게 하는 옵트아웃이다.
 * 기본(파라미터 없음)은 롤업 포함 — 무시돼도 느려질 뿐 깨지지 않는다.
 *
 * 그레이스풀 강등: listCampaigns 는 DB 오류 시 throw 한다(마이그레이션 미적용이면
 * relation 부재로 throw). 라우트가 크래시하지 않도록 try/catch 로 500 강등 →
 * UI 레이어가 빈/에러 상태를 렌더한다. 채널 소스 실패는 gatherRollupSources 내부에서
 * 채널 단위로 격리되므로 목록 자체를 죽이지 않는다(그 채널만 0/null).
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const rollupParam = req.nextUrl.searchParams.get("rollup")
  const skipRollup = rollupParam === "0" || rollupParam === "none"

  try {
    const campaigns = await listCampaigns()
    // 경량 모드: 저장소 결과 그대로(rollup·label 없음) — 채널 소스 조회 0회.
    if (skipRollup) return NextResponse.json({ campaigns })

    const { sources, labels } = await gatherRollupSources(campaigns.flatMap((c) => c.links))
    const enriched = campaigns.map((campaign) => {
      const links = withLinkLabels(campaign.links, labels)
      return { ...campaign, links, rollup: computeCampaignRollup(links, sources) }
    })
    return NextResponse.json({ campaigns: enriched })
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

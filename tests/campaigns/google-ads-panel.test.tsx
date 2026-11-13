import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import GoogleAdsPanel from "@/components/admin/campaigns/google/GoogleAdsPanel"
import { fromGoogle, summarizeVideo } from "@/lib/marketing/ad-insights"
import { GOOGLE_ADS_CAMPAIGN_PLAN, GOOGLE_ADS_COUPON, planDays, planTotal } from "@/lib/marketing/google-ads-setup"
import type { MarketingPerfResponse, PerfChannelLive, PerfGoogleCampaign } from "@/lib/marketing/perf"

const google = (over: Partial<PerfChannelLive> = {}): PerfChannelLive => ({
  channel: "google",
  spend: null,
  currency: null,
  impressions: 0,
  clicks: 0,
  conversions: null,
  costPerConversion: null,
  campaignCount: 0,
  configured: false,
  dataThrough: null,
  syncedAt: null,
  previousSpend: null,
  deltaPct: null,
  ...over,
})

const perf = (live: PerfChannelLive, googleCampaigns: PerfGoogleCampaign[] = []) =>
  ({
    channelLive: [live],
    googleCampaigns,
    period: { key: "30d", since: "2026-10-05", until: "2026-11-03", prevSince: "", prevUntil: "", prevBasis: "trailing" },
  }) satisfies Pick<MarketingPerfResponse, "channelLive" | "googleCampaigns" | "period">

const render = (props: Parameters<typeof GoogleAdsPanel>[0]) => renderToStaticMarkup(<GoogleAdsPanel {...props} />)

describe("Google Ads 캠페인 계획", () => {
  it("기간은 양 끝 포함 — 11/3~12/31 은 59일", () => {
    expect(planDays({ start: "2026-11-03", end: "2026-12-31" })).toBe(59)
  })

  it("C1~C4 합계는 점검 기록의 ₩1,822,000 이고 쿠폰 조건(₩180만)을 넘는다", () => {
    expect(planTotal()).toBe(1_822_000)
    expect(planTotal()).toBeGreaterThanOrEqual(GOOGLE_ADS_COUPON.spendTarget)
    expect(GOOGLE_ADS_CAMPAIGN_PLAN.map((campaign) => campaign.key)).toEqual(["C1", "C2", "C3", "C4"])
  })
})

describe("GoogleAdsPanel", () => {
  it("계정 3개 · 캠페인 계획 · 전환 추적 · 남은 일을 그린다", () => {
    const html = render({ perf: perf(google()) })
    for (const text of ["395-174-3288", "924-032-2833", "145-679-4327", "C4 검색", "₩1,822,000", "generate_lead", "AW-18551599540", "₩347,777"]) {
      expect(html).toContain(text)
    }
  })

  it("API 상태는 실제 연동 여부를 따른다 — 정적 기록을 라이브로 착각하지 않게", () => {
    expect(render({ perf: null })).toContain("API 상태 확인 중")
    expect(render({ perf: null, perfFailed: true })).toContain("API 상태 확인 실패")
    const off = render({ perf: perf(google()) })
    expect(off).toContain("API 미연동")
    // 미연동일 때만 연동 단계를 남은 일에 띄우고, 실적 표는 그리지 않는다.
    expect(off).toContain("GOOGLE_ADS_CUSTOMER_ID=3951743288")
    expect(off).not.toContain("캠페인 실적")
  })

  it("연동되면 캠페인 실적 표와 합계를 그리고 연동 단계는 숨긴다", () => {
    const campaign: PerfGoogleCampaign = {
      channel: "google",
      campaignId: "111",
      campaignName: "C2 리드 디맨드젠",
      spend: 42_000,
      currency: "KRW",
      impressions: 12_000,
      clicks: 300,
      conversions: 3,
      costPerConversion: 14_000,
      campaignCount: 1,
    }
    const html = render({
      perf: perf(
        google({ configured: true, spend: 42_000, currency: "KRW", impressions: 12_000, clicks: 300, conversions: 3, costPerConversion: 14_000, campaignCount: 1, dataThrough: "2026-11-02" }),
        [campaign]
      ),
    })
    expect(html).toContain("API 수집 중 (~2026-11-02)")
    expect(html).toContain("C2 리드 디맨드젠")
    expect(html).toContain("₩42,000")
    expect(html).toContain("합계 1개")
    expect(html).not.toContain("GOOGLE_ADS_CUSTOMER_ID=3951743288")
  })

  it("연동됐는데 아직 수집 전이면 표 자리에 그 사실을 적는다", () => {
    expect(render({ perf: perf(google({ configured: true })) })).toContain("크론 첫 실행 대기")
  })
})

describe("GoogleAdsPanel — 캠페인 실적 표의 유형 · 조회수 · 조회당 비용(2026-11-10)", () => {
  const campaign = (over: Partial<PerfGoogleCampaign>): PerfGoogleCampaign => ({
    channel: "google",
    campaignId: "g1",
    campaignName: "유튜브 전반성장_1102",
    spend: 29_637.84,
    currency: "KRW",
    impressions: 7_930,
    clicks: 8,
    conversions: 0,
    costPerConversion: null,
    campaignCount: 1,
    channelType: "VIDEO",
    videoViews: 2_613,
    viewsPartial: false,
    costPerView: 11.34,
    ...over,
  })
  const live = google({ configured: true, spend: 115_623.55, currency: "KRW", impressions: 33_827, clicks: 996, conversions: 0, campaignCount: 2 })
  const dg = campaign({ campaignId: "g2", campaignName: "G_DG_[SW]_AI강의분석", spend: 85_985.71, impressions: 25_897, clicks: 988, channelType: "DEMAND_GEN", videoViews: 3_763, costPerView: 22.85 })

  it("유형은 사람 말로, 조회수·조회당 비용(100원 아래 소수 한 자리) 칸을 그린다", () => {
    const html = render({ perf: perf(live, [dg, campaign({})]) })
    for (const text of ["유형", "조회수", "조회당 비용", "유튜브(동영상)", "디맨드젠", "2,613", "₩11.3", "3,763", "₩22.9"]) expect(html).toContain(text)
  })

  it("합계 줄 — 조회수는 잰 캠페인만 더하고, 조회당 비용은 그 캠페인들의 광고비로 나눈다", () => {
    // (85,985.71 + 29,637.84) ÷ (3,763 + 2,613) = ₩18.1 — 검색처럼 조회수가 없는 캠페인 광고비는 섞지 않는다.
    const search = campaign({ campaignId: "g4", campaignName: "검색", channelType: "SEARCH", spend: 7_000, videoViews: null, costPerView: null })
    const html = render({ perf: perf(live, [dg, campaign({}), search]) })
    expect(html).toContain("6,376")
    expect(html).toContain("₩18.1")
  })

  it("실제 검색 캠페인 행(API 조회수 0)도 합계 조회당 비용에 광고비를 섞지 않는다 — summarizeVideo 를 거친 모양", () => {
    // 위 테스트는 검색 줄을 videoViews: null 로 손으로 만든다. 운영 행은 0 이라 summarizeVideo 가 null 로 바꿔야 한다.
    const searchRows = fromGoogle([
      { date: "2026-11-09", campaignId: "g4", campaignName: "C4 검색", spend: 7_000, impressions: 900, clicks: 40, conversions: 0, currency: "KRW", channelType: "SEARCH", videoViews: 0 },
    ])
    const search = campaign({ campaignId: "g4", campaignName: "C4 검색", spend: 7_000, ...summarizeVideo(searchRows) })
    const html = render({ perf: perf(live, [dg, campaign({}), search]) })
    expect(html).toContain("6,376")
    expect(html).toContain("₩18.1")
  })

  it("조회수가 빈 날이 섞인 캠페인은 「이상」, 합계 조회당 비용은 비운다", () => {
    const html = render({ perf: perf(live, [campaign({ viewsPartial: true, costPerView: null })]) })
    expect(html).toContain("2,613 이상")
    expect(html).not.toContain("₩11.3")
  })

  it("배포 직후 옛 캐시(유형·조회수 칸 없음)도 깨지지 않고 —로 그린다", () => {
    const old = campaign({ channelType: undefined, videoViews: undefined, viewsPartial: undefined, costPerView: undefined })
    const html = render({ perf: perf(live, [old]) })
    expect(html).toContain("유튜브 전반성장_1102")
    expect(html).not.toContain("유튜브(동영상)")
  })
})

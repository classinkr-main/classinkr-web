import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import GoogleAdsPanel from "@/components/admin/campaigns/google/GoogleAdsPanel"
import { GOOGLE_ADS_CAMPAIGN_PLAN, GOOGLE_ADS_COUPON, planDays, planTotal } from "@/lib/marketing/google-ads-setup"
import type { PerfChannelLive } from "@/lib/marketing/perf"

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
    const html = renderToStaticMarkup(<GoogleAdsPanel channelLive={[google()]} />)
    for (const text of ["395-174-3288", "924-032-2833", "145-679-4327", "C4 검색", "₩1,822,000", "generate_lead", "AW-18551599540", "₩347,777"]) {
      expect(html).toContain(text)
    }
  })

  it("API 상태는 실제 연동 여부를 따른다 — 정적 기록을 라이브로 착각하지 않게", () => {
    expect(renderToStaticMarkup(<GoogleAdsPanel channelLive={null} />)).toContain("API 상태 확인 중")
    expect(renderToStaticMarkup(<GoogleAdsPanel channelLive={null} perfFailed />)).toContain("API 상태 확인 실패")
    expect(renderToStaticMarkup(<GoogleAdsPanel channelLive={[google()]} />)).toContain("API 미연동")
    expect(
      renderToStaticMarkup(<GoogleAdsPanel channelLive={[google({ configured: true, spend: 1000, dataThrough: "2026-11-02" })]} />)
    ).toContain("API 수집 중 (~2026-11-02)")
  })
})

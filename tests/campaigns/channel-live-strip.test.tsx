import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ChannelLiveStrip } from "@/components/admin/campaigns/perf/ChannelLiveStrip"
import type { PerfChannelLive } from "@/lib/marketing/perf"

/**
 * 채널 스트립의 **정직 표기**를 화면 문자열로 잠근다. 순수함수 테스트만으로는
 * "null 이 0 으로 그려지는" 종류의 회귀를 못 잡는다 — 그건 렌더 단계에서 생긴다.
 */

const entry = (over: Partial<PerfChannelLive> = {}): PerfChannelLive => ({
  channel: "meta",
  spend: 1240.5,
  currency: "USD",
  impressions: 100_000,
  clicks: 2_000,
  conversions: 62,
  costPerConversion: 20,
  campaignCount: 3,
  configured: true,
  dataThrough: "2026-09-13",
  syncedAt: "2026-09-14T11:50:00.000Z",
  previousSpend: 1100,
  deltaPct: 12,
  ...over,
})

const render = (channels: PerfChannelLive[], manualChannelCount = 4) =>
  renderToStaticMarkup(
    <ChannelLiveStrip channels={channels} manualChannelCount={manualChannelCount} />
  )

describe("ChannelLiveStrip", () => {
  it("통화 기호를 항상 붙인다 — USD 와 KRW 가 한 줄에 서도 헷갈리지 않게", () => {
    const html = render([
      entry(),
      entry({ channel: "naver", spend: 920_000, currency: "KRW", costPerConversion: null, conversions: null }),
    ])
    expect(html).toContain("$1,240.50")
    expect(html).toContain("₩920,000")
  })

  it("통화가 섞이면 합계를 만들지 않고 그 이유를 말한다", () => {
    const html = render([
      entry(),
      entry({ channel: "naver", spend: 920_000, currency: "KRW" }),
    ])
    expect(html).toContain("통화가 달라 합계를 내지 않는다")
    expect(html).not.toContain("합계 $")
  })

  it("전 채널이 같은 통화면 합계를 낸다", () => {
    const html = render([entry(), entry({ channel: "google", spend: 59.5 })])
    expect(html).toContain("합계 $1,300.00")
  })

  it("미측정(spend=null)은 0 이 아니라 — 로 그린다", () => {
    const html = render([entry({ spend: null, currency: null, conversions: null })])
    expect(html).toContain("—")
    expect(html).not.toContain("$0.00")
  })

  it("미연동 채널은 '미연동' 이라고 말한다 — 수집 실패와 다르다", () => {
    expect(render([entry({ configured: false, spend: null, currency: null })])).toContain("미연동")
    expect(render([entry({ configured: true, spend: null, currency: null })])).toContain("수집 대기")
  })

  it("전기 비교가 불가능하면 0% 로 지어내지 않는다", () => {
    expect(render([entry({ deltaPct: null })])).toContain("전기 비교 없음")
    expect(render([entry({ deltaPct: 12 })])).toContain("12% 전기 대비")
    expect(render([entry({ deltaPct: -4 })])).toContain("4% 전기 대비")
  })

  it("전환 미측정은 '전환 —'", () => {
    const html = render([entry({ conversions: null, costPerConversion: null })])
    expect(html).toContain("전환 —")
  })

  it("연동/수기 채널 수를 헤더에 사실대로 적는다", () => {
    const html = render([entry(), entry({ channel: "google", configured: false })], 4)
    expect(html).toContain("연동 1")
    expect(html).toContain("수기 4")
  })

  it("채널 식별색은 점에만 쓴다 — 숫자·배경에 브랜드색이 새지 않게", () => {
    const html = render([entry({ channel: "naver", currency: "KRW", spend: 1000 })])
    // 네이버 그린이 rounded-full 점 스타일에만 등장해야 한다.
    const occurrences = html.split("#03C75A").length - 1
    expect(occurrences).toBe(1)
    expect(html).toContain("rounded-full")
  })
})

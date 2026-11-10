import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))

import { AdChannelCards } from "@/components/admin/campaigns/ads/AdChannelCards"
import { buildAdBoard } from "@/lib/marketing/ad-board"
import { fromGoogle } from "@/lib/marketing/ad-insights"
import type { AdCampaignRecord } from "@/lib/marketing/google-ads-setup"

/**
 * 광고 탭 Google 카드의 참고 줄 — 유튜브(동영상)·디맨드젠은 클릭보다 조회가 성과라 조회수·조회당 비용을 앞에 둔다(2026-11-10).
 * 예전 줄은 「클릭 8 · 전환 0」뿐이라 조회 2,613회 · 조회당 ₩11.3 인 유튜브 캠페인이 실패한 것처럼 읽혔다.
 */
const plan: AdCampaignRecord[] = [
  { account: "395", key: "C1", name: "유튜브 전반성장_1102", type: "동영상", campaignId: "g1", status: "running", start: "2026-11-03", end: "2026-12-31", dailyBudget: 8000, note: null },
  { account: "395", key: "C4", name: "검색", type: "검색", campaignId: "g4", status: "running", start: "2026-11-03", end: "2026-12-31", dailyBudget: 7000, note: null },
]
const row = (over: Record<string, unknown>) => ({ date: "2026-11-08", campaignId: "g1", campaignName: "유튜브 전반성장_1102", spend: 29_637.84, impressions: 7_930, clicks: 8, conversions: 0, currency: "KRW", channelType: "VIDEO", videoViews: 2_613, ...over })

function render(rows: Record<string, unknown>[]) {
  const board = buildAdBoard({ since: "2026-11-03", until: "2026-11-09", meta: [], google: fromGoogle(rows as never), plan, leads: [] })
  return renderToStaticMarkup(<AdChannelCards board={board} channelLive={[]} links={{ google: "#g", metaCreatives: "#c", metaTable: "#m" }} />)
}

describe("AdChannelCards — Google 참고 줄의 조회수", () => {
  it("유튜브 줄은 조회 · 조회당(100원 아래 소수 한 자리) · 클릭 · 전환", () => {
    expect(render([row({})])).toContain("참고 · 조회 2,613 · 조회당 ₩11.3 · 클릭 8 · 전환 0")
  })

  it("조회수가 빈 날이 섞이면 「이상」을 붙이고 조회당 비용은 뺀다", () => {
    const html = render([row({ date: "2026-11-03", videoViews: null, channelType: null, spend: 4_766.84 }), row({})])
    expect(html).toContain("참고 · 조회 2,613 이상 · 클릭 16 · 전환 0")
    expect(html).not.toMatch(/조회당 ₩/)
  })

  it("조회가 없는 검색 줄은 예전 그대로 클릭 · 전환만", () => {
    expect(render([row({ campaignId: "g4", campaignName: "검색", channelType: "SEARCH", videoViews: 0, clicks: 40 })])).toContain("참고 · 클릭 40 · 전환 0")
  })
})

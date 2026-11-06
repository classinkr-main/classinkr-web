/**
 * Overview "지금" 띠 — 방문·문의를 첫 화면 맨 위에서(기획 2026-11-04 §3.1).
 * 정직 규칙: 실패를 0으로 바꾸지 않는다 · 원천 하나가 빠지면 미집계를 밝히고 어제 비교를 하지 않는다 ·
 * 응대 전·24h+ 칸은 리드 보드의 같은 필터로 착지한다.
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))

import { OverviewNowBand, type OverviewNowBandProps } from "@/components/admin/overview/OverviewNowBand"
import type { IntakeFeedResult } from "@/lib/marketing/intake-feed"

function intake(over: Partial<IntakeFeedResult> = {}): IntakeFeedResult {
  return {
    todayCount: 7,
    todayReinflowCount: 1,
    todayBySource: { homepage: 3, ad: 3, intake: 1, resources: 0, other: 0 },
    yesterdayCount: 5,
    delta: 2,
    overlapCount: 1,
    items: [
      {
        key: "a:lead-1",
        at: "2026-11-04T05:21:00.000Z",
        name: "김원장",
        org: "행복수학학원",
        region: null,
        adName: null,
        origins: ["admin"],
        compassLeadId: null,
        adminLeadId: "lead-1",
        sourceKind: "homepage",
        reinflow: false,
      },
      {
        key: "c:91",
        at: "2026-11-04T04:58:00.000Z",
        name: "이원장",
        org: null,
        region: null,
        adName: "겨울특강 리드폼",
        origins: ["compass"],
        compassLeadId: 91,
        adminLeadId: null,
        sourceKind: "ad",
        reinflow: true,
      },
    ],
    adminMeasured: true,
    compassMeasured: true,
    compassTruncated: false,
    windows: {
      todayKst: "2026-11-04",
      yesterdayKst: "2026-11-03",
      todayStartIso: "2026-11-03T15:00:00.000Z",
      nowIso: "2026-11-04T05:32:00.000Z",
      yesterdayStartIso: "2026-11-02T15:00:00.000Z",
      yesterdaySameTimeIso: "2026-11-03T05:32:00.000Z",
    },
    ...over,
  }
}

function render(over: Partial<OverviewNowBandProps> = {}) {
  const props: OverviewNowBandProps = {
    visitorState: "ready",
    visitorToday: { visitors: 312, homeVisitors: 186 },
    onVisitorRetry: () => undefined,
    leadState: "ready",
    companyMetrics: { unrespondedCount: 4, unresponded24hCount: 1, unrespondedUnconfirmedCount: 3 },
    onLeadRetry: () => undefined,
    intake: { data: intake(), error: false, retry: () => undefined },
    ...over,
  }
  return renderToStaticMarkup(createElement(OverviewNowBand, props))
}

describe("Overview 지금 띠", () => {
  it("네 칸과 오늘 문의 피드를 전사 기준으로 그린다", () => {
    const html = render()
    expect(html).toContain("전사 기준")
    expect(html).toContain("312")
    expect(html).toContain("홈 방문 186명")
    expect(html).toContain("홈페이지 3 · 광고 3 · 쇼룸·도입 신청 1")
    expect(html).toContain("어제 이 시각 5건")
    expect(html).toContain("그중 아직 아무도 안 본 문의 3건")
    expect(html).toContain("김원장")
    expect(html).toContain("재유입")
  })

  it("칸은 리드 보드의 같은 필터로 착지하고, 피드는 어드민 리드·Compass 리드로 나눠 연결한다", () => {
    const html = render()
    expect(html).toContain('href="/admin/crm/customers/leads?filter=unresponded"')
    expect(html).toContain('href="/admin/crm/customers/leads?filter=unresponded_24h&amp;focus=risk"')
    expect(html).toContain('href="/admin/traffic"')
    expect(html).toContain('href="/admin/crm/customers/leads?lead=lead-1"')
    expect(html).toContain("Compass →")
  })

  it("조회 실패를 0으로 바꾸지 않는다 — 그 칸만 확인 필요", () => {
    const html = render({ visitorState: "error", visitorToday: null, leadState: "error", companyMetrics: null })
    expect(html).toContain("방문 집계를 불러오지 못했습니다")
    expect(html).toContain("리드 집계를 불러오지 못했습니다")
    expect(html.match(/확인 필요/g)?.length).toBeGreaterThanOrEqual(3)
    // 오늘 문의 칸은 정상 원천이라 그대로 보인다
    expect(html).toContain("어제 이 시각 5건")
  })

  it("Compass 가 끊기면 미집계를 밝히고 어제와 비교하지 않는다", () => {
    const html = render({
      intake: { data: intake({ compassMeasured: false, todayCount: 4, delta: -1 }), error: false, retry: () => undefined },
    })
    expect(html).toContain("미집계 · Compass 연결 끊김")
    expect(html).toContain("최소 ")
    expect(html).not.toContain("어제 이 시각")
  })

  it("옛 응답(소스 분해 없음)에도 깨지지 않는다", () => {
    const old = intake()
    delete (old as Partial<IntakeFeedResult>).todayBySource
    const html = render({ intake: { data: old, error: false, retry: () => undefined } })
    expect(html).toContain("오늘 문의")
    expect(html).not.toContain("홈페이지 3 · 광고 3")
  })
})

/**
 * Overview "오늘 들어온 문의"(시안 B, 2026-11-27) — 직접 문의 칸과 광고·자료 칸을 나눠 그린다.
 * 광고가 최근 피드를 다 채워도 홈페이지 문의가 위 칸에 남는지, 원천 실패를 0건으로 그리지 않는지 본다.
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { OverviewTodayInquiries } from "@/components/admin/overview/OverviewTodayInquiries"
import type { LiveIntakeState } from "@/components/admin/overview/useLiveIntake"
import type { IntakeFeedItem, IntakeFeedResult } from "@/lib/marketing/intake-feed"

const item = (key: string, overrides: Partial<IntakeFeedItem> = {}): IntakeFeedItem => ({
  key,
  at: "2026-11-27T05:21:00.000Z",
  name: "박지후",
  org: "새벽영어학원",
  region: "경기",
  adName: null,
  origins: ["admin"],
  compassLeadId: null,
  adminLeadId: `lead-${key}`,
  sourceKind: "homepage",
  formLabel: "문의",
  response: "awaiting",
  reinflow: false,
  ...overrides,
})

const ad = (key: string, overrides: Partial<IntakeFeedItem> = {}) =>
  item(key, { name: `광고${key}`, org: "학원", sourceKind: "ad", formLabel: null, adName: "설명회 포스터", origins: ["compass"], adminLeadId: null, compassLeadId: Number(key), response: "contacted", ...overrides })

function result(overrides: Partial<IntakeFeedResult> = {}): IntakeFeedResult {
  return {
    todayCount: 4,
    todayReinflowCount: 0,
    todayBySource: { homepage: 1, ad: 3, intake: 0, resources: 0, other: 0 },
    yesterdayCount: 2,
    delta: 2,
    overlapCount: 0,
    items: [ad("1"), ad("2"), ad("3")],
    directItems: [item("h1")],
    leadItems: [ad("1"), ad("2"), ad("3")],
    adminMeasured: true,
    compassMeasured: true,
    compassTruncated: false,
    windows: {
      todayKst: "2026-11-27",
      yesterdayKst: "2026-11-26",
      todayStartIso: "2026-11-26T15:00:00.000Z",
      nowIso: "2026-11-27T05:32:00.000Z",
      yesterdayStartIso: "2026-11-25T15:00:00.000Z",
      yesterdaySameTimeIso: "2026-11-26T05:32:00.000Z",
    },
    ...overrides,
  }
}

function render(data: IntakeFeedResult | null, error = false) {
  const intake: LiveIntakeState = { data, error, retry: () => undefined }
  return renderToStaticMarkup(createElement(OverviewTodayInquiries, { intake }))
}

describe("Overview 오늘 들어온 문의 — 직접 문의 먼저", () => {
  it("최근 피드가 광고로 차 있어도 홈페이지 문의를 직접 문의 칸에 카드로 보이고, 응대 전이면 응대 시작 버튼을 단다", () => {
    const html = render(result())
    expect(html).toContain("직접 문의")
    expect(html).toContain("박지후")
    expect(html).toContain("응대 전")
    expect(html).toContain("응대 시작")
    expect(html).toContain("/admin/crm/customers/leads?lead=lead-h1")
    expect(html).toContain("광고 · 자료 리드")
    expect(html).toContain("광고1")
  })

  it("직접 문의가 0건이면 칸을 지우지 않고 '아직 없습니다'를 밝힌다", () => {
    const html = render(result({ directItems: [], todayBySource: { homepage: 0, ad: 3, intake: 0, resources: 0, other: 0 }, todayCount: 3 }))
    expect(html).toContain("오늘 들어온 홈페이지·쇼룸·도입 문의가 아직 없습니다.")
  })

  it("어드민 리드 조회가 실패하면 직접 문의 칸을 0건이 아니라 확인 필요로 둔다", () => {
    const html = render(result({ adminMeasured: false, directItems: [] }))
    expect(html).toContain("확인 필요")
    expect(html).not.toContain("오늘 들어온 홈페이지·쇼룸·도입 문의가 아직 없습니다.")
  })

  it("옛 응답(directItems 없음)이면 최근 피드에서 직접 문의를 나눠 보인다", () => {
    const html = render(result({ directItems: undefined, leadItems: undefined, items: [item("h9", { name: "옛응답" }), ad("1")] }))
    expect(html).toContain("옛응답")
  })

  it("응답이 없고 실패했으면 0건 대신 확인 필요와 다시 시도를 그린다", () => {
    const html = render(null, true)
    expect(html).toContain("확인 필요")
    expect(html).toContain("다시 시도")
  })
})

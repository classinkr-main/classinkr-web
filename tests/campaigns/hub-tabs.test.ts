import { describe, expect, it } from "vitest"
import {
  CAMPAIGN_TABS,
  DATA_SECTIONS,
  DETAIL_SECTIONS,
  campaignHubHref,
  isHubSection,
  resolveCampaignTab,
} from "@/lib/marketing/hub-tabs"

describe("resolveCampaignTab", () => {
  it("새 탭 id 는 그대로 — 앵커 없음, legacy=false", () => {
    for (const tab of ["summary", "detail", "data", "email"] as const) {
      expect(resolveCampaignTab(tab)).toEqual({ tab, anchor: null, legacy: false })
    }
  })

  it("옛 탭 id 는 새 층의 섹션으로 착지한다(삭제하지 않고 접는다)", () => {
    expect(resolveCampaignTab("leads")).toEqual({ tab: "data", anchor: "new-leads", legacy: true })
    expect(resolveCampaignTab("events")).toEqual({ tab: "detail", anchor: "events", legacy: true })
    expect(resolveCampaignTab("meta")).toEqual({ tab: "detail", anchor: "campaigns", legacy: true })
  })

  it("모르는 값·빈 값은 한눈에(기본)로 — 옛 요약 탭과 같은 자리", () => {
    expect(resolveCampaignTab(undefined).tab).toBe("summary")
    expect(resolveCampaignTab(null).tab).toBe("summary")
    expect(resolveCampaignTab("").tab).toBe("summary")
    expect(resolveCampaignTab("nope").tab).toBe("summary")
  })

  it("레거시 앵커는 실제 섹션 목록에 존재한다(매핑 오타 회귀 방지)", () => {
    for (const raw of ["leads", "events", "meta"]) {
      const resolved = resolveCampaignTab(raw)
      expect(isHubSection(resolved.tab, resolved.anchor)).toBe(true)
    }
  })
})

describe("isHubSection", () => {
  it("층에 맞는 섹션만 참 — 임의 해시로 스크롤하지 않는다", () => {
    expect(isHubSection("detail", "campaigns")).toBe(true)
    expect(isHubSection("data", "campaigns")).toBe(false)
    expect(isHubSection("summary", "campaigns")).toBe(false)
    expect(isHubSection("data", null)).toBe(false)
  })
  it("섹션 id 는 층 안에서 유일하다", () => {
    for (const sections of [DETAIL_SECTIONS, DATA_SECTIONS]) {
      const ids = sections.map((section) => section.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe("campaignHubHref", () => {
  it("기본값(한눈에·30일)은 쿼리를 싣지 않는다", () => {
    expect(campaignHubHref({})).toBe("/admin/campaigns")
    expect(campaignHubHref({ tab: "summary", perf: "30d" })).toBe("/admin/campaigns")
  })
  it("탭·기간·섹션을 한 규칙으로 조립한다 — 해시는 쿼리 뒤", () => {
    expect(campaignHubHref({ tab: "data", section: "budgets" })).toBe("/admin/campaigns?tab=data#budgets")
    expect(campaignHubHref({ tab: "detail", section: "campaigns", perf: "7d" })).toBe(
      "/admin/campaigns?tab=detail&perf=7d#campaigns"
    )
  })
})

describe("CAMPAIGN_TABS", () => {
  it("정보 층은 1·2·3 순서이고 메시지(도구)는 층 번호가 없다", () => {
    expect(CAMPAIGN_TABS.map((tab) => tab.tier)).toEqual([1, 2, 3, null])
    expect(CAMPAIGN_TABS.map((tab) => tab.id)).toEqual(["summary", "detail", "data", "email"])
  })
})

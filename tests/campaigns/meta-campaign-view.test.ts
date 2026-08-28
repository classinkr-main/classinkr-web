import { describe, expect, it } from "vitest"
import {
  isRunningMetaCampaign,
  metaRunState,
  splitMetaCampaignsByRun,
} from "@/lib/marketing/meta-campaign-view"
import type { MetaCampaignRow } from "@/lib/meta/marketing"

function campaign(
  id: string,
  status: string,
  insights: Partial<MetaCampaignRow["insights"]> = {},
  effectiveStatus?: string
): MetaCampaignRow {
  return {
    id,
    name: `캠페인 ${id}`,
    status,
    effectiveStatus,
    lifetimeBudget: null,
    dailyBudget: null,
    insights: {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      ctr: null,
      cpc: null,
      cpm: null,
      leads: 0,
      ...insights,
    },
  } as MetaCampaignRow
}

describe("splitMetaCampaignsByRun — 돌고 있는 광고와 멈춘 광고", () => {
  it("ACTIVE 만 집행 중으로 본다", () => {
    const { running, stopped } = splitMetaCampaignsByRun([
      campaign("a", "ACTIVE"),
      campaign("b", "PAUSED"),
      campaign("c", "ARCHIVED"),
      campaign("d", "DELETED"),
    ])
    expect(running.map((c) => c.id)).toEqual(["a"])
    expect(stopped.map((c) => c.id)).toEqual(["b", "c", "d"])
  })

  it("effectiveStatus 가 있으면 그게 정본이다 — status 만 ACTIVE 인 캠페인에 속지 않는다", () => {
    expect(metaRunState(campaign("a", "ACTIVE", {}, "CAMPAIGN_PAUSED"))).toBe("CAMPAIGN_PAUSED")
    expect(isRunningMetaCampaign(campaign("a", "ACTIVE", {}, "CAMPAIGN_PAUSED"))).toBe(false)
    expect(isRunningMetaCampaign(campaign("b", "PAUSED", {}, "ACTIVE"))).toBe(true)
  })

  it("소문자·공백 상태도 같게 판정한다", () => {
    expect(isRunningMetaCampaign(campaign("a", "active"))).toBe(true)
  })

  it("멈춘 캠페인의 기간 광고비·리드를 합산한다 — 접힘 안내가 이 값에 걸린다", () => {
    const { stoppedTotals } = splitMetaCampaignsByRun([
      campaign("a", "ACTIVE", { spend: 500, leads: 100 }),
      campaign("b", "PAUSED", { spend: 300.5, leads: 20 }),
      campaign("c", "PAUSED", { spend: 205.88, leads: 7 }),
      campaign("d", "PAUSED", { spend: 0, leads: 0 }),
    ])
    expect(stoppedTotals.count).toBe(3)
    expect(stoppedTotals.spend).toBeCloseTo(506.38, 2)
    expect(stoppedTotals.leads).toBe(27)
    // 광고비가 실제로 있는 건만 센다 — "3개 중 2개가 돈을 썼다"를 말할 수 있어야 한다.
    expect(stoppedTotals.withSpend).toBe(2)
  })

  it("전부 멈췄으면 allStopped — 빈 표 대신 전체를 편다", () => {
    const all = splitMetaCampaignsByRun([campaign("a", "PAUSED"), campaign("b", "ARCHIVED")])
    expect(all.allStopped).toBe(true)
    expect(all.running).toHaveLength(0)
  })

  it("집행 중이 하나라도 있으면 allStopped 가 아니다", () => {
    expect(splitMetaCampaignsByRun([campaign("a", "ACTIVE"), campaign("b", "PAUSED")]).allStopped).toBe(false)
  })

  it("빈 목록은 allStopped 가 아니다 — 접을 것도 펼 것도 없다", () => {
    const empty = splitMetaCampaignsByRun([])
    expect(empty.allStopped).toBe(false)
    expect(empty.stoppedTotals).toEqual({ count: 0, spend: 0, leads: 0, withSpend: 0 })
  })

  it("입력 순서를 뒤집지 않는다 — 서버가 준 광고비순 정렬을 덮어쓰지 않는다", () => {
    const { stopped } = splitMetaCampaignsByRun([
      campaign("high", "PAUSED", { spend: 900 }),
      campaign("low", "PAUSED", { spend: 10 }),
    ])
    expect(stopped.map((c) => c.id)).toEqual(["high", "low"])
  })

  it("insights 가 깨져 있어도 합계를 NaN 으로 오염시키지 않는다", () => {
    const broken = { ...campaign("x", "PAUSED"), insights: undefined } as unknown as MetaCampaignRow
    const { stoppedTotals } = splitMetaCampaignsByRun([broken, campaign("y", "PAUSED", { spend: 5, leads: 1 })])
    expect(stoppedTotals.spend).toBe(5)
    expect(stoppedTotals.leads).toBe(1)
  })
})

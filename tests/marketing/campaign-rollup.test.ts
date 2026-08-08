import { describe, it, expect } from "vitest"
import {
  computeCampaignRollup,
  type CampaignRollupSources,
} from "@/lib/marketing/campaign-rollup"
import type { CampaignLink, CampaignRefType } from "@/lib/types/marketing-campaign"

// 링크 팩토리 — id/campaignId/createdAt 는 롤업 계산에 무관하므로 고정.
function link(refType: CampaignRefType, refId: string): CampaignLink {
  return {
    id: `link-${refType}-${refId}`,
    campaignId: "camp-1",
    refType,
    refId,
    createdAt: "2026-07-24",
  }
}

function emptySources(): CampaignRollupSources {
  return { emailCampaigns: {}, smsCampaigns: {}, eventMetrics: {}, metaCampaigns: {} }
}

describe("computeCampaignRollup (크로스채널 캠페인 롤업 순수함수)", () => {
  it("빈 링크 → 전부 0, eventRevenue·metaSpend·metaCurrency 는 null", () => {
    const rollup = computeCampaignRollup([], emptySources())
    expect(rollup).toEqual({
      emailRecipients: 0,
      emailOpens: 0,
      smsRecipients: 0,
      eventLeads: 0,
      eventDeals: 0,
      eventRevenue: null,
      metaSpend: null,
      metaCurrency: null,
      metaLeads: 0,
      linkedCounts: { email: 0, sms: 0, event: 0, meta: 0 },
    })
  })

  it("이메일 링크 2건 → recipient·open 합산, linkedCounts.email=2", () => {
    const links = [link("email_campaign", "e1"), link("email_campaign", "e2")]
    const sources = emptySources()
    sources.emailCampaigns = {
      e1: { recipientCount: 100, openCount: 40 },
      e2: { recipientCount: 250, openCount: 90 },
    }
    const rollup = computeCampaignRollup(links, sources)
    expect(rollup.emailRecipients).toBe(350)
    expect(rollup.emailOpens).toBe(130)
    expect(rollup.linkedCounts.email).toBe(2)
  })

  it("문자 링크 → recipient 합산, linkedCounts.sms", () => {
    const links = [link("sms_campaign", "s1"), link("sms_campaign", "s2")]
    const sources = emptySources()
    sources.smsCampaigns = {
      s1: { recipientCount: 500 },
      s2: { recipientCount: 320 },
    }
    const rollup = computeCampaignRollup(links, sources)
    expect(rollup.smsRecipients).toBe(820)
    expect(rollup.linkedCounts.sms).toBe(2)
  })

  it("행사 링크: 매출 입력 있음+없음 혼재 → non-null 만 합산, leads·deals 합산", () => {
    const links = [link("event", "ev1"), link("event", "ev2")]
    const sources = emptySources()
    sources.eventMetrics = {
      ev1: { leads: 12, dealsCount: 3, dealsRevenue: 1_000_000 },
      ev2: { leads: 8, dealsCount: 2, dealsRevenue: null },
    }
    const rollup = computeCampaignRollup(links, sources)
    expect(rollup.eventLeads).toBe(20)
    expect(rollup.eventDeals).toBe(5)
    expect(rollup.eventRevenue).toBe(1_000_000)
    expect(rollup.linkedCounts.event).toBe(2)
  })

  it("행사 링크 전부 매출 미입력 → eventRevenue=null (0 아님)", () => {
    const links = [link("event", "ev1"), link("event", "ev2")]
    const sources = emptySources()
    sources.eventMetrics = {
      ev1: { leads: 5, dealsCount: 1, dealsRevenue: null },
      ev2: { leads: 3, dealsCount: null, dealsRevenue: null },
    }
    const rollup = computeCampaignRollup(links, sources)
    expect(rollup.eventRevenue).toBeNull()
    expect(rollup.eventLeads).toBe(8)
    expect(rollup.eventDeals).toBe(1) // dealsCount null → 0 기여
  })

  it("Meta 링크 동일 통화(USD) → spend 합산·currency=USD·leads 합산 (KRW 로 접지 않음)", () => {
    const links = [link("meta_campaign", "m1"), link("meta_campaign", "m2")]
    const sources = emptySources()
    sources.metaCampaigns = {
      m1: { spend: 120.5, leads: 30, currency: "USD" },
      m2: { spend: 80.25, leads: 20, currency: "USD" },
    }
    const rollup = computeCampaignRollup(links, sources)
    expect(rollup.metaSpend).toBeCloseTo(200.75)
    expect(rollup.metaCurrency).toBe("USD")
    expect(rollup.metaLeads).toBe(50)
    expect(rollup.linkedCounts.meta).toBe(2)
  })

  it("Meta 링크 혼합 통화(USD+KRW) → spend·currency=null 이지만 leads 는 합산", () => {
    const links = [link("meta_campaign", "m1"), link("meta_campaign", "m2")]
    const sources = emptySources()
    sources.metaCampaigns = {
      m1: { spend: 120, leads: 30, currency: "USD" },
      m2: { spend: 500_000, leads: 45, currency: "KRW" },
    }
    const rollup = computeCampaignRollup(links, sources)
    expect(rollup.metaSpend).toBeNull()
    expect(rollup.metaCurrency).toBeNull()
    expect(rollup.metaLeads).toBe(75)
  })

  it("Meta 링크 일부만 sources 에 존재 → 있는 것만 합산, 단일 통화 유지", () => {
    const links = [link("meta_campaign", "m1"), link("meta_campaign", "m-missing")]
    const sources = emptySources()
    sources.metaCampaigns = {
      m1: { spend: 90, leads: 12, currency: "USD" },
    }
    const rollup = computeCampaignRollup(links, sources)
    expect(rollup.metaSpend).toBe(90)
    expect(rollup.metaCurrency).toBe("USD")
    expect(rollup.metaLeads).toBe(12)
    expect(rollup.linkedCounts.meta).toBe(2) // 링크는 2건, 지표는 해석된 1건만
  })

  it("sources 에 없는 ref_id → 0 기여·throw 없음, 링크 카운트는 유지", () => {
    const links = [
      link("email_campaign", "missing-email"),
      link("sms_campaign", "missing-sms"),
      link("event", "missing-event"),
      link("meta_campaign", "missing-meta"),
    ]
    expect(() => computeCampaignRollup(links, emptySources())).not.toThrow()
    const rollup = computeCampaignRollup(links, emptySources())
    expect(rollup.emailRecipients).toBe(0)
    expect(rollup.emailOpens).toBe(0)
    expect(rollup.smsRecipients).toBe(0)
    expect(rollup.eventLeads).toBe(0)
    expect(rollup.eventDeals).toBe(0)
    expect(rollup.eventRevenue).toBeNull()
    expect(rollup.metaSpend).toBeNull()
    expect(rollup.metaCurrency).toBeNull()
    expect(rollup.metaLeads).toBe(0)
    expect(rollup.linkedCounts).toEqual({ email: 1, sms: 1, event: 1, meta: 1 })
  })

  it("전 채널 혼합 링크 → 채널별 독립 집계(간섭 없음)", () => {
    const links = [
      link("email_campaign", "e1"),
      link("sms_campaign", "s1"),
      link("event", "ev1"),
      link("meta_campaign", "m1"),
    ]
    const sources: CampaignRollupSources = {
      emailCampaigns: { e1: { recipientCount: 200, openCount: 75 } },
      smsCampaigns: { s1: { recipientCount: 150 } },
      eventMetrics: { ev1: { leads: 10, dealsCount: 4, dealsRevenue: 2_400_000 } },
      metaCampaigns: { m1: { spend: 300, leads: 60, currency: "USD" } },
    }
    const rollup = computeCampaignRollup(links, sources)
    expect(rollup).toEqual({
      emailRecipients: 200,
      emailOpens: 75,
      smsRecipients: 150,
      eventLeads: 10,
      eventDeals: 4,
      eventRevenue: 2_400_000,
      metaSpend: 300,
      metaCurrency: "USD",
      metaLeads: 60,
      linkedCounts: { email: 1, sms: 1, event: 1, meta: 1 },
    })
  })

  it("출력에 roas 키가 존재하지 않는다(채널·통화 가로지르는 조작 ROAS 금지)", () => {
    const links = [
      link("event", "ev1"),
      link("meta_campaign", "m1"),
    ]
    const sources: CampaignRollupSources = {
      emailCampaigns: {},
      smsCampaigns: {},
      eventMetrics: { ev1: { leads: 10, dealsCount: 4, dealsRevenue: 2_400_000 } },
      metaCampaigns: { m1: { spend: 300, leads: 60, currency: "USD" } },
    }
    const rollup = computeCampaignRollup(links, sources)
    expect(rollup).not.toHaveProperty("roas")
    expect(rollup).not.toHaveProperty("roi")
  })
})

import { describe, expect, it } from "vitest"

import { aggregateAdConversion, leadReached } from "@/lib/marketing/ad-conversion"

const W = { since: "2026-10-01", until: "2026-10-31" }
const lead = (meta_ad_id: string | null, stage: string, extra: Record<string, string> = {}, created_at = "2026-10-10T03:00:00Z") =>
  ({ meta_ad_id, stage, created_at, ...extra })

describe("leadReached", () => {
  it("counts won as demo + bd + paid, and lost only by timestamps", () => {
    expect(leadReached(lead("a", "won"))).toEqual({ demo: true, bd: true, paid: true })
    expect(leadReached(lead("a", "lost"))).toEqual({ demo: false, bd: false, paid: false })
    expect(leadReached(lead("a", "lost", { demo_at: "2026-10-12" }))).toEqual({ demo: true, bd: false, paid: false })
    expect(leadReached(lead("a", "bd", { bd_paid_at: "2026-10-20" })).paid).toBe(true)
  })
})

describe("aggregateAdConversion", () => {
  const ads = [
    { day: "2026-10-05", ad_id: "a", ad_name: "A", campaign_name: "C1", spend_usd: 100 },
    { day: "2026-10-06", ad_id: "a", ad_name: "A", campaign_name: "C1", spend_usd: 50 },
    { day: "2026-09-20", ad_id: "a", ad_name: "A", campaign_name: "C1", spend_usd: 999 }, // 기간 밖 — 집행비 제외
    { day: "2026-10-05", ad_id: "b", ad_name: "B", campaign_name: "C1", spend_usd: 30 },
  ]
  const leads = [
    lead("a", "new"), lead("a", "demo"), lead("a", "won"),
    lead("b", "new"),
    lead("x", "won"), // 집행 기록 없는 광고 — 집행비 null
    lead(null, "won"), // 광고 id 없음 — 제외 집계
    lead("a", "won", {}, "2026-09-30T14:59:00Z"), // KST 9/30 23:59 — 기간 밖
    lead("a", "won", {}, "2026-09-30T15:00:00Z"), // KST 10/1 00:00 — 기간 안
  ]
  const r = aggregateAdConversion(leads, ads, W)

  it("rolls up per ad with rates and costs", () => {
    const a = r.rows.find((x) => x.adId === "a")!
    expect(a).toMatchObject({ leads: 4, demo: 3, bd: 2, paid: 2, spendUsd: 150, paidRate: 50, demoToPaidRate: 66.7, costPerLead: 37.5, costPerPaid: 75 })
    const x = r.rows.find((y) => y.adId === "x")!
    expect(x).toMatchObject({ spendUsd: null, costPerPaid: null, paid: 1 })
    expect(r.rows.find((y) => y.adId === "b")).toMatchObject({ paid: 0, paidRate: 0, costPerPaid: null })
  })

  it("keeps unattributed leads out and totals honest", () => {
    expect(r.unattributedLeads).toBe(1)
    expect(r.totals).toMatchObject({ leads: 6, paid: 3, spendUsd: 180, costPerPaid: 60 })
    expect(r.campaigns.map((c) => c.campaignName)).toEqual(["C1", "캠페인 모름"])
  })

  it("returns null rates on empty input", () => {
    expect(aggregateAdConversion([], [], W).totals).toMatchObject({ leads: 0, paidRate: null, costPerPaid: null, spendUsd: null })
  })
})

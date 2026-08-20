import { describe, expect, it } from "vitest"
import { mapDailyInsightRow, normalizeBudgetAmount } from "@/lib/meta/marketing"

describe("mapDailyInsightRow", () => {
  it("정상 행을 도메인 행으로 변환한다 (leads 는 actions 에서 파생)", () => {
    const row = mapDailyInsightRow({
      date_start: "2026-08-18",
      date_stop: "2026-08-18",
      campaign_id: "123",
      campaign_name: "여름특강",
      spend: "42.5",
      impressions: "1000",
      reach: "800",
      clicks: "50",
      ctr: "5",
      cpc: "0.85",
      cpm: "42.5",
      actions: [{ action_type: "lead", value: "7" }],
    })
    expect(row).toEqual({
      date: "2026-08-18",
      campaignId: "123",
      campaignName: "여름특강",
      spend: 42.5,
      impressions: 1000,
      reach: 800,
      clicks: 50,
      ctr: 5,
      cpc: 0.85,
      cpm: 42.5,
      leads: 7,
    })
  })

  it("campaign_id 또는 date_start 가 없으면 null", () => {
    expect(mapDailyInsightRow({ campaign_id: "1" })).toBeNull()
    expect(mapDailyInsightRow({ date_start: "2026-08-18" })).toBeNull()
  })

  it("빈 지표는 0/null 로 정규화한다", () => {
    const row = mapDailyInsightRow({ date_start: "2026-08-18", campaign_id: "1" })
    expect(row).toMatchObject({ spend: 0, impressions: 0, leads: 0, ctr: null, cpc: null })
  })
})

describe("normalizeBudgetAmount", () => {
  it("USD 는 100 오프셋(센트→달러)", () => {
    expect(normalizeBudgetAmount("50000", "USD")).toBe(500)
  })
  it("KRW 는 오프셋 1", () => {
    expect(normalizeBudgetAmount("500000", "KRW")).toBe(500000)
  })
  it("0 이하·비수치는 null", () => {
    expect(normalizeBudgetAmount("0", "USD")).toBeNull()
    expect(normalizeBudgetAmount(undefined, "USD")).toBeNull()
  })
})

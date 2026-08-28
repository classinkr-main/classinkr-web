import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchMetaDailyInsights, mapDailyInsightRow, normalizeBudgetAmount } from "@/lib/meta/marketing"

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

/*
 * fetchMetaDailyInsights — 계정 필드 조회(getMetaAdAccountStatus)와 insights 페이징을
 * URL 로 분기하는 fetch mock. account 호출은 "/insights" 를 포함하지 않아 분기 기준으로 쓴다.
 */
describe("fetchMetaDailyInsights", () => {
  const ACCOUNT_BODY = { id: "act_123", currency: "USD" }

  function dailyRow(campaignId: string, date: string) {
    return {
      campaign_id: campaignId,
      campaign_name: `캠페인 ${campaignId}`,
      date_start: date,
      date_stop: date,
      spend: "10",
      impressions: "100",
      reach: "80",
      clicks: "5",
      ctr: "5",
      cpc: "2",
      cpm: "100",
      actions: [{ action_type: "lead", value: "1" }],
    }
  }

  beforeEach(() => {
    vi.stubEnv("META_AD_ACCOUNT_ID", "123")
    vi.stubEnv("META_ACCESS_TOKEN", "test-token")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("커서 페이징 결과를 이어붙이고 truncated=false", async () => {
    const insightsUrls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (!url.includes("/insights")) {
          return { ok: true, json: async () => ACCOUNT_BODY } as unknown as Response
        }
        insightsUrls.push(url)
        if (insightsUrls.length === 1) {
          return {
            ok: true,
            json: async () => ({
              data: [dailyRow("1", "2026-08-01"), dailyRow("2", "2026-08-01")],
              paging: { next: "https://graph.facebook.com/next", cursors: { after: "CURSOR_1" } },
            }),
          } as unknown as Response
        }
        return {
          ok: true,
          json: async () => ({ data: [dailyRow("1", "2026-08-02")], paging: {} }),
        } as unknown as Response
      })
    )

    const result = await fetchMetaDailyInsights({ since: "2026-08-01", until: "2026-08-02" })

    expect(result.rows).toHaveLength(3)
    expect(result.truncated).toBe(false)
    expect(result.currency).toBe("USD")
    expect(insightsUrls).toHaveLength(2)
    expect(insightsUrls[1]).toContain("after=CURSOR_1")
  })

  it("20페이지 캡에 걸리면 truncated=true + 경고 로그", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    let insightsCallCount = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (!url.includes("/insights")) {
          return { ok: true, json: async () => ACCOUNT_BODY } as unknown as Response
        }
        insightsCallCount += 1
        return {
          ok: true,
          json: async () => ({
            data: [dailyRow(String(insightsCallCount), "2026-08-01")],
            paging: {
              next: "https://graph.facebook.com/next",
              cursors: { after: `CURSOR_${insightsCallCount}` },
            },
          }),
        } as unknown as Response
      })
    )

    const result = await fetchMetaDailyInsights({ since: "2026-08-01", until: "2026-08-01" })

    expect(insightsCallCount).toBe(20)
    expect(result.rows).toHaveLength(20)
    expect(result.truncated).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(
      "[meta-daily] 페이징 상한 도달 — 결과 절단됨",
      expect.objectContaining({ since: "2026-08-01", until: "2026-08-01" })
    )
  })
})

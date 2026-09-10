// lib/marketing/insights/input-builder.ts — 공유 perf 캐시 소비 회귀 가드 (2026-09-04).
//
// insights 빌더는 이제 raw assembleMarketingPerf가 아니라 perf 라우트와 같은 Data Cache
// 엔트리(getCachedMarketingPerf)를 소비한다. 이 목은 assembleMarketingPerf를 아예 제공하지
// 않는다 — 빌더가 실수로 그걸 다시 부르면 "getCachedMarketingPerf/assembleMarketingPerf is
// not a function"으로 즉시 드러난다.
import { beforeEach, describe, expect, it, vi } from "vitest"

const FAKE_PERF = {
  period: {
    key: "30d",
    since: "2026-08-01",
    until: "2026-08-30",
    prevSince: "2026-07-01",
    prevUntil: "2026-07-31",
    prevBasis: "trailing",
  },
  snapshotAt: "2026-08-30T00:00:00.000Z",
  metaDataThrough: "2026-08-30",
  kpis: {
    spendUsd: { value: 100, previous: 50, deltaPct: 100, currency: "USD" },
    leads: { value: 10, previous: 5, deltaPct: 100 },
    adLeads: { value: 8, previous: 4, deltaPct: 100 },
    cplUsd: { value: 12.5, previous: 12.5, deltaPct: 0, currency: "USD" },
    leadConversionRate: { value: 20, previous: 20, deltaPct: 0 },
    budgetExecutionPct: { value: 50, previous: null, deltaPct: null, currency: "KRW" },
  },
  daily: [],
  scoreboard: [],
  funnel: { impressions: 100, clicks: 10, adLeads: 8, contacted: 4, convertedLeads: 2 },
  leadDailyBySource: {},
  channelMix: [],
  updatesFeed: [],
}

const mocks = vi.hoisted(() => ({
  getCachedMarketingPerf: vi.fn(),
  getCompassAdsDaily: vi.fn(),
  listCampaigns: vi.fn(),
  getMetaInsightsDailyRange: vi.fn(),
}))

vi.mock("@/lib/marketing/perf-assemble", () => ({
  getCachedMarketingPerf: mocks.getCachedMarketingPerf,
  kstToday: () => "2026-08-30",
}))
vi.mock("@/lib/compass/bridge", () => ({ getCompassAdsDaily: mocks.getCompassAdsDaily }))
vi.mock("@/lib/repositories/marketing-campaigns", () => ({ listCampaigns: mocks.listCampaigns }))
vi.mock("@/lib/repositories/meta-insights-daily", () => ({
  getMetaInsightsDailyRange: mocks.getMetaInsightsDailyRange,
}))

describe("assembleMarketingInsightBuild — getCachedMarketingPerf 소비", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCachedMarketingPerf.mockResolvedValue(FAKE_PERF)
    mocks.getCompassAdsDaily.mockResolvedValue({ rows: [], down: false })
    mocks.listCampaigns.mockResolvedValue([])
    mocks.getMetaInsightsDailyRange.mockResolvedValue([])
  })

  it("raw assembleMarketingPerf 대신 getCachedMarketingPerf('30d')를 호출한다", async () => {
    const { buildMarketingInsightInput } = await import("@/lib/marketing/insights/input-builder")
    const input = await buildMarketingInsightInput()

    expect(mocks.getCachedMarketingPerf).toHaveBeenCalledTimes(1)
    expect(mocks.getCachedMarketingPerf).toHaveBeenCalledWith("30d")
    // 값이 실제로 perf 응답에서 평탄화됐는지도 함께 고정(목 호출 여부만으로는 배선 누락을 못 잡는다).
    expect(input.kpis.spend_usd).toBe(100)
    expect(input.period).toEqual({ key: "30d", since: "2026-08-01", until: "2026-08-30" })
  })
})

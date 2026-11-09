/**
 * lib/repositories/google-ads-daily.ts — 캠페인 유형 · 유튜브 조회수 칸(20261106 마이그레이션).
 *  - upsert 가 channel_type·video_views 를 싣는다(빠지면 Compass 광고 탭 「구글」이 유형·조회수를 못 본다).
 *  - 읽기는 칸이 생기기 전 행의 video_views NULL 을 0 으로 바꾸지 않는다("0회"와 "아직 안 받음"이 섞인다).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  upserts: [] as Array<Array<Record<string, unknown>>>,
  rangeRows: [] as Array<Record<string, unknown>>,
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))
vi.mock("@/lib/repositories/marketing", () => ({ MARKETING_PERF_CACHE_TAG: "marketing-perf" }))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const query = {
        upsert: async (payload: Array<Record<string, unknown>>) => {
          mocks.upserts.push(payload)
          return { error: null }
        },
        select: () => query,
        gte: () => query,
        lte: () => query,
        order: async () => ({ data: mocks.rangeRows, error: null }),
      }
      return query
    },
  }),
}))

import { getGoogleAdsDailyRange, upsertGoogleAdsDaily } from "@/lib/repositories/google-ads-daily"

beforeEach(() => {
  mocks.upserts.length = 0
  mocks.rangeRows = []
})

describe("google_ads_daily — 캠페인 유형 · 조회수", () => {
  it("upsert 에 channel_type·video_views 를 싣는다", async () => {
    await upsertGoogleAdsDaily(
      [
        {
          date: "2026-11-05",
          campaignId: "24421437785",
          campaignName: "유튜브 전반성장_1102",
          spend: 4852.9,
          impressions: 1003,
          clicks: 0,
          conversions: 0,
          channelType: "VIDEO",
          videoViews: 287,
        },
      ],
      "KRW"
    )
    expect(mocks.upserts[0][0]).toMatchObject({
      campaign_id: "24421437785",
      channel_type: "VIDEO",
      video_views: 287,
      currency: "KRW",
    })
  })

  it("칸이 생기기 전 행(NULL)은 null 로 읽는다 — 0 으로 채우지 않는다", async () => {
    mocks.rangeRows = [
      { date: "2026-11-03", campaign_id: "1", spend: "10", impressions: 5, clicks: 0, conversions: "0", channel_type: null, video_views: null, currency: "KRW", synced_at: "x" },
      { date: "2026-11-04", campaign_id: "1", spend: "10", impressions: 5, clicks: 0, conversions: "0", channel_type: "VIDEO", video_views: "42", currency: "KRW", synced_at: "y" },
    ]
    const rows = await getGoogleAdsDailyRange("2026-11-03", "2026-11-04")
    expect(rows.map((r) => [r.channelType, r.videoViews])).toEqual([
      [null, null],
      ["VIDEO", 42],
    ])
  })
})

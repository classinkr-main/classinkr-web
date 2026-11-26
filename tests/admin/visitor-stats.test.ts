import { beforeEach, describe, expect, it, vi } from "vitest"

const mockState = vi.hoisted(() => ({
  rpcResult: { data: null, error: null } as { data: unknown; error: { code?: string } | null },
  rows: [] as Array<{ page: string; anonymous_id: string; created_at: string }>,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async () => mockState.rpcResult,
    from: () => {
      const builder: Record<string, unknown> = {}
      for (const name of ["select", "eq", "gte", "order"]) builder[name] = () => builder
      builder.range = async (from: number, to: number) => ({
        data: mockState.rows.slice(from, Math.min(to + 1, from + 1000)),
        error: null,
        count: mockState.rows.length,
      })
      return builder
    },
  }),
}))

import {
  getAdminVisitorStats,
  buildVisitorStatsFromRows,
  normalizeVisitorStatsPayload,
  parseVisitorStatsRange,
} from "@/lib/admin-visitor-stats"

describe("getAdminVisitorStats fallback", () => {
  beforeEach(() => {
    mockState.rpcResult = { data: null, error: null }
    mockState.rows = []
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("rethrows RPC errors other than a missing function", async () => {
    mockState.rpcResult = { data: null, error: { code: "57014" } }
    await expect(getAdminVisitorStats(7)).rejects.toMatchObject({ code: "57014" })
  })

  it("counts every page when the RPC is missing and rows exceed 1000", async () => {
    mockState.rpcResult = { data: null, error: { code: "PGRST202" } }
    const created = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    mockState.rows = Array.from({ length: 2500 }, (_, i) => ({
      page: "/",
      anonymous_id: `v${i}`,
      created_at: created,
    }))
    const stats = await getAdminVisitorStats(7)
    expect(stats.totals.pageViews).toBe(2500)
    expect(stats.totals.visitors).toBe(2500)
  })
})

describe("admin visitor stats", () => {
  it("counts KST daily visitors and home page views from client events", () => {
    const now = new Date("2026-06-24T06:00:00.000Z")
    const stats = buildVisitorStatsFromRows(
      [
        { page: "/", anonymous_id: "a", created_at: "2026-06-23T14:30:00.000Z" },
        { page: "/", anonymous_id: "a", created_at: "2026-06-24T00:10:00.000Z" },
        { page: "/blog/post", anonymous_id: "a", created_at: "2026-06-24T00:20:00.000Z" },
        { page: "/", anonymous_id: "b", created_at: "2026-06-23T15:30:00.000Z" },
        { page: "/", anonymous_id: null, created_at: "2026-06-24T01:00:00.000Z" },
      ],
      7,
      now
    )

    expect(stats.daily.slice(-2)).toEqual([
      {
        date: "2026-06-23",
        visitors: 1,
        pageViews: 1,
        homeVisitors: 1,
        homePageViews: 1,
      },
      {
        date: "2026-06-24",
        visitors: 2,
        pageViews: 4,
        homeVisitors: 2,
        homePageViews: 3,
      },
    ])
    expect(stats.totals).toEqual({
      visitors: 2,
      pageViews: 5,
      homeVisitors: 2,
      homePageViews: 4,
    })
  })

  it("normalizes RPC payloads into a complete date series", () => {
    const stats = normalizeVisitorStatsPayload(
      {
        daily: [
          {
            date: "2026-06-24",
            visitors: 3,
            pageViews: 8,
            homeVisitors: 2,
            homePageViews: 5,
          },
        ],
        totals: {
          visitors: 3,
          pageViews: 8,
          homeVisitors: 2,
          homePageViews: 5,
        },
      },
      7,
      new Date("2026-06-24T06:00:00.000Z")
    )

    expect(stats.daily.at(-2)).toEqual({
      date: "2026-06-23",
      visitors: 0,
      pageViews: 0,
      homeVisitors: 0,
      homePageViews: 0,
    })
    expect(stats.today.homeVisitors).toBe(2)
    expect(stats.totals.homePageViews).toBe(5)
  })

  it("keeps admin range inputs bounded", () => {
    expect(parseVisitorStatsRange("7")).toBe(7)
    expect(parseVisitorStatsRange("90")).toBe(90)
    expect(parseVisitorStatsRange("365")).toBe(30)
    expect(parseVisitorStatsRange(null)).toBe(30)
  })
})

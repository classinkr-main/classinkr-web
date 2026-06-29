import { describe, expect, it } from "vitest"

import {
  buildVisitorStatsFromRows,
  normalizeVisitorStatsPayload,
  parseVisitorStatsRange,
} from "@/lib/admin-visitor-stats"

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

import { describe, expect, it } from "vitest"

import { mergePublicPageRequestChunks, parsePublicPageRequests } from "@/lib/admin/public-page-requests"

const now = new Date("2026-11-09T02:00:00.000Z")

describe("public page request metrics", () => {
  it("keeps KST day boundaries and fills empty days without converting requests into visitors", () => {
    const result = parsePublicPageRequests({
      data: [
        { timestamp: "2026-11-05T15:00:00.000Z", vercel_request_count_sum: 63 },
        { timestamp: "2026-11-08T15:00:00.000Z", vercel_request_count_sum: 45 },
      ],
      summary: [{ vercel_request_count_sum: 108 }],
    }, 7, now)
    expect(result.daily.slice(-4)).toEqual([
      { date: "2026-11-06", requests: 63 },
      { date: "2026-11-07", requests: 0 },
      { date: "2026-11-08", requests: 0 },
      { date: "2026-11-09", requests: 45 },
    ])
    expect(result.today).toBe(45)
    expect(result.total).toBe(108)
  })

  it("rejects incomplete or duplicated buckets instead of reporting them as zero", () => {
    expect(() => parsePublicPageRequests({
      data: [{ timestamp: "2026-11-05T15:00:00.000Z", vercel_request_count_sum: 5 }],
      summary: [{ vercel_request_count_sum: 6 }],
    }, 7, now)).toThrow("Incomplete")
    expect(() => parsePublicPageRequests({
      data: [
        { timestamp: "2026-11-05T15:00:00.000Z", vercel_request_count_sum: 0 },
        { timestamp: "2026-11-05T15:00:00.000Z", vercel_request_count_sum: 0 },
      ],
      summary: [{ vercel_request_count_sum: 0 }],
    }, 7, now)).toThrow("Unexpected")
  })

  it("rejects an unknown total rather than presenting an empty result as zero", () => {
    expect(() => parsePublicPageRequests({ data: [], summary: [] }, 7, now)).toThrow()
  })

  it("combines separate periods and rejects overlapping day buckets", () => {
    const first = { data: [{ timestamp: "2026-11-05T15:00:00.000Z", vercel_request_count_sum: 5 }], summary: [{ vercel_request_count_sum: 5 }] }
    const second = { data: [{ timestamp: "2026-11-08T15:00:00.000Z", vercel_request_count_sum: 8 }], summary: [{ vercel_request_count_sum: 8 }] }
    expect(mergePublicPageRequestChunks([first, second], 7, now).total).toBe(13)
    expect(() => mergePublicPageRequestChunks([first, first], 7, now)).toThrow("Unexpected")
  })
})

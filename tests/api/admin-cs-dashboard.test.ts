import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  fetchCsInquiryDashboard: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  verifyAdmin: mocks.verifyAdmin,
}))

vi.mock("@/lib/cs/inquiry-dashboard", () => ({
  fetchCsInquiryDashboard: mocks.fetchCsInquiryDashboard,
}))

import { GET } from "@/app/api/admin/cs/dashboard/route"

describe("GET /api/admin/cs/dashboard", () => {
  beforeEach(() => {
    mocks.verifyAdmin.mockReset()
    mocks.fetchCsInquiryDashboard.mockReset()
    mocks.verifyAdmin.mockResolvedValue(null)
  })

  it("returns 401 when admin verification fails", async () => {
    mocks.verifyAdmin.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    )

    const req = new NextRequest("https://classin.kr/api/admin/cs/dashboard")
    const res = await GET(req)

    expect(res.status).toBe(401)
    expect(mocks.fetchCsInquiryDashboard).not.toHaveBeenCalled()
  })

  it("passes period param to fetchCsInquiryDashboard and returns cached json", async () => {
    const mockData = {
      period: "30d",
      kpis: {
        totalInquiries: 42,
        unansweredCount: 5,
        resolvedCount: 35,
        inProgressCount: 2,
        resolutionRate: 83.3,
        avgResponseHours: 1.5,
        prevPeriodDiff: { totalPercent: 10, resolutionRateDiff: 2.1 },
      },
      connections: {
        channelTalk: { status: "connected", totalCount: 100 },
        homepage: { status: "connected", totalCount: 50 },
      },
      trends: [],
      genres: [],
      channels: [],
      frequentIssues: [],
      unansweredInquiries: [],
    }

    mocks.fetchCsInquiryDashboard.mockResolvedValue(mockData)

    const req = new NextRequest("https://classin.kr/api/admin/cs/dashboard?period=30d")
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(mocks.fetchCsInquiryDashboard).toHaveBeenCalledWith({ period: "30d" })
    const json = await res.json()
    expect(json.period).toBe("30d")
    expect(json.kpis.totalInquiries).toBe(42)
  })
})

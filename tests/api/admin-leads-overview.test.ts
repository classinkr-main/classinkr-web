import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getLeads: vi.fn(),
  getDashboardLeads: vi.fn(),
  getCampaignLeads: vi.fn(),
  getMarketingLeads: vi.fn(),
  getCachedOverviewLeadSummary: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/leads", () => ({
  getLeads: mocks.getLeads,
  getDashboardLeads: mocks.getDashboardLeads,
  getCampaignLeads: mocks.getCampaignLeads,
  getMarketingLeads: mocks.getMarketingLeads,
  findLeadsByContacts: vi.fn(),
  saveLead: vi.fn(),
}))

vi.mock("@/lib/admin/overview/lead-summary-cache", () => ({
  getCachedOverviewLeadSummary: mocks.getCachedOverviewLeadSummary,
}))

import { GET } from "@/app/api/admin/leads/route"

function request(scope: string) {
  return new NextRequest(`https://classin.kr/api/admin/leads?scope=${scope}`)
}

const dashboardLeads = Array.from({ length: 8 }, (_, index) => ({
  id: `lead-${index}`,
  source: index % 2 === 0 ? "contact_page" : "demo_modal",
  name: `리드 ${index}`,
  org: `학원 ${index}`,
  email: `lead-${index}@example.com`,
  timestamp: new Date(2026, 7, 27 - index, 10).toISOString(),
  status: "new" as const,
  branch: "서울",
  confirmed_at: new Date(2026, 7, 27 - index, 10).toISOString(),
}))

const overviewSummary = {
  metrics: { total: 8 },
  recentLeads: dashboardLeads.slice(0, 6).map(
    ({ id, source, name, org, email, timestamp, status }) => ({
      id,
      source,
      name,
      org,
      email,
      timestamp,
      status,
    })
  ),
  trends: {
    days7: Array.from({ length: 7 }, () => ({ date: "2026-08-27", count: 0 })),
    days30: Array.from({ length: 30 }, () => ({ date: "2026-08-27", count: 0 })),
  },
}

describe("GET /api/admin/leads overview scope", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({
      source: "supabase",
      role: "ADMIN",
      userId: "admin-1",
    })
    mocks.getDashboardLeads.mockResolvedValue(dashboardLeads)
    mocks.getCachedOverviewLeadSummary.mockResolvedValue(overviewSummary)
  })

  it("aggregates repository data once and returns only the compact overview contract", async () => {
    const response = await GET(request("overview"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.getCachedOverviewLeadSummary).toHaveBeenCalledTimes(1)
    expect(mocks.getDashboardLeads).not.toHaveBeenCalled()
    expect(mocks.getLeads).not.toHaveBeenCalled()
    expect(body.overview.metrics.total).toBe(8)
    expect(body.overview.recentLeads).toHaveLength(6)
    expect(body.overview.trends.days7).toHaveLength(7)
    expect(body.overview.trends.days30).toHaveLength(30)
    expect(body).not.toHaveProperty("leads")
    expect(body.overview.recentLeads[0]).not.toHaveProperty("confirmed_at")
    expect(body.overview.recentLeads[0]).not.toHaveProperty("branch")
  })

  it("preserves the existing dashboard scope response unchanged", async () => {
    const response = await GET(request("dashboard"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ leads: dashboardLeads })
    expect(mocks.getDashboardLeads).toHaveBeenCalledTimes(1)
  })
})

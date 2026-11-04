import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn((fn: () => unknown) => fn),
  getDashboardLeads: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
}))

vi.mock("@/lib/repositories/leads", () => ({
  ADMIN_LEADS_OVERVIEW_CACHE_TAG: "admin-leads-overview",
  getDashboardLeads: mocks.getDashboardLeads,
}))

describe("Overview lead summary server cache", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.unstableCache.mockClear()
    mocks.getDashboardLeads.mockReset()
  })

  it("shares the compact aggregate briefly and tags it for write invalidation", async () => {
    mocks.getDashboardLeads.mockResolvedValue([
      {
        id: "lead-1",
        source: "contact_page",
        name: "리드 1",
        org: "학원 1",
        timestamp: "2026-08-27T00:00:00.000Z",
        status: "new",
      },
    ])

    const { getCachedOverviewLeadSummary } = await import("@/lib/admin/overview/lead-summary-cache")
    const summary = await getCachedOverviewLeadSummary()

    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["admin-leads-overview-v3"],
      { revalidate: 30, tags: ["admin-leads-overview"] }
    )
    expect(mocks.getDashboardLeads).toHaveBeenCalledTimes(1)
    expect(summary.metrics.total).toBe(1)
    expect(summary.recentLeads).toHaveLength(1)
    expect(summary.company.metrics.total).toBe(1)
  })

  it("reads the full snapshot once and scopes the owner view in memory", async () => {
    mocks.getDashboardLeads.mockResolvedValue([
      { id: "mine", source: "contact_page", timestamp: "2026-08-27T00:00:00.000Z", status: "new", assigned_to: "Somang" },
      { id: "unassigned", source: "contact_page", timestamp: "2026-08-27T00:00:00.000Z", status: "new" },
    ])

    const { getCachedOverviewLeadSummary } = await import("@/lib/admin/overview/lead-summary-cache")
    const summary = await getCachedOverviewLeadSummary(["Somang"])

    expect(mocks.getDashboardLeads).toHaveBeenCalledTimes(1)
    expect(mocks.getDashboardLeads).toHaveBeenCalledWith()
    expect(summary.metrics.total).toBe(1)
    expect(summary.company.metrics.total).toBe(2)
  })
})

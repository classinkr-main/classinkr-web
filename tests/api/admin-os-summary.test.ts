import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  getNeoCrmCustomers: vi.fn(),
  getCrmSourceLinkCoverage: vi.fn(),
  listHwOutbound: vi.fn(),
  countPublishedPosts: vi.fn(),
  countPublicEvents: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))
vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/admin-crm-customers-neo", () => ({ getNeoCrmCustomers: mocks.getNeoCrmCustomers }))
vi.mock("@/lib/repositories/crm-source-links", () => ({
  getCrmSourceLinkCoverage: mocks.getCrmSourceLinkCoverage,
}))
vi.mock("@/lib/repositories/branch-hw", () => ({ listHwOutbound: mocks.listHwOutbound }))
vi.mock("@/lib/repositories/blog", () => ({ countPublishedPosts: mocks.countPublishedPosts }))
vi.mock("@/lib/repositories/public-events", () => ({ countPublicEvents: mocks.countPublicEvents }))

describe("GET /api/admin/os-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.getNeoCrmCustomers.mockResolvedValue({ ok: true, summary: { expiringSoonCount: 2 } })
    mocks.getCrmSourceLinkCoverage.mockResolvedValue({
      total: 10,
      linked: 7,
      needsReview: 3,
      coveragePct: 70,
    })
    mocks.listHwOutbound.mockResolvedValue([])
    mocks.countPublishedPosts.mockResolvedValue(5)
    mocks.countPublicEvents.mockResolvedValue(12)
  })

  it("행사 전체 목록 대신 경량 count 결과와 정상 source health를 내려준다", async () => {
    const { GET } = await import("@/app/api/admin/os-summary/route")
    const response = await GET(new NextRequest("https://classin.kr/api/admin/os-summary"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      content: { blogPublished: 5 },
      events: { count: 12 },
      sources: {
        renewal: { status: "ready", error: null },
        matching: { status: "ready", error: null },
        hw: { status: "ready", error: null },
        content: { status: "ready", error: null },
        events: { status: "ready", error: null },
      },
    })
    expect(mocks.countPublicEvents).toHaveBeenCalledTimes(1)
    expect(mocks.getCrmSourceLinkCoverage).toHaveBeenCalledWith({ throwOnError: true })
  })

  it("부분 실패를 0으로 바꾸지 않고 실패 소스만 null+error로 격리한다", async () => {
    mocks.getNeoCrmCustomers.mockResolvedValue({ ok: false, summary: { expiringSoonCount: 0 } })
    mocks.listHwOutbound.mockRejectedValue(new Error("hardware unavailable"))
    mocks.countPublicEvents.mockRejectedValue(new Error("events unavailable"))

    const { GET } = await import("@/app/api/admin/os-summary/route")
    const response = await GET(new NextRequest("https://classin.kr/api/admin/os-summary"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      renewal: { expiringSoonCount: null },
      matching: { total: 10, linked: 7, needsReview: 3, coveragePct: 70 },
      hw: { boards86: null, plannedBoards86: null, target: 218 },
      content: { blogPublished: 5, target: 48 },
      events: { count: null, target: 12 },
      sources: {
        renewal: { status: "error" },
        matching: { status: "ready", error: null },
        hw: { status: "error" },
        content: { status: "ready", error: null },
        events: { status: "error" },
      },
    })
    expect(body.sources.renewal.error).toContain("리뉴얼")
    expect(body.sources.hw.error).toContain("하드웨어")
    expect(body.sources.events.error).toContain("행사")
  })
})

import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  countSubscribers: vi.fn(),
  getSubscriberAnalyticsRows: vi.fn(),
  getSubscribersPage: vi.fn(),
  upsertSubscriber: vi.fn(),
  deleteSubscriber: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/repositories/marketing", () => ({
  countSubscribers: mocks.countSubscribers,
  getSubscriberAnalyticsRows: mocks.getSubscriberAnalyticsRows,
  getSubscribersPage: mocks.getSubscribersPage,
  upsertSubscriber: mocks.upsertSubscriber,
  deleteSubscriber: mocks.deleteSubscriber,
}))

function request(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/subscribers${query ? `?${query}` : ""}`)
}

describe("GET /api/admin/subscribers pagination contracts", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns exact total and explicit truncation metadata for the list", async () => {
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.getSubscribersPage.mockResolvedValue({
      subscribers: [{ id: "sub-1", email: "masked@example.com" }],
      total: 1_234,
      limit: 200,
      offset: 400,
      hasMore: true,
    })
    const { GET } = await import("@/app/api/admin/subscribers/route")

    const response = await GET(request("limit=200&offset=400&status=active&tag=vip"))

    expect(response.status).toBe(200)
    expect(mocks.getSubscribersPage).toHaveBeenCalledWith(200, 400, {
      status: "active",
      tag: "vip",
    })
    await expect(response.json()).resolves.toMatchObject({
      total: 1_234,
      limit: 200,
      offset: 400,
      hasMore: true,
    })
  })

  it("uses the all-row, narrow analytics projection instead of the 1,000-row list", async () => {
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.getSubscriberAnalyticsRows.mockResolvedValue([
      { createdAt: "2026-08-01T00:00:00.000Z", status: "active", source: "blog" },
      { createdAt: "2026-08-02T00:00:00.000Z", status: "active", source: "event" },
    ])
    const { GET } = await import("@/app/api/admin/subscribers/route")

    const response = await GET(request("scope=analytics"))

    expect(response.status).toBe(200)
    expect(mocks.getSubscriberAnalyticsRows).toHaveBeenCalledOnce()
    expect(mocks.getSubscribersPage).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ total: 2 })
  })

  it("returns a structured 500 instead of leaking a rejected repository promise", async () => {
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.getSubscribersPage.mockRejectedValue(new Error("database unavailable"))
    const { GET } = await import("@/app/api/admin/subscribers/route")

    const response = await GET(request())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: "Failed to fetch subscribers" })
  })

  it("does not query subscriber data when authorization fails", async () => {
    mocks.verifyAdmin.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    )
    const { GET } = await import("@/app/api/admin/subscribers/route")

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(mocks.getSubscribersPage).not.toHaveBeenCalled()
    expect(mocks.getSubscriberAnalyticsRows).not.toHaveBeenCalled()
    expect(mocks.countSubscribers).not.toHaveBeenCalled()
  })
})

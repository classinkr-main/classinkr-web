import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({ verifyAdmin: vi.fn(), requests: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/admin/public-page-requests", () => ({ getPublicPageRequests: mocks.requests }))
import { GET } from "@/app/api/admin/public-page-requests/route"

describe("GET /api/admin/public-page-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.requests.mockResolvedValue({ total: 42, today: 5 })
  })

  it("rejects unauthenticated callers before reading server traffic", async () => {
    mocks.verifyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    const result = await GET(new NextRequest("https://classin.co.kr/api/admin/public-page-requests?range=7"))
    expect(result.status).toBe(401)
    expect(mocks.requests).not.toHaveBeenCalled()
  })

  it("returns unavailable rather than a false zero when the source fails", async () => {
    mocks.requests.mockResolvedValue(null)
    const result = await GET(new NextRequest("https://classin.co.kr/api/admin/public-page-requests?range=30"))
    expect(result.status).toBe(503)
  })

  it("returns the requested range without exposing credentials", async () => {
    const result = await GET(new NextRequest("https://classin.co.kr/api/admin/public-page-requests?range=7"))
    expect(mocks.requests).toHaveBeenCalledWith(7)
    expect(result.headers.get("Cache-Control")).toBe("private, no-store")
    expect(await result.json()).toEqual({ total: 42, today: 5 })
  })
})

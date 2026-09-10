import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const verifyAdmin = vi.fn()
const createSupabaseAdminClient = vi.fn()

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin }))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }))

function request(query = "prefix=%2Fdocs%2F&days=30&limit=10") {
  return new NextRequest(`https://classin.kr/api/admin/content/page-views?${query}`)
}

function aggregateClient(result: { data: unknown; error: unknown }) {
  const abortSignal = vi.fn().mockResolvedValue(result)
  const rpc = vi.fn(() => ({ abortSignal }))
  const from = vi.fn()
  return { client: { rpc, from }, rpc, from, abortSignal }
}

function fallbackClient(
  aggregateResult: { data: unknown; error: unknown },
  scanResult: { data: unknown[] | null; error: unknown; count: number | null }
) {
  const rpcAbortSignal = vi.fn().mockResolvedValue(aggregateResult)
  const scanAbortSignal = vi.fn().mockResolvedValue(scanResult)
  const scan = {
    select: vi.fn(),
    eq: vi.fn(),
    like: vi.fn(),
    gte: vi.fn(),
    limit: vi.fn(),
    abortSignal: scanAbortSignal,
  }
  scan.select.mockReturnValue(scan)
  scan.eq.mockReturnValue(scan)
  scan.like.mockReturnValue(scan)
  scan.gte.mockReturnValue(scan)
  scan.limit.mockReturnValue(scan)
  const rpc = vi.fn(() => ({ abortSignal: rpcAbortSignal }))
  const from = vi.fn(() => scan)
  return { client: { rpc, from }, rpc, from, scan, rpcAbortSignal, scanAbortSignal }
}

describe("GET /api/admin/content/page-views", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("checks admin authorization before touching Supabase", async () => {
    verifyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    const { GET } = await import("@/app/api/admin/content/page-views/route")

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("uses the SQL aggregate for docs and preserves exact totals", async () => {
    verifyAdmin.mockResolvedValue(null)
    const mocked = aggregateClient({
      data: [
        { page: "/docs/start?utm_source=a", views: 7 },
        { page: "/docs/start", views: "3" },
        { page: "/docs/faq", views: 4 },
      ],
      error: null,
    })
    createSupabaseAdminClient.mockReturnValue(mocked.client)
    const { GET } = await import("@/app/api/admin/content/page-views/route")

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("private")
    await expect(response.json()).resolves.toEqual({
      rangeDays: 30,
      total: 14,
      top: [
        { page: "/docs/start", count: 10 },
        { page: "/docs/faq", count: 4 },
      ],
    })
    expect(mocked.rpc).toHaveBeenCalledWith("admin_docs_page_view_counts", {
      since_ts: expect.any(String),
    })
    expect(mocked.from).not.toHaveBeenCalled()
  })

  it("falls back without disguising query-string variants as separate pages", async () => {
    verifyAdmin.mockResolvedValue(null)
    const mocked = fallbackClient(
      { data: null, error: { code: "PGRST202" } },
      {
        data: [
          { page: "/docs/start?utm_source=a" },
          { page: "/docs/start" },
          { page: "/docs/faq" },
        ],
        error: null,
        count: 3,
      }
    )
    createSupabaseAdminClient.mockReturnValue(mocked.client)
    const { GET } = await import("@/app/api/admin/content/page-views/route")

    const response = await GET(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      total: 3,
      top: [
        { page: "/docs/start", count: 2 },
        { page: "/docs/faq", count: 1 },
      ],
    })
    expect(mocked.scan.limit).toHaveBeenCalledWith(50_001)
  })

  it("returns 503 instead of presenting a truncated 50k-row scan as complete", async () => {
    verifyAdmin.mockResolvedValue(null)
    const mocked = fallbackClient(
      { data: null, error: { code: "PGRST202" } },
      {
        // PostgREST가 응답을 1,000행으로 클램프해도 exact count로 절단을 검출한다.
        data: Array.from({ length: 1_000 }, () => ({ page: "/docs/start" })),
        error: null,
        count: 50_001,
      }
    )
    createSupabaseAdminClient.mockReturnValue(mocked.client)
    const { GET } = await import("@/app/api/admin/content/page-views/route")

    const response = await GET(request())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: "PAGE_VIEW_AGGREGATION_REQUIRED",
    })
  })
})

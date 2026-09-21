// GET /api/admin/marketing/intake-today — route-local 20초 Map(memo)을 Data Cache로 교체
// (admin-performance-round3-2026-09-10.md §3.2 — 2라운드 실측 재방문 1.8초).
//
// perf/compass-ads 라우트와 같은 구조였다: 인자 없는 route-local Map, fresh=1 우회.
// Vercel Fluid 콜드 인스턴스마다 이 Map이 비어 있었다. unstable_cache(20초, 옛 TTL 유지)로
// 교체하고, fresh=1은 태그를 {expire:0}으로 하드 만료시킨 뒤 캐시된 함수를 불러 재계산한다.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  getMarketingLeads: vi.fn(),
  getCompassLeadsByInflowRange: vi.fn(),
  getCompassAdsDaily: vi.fn(),
  revalidateTag: vi.fn(),
}))

const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/repositories/leads", () => ({ getMarketingLeads: mocks.getMarketingLeads }))
vi.mock("@/lib/compass/bridge", () => ({
  getCompassLeadsByInflowRange: mocks.getCompassLeadsByInflowRange,
  getCompassAdsDaily: mocks.getCompassAdsDaily,
}))
vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keyParts: string[],
    options?: { revalidate?: number; tags?: string[] },
  ) => {
    unstableCacheCalls.push({ keyParts, options })
    return fn
  },
  revalidateTag: mocks.revalidateTag,
}))

function req(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/marketing/intake-today${query}`)
}

describe("GET /api/admin/marketing/intake-today — unstable_cache 배선", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unstableCacheCalls.length = 0
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.getMarketingLeads.mockResolvedValue([])
    mocks.getCompassLeadsByInflowRange.mockResolvedValue({ rows: [], down: false })
    mocks.getCompassAdsDaily.mockResolvedValue({ rows: [], down: false })
  })

  it("옛 메모와 같은 20초로 캐시하고 태그를 채운다", async () => {
    vi.resetModules()
    await import("@/app/api/admin/marketing/intake-today/route")

    const call = unstableCacheCalls.find((c) => c.options?.revalidate === 20)
    expect(call).toBeDefined()
    expect(call?.options?.tags).toBeDefined()
    expect(call?.options?.tags?.length).toBeGreaterThan(0)
  })

  it("fresh=1 이 아니면 태그를 건드리지 않고 캐시된 함수만 부른다", async () => {
    vi.resetModules()
    const { GET } = await import("@/app/api/admin/marketing/intake-today/route")
    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(mocks.getMarketingLeads).toHaveBeenCalledTimes(1)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("fresh=1 이면 태그를 {expire:0}으로 하드 만료시킨다", async () => {
    vi.resetModules()
    const { GET } = await import("@/app/api/admin/marketing/intake-today/route")
    const res = await GET(req("?fresh=1"))

    expect(res.status).toBe(200)
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
    const [tag, profile] = mocks.revalidateTag.mock.calls[0]
    expect(typeof tag).toBe("string")
    expect(profile).toEqual({ expire: 0 })
  })

  it("Compass 절단 판정은 브리지 truncated 를 그대로 쓴다 — 행 수(예전 500 사본)로 짐작하지 않는다", async () => {
    vi.resetModules()
    const rows = Array.from({ length: 500 }, (_, index) => ({
      id: index + 1,
      academy: null,
      name: null,
      phone_key: null,
      region: null,
      meta_ad_id: null,
      created_at: "2020-01-01T00:00:00.000Z",
      last_inflow_at: null,
    }))
    mocks.getCompassLeadsByInflowRange.mockResolvedValue({ rows, down: false, truncated: false })
    const { GET } = await import("@/app/api/admin/marketing/intake-today/route")
    const notTruncated = await (await GET(req())).json()
    expect(notTruncated.compassTruncated).toBe(false)

    vi.resetModules()
    mocks.getCompassLeadsByInflowRange.mockResolvedValue({ rows: [], down: false, truncated: true })
    const { GET: GET2 } = await import("@/app/api/admin/marketing/intake-today/route")
    const truncated = await (await GET2(req())).json()
    expect(truncated.compassTruncated).toBe(true)
    expect(typeof truncated.todayReinflowCount).toBe("number")
  })

  it("캐시 키를 v3 로 올렸다 — 재문의가 빠진 옛 건수(v2)를 재사용하지 않는다", async () => {
    vi.resetModules()
    await import("@/app/api/admin/marketing/intake-today/route")

    const call = unstableCacheCalls.find((c) => c.options?.revalidate === 20)
    expect(call?.keyParts).toEqual(["marketing-intake-today-v3"])
  })

  it("재문의 병합 리드(예전 생성·오늘 last_inflow_at)를 오늘 재유입으로 싣는다", async () => {
    vi.resetModules()
    const now = new Date()
    mocks.getMarketingLeads.mockResolvedValue([
      {
        id: "lead-again",
        source: "demo_modal",
        status: "contacted",
        phone: "010-7777-1234",
        org: "다시학원",
        timestamp: new Date(now.getTime() - 90 * 86_400_000).toISOString(),
        last_inflow_at: now.toISOString(),
      },
    ])
    const { GET } = await import("@/app/api/admin/marketing/intake-today/route")
    const body = await (await GET(req())).json()

    expect(body.todayCount).toBe(1)
    expect(body.todayReinflowCount).toBe(1)
    expect(body.items[0]).toMatchObject({ key: "a:lead-again", reinflow: true, origins: ["admin"] })
  })

  it("관리자 인증 실패 응답을 그대로 반환하고 원천을 조회하지 않는다", async () => {
    vi.resetModules()
    mocks.verifyAdmin.mockResolvedValue(new Response(null, { status: 403 }))
    const { GET } = await import("@/app/api/admin/marketing/intake-today/route")
    const res = await GET(req())

    expect(res.status).toBe(403)
    expect(mocks.getMarketingLeads).not.toHaveBeenCalled()
  })
})

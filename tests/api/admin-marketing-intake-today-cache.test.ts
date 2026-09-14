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

  it("관리자 인증 실패 응답을 그대로 반환하고 원천을 조회하지 않는다", async () => {
    vi.resetModules()
    mocks.verifyAdmin.mockResolvedValue(new Response(null, { status: 403 }))
    const { GET } = await import("@/app/api/admin/marketing/intake-today/route")
    const res = await GET(req())

    expect(res.status).toBe(403)
    expect(mocks.getMarketingLeads).not.toHaveBeenCalled()
  })
})

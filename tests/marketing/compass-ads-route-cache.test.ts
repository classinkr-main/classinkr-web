// GET /api/admin/compass/ads — route-local 45초 Map(memo)을 Data Cache로 교체 (2026-09-04).
//
// perf 라우트(app/api/admin/marketing/perf/route.ts)와 같은 구조였다: period 키의
// route-local Map, fresh=1 우회. Vercel Fluid 콜드 인스턴스마다 이 Map이 비어 있었다.
// unstable_cache(60초)로 교체하고, fresh=1은 태그를 {expire:0}으로 하드 만료시킨 뒤
// 캐시된 함수를 불러 재계산 + 재적재한다(perf 라우트와 동일 패턴).
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  getCompassAdsDaily: vi.fn(),
  revalidateTag: vi.fn(),
}))

const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/compass/bridge", () => ({ getCompassAdsDaily: mocks.getCompassAdsDaily }))
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
  return new NextRequest(`https://classin.kr/api/admin/compass/ads${query}`)
}

describe("GET /api/admin/compass/ads — unstable_cache 배선", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unstableCacheCalls.length = 0
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.getCompassAdsDaily.mockResolvedValue({ rows: [], down: false })
  })

  it("60초로 캐시한다", async () => {
    vi.resetModules()
    await import("@/app/api/admin/compass/ads/route")

    // 이 라우트는 kstToday(lib/marketing/perf-assemble.ts)를 임포트하는데, 그 모듈도 자체
    // unstable_cache(getCachedMarketingPerf)를 모듈 스코프에서 부른다 — 이 목은 전체 그래프의
    // 모든 unstable_cache 호출을 잡으므로, revalidate:60인 항목만 골라 이 라우트의 것으로 본다
    // (perf 조립 캐시는 revalidate:60이 아니라 서로 다른 값을 쓰는 다른 항목들과 함께 섞여도
    // revalidate:60 & tags 보유라는 조합으로 구분된다).
    const call = unstableCacheCalls.find(
      (c) => c.options?.revalidate === 60 && c.keyParts.some((k) => k.includes("compass")),
    )
    expect(call).toBeDefined()
    expect(call?.options?.tags).toBeDefined()
    expect(call?.options?.tags?.length).toBeGreaterThan(0)
  })

  it("fresh=1 이 아니면 태그를 건드리지 않고 캐시된 함수만 부른다", async () => {
    vi.resetModules()
    const { GET } = await import("@/app/api/admin/compass/ads/route")
    const res = await GET(req("?period=30d"))

    expect(res.status).toBe(200)
    expect(mocks.getCompassAdsDaily).toHaveBeenCalledTimes(1)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("fresh=1 이면 태그를 {expire:0}으로 하드 만료시킨다", async () => {
    vi.resetModules()
    const { GET } = await import("@/app/api/admin/compass/ads/route")
    const res = await GET(req("?period=30d&fresh=1"))

    expect(res.status).toBe(200)
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
    const [tag, profile] = mocks.revalidateTag.mock.calls[0]
    expect(typeof tag).toBe("string")
    expect(profile).toEqual({ expire: 0 })
  })

  it("잘못된 period 는 브리지를 조회하지 않고 400을 돌려준다", async () => {
    vi.resetModules()
    const { GET } = await import("@/app/api/admin/compass/ads/route")
    const res = await GET(req("?period=bogus"))

    expect(res.status).toBe(400)
    expect(mocks.getCompassAdsDaily).not.toHaveBeenCalled()
  })
})

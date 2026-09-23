// GET /api/admin/compass/adsets — route-local 45초 Map(memo)을 Data Cache로 교체 (2026-09-21).
//
// 형제 ads 라우트(app/api/admin/compass/ads/route.ts)는 2026-09-04에 옮겨졌는데 이 라우트만
// period 키의 route-local Map + fresh=1 우회로 남아 있었다. Vercel Fluid 콜드 인스턴스마다 이
// Map이 비어 있었다(admin-performance-round3 §3.2). unstable_cache(60초)로 교체하고, fresh=1은
// 태그를 {expire:0}으로 하드 만료시킨 뒤 캐시된 함수를 불러 재계산 + 재적재한다(ads 라우트와 동일).
import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PERF_PERIOD_KEYS } from "@/lib/marketing/perf"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  getCompassAdsetsDaily: vi.fn(),
  revalidateTag: vi.fn(),
}))

const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/compass/bridge", () => ({ getCompassAdsetsDaily: mocks.getCompassAdsetsDaily }))
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
  return new NextRequest(`https://classin.kr/api/admin/compass/adsets${query}`)
}

async function importRoute() {
  vi.resetModules()
  return import("@/app/api/admin/compass/adsets/route")
}

/** 이 라우트의 unstable_cache 등록 — 목이 전체 import 그래프(perf-assemble 등)의 호출을 다 잡으므로 키로 고른다. */
function adsetsCacheCall() {
  return unstableCacheCalls.find((c) => c.keyParts.some((k) => k.startsWith("compass-adsets")))
}

describe("GET /api/admin/compass/adsets — unstable_cache 배선", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unstableCacheCalls.length = 0
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.getCompassAdsetsDaily.mockResolvedValue({ rows: [], down: false, truncated: false })
  })

  it("버전 붙은 키·전용 태그로 60초 캐시한다", async () => {
    await importRoute()

    const call = adsetsCacheCall()
    expect(call).toBeDefined()
    // 응답 형태가 바뀌면 키 버전을 올려 옛 캐시 항목을 버린다 — 버전 접미사를 잠근다.
    expect(call?.keyParts).toContain("compass-adsets-v1")
    expect(call?.options?.revalidate).toBe(60)
    // ads 라우트의 태그("compass-ads")와 갈라야 한 카드의 새로고침이 다른 카드 캐시까지 비우지 않는다.
    expect(call?.options?.tags).toEqual(["compass-adsets"])
  })

  it("fresh=1 이 아니면 태그를 건드리지 않고 캐시된 함수만 부른다", async () => {
    const { GET } = await importRoute()
    const res = await GET(req("?period=30d"))

    expect(res.status).toBe(200)
    expect(mocks.getCompassAdsetsDaily).toHaveBeenCalledTimes(1)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("fresh=1 이면 캐시 등록과 같은 태그를 {expire:0}으로 하드 만료시킨 뒤 조회한다", async () => {
    const { GET } = await importRoute()
    const res = await GET(req("?period=30d&fresh=1"))

    expect(res.status).toBe(200)
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
    const [tag, profile] = mocks.revalidateTag.mock.calls[0]
    expect(adsetsCacheCall()?.options?.tags).toContain(tag)
    expect(profile).toEqual({ expire: 0 })
    // 만료가 먼저여야 이어지는 호출이 옛 항목 대신 재계산 값을 받는다.
    expect(mocks.revalidateTag.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getCompassAdsetsDaily.mock.invocationCallOrder[0],
    )
  })

  it("route-local 메모가 남아 있지 않다 — 캐시를 통과 함수로 두면 매 요청이 브리지까지 간다", async () => {
    const { GET } = await importRoute()
    await GET(req("?period=30d"))
    await GET(req("?period=30d"))

    // 예전 45초 Map 이 남아 있으면 두 번째 요청은 브리지를 부르지 않는다.
    expect(mocks.getCompassAdsetsDaily).toHaveBeenCalledTimes(2)
  })

  it.each(PERF_PERIOD_KEYS)("PERF_PERIOD_KEYS 의 %s 는 200", async (key) => {
    const { GET } = await importRoute()
    const res = await GET(req(`?period=${key}`))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.period.key).toBe(key)
  })

  it("period 가 없으면 30d 로 조회한다", async () => {
    const { GET } = await importRoute()
    const body = await (await GET(req())).json()

    expect(body.period.key).toBe("30d")
  })

  it("잘못된 period 는 브리지를 조회하지 않고 400을 돌려준다", async () => {
    const { GET } = await importRoute()
    const res = await GET(req("?period=bogus"))

    expect(res.status).toBe(400)
    expect(mocks.getCompassAdsetsDaily).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.error).toContain(PERF_PERIOD_KEYS.join("|"))
  })

  it("관리자 인증이 실패하면 캐시·브리지를 건드리지 않고 그 응답을 그대로 돌려준다", async () => {
    mocks.verifyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    const { GET } = await importRoute()
    const res = await GET(req("?period=30d&fresh=1"))

    expect(res.status).toBe(401)
    expect(mocks.getCompassAdsetsDaily).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })
})

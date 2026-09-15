// GET /api/admin/compass/ads — truncated 는 브리지가 총 행수(count)와 비교해 준 값을 그대로 쓴다(2026-09-14).
// 예전 근사(rows.length >= 3000)는 PostgREST max-rows(1000) 절단을 잡지 못했고, 정확히 3000행이면
// 거짓 양성이었다.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  getCompassAdsDaily: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/compass/bridge", () => ({ getCompassAdsDaily: mocks.getCompassAdsDaily }))
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

function req(query = "?period=30d") {
  return new NextRequest(`https://classin.kr/api/admin/compass/ads${query}`)
}

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({ day: "2026-09-01", ad_id: `ad-${i}`, spend_usd: 1, leads: 0 }))
}

describe("GET /api/admin/compass/ads — truncated", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mocks.verifyAdmin.mockResolvedValue(null)
  })

  it("브리지가 truncated=true 면 행 수와 무관하게 true", async () => {
    mocks.getCompassAdsDaily.mockResolvedValue({ rows: rows(1000), down: false, truncated: true })
    const { GET } = await import("@/app/api/admin/compass/ads/route")
    const body = await (await GET(req())).json()
    expect(body.down).toBe(false)
    expect(body.truncated).toBe(true)
  })

  it("정확히 3000행이어도 브리지가 잘리지 않았다고 하면 false", async () => {
    mocks.getCompassAdsDaily.mockResolvedValue({ rows: rows(3000), down: false, truncated: false })
    const { GET } = await import("@/app/api/admin/compass/ads/route")
    const body = await (await GET(req())).json()
    expect(body.truncated).toBe(false)
  })

  it("truncated 가 없는 결과(구버전 목 등)는 false", async () => {
    mocks.getCompassAdsDaily.mockResolvedValue({ rows: [], down: false })
    const { GET } = await import("@/app/api/admin/compass/ads/route")
    const body = await (await GET(req())).json()
    expect(body.truncated).toBe(false)
  })
})

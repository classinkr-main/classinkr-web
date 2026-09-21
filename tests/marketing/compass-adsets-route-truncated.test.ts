// GET /api/admin/compass/adsets — truncated 는 브리지가 총 행수(count)와 비교해 준 값을 그대로 쓴다(2026-09-21).
// ads 라우트(tests/marketing/compass-ads-route-truncated.test.ts)와 같은 계약. 예전 근사
// (rows.length >= 3000)는 PostgREST max-rows(1000) 절단을 잡지 못했고, 정확히 3000행이면 거짓 양성이었다.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  getCompassAdsetsDaily: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/compass/bridge", () => ({ getCompassAdsetsDaily: mocks.getCompassAdsetsDaily }))
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

function req(query = "?period=30d") {
  return new NextRequest(`https://classin.kr/api/admin/compass/adsets${query}`)
}

/** 기간(30d) 안에 들도록 브리지가 돌려준 기간 끝(until)을 일자로 쓴다. */
function rows(n: number, day: string) {
  return Array.from({ length: n }, (_, i) => ({
    day,
    adset_id: `adset-${i}`,
    adset_name: `세트 ${i}`,
    spend_usd: 1,
    leads: 0,
  }))
}

async function getJson() {
  const { GET } = await import("@/app/api/admin/compass/adsets/route")
  return (await GET(req())).json()
}

describe("GET /api/admin/compass/adsets — truncated", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mocks.verifyAdmin.mockResolvedValue(null)
  })

  it("브리지가 truncated=true 면 행 수와 무관하게 true", async () => {
    mocks.getCompassAdsetsDaily.mockImplementation(async (_since: string, until: string) => ({
      rows: rows(1000, until),
      down: false,
      truncated: true,
    }))
    const body = await getJson()
    expect(body.down).toBe(false)
    expect(body.truncated).toBe(true)
    // 잘렸어도 받은 행으로는 집계한다 — "전체"라 부르지 않는 표시는 카드 몫이다.
    expect(body.totals.adsetCount).toBe(1000)
  })

  it("정확히 3000행이어도 브리지가 잘리지 않았다고 하면 false", async () => {
    mocks.getCompassAdsetsDaily.mockImplementation(async (_since: string, until: string) => ({
      rows: rows(3000, until),
      down: false,
      truncated: false,
    }))
    const body = await getJson()
    expect(body.truncated).toBe(false)
    expect(body.totals.adsetCount).toBe(3000)
  })

  it("truncated 가 없는 결과(구버전 목 등)는 false", async () => {
    mocks.getCompassAdsetsDaily.mockResolvedValue({ rows: [], down: false })
    const body = await getJson()
    expect(body.truncated).toBe(false)
  })

  it("브리지가 죽으면 500 이 아니라 down:true 로 200 — 수치·truncated 는 싣지 않는다", async () => {
    mocks.getCompassAdsetsDaily.mockResolvedValue({ rows: [], down: true, error: "view missing" })
    const { GET } = await import("@/app/api/admin/compass/adsets/route")
    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.down).toBe(true)
    expect(body.error).toBe("view missing")
    expect(body.rows).toBeUndefined()
    expect(body.totals).toBeUndefined()
    expect(body.truncated).toBeUndefined()
  })
})

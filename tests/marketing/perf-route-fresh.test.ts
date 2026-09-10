// GET /api/admin/marketing/perf — fresh=1 하드 만료 회귀 가드 (2026-09-04).
//
// perf 라우트는 route-local perfMemo Map을 버리고 lib/marketing/perf-assemble.ts의
// getCachedMarketingPerf(unstable_cache)를 직접 호출한다. fresh=1 은 여전히 "지금 당장 새로
// 계산"을 보장해야 한다 — revalidateTag(tag, {expire:0})로 하드 만료시킨 뒤 캐시된 함수를
// 부르면, 그 함수는 무효화된 태그를 보고 재계산하며 결과를 다시 채워 넣는다(다른 소비처도
// 곧바로 새 값을 본다).
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  getCachedMarketingPerf: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/marketing/perf-assemble", () => ({
  getCachedMarketingPerf: mocks.getCachedMarketingPerf,
}))
vi.mock("@/lib/repositories/marketing", () => ({
  MARKETING_PERF_CACHE_TAG: "marketing-perf",
}))
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }))

function req(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/marketing/perf${query}`)
}

describe("GET /api/admin/marketing/perf — fresh=1 하드 만료", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.getCachedMarketingPerf.mockResolvedValue({ kpis: {} })
  })

  it("fresh=1 이 아니면 캐시된 함수만 부르고 태그를 건드리지 않는다", async () => {
    const { GET } = await import("@/app/api/admin/marketing/perf/route")
    const res = await GET(req("?period=30d"))

    expect(res.status).toBe(200)
    expect(mocks.getCachedMarketingPerf).toHaveBeenCalledWith("30d")
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("fresh=1 이면 태그를 {expire:0}으로 하드 만료시킨 뒤 캐시된 함수를 부른다", async () => {
    const { GET } = await import("@/app/api/admin/marketing/perf/route")
    const res = await GET(req("?period=30d&fresh=1"))

    expect(res.status).toBe(200)
    expect(mocks.revalidateTag).toHaveBeenCalledWith("marketing-perf", { expire: 0 })
    expect(mocks.getCachedMarketingPerf).toHaveBeenCalledWith("30d")
  })

  it("잘못된 period 는 캐시된 함수를 부르지 않고 400을 돌려준다", async () => {
    const { GET } = await import("@/app/api/admin/marketing/perf/route")
    const res = await GET(req("?period=bogus"))

    expect(res.status).toBe(400)
    expect(mocks.getCachedMarketingPerf).not.toHaveBeenCalled()
  })
})

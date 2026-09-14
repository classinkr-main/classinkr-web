// GET /api/admin/messaging/status — route-local 60초 Map(cache)을 Data Cache로 교체
// (admin-performance-round3-2026-09-10.md §3.2).
//
// perf/compass-ads 라우트와 같은 구조였다: 인자 없는 route-local Map. Vercel Fluid 콜드
// 인스턴스마다 이 Map이 비어 있어 매 재방문마다 solapi 원격 호출 3건을 다시 태웠다.
// unstable_cache(60초, 옛 TTL 유지)로 교체하고, fresh=1은 태그를 {expire:0}으로 하드
// 만료시킨 뒤 캐시된 함수를 불러 재계산한다.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  isSolapiConfigured: vi.fn(),
  getDefaultSenderNumber: vi.fn(),
  getKakaoPfId: vi.fn(),
  revalidateTag: vi.fn(),
}))

const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/messaging/solapi", () => ({
  solapi: null,
  isSolapiConfigured: mocks.isSolapiConfigured,
  getDefaultSenderNumber: mocks.getDefaultSenderNumber,
  getKakaoPfId: mocks.getKakaoPfId,
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
  return new NextRequest(`https://classin.kr/api/admin/messaging/status${query}`)
}

describe("GET /api/admin/messaging/status — unstable_cache 배선", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unstableCacheCalls.length = 0
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.isSolapiConfigured.mockReturnValue(false) // 미설정 경로 — 원격 호출 없이 빠르게 검증
    mocks.getDefaultSenderNumber.mockReturnValue("")
    mocks.getKakaoPfId.mockReturnValue("")
  })

  it("옛 메모와 같은 60초로 캐시하고 태그를 채운다", async () => {
    vi.resetModules()
    await import("@/app/api/admin/messaging/status/route")

    const call = unstableCacheCalls.find((c) => c.options?.revalidate === 60)
    expect(call).toBeDefined()
    expect(call?.options?.tags).toBeDefined()
    expect(call?.options?.tags?.length).toBeGreaterThan(0)
  })

  it("fresh=1 이 아니면 태그를 건드리지 않는다", async () => {
    vi.resetModules()
    const { GET } = await import("@/app/api/admin/messaging/status/route")
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.configured).toBe(false)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("fresh=1 이면 태그를 {expire:0}으로 하드 만료시킨다", async () => {
    vi.resetModules()
    const { GET } = await import("@/app/api/admin/messaging/status/route")
    const res = await GET(req("?fresh=1"))

    expect(res.status).toBe(200)
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
    const [tag, profile] = mocks.revalidateTag.mock.calls[0]
    expect(typeof tag).toBe("string")
    expect(profile).toEqual({ expire: 0 })
  })

  it("관리자 인증 실패 응답을 그대로 반환한다", async () => {
    vi.resetModules()
    mocks.verifyAdmin.mockResolvedValue(new Response(null, { status: 403 }))
    const { GET } = await import("@/app/api/admin/messaging/status/route")
    const res = await GET(req())

    expect(res.status).toBe(403)
  })
})

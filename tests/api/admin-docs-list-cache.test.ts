// GET /api/admin/docs — 캐시가 전혀 없던 경로를 Data Cache로 승격
// (admin-performance-round3-2026-09-10.md §3.3). 무효화는 app/api/admin/docs/articles/
// _revalidate.ts가 담당하며 tests/api/admin-docs-revalidate.test.ts가 그 배선을 고정한다.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  listAdminDocsContent: vi.fn(),
}))

const unstableCacheCalls: Array<{
  keyParts: string[]
  options?: { revalidate?: number; tags?: string[] }
}> = []

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/admin-docs", () => ({ listAdminDocsContent: mocks.listAdminDocsContent }))
vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keyParts: string[],
    options?: { revalidate?: number; tags?: string[] },
  ) => {
    unstableCacheCalls.push({ keyParts, options })
    return fn
  },
  revalidateTag: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  unstableCacheCalls.length = 0
  mocks.verifyAdmin.mockResolvedValue(null)
  mocks.listAdminDocsContent.mockResolvedValue({ categories: [], articles: [] })
})

describe("GET /api/admin/docs — unstable_cache 배선", () => {
  it("60초로 캐시하고 태그를 채운다", async () => {
    vi.resetModules()
    await import("@/app/api/admin/docs/_admin-list-cache")

    const call = unstableCacheCalls.find((c) => c.options?.revalidate === 60)
    expect(call).toBeDefined()
    expect(call?.options?.tags?.length).toBeGreaterThan(0)
  })

  it("캐시된 함수를 통해 목록을 반환한다", async () => {
    vi.resetModules()
    const { GET } = await import("@/app/api/admin/docs/route")
    const res = await GET(new NextRequest("https://classin.kr/api/admin/docs"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ categories: [], articles: [] })
    expect(mocks.listAdminDocsContent).toHaveBeenCalledTimes(1)
  })

  it("관리자 인증 실패 응답을 그대로 반환하고 원천을 조회하지 않는다", async () => {
    vi.resetModules()
    mocks.verifyAdmin.mockResolvedValue(new Response(null, { status: 403 }))
    const { GET } = await import("@/app/api/admin/docs/route")
    const res = await GET(new NextRequest("https://classin.kr/api/admin/docs"))

    expect(res.status).toBe(403)
    expect(mocks.listAdminDocsContent).not.toHaveBeenCalled()
  })
})

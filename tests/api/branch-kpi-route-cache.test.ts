// GET /api/admin/branch/kpi — 조립 결과 Data Cache 배선 회귀 가드 (2026-09-04).
//
// 배경: DSH/KPI/REV 각 소스(readDshPreferDb/readKpiBlocksPreferDb/readRevDealsPreferActive)는
// 이미 각자 다층 unstable_cache(액티브 임포트→미러→라이브 시트)지만, 이 라우트가 그 결과를
// 조합해 teams/members 페이로드로 만드는 조립 자체(멤버별 pacing 계산·KPI 행 매칭·딜 그룹핑)엔
// 캐시가 없어 소스가 전부 히트여도 매 요청 재계산 + 여러 소스 각각의 캐시 조회 왕복이 겹쳤다.
// 태그는 새로 만들지 않고 하위 소스가 이미 쓰는 4개 태그를 재사용한다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const EMPTY_DSH = { rows: [], members: {}, breakdown: [] }
const EMPTY_KPI_BLOCKS = { fy: [], months: {} }

async function loadKpiRoute() {
  vi.resetModules()
  const capturedTags: Record<string, string[]> = {}
  const verifyAdmin = vi.fn(async (): Promise<NextResponse | null> => null)
  const readRevDealsPreferActive = vi.fn(async () => [])
  const readDshPreferDb = vi.fn(async () => EMPTY_DSH)
  const readKpiBlocksPreferDb = vi.fn(async () => EMPTY_KPI_BLOCKS)

  vi.doMock("@/lib/admin-auth", () => ({
    verifyAdmin,
    BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"],
  }))
  vi.doMock("@/lib/branch/read-rev-deals", () => ({ readRevDealsPreferActive }))
  vi.doMock("@/lib/branch/read-dsh-kpi", () => ({ readDshPreferDb, readKpiBlocksPreferDb }))
  vi.doMock("next/cache", () => {
    const stores = new Map<string, Map<string, unknown>>()
    return {
      unstable_cache: (
        fn: (...args: unknown[]) => Promise<unknown>,
        keyParts: string[],
        options?: { revalidate?: number; tags?: string[] },
      ) => {
        const cacheKey = keyParts.join("|")
        capturedTags[cacheKey] = options?.tags ?? []
        if (!stores.has(cacheKey)) stores.set(cacheKey, new Map())
        const store = stores.get(cacheKey)!
        return async (...args: unknown[]) => {
          const argsKey = JSON.stringify(args)
          if (store.has(argsKey)) return store.get(argsKey)
          const result = await fn(...args)
          store.set(argsKey, result)
          return result
        }
      },
    }
  })

  const route = await import("@/app/api/admin/branch/kpi/route")
  return { route, verifyAdmin, readRevDealsPreferActive, readDshPreferDb, readKpiBlocksPreferDb, capturedTags }
}

function req(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/branch/kpi${query}`)
}

describe("GET /api/admin/branch/kpi — unstable_cache 배선", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock("@/lib/admin-auth")
    vi.doUnmock("@/lib/branch/read-rev-deals")
    vi.doUnmock("@/lib/branch/read-dsh-kpi")
    vi.doUnmock("next/cache")
    vi.resetModules()
  })

  it("DSH·KPI·REV·액티브임포트 4개 태그를 재사용하고 60초로 캐시한다", async () => {
    const { route, capturedTags } = await loadKpiRoute()
    const res = await route.GET(req("?team=ALL&period=Q"))
    expect(res.status).toBe(200)

    // 라우트가 태그 상수를 얻으려 실제 lib/repositories/branch-dsh-kpi-mirror.ts를 임포트하고,
    // 그 파일도 자체 unstable_cache(DSH/KPI 미러 각각)를 모듈 스코프에서 부른다 — 이 목은
    // 전체 그래프의 모든 unstable_cache 호출을 잡으므로, 이 라우트가 만든 항목만 키로 골라낸다.
    expect(capturedTags["branch-kpi-assembled-v1"]).toEqual([
      "sales-ledger-imports",
      "branch-dsh",
      "branch-kpi",
      "branch-rev-deals",
    ])
  })

  it("같은 team·period·월이면 두 번째 요청은 소스를 다시 읽지 않는다", async () => {
    const { route, readDshPreferDb, readKpiBlocksPreferDb, readRevDealsPreferActive } =
      await loadKpiRoute()

    await route.GET(req("?team=ALL&period=Q"))
    await route.GET(req("?team=ALL&period=Q"))

    expect(readDshPreferDb).toHaveBeenCalledTimes(1)
    expect(readKpiBlocksPreferDb).toHaveBeenCalledTimes(1)
    expect(readRevDealsPreferActive).toHaveBeenCalledTimes(1)
  })

  it("team이 다르면 별도 엔트리로 재조회한다", async () => {
    const { route, readDshPreferDb } = await loadKpiRoute()

    await route.GET(req("?team=ALL&period=Q"))
    await route.GET(req("?team=BD&period=Q"))

    expect(readDshPreferDb).toHaveBeenCalledTimes(2)
  })

  it("인증 실패면 소스를 조회하지 않고 그대로 응답을 반환한다", async () => {
    const { route, verifyAdmin, readDshPreferDb } = await loadKpiRoute()
    verifyAdmin.mockResolvedValueOnce(NextResponse.json({ error: "unauthorized" }, { status: 401 }))

    const res = await route.GET(req("?team=ALL&period=Q"))

    expect(res.status).toBe(401)
    expect(readDshPreferDb).not.toHaveBeenCalled()
  })
})

// GET /api/admin/branch/hw — 조립 결과 Data Cache 배선 회귀 가드 (2026-09-04).
//
// 배경: 4개 소스(listHwInbound/listHwOutbound/listHwStock/getHardwareDashboard)는 이미 각자
// unstable_cache지만, 이 라우트가 패턴별 재고 매핑·설치 최근 내역 도출을 조합하는 조립
// 자체엔 캐시가 없어 소스가 전부 히트여도 4개 소스 각각의 캐시 조회 왕복 + CPU 재계산이
// 매 요청 겹쳤다. 쿼리 파라미터가 없는 고정 페이로드라 캐시 키도 고정이다. 태그는 새로
// 만들지 않고 하위 소스가 이미 쓰는 두 태그(BRANCH_HW_CACHE_TAG·HARDWARE_INVENTORY_CACHE_TAG)를
// 재사용한다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

async function loadHwRoute() {
  vi.resetModules()
  const capturedTags: Record<string, string[]> = {}
  const verifyAdmin = vi.fn(async (): Promise<NextResponse | null> => null)
  const listHwInbound = vi.fn(async () => [])
  const listHwOutbound = vi.fn(async () => [])
  const listHwStock = vi.fn(async () => [])
  const getHardwareDashboard = vi.fn(async () => null)

  vi.doMock("@/lib/admin-auth", () => ({
    verifyAdmin,
    BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"],
  }))
  vi.doMock("@/lib/repositories/branch-hw", () => ({
    listHwInbound,
    listHwOutbound,
    listHwStock,
    BRANCH_HW_CACHE_TAG: "branch-hw",
  }))
  vi.doMock("@/lib/repositories/hardware-inventory", () => ({
    getHardwareDashboard,
    HARDWARE_INVENTORY_CACHE_TAG: "hardware-inventory",
  }))
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

  const route = await import("@/app/api/admin/branch/hw/route")
  return { route, verifyAdmin, listHwInbound, listHwOutbound, listHwStock, getHardwareDashboard, capturedTags }
}

function req() {
  return new NextRequest("https://classin.kr/api/admin/branch/hw")
}

describe("GET /api/admin/branch/hw — unstable_cache 배선", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock("@/lib/admin-auth")
    vi.doUnmock("@/lib/repositories/branch-hw")
    vi.doUnmock("@/lib/repositories/hardware-inventory")
    vi.doUnmock("next/cache")
    vi.resetModules()
  })

  it("BRANCH_HW_CACHE_TAG·HARDWARE_INVENTORY_CACHE_TAG를 재사용하고 60초로 캐시한다", async () => {
    const { route, capturedTags } = await loadHwRoute()
    const res = await route.GET(req())
    expect(res.status).toBe(200)

    const call = Object.entries(capturedTags).find(([, tags]) =>
      tags.includes("branch-hw") && tags.includes("hardware-inventory"),
    )
    expect(call).toBeDefined()
    expect(call?.[1]).toEqual(["branch-hw", "hardware-inventory"])
  })

  it("두 번째 요청은 4개 소스를 다시 읽지 않는다(콜드 인스턴스 재계산 제거)", async () => {
    const { route, listHwInbound, listHwOutbound, listHwStock, getHardwareDashboard } =
      await loadHwRoute()

    await route.GET(req())
    await route.GET(req())

    expect(listHwInbound).toHaveBeenCalledTimes(1)
    expect(listHwOutbound).toHaveBeenCalledTimes(1)
    expect(listHwStock).toHaveBeenCalledTimes(1)
    expect(getHardwareDashboard).toHaveBeenCalledTimes(1)
  })

  it("인증 실패면 소스를 조회하지 않고 그대로 응답을 반환한다", async () => {
    const { route, verifyAdmin, listHwInbound } = await loadHwRoute()
    verifyAdmin.mockResolvedValueOnce(NextResponse.json({ error: "unauthorized" }, { status: 401 }))

    const res = await route.GET(req())

    expect(res.status).toBe(401)
    expect(listHwInbound).not.toHaveBeenCalled()
  })
})

/**
 * GET /api/admin/crm/region-map — 캐시 헤더(2026-10-19 09-mooni 병합 검토 후속).
 * 부분 지도(원천 실패·절단 레이어)는 첫 읽기에서 200으로 나가지만 브라우저 캐시에 두지 않는다(no-store) — 원천이
 * 돌아와도 캐시 수명 동안 "모름" 지도가 재사용되지 않게. 완전한 지도는 표준 사설 캐시 헤더.
 * 집계는 목(getCrmRegionMap) — 집계·throw 규칙은 tests/crm/crm-region-map-pagination.test.ts 가 고정한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getCrmRegionMap: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: m.requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/crm-region-map", () => ({ getCrmRegionMap: m.getCrmRegionMap }))

function regionMap(layerState: { failed?: boolean; truncated?: boolean }[]) {
  return {
    generatedAt: "2026-10-19T00:00:00.000Z",
    provinces: [],
    layers: layerState.map((state, index) => ({ key: `l${index}`, regions: {}, notes: [], ...state })),
    topCustomersByRegion: {},
    ownerStats: {},
  }
}

async function get(path: string) {
  const { GET } = await import("@/app/api/admin/crm/region-map/route")
  return GET(new NextRequest(`https://classin.kr${path}`))
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "김운영", userId: "u1" })
})

describe("GET region-map 캐시 헤더", () => {
  it("완전한 지도는 표준 사설 캐시 헤더", async () => {
    m.getCrmRegionMap.mockResolvedValue(regionMap([{}, {}]))
    const response = await get("/api/admin/crm/region-map")
    expect(response.status).toBe(200)
    expect(m.getCrmRegionMap).toHaveBeenCalledWith({ force: false })
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30, stale-while-revalidate=120")
  })

  it("원천 실패 레이어가 있는 부분 지도는 200 이지만 no-store", async () => {
    m.getCrmRegionMap.mockResolvedValue(regionMap([{}, { failed: true }]))
    const response = await get("/api/admin/crm/region-map")
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect((await response.json()).layers[1].failed).toBe(true)
  })

  it("절단(truncated) 레이어도 부분 지도라 no-store", async () => {
    m.getCrmRegionMap.mockResolvedValue(regionMap([{ truncated: true }]))
    const response = await get("/api/admin/crm/region-map")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("force 는 파라미터 존재로 판정하고, 던지면 500(화면은 최근 확인한 분포를 유지)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    m.getCrmRegionMap.mockRejectedValue(new Error("지역 원천 조회가 제한되어 전체 분포를 확인하지 못했습니다."))
    const response = await get("/api/admin/crm/region-map?force=1")
    expect(m.getCrmRegionMap).toHaveBeenCalledWith({ force: true })
    expect(response.status).toBe(500)
  })
})

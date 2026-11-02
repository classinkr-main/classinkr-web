// GET /api/admin/hardware/sales-dashboard — 권한(브랜치 조회 역할)과 ?fy= 검사. 저장소 집계는 목으로 둔다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const { requireVerifiedAdminContext, getHardwareSalesDashboard } = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  getHardwareSalesDashboard: vi.fn(),
}))

vi.mock("@/lib/admin-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-auth")>()),
  requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/hardware-sales-dashboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/hardware-sales-dashboard")>()),
  getHardwareSalesDashboard,
}))

import { GET } from "@/app/api/admin/hardware/sales-dashboard/route"
import { BRANCH_READ_ADMIN_API_ROLES } from "@/lib/admin-auth"
import { currentSalesFy } from "@/lib/repositories/hardware-sales-dashboard"

const VIEWER = { source: "supabase", role: "VIEWER", name: "조회 담당", userId: "admin-1", capabilities: [] }

function request(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/hardware/sales-dashboard${query}`)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/admin/hardware/sales-dashboard", () => {
  it("브랜치 조회 역할로 게이트하고, 막히면 저장소를 부르지 않는다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

    const response = await GET(request("?fy=2026"))

    expect(response.status).toBe(401)
    expect(requireVerifiedAdminContext.mock.calls[0][1]).toBe(BRANCH_READ_ADMIN_API_ROLES)
    expect(getHardwareSalesDashboard).not.toHaveBeenCalled()
  })

  it("fy 가 없으면 현재 FY 로 읽고 비공개 캐시 헤더로 돌려준다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(VIEWER)
    getHardwareSalesDashboard.mockResolvedValue({ fy: 2026, groups: [] })

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(getHardwareSalesDashboard).toHaveBeenCalledWith(currentSalesFy(new Date()))
    expect(response.headers.get("cache-control")).toContain("private")
    expect(await response.json()).toEqual({ fy: 2026, groups: [] })
  })

  it("지정한 fy 를 넘긴다", async () => {
    requireVerifiedAdminContext.mockResolvedValue(VIEWER)
    getHardwareSalesDashboard.mockResolvedValue({ fy: 2024 })

    await GET(request("?fy=2024"))

    expect(getHardwareSalesDashboard).toHaveBeenCalledWith(2024)
  })

  it.each(["abc", "26", "2014", "9999", "2026-04"])("잘못된 fy(%s)는 400", async (fy) => {
    requireVerifiedAdminContext.mockResolvedValue(VIEWER)

    const response = await GET(request(`?fy=${encodeURIComponent(fy)}`))

    expect(response.status).toBe(400)
    expect(getHardwareSalesDashboard).not.toHaveBeenCalled()
  })

  it("집계가 실패하면 500 과 메시지", async () => {
    requireVerifiedAdminContext.mockResolvedValue(VIEWER)
    getHardwareSalesDashboard.mockRejectedValue(new Error("db down"))

    const response = await GET(request("?fy=2026"))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "db down" })
  })
})

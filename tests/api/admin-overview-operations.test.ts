import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), role: vi.fn(), demos: vi.fn(), hardware: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({
  requireVerifiedAdminContext: mocks.auth, hasAdminApiRole: mocks.role,
  BRANCH_READ_ADMIN_API_ROLES: ["ADMIN", "VIEWER"], CRM_STAFF_ADMIN_API_ROLES: ["ADMIN"],
}))
vi.mock("@/lib/compass/bridge", () => ({ getCompassDemos: mocks.demos }))
vi.mock("@/lib/repositories/hardware-inventory", () => ({ getPlannedHardwareMovements: mocks.hardware }))
import { GET } from "@/app/api/admin/overview/operations/route"

describe("GET /api/admin/overview/operations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ role: "ADMIN" })
    mocks.role.mockReturnValue(true)
    mocks.demos.mockResolvedValue({ rows: [], down: false })
    mocks.hardware.mockResolvedValue([])
  })

  it("미인증 요청은 원천을 읽기 전에 차단한다", async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    expect((await GET(new NextRequest("https://classin.co.kr/api/admin/overview/operations"))).status).toBe(401)
    expect(mocks.demos).not.toHaveBeenCalled()
    expect(mocks.hardware).not.toHaveBeenCalled()
  })

  it("CRM 권한 없는 읽기 사용자는 데모 원천을 조회하거나 전달받지 않는다", async () => {
    mocks.auth.mockResolvedValue({ role: "VIEWER" })
    mocks.role.mockReturnValue(false)
    const response = await GET(new NextRequest("https://classin.co.kr/api/admin/overview/operations"))
    expect(await response.json()).toMatchObject({ demos: { status: "forbidden", data: null }, installations: { status: "ready", data: { count: 0 } } })
    expect(mocks.demos).not.toHaveBeenCalled()
  })

  it("데모 장애를 0으로 바꾸지 않고 정상 하드웨어 지표는 유지하며 영속 캐시하지 않는다", async () => {
    mocks.demos.mockResolvedValue({ rows: [], down: true })
    const response = await GET(new NextRequest("https://classin.co.kr/api/admin/overview/operations"))
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(await response.json()).toMatchObject({ demos: { status: "error", data: null }, installations: { status: "ready", data: { count: 0 } } })
  })

  it("하드웨어 장애가 데모 원천을 끊지 않는다", async () => {
    mocks.hardware.mockRejectedValue(new Error("unavailable"))
    const response = await GET(new NextRequest("https://classin.co.kr/api/admin/overview/operations"))
    expect(await response.json()).toMatchObject({ demos: { status: "ready", data: { upcomingCount: 0 } }, installations: { status: "error", data: null } })
  })
})

vi.mock("@/lib/admin/data-owner", () => ({ dataOwnerFromRequest: async (url: URL) => url.searchParams.get("owner") === "" ? undefined : ["Somang"] }))

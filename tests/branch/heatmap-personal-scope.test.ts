import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  branchManagerFromRequest: vi.fn(),
  readRevDealsPreferActive: vi.fn(),
  computeHeatmap: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"],
  verifyAdmin: mocks.verifyAdmin,
}))
vi.mock("@/lib/admin/personal-branch", () => ({ branchManagerFromRequest: mocks.branchManagerFromRequest }))
vi.mock("@/lib/branch/personal-scope", () => ({ branchManagerMatches: (actual: string, expected: string) => actual === expected }))
vi.mock("@/lib/branch/read-rev-deals", () => ({ readRevDealsPreferActive: mocks.readRevDealsPreferActive }))
vi.mock("@/lib/branch/computations/heatmap", () => ({ computeHeatmap: mocks.computeHeatmap }))

describe("personal overview heatmap", () => {
  beforeEach(() => {
    mocks.verifyAdmin.mockReset().mockResolvedValue(null)
    mocks.branchManagerFromRequest.mockReset().mockResolvedValue("kim")
    mocks.readRevDealsPreferActive.mockReset().mockResolvedValue([{ manager: "kim" }, { manager: "park" }])
    mocks.computeHeatmap.mockReset().mockImplementation((deals: unknown[]) => deals)
  })

  it("인증된 담당자 데이터만 반환하고 브라우저에 캐시하지 않는다", async () => {
    const { GET } = await import("@/app/api/admin/branch/heatmap/route")
    const response = await GET(new NextRequest("https://classin.kr/api/admin/branch/heatmap?team=ALL&period=Y&manager=__me"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ rows: [{ manager: "kim" }] })
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(mocks.computeHeatmap.mock.calls[0][0]).toEqual([{ manager: "kim" }])
  })

  it("권한이 없으면 원천 조회를 시작하지 않는다", async () => {
    mocks.verifyAdmin.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }))
    const { GET } = await import("@/app/api/admin/branch/heatmap/route")
    const response = await GET(new NextRequest("https://classin.kr/api/admin/branch/heatmap?team=ALL&period=Y&manager=__me"))
    expect(response.status).toBe(403)
    expect(mocks.readRevDealsPreferActive).not.toHaveBeenCalled()
  })
})

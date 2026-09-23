import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const listVoidedHardwareMovements = vi.fn()
const getHardwareDashboard = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  BRANCH_READ_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "VIEWER"],
  HARDWARE_EDITOR_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  HARDWARE_FINALIZE_CAPABILITY: "hardware.finalize",
  hasAdminApiRole: () => true,
  hasAdminCapability: () => true,
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/hardware-inventory", () => ({
  getHardwareCustomerLinks: vi.fn(),
  getHardwareDashboard,
  getHardwareMovementsPage: vi.fn(),
  listVoidedHardwareMovements,
}))

// 하드웨어 라운드 2 L-1 — "취소 포함"이 켜질 때만 부르는 취소 기록 읽기. 대시보드를 다시 계산하지 않고, 캐시하지 않는다.
describe("GET /api/admin/hardware?scope=voided", () => {
  afterEach(() => vi.clearAllMocks())

  it("returns voided movements with their reason, uncached, without building the dashboard", async () => {
    requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "ops" })
    listVoidedHardwareMovements.mockResolvedValue({
      movements: [{ id: "m1", voided_at: "2026-09-23T01:00:00Z", void_reason: "시트 가져오기 우선(정책 §8-6)" }],
      limit: 500,
    })

    const { GET } = await import("@/app/api/admin/hardware/route")
    const response = await GET(new NextRequest("https://classin.kr/api/admin/hardware?scope=voided"))

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toContain("no-store")
    await expect(response.json()).resolves.toMatchObject({ limit: 500, movements: [{ id: "m1", void_reason: expect.stringContaining("시트") }] })
    expect(getHardwareDashboard).not.toHaveBeenCalled()
  })
})

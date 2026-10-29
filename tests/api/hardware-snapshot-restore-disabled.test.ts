import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

const { restore } = vi.hoisted(() => ({ restore: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({
  HARDWARE_EDITOR_ADMIN_API_ROLES: ["admin"],
  HARDWARE_FINALIZE_CAPABILITY: "hardware.finalize",
  requireVerifiedAdminContext: vi.fn(async () => ({ role: "admin", userId: "test" })),
  requireAdminCapability: vi.fn(() => null),
}))
vi.mock("@/lib/repositories/hardware-inventory", () => ({ restoreHardwareSheetImportSnapshot: restore }))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit: vi.fn() }))
vi.mock("@/lib/server/sync-cache-tags", () => ({ expireSyncCacheTags: vi.fn() }))

import { POST } from "@/app/api/admin/hardware/import-snapshots/[id]/restore/route"

describe("hardware snapshot restore guard", () => {
  it("권한이 있어도 검증 전에는 직접 API 호출이 실패하고 복원하지 않는다", async () => {
    const req = new NextRequest("https://classin.co.kr/api/admin/hardware/import-snapshots/test/restore", { method: "POST" })
    const response = await POST(req, { params: Promise.resolve({ id: "test" }) })
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ reason: "restore-unavailable" })
    expect(restore).not.toHaveBeenCalled()
  })
})

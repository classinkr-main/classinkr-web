import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const syncHw = vi.fn()
const importHardwareFromBranchSheets = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  HARDWARE_EDITOR_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/branch/sync/sync-hw", () => ({
  syncHw,
}))

vi.mock("@/lib/repositories/hardware-inventory", () => ({
  importHardwareFromBranchSheets,
}))

function importRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/hardware/import-sheet", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  })
}

describe("POST /api/admin/hardware/import-sheet", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("forces sheet sync before importing even when the request disables sync", async () => {
    requireVerifiedAdminContext.mockResolvedValue({
      source: "supabase",
      role: "ADMIN",
      name: "Ops Admin",
      userId: "admin-1",
    })
    syncHw.mockResolvedValue({ inbound: 1, outbound: 2, stock: 3, sales: 4 })
    importHardwareFromBranchSheets.mockResolvedValue({
      imported: 5,
      skipped: 0,
      runId: "run-1",
      snapshotId: "snapshot-1",
      snapshotChecksum: "checksum-1",
      snapshotCreatedAt: "2026-06-27T00:00:00.000Z",
    })

    const { POST } = await import("@/app/api/admin/hardware/import-sheet/route")
    const response = await POST(importRequest({ sync: false }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      sync: { inbound: 1, outbound: 2, stock: 3, sales: 4 },
      import: { imported: 5, snapshotId: "snapshot-1" },
    })
    expect(syncHw).toHaveBeenCalledTimes(1)
    expect(importHardwareFromBranchSheets).toHaveBeenCalledWith({ actor: "Ops Admin" })
    expect(syncHw.mock.invocationCallOrder[0]).toBeLessThan(
      importHardwareFromBranchSheets.mock.invocationCallOrder[0]
    )
  })
})

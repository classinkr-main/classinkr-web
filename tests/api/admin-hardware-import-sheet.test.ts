import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const runAll = vi.fn()
const importHardwareFromBranchSheets = vi.fn()
const findRunningHardwareImportRun = vi.fn()
const expireSyncCacheTags = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  HARDWARE_EDITOR_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/branch/sync/run-all", () => ({
  runAll,
}))

vi.mock("@/lib/repositories/hardware-inventory", () => ({
  importHardwareFromBranchSheets,
  findRunningHardwareImportRun,
}))

vi.mock("@/lib/server/sync-cache-tags", () => ({
  expireSyncCacheTags,
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

const ADMIN = { source: "supabase", role: "ADMIN", name: "Ops Admin", userId: "admin-1" }
const HW_SYNC = { inbound: 1, outbound: 2, stock: 3, sales: 4 }
const IMPORT_RESULT = {
  imported: 5,
  skipped: 0,
  runId: "run-1",
  snapshotId: "snapshot-1",
  snapshotChecksum: "checksum-1",
  snapshotCreatedAt: "2026-06-27T00:00:00.000Z",
  sheetWinsVoided: 0,
  sheetWinsKept: 0,
  sheetWinsError: null,
  runRecordError: null,
}

// 하드웨어 라운드 2 §4.1 — 가져오기 잠금 · runAll 잠금 · 결과 계약 · 즉시 만료.
describe("POST /api/admin/hardware/import-sheet", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("syncs the HW sheet through runAll before importing, even when the request disables sync", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    findRunningHardwareImportRun.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: true, hw: HW_SYNC })
    importHardwareFromBranchSheets.mockResolvedValue(IMPORT_RESULT)

    const { POST } = await import("@/app/api/admin/hardware/import-sheet/route")
    const response = await POST(importRequest({ sync: false }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: "done",
      ledgerChanged: true,
      sync: HW_SYNC,
      import: { imported: 5, snapshotId: "snapshot-1" },
    })
    expect(runAll).toHaveBeenCalledWith({ trigger: "manual", sources: ["hw"] })
    expect(importHardwareFromBranchSheets).toHaveBeenCalledWith({ actor: "Ops Admin", origin: "sheet" })
    expect(runAll.mock.invocationCallOrder[0]).toBeLessThan(importHardwareFromBranchSheets.mock.invocationCallOrder[0])
    // 미러 묶음(branchHw) 만료 뒤 원장 묶음(hardwareImport)을 즉시 만료한다 — 예전 "max"(SWR)는 직후 조회가 옛 값이었다.
    expect(expireSyncCacheTags).toHaveBeenNthCalledWith(1, "branchHw")
    expect(expireSyncCacheTags).toHaveBeenNthCalledWith(2, "hardwareImport")
  })

  it("does nothing and answers running while another import holds the lock", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    findRunningHardwareImportRun.mockResolvedValue({ id: "run-0", started_at: "2026-09-23T01:00:00.000Z" })

    const { POST } = await import("@/app/api/admin/hardware/import-sheet/route")
    const response = await POST(importRequest({}))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      outcome: "running",
      stage: "lock",
      startedAt: "2026-09-23T01:00:00.000Z",
      ledgerChanged: false,
    })
    expect(runAll).not.toHaveBeenCalled()
    expect(importHardwareFromBranchSheets).not.toHaveBeenCalled()
    expect(expireSyncCacheTags).not.toHaveBeenCalled()
  })

  it("does not import while a branch sync (cron or another tab) holds the runAll lock", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    findRunningHardwareImportRun.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, skipped: true, runningSince: "2026-09-23T02:00:00.000Z" })

    const { POST } = await import("@/app/api/admin/hardware/import-sheet/route")
    const response = await POST(importRequest({}))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ outcome: "running", startedAt: "2026-09-23T02:00:00.000Z" })
    expect(importHardwareFromBranchSheets).not.toHaveBeenCalled()
    expect(expireSyncCacheTags).not.toHaveBeenCalled()
  })

  it("skips the import and reports the sync stage when the sheet sync fails", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    findRunningHardwareImportRun.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: false, error: "hw: Sheets 403" })

    const { POST } = await import("@/app/api/admin/hardware/import-sheet/route")
    const response = await POST(importRequest({}))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      outcome: "failed",
      stage: "sync",
      ledgerChanged: false,
      error: "hw: Sheets 403",
    })
    expect(importHardwareFromBranchSheets).not.toHaveBeenCalled()
    // 실행 기록은 바뀌었으니 상태 묶음만 만료한다.
    expect(expireSyncCacheTags).toHaveBeenCalledWith("branchSyncStatus")
  })

  it("reports import-stage failure without claiming the ledger changed and still expires the dashboard", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    findRunningHardwareImportRun.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: true, hw: HW_SYNC })
    importHardwareFromBranchSheets.mockRejectedValue(new Error("replace rpc timeout"))

    const { POST } = await import("@/app/api/admin/hardware/import-sheet/route")
    const response = await POST(importRequest({}))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      outcome: "failed",
      stage: "import",
      ledgerChanged: false,
      error: "replace rpc timeout",
    })
    expect(expireSyncCacheTags).toHaveBeenCalledWith("hardwareImport")
  })

  it("carries review warnings (skipped rows, kept admin confirmations) on a successful import", async () => {
    requireVerifiedAdminContext.mockResolvedValue(ADMIN)
    findRunningHardwareImportRun.mockResolvedValue(null)
    runAll.mockResolvedValue({ ok: true, hw: HW_SYNC })
    importHardwareFromBranchSheets.mockResolvedValue({ ...IMPORT_RESULT, skipped: 3, sheetWinsKept: 1 })

    const { POST } = await import("@/app/api/admin/hardware/import-sheet/route")
    const response = await POST(importRequest({}))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.outcome).toBe("done")
    expect(body.warnings).toHaveLength(2)
    expect(body.warnings[0]).toContain("건너뛴 시트 행 3건")
  })
})

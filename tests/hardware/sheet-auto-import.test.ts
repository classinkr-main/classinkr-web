import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const syncHw = vi.hoisted(() => vi.fn())
const isAnyRunning = vi.hoisted(() => vi.fn())
const importIfChanged = vi.hoisted(() => vi.fn())
const isImportRunning = vi.hoisted(() => vi.fn())
const recordFailure = vi.hoisted(() => vi.fn())
const revalidateTag = vi.hoisted(() => vi.fn())

vi.mock("next/cache", () => ({ revalidateTag }))
vi.mock("@/lib/branch/sync/sync-hw", () => ({ syncHw }))
vi.mock("@/lib/repositories/branch-hw", () => ({ BRANCH_HW_CACHE_TAG: "branch-hw" }))
vi.mock("@/lib/repositories/branch-sync", () => ({ isAnyRunning }))
vi.mock("@/lib/repositories/hardware-inventory", () => ({
  importHardwareFromBranchSheetsIfChanged: importIfChanged,
  isHardwareSheetImportRunning: isImportRunning,
  recordHardwareSheetImportFailure: recordFailure,
}))

import {
  HARDWARE_SHEET_AUTO_IMPORT_ACTOR,
  isHardwareSheetAutoImportEnabled,
  runHardwareSheetAutoImport,
} from "@/lib/hardware/sheet-auto-import"

const ORIGINAL_ENV = { ...process.env }

const importedResult = {
  runId: "run-9",
  imported: 412,
  skipped: 2,
  snapshotId: "snap-9",
  snapshotChecksum: "c",
  snapshotCreatedAt: "2026-10-22T05:20:00Z",
  sheetWinsVoided: 1,
  sheetWinsKept: 0,
  sheetWinsError: null,
}

beforeEach(() => {
  process.env.CRON_SECRET = "cron-test-secret"
  delete process.env.HARDWARE_SHEET_AUTO_IMPORT
  for (const fn of [syncHw, isAnyRunning, importIfChanged, isImportRunning, recordFailure, revalidateTag]) fn.mockReset()
  isAnyRunning.mockResolvedValue(false)
  isImportRunning.mockResolvedValue(false)
  syncHw.mockResolvedValue({ inbound: 1, outbound: 2, stock: 3, sales: 4 })
  recordFailure.mockResolvedValue("run-failed")
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("isHardwareSheetAutoImportEnabled", () => {
  it("is on by default and turns off with 0/false/off", () => {
    expect(isHardwareSheetAutoImportEnabled({})).toBe(true)
    expect(isHardwareSheetAutoImportEnabled({ HARDWARE_SHEET_AUTO_IMPORT: "1" })).toBe(true)
    for (const value of ["0", "false", "OFF", " off "]) {
      expect(isHardwareSheetAutoImportEnabled({ HARDWARE_SHEET_AUTO_IMPORT: value })).toBe(false)
    }
  })
})

describe("runHardwareSheetAutoImport", () => {
  it("does nothing when switched off", async () => {
    process.env.HARDWARE_SHEET_AUTO_IMPORT = "0"

    await expect(runHardwareSheetAutoImport()).resolves.toEqual({ status: "disabled" })
    expect(isAnyRunning).not.toHaveBeenCalled()
    expect(syncHw).not.toHaveBeenCalled()
  })

  it("skips this hour while the daily branch sync is running", async () => {
    isAnyRunning.mockResolvedValue(true)

    await expect(runHardwareSheetAutoImport()).resolves.toEqual({ status: "busy", reason: "branch_sync_running" })
    expect(syncHw).not.toHaveBeenCalled()
  })

  it("skips this hour while a manual hardware import is running", async () => {
    isImportRunning.mockResolvedValue(true)

    await expect(runHardwareSheetAutoImport()).resolves.toEqual({ status: "busy", reason: "hardware_import_running" })
    expect(syncHw).not.toHaveBeenCalled()
  })

  it("records a failed run and stops when the sheet cannot be read", async () => {
    syncHw.mockRejectedValue(new Error("[branch/sheets] '3.출고 현황'!A1:Z failed after retries: 403"))

    const outcome = await runHardwareSheetAutoImport()

    expect(outcome).toMatchObject({ status: "failed", stage: "sheet_sync" })
    expect(recordFailure).toHaveBeenCalledWith(expect.stringMatching(/^시트 읽기 실패: .*403/), { trigger: "auto" })
    expect(importIfChanged).not.toHaveBeenCalled()
  })

  it("still reports the sheet failure when recording it fails too", async () => {
    syncHw.mockRejectedValue(new Error("timeout"))
    recordFailure.mockRejectedValue(new Error("db down"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(runHardwareSheetAutoImport()).resolves.toMatchObject({ status: "failed", stage: "sheet_sync", error: "timeout" })
  })

  it("reports unchanged without importing when the sheet matches the last import", async () => {
    importIfChanged.mockResolvedValue({ status: "unchanged", runId: "run-prev", sourceChecksum: "x", checkedAt: "2026-10-22T05:20:01Z" })

    const outcome = await runHardwareSheetAutoImport()

    expect(outcome).toEqual({ status: "unchanged", runId: "run-prev", checkedAt: "2026-10-22T05:20:01Z" })
    expect(importIfChanged).toHaveBeenCalledWith({ actor: HARDWARE_SHEET_AUTO_IMPORT_ACTOR })
    expect(revalidateTag).toHaveBeenCalledWith("branch-hw", "max")
  })

  it("returns import counts when the sheet changed", async () => {
    importIfChanged.mockResolvedValue({ status: "imported", sourceChecksum: "y", result: importedResult })

    await expect(runHardwareSheetAutoImport()).resolves.toEqual({
      status: "imported",
      runId: "run-9",
      imported: 412,
      skipped: 2,
      sheetWinsVoided: 1,
      sheetWinsKept: 0,
      sheetWinsError: null,
    })
  })

  it("reports an import-stage failure without hiding it", async () => {
    importIfChanged.mockRejectedValue({ message: "hardware sheet import snapshot does not match", code: "P0001" })

    await expect(runHardwareSheetAutoImport()).resolves.toEqual({
      status: "failed",
      stage: "import",
      error: "hardware sheet import snapshot does not match",
    })
  })
})

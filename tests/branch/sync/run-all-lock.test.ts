// 시트 고정(BRANCH_REV_SHEET_LOCKED_AT, D5) 중 runAll — 크론·수동은 REV 대신 DSH·KPI(+HW)만, 관리자 스냅샷 다시 읽기만 REV.
// 시트·DB 는 전부 목(run-all-write-guard.test.ts 와 같은 방식). 회계연도는 KST 업무일(F-26).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BRANCH_SYNC_NONPROD_WRITE_FLAG } from "@/lib/branch/sync/write-guard"

const syncRev = vi.fn()
const syncDshKpi = vi.fn()
const syncHw = vi.fn()
const recaptureActiveRevImport = vi.fn()
const startSyncRun = vi.fn(async () => "run-1")
const finishSyncRun = vi.fn(async () => undefined)
const findActiveSyncRun = vi.fn(async (): Promise<{ id: string; started_at: string } | null> => null)

vi.mock("server-only", () => ({}))
vi.mock("@/lib/branch/sync/sync-rev", () => ({ syncRev, syncDshKpi }))
vi.mock("@/lib/branch/sync/sync-hw", () => ({ syncHw }))
vi.mock("@/lib/repositories/sales-ledger-rev-import", () => ({ recaptureActiveRevImport }))
vi.mock("@/lib/repositories/branch-sync", () => ({ startSyncRun, finishSyncRun, findActiveSyncRun }))

const HW = { inbound: 1, outbound: 2, stock: 3, sales: 4 }

function stub(lockedAt: string, now: string, env: Record<string, string> = { VERCEL_ENV: "production" }) {
  vi.stubEnv("VERCEL_ENV", "")
  vi.stubEnv(BRANCH_SYNC_NONPROD_WRITE_FLAG, "")
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  vi.stubEnv("BRANCH_REV_SHEET_LOCKED_AT", lockedAt)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(now))
}

describe("runAll — 시트 고정", () => {
  beforeEach(() => {
    syncRev.mockResolvedValue({ rows: 385 })
    syncDshKpi.mockResolvedValue({ rows: 40 })
    syncHw.mockResolvedValue(HW)
    recaptureActiveRevImport.mockResolvedValue({ status: "captured", runId: "r", capturedAt: "2026-12-01T00:00:00Z", lineCount: 385 })
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it("고정 날짜(KST) 크론 — REV 파싱·재캡처 없이 DSH·KPI·HW 만, 기록은 dsh+hw", async () => {
    stub("2026-12-01", "2026-12-01T00:00:00Z") // KST 12-01 09:00 첫 크론
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "cron" })

    expect(syncRev).not.toHaveBeenCalled()
    expect(recaptureActiveRevImport).not.toHaveBeenCalled()
    expect(syncDshKpi).toHaveBeenCalledWith({ refFy: 2026 })
    expect(syncHw).toHaveBeenCalledTimes(1)
    expect(startSyncRun).toHaveBeenCalledWith("dsh+hw", "cron", expect.objectContaining({ env: "production" }))
    expect(result).toMatchObject({
      ok: true,
      rev: 0,
      dsh: 40,
      dshOk: true,
      hw: HW,
      ranSources: ["dsh", "hw"],
      revSheetLock: { lockedAt: "2026-12-01", reread: false },
    })
    expect(result.revOk).toBeUndefined()
    expect(result.revImport).toBeUndefined()
    expect(finishSyncRun).toHaveBeenCalledWith("run-1", { status: "success", rows_affected: 40 + 10 })
  })

  it("수동 ['rev'](CRM 딜·매출시트) → dsh 만, 기록 dsh", async () => {
    stub("2026-12-01", "2026-12-03T03:00:00Z")
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "manual", sources: ["rev"] })

    expect(syncRev).not.toHaveBeenCalled()
    expect(syncHw).not.toHaveBeenCalled()
    expect(startSyncRun).toHaveBeenCalledWith("dsh", "manual", expect.anything())
    expect(result.ranSources).toEqual(["dsh"])
  })

  it("장부 버튼 ['rev','hw'] → dsh+hw", async () => {
    stub("2026-12-01", "2026-12-03T03:00:00Z")
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "manual", sources: ["rev", "hw"] })

    expect(startSyncRun).toHaveBeenCalledWith("dsh+hw", "manual", expect.anything())
    expect(result.ranSources).toEqual(["dsh", "hw"])
  })

  it("관리자 스냅샷 다시 읽기 — REV 를 읽고 재캡처, 기록 rev, 회계연도는 고정 날짜의 것", async () => {
    // 2027-04-01 01:00 KST — KST 회계연도는 2027 이지만 12/1 스냅샷은 FY2026 으로 다시 읽는다.
    stub("2026-12-01", "2027-03-31T16:00:00Z")
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "manual", sources: ["rev"], allowLockedRevRead: true })

    expect(syncRev).toHaveBeenCalledWith({ refFy: 2026 })
    expect(syncDshKpi).not.toHaveBeenCalled()
    // 재캡처도 같은 회계연도로 저장·활성화한다 — 4월 뒤에 다시 읽어도 FY26-27 스냅샷이 FY27-28 로 가지 않게(F-26).
    expect(recaptureActiveRevImport).toHaveBeenCalledWith("sync:manual", { fiscalYear: 2026 })
    expect(startSyncRun).toHaveBeenCalledWith("rev", "manual", expect.anything())
    expect(result).toMatchObject({ ok: true, revOk: true, ranSources: ["rev"], revSheetLock: { lockedAt: "2026-12-01", reread: true } })
  })

  it("고정 예정(날짜 전)은 지금 그대로 — REV·HW, 기록 all, revSheetLock 없음", async () => {
    stub("2026-12-01", "2026-11-30T08:00:00Z") // KST 11-30 17:00 마지막 자동 REV 읽기
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "cron" })

    expect(syncRev).toHaveBeenCalledWith({ refFy: 2026 })
    expect(syncDshKpi).not.toHaveBeenCalled()
    expect(recaptureActiveRevImport).toHaveBeenCalledWith("sync:cron", { fiscalYear: 2026 })
    expect(startSyncRun).toHaveBeenCalledWith("all", "cron", expect.anything())
    expect(result.revSheetLock).toBeUndefined()
    expect(result.ranSources).toEqual(["rev", "hw"])
  })

  it("형식이 틀린 값은 지금 그대로(경고만)", async () => {
    stub("12/1", "2026-12-03T03:00:00Z")
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "cron" })

    expect(syncRev).toHaveBeenCalledTimes(1)
    expect(startSyncRun).toHaveBeenCalledWith("all", "cron", expect.anything())
    expect(result.revSheetLock).toBeUndefined()
  })

  it("고정 전 수동 스냅샷 다시 읽기 표시는 아무것도 바꾸지 않는다", async () => {
    stub("", "2026-11-25T03:00:00Z")
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "manual", sources: ["rev"], allowLockedRevRead: true })

    expect(syncRev).toHaveBeenCalledWith({ refFy: 2026 })
    expect(startSyncRun).toHaveBeenCalledWith("rev", "manual", expect.anything())
    expect(result.revSheetLock).toBeUndefined()
  })

  it("Preview 는 플래그 없이 고정 판정보다 먼저 건너뛴다", async () => {
    stub("2026-12-01", "2026-12-03T03:00:00Z", { VERCEL_ENV: "preview" })
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "cron" })

    expect(result).toMatchObject({ ok: false, skipped: true, outcome: "skipped" })
    expect(startSyncRun).not.toHaveBeenCalled()
    expect(syncDshKpi).not.toHaveBeenCalled()
  })

  it("DSH·KPI 가 실패해도 HW 는 돈다 — 오류는 'rev: [DSH·KPI] …'(연속 실패 키는 스프레드시트)", async () => {
    stub("2026-12-01", "2026-12-03T03:00:00Z")
    syncDshKpi.mockRejectedValue(new Error("The caller does not have permission"))
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "cron" })

    expect(syncHw).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ ok: false, dshOk: false, hw: HW, ranSources: ["dsh", "hw"] })
    expect(result.error).toBe("rev: [DSH·KPI] The caller does not have permission")
    expect(finishSyncRun).toHaveBeenCalledWith("run-1", expect.objectContaining({ status: "failed" }))
  })

  it("고정이 없어도 회계연도는 KST 업무일 — 2027-04-01 0시 KST 이후 크론은 FY2027(F-26)", async () => {
    stub("", "2027-03-31T15:05:00Z")
    const { runAll } = await import("@/lib/branch/sync/run-all")

    await runAll({ trigger: "cron" })

    expect(syncRev).toHaveBeenCalledWith({ refFy: 2027 })
  })
})

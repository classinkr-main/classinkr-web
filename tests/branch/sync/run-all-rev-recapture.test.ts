// P0(2026-09-11) — 동기화 성공 직후 서버가 REV 장부 임포트를 재캡처한다.
// 예전에는 매출 장부 화면의 "새로고침"만 재캡처를 이어 붙였고, 크론·KR Team·CRM 동기화는
// 시트 미러만 갱신했다. 액티브 임포트가 서빙 원천이라 그 경로들로는 화면이 안 바뀌었다
// (7/16 스테일 임포트 사고의 구조). 이제 runAll 한 곳에서 처리해 모든 트리거가 같게 동작한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const syncRev = vi.fn()
const syncHw = vi.fn()
const recaptureActiveRevImport = vi.fn()
const startSyncRun = vi.fn(async () => "run-1")
const finishSyncRun = vi.fn(async () => undefined)
const findRunningSyncRun = vi.fn(
  async (): Promise<{ id: string; started_at: string; source: string; trigger: string } | null> => null,
)

vi.mock("server-only", () => ({}))
vi.mock("@/lib/branch/sync/sync-rev", () => ({ syncRev }))
vi.mock("@/lib/branch/sync/sync-hw", () => ({ syncHw }))
vi.mock("@/lib/repositories/sales-ledger-rev-import", () => ({ recaptureActiveRevImport }))
vi.mock("@/lib/repositories/branch-sync", () => ({ startSyncRun, finishSyncRun, findRunningSyncRun }))

const HW = { inbound: 1, outbound: 2, stock: 3, sales: 4 }

describe("runAll — REV 장부 임포트 자동 재캡처", () => {
  beforeEach(() => {
    syncRev.mockResolvedValue({ rows: 385 })
    syncHw.mockResolvedValue(HW)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("REV 동기화가 성공하면 트리거 이름으로 재캡처하고 결과를 싣는다", async () => {
    recaptureActiveRevImport.mockResolvedValue({
      status: "captured", runId: "run-new", capturedAt: "2026-09-11T08:38:00Z", lineCount: 385,
    })
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "cron" })

    expect(recaptureActiveRevImport).toHaveBeenCalledWith("sync:cron")
    expect(result.ok).toBe(true)
    expect(result.revOk).toBe(true)
    expect(result.revImport).toEqual(expect.objectContaining({ status: "captured", runId: "run-new" }))
    expect(finishSyncRun).toHaveBeenCalledWith("run-1", expect.objectContaining({ status: "success" }))
  })

  it("REV 동기화가 실패하면 재캡처하지 않는다 — 옛 미러를 다시 굳힐 이유가 없다", async () => {
    syncRev.mockRejectedValue(new Error("The caller does not have permission"))
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "cron" })

    expect(recaptureActiveRevImport).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.revOk).toBe(false)
    expect(result.error).toContain("rev: The caller does not have permission")
  })

  it("재캡처가 실패해도 동기화 성공은 유지하고 경고로 알린다", async () => {
    recaptureActiveRevImport.mockRejectedValue(new Error("line 삽입 실패"))
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "manual" })

    expect(result.ok).toBe(true)
    expect(result.revImport).toBeUndefined()
    expect(result.revImportError).toBe("line 삽입 실패")
    expect(result.warnings?.some((w) => w.includes("장부 임포트 재캡처 실패") && w.includes("line 삽입 실패"))).toBe(true)
  })

  it("hw만 동기화하면 재캡처하지 않는다", async () => {
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "manual", sources: ["hw"] })

    expect(recaptureActiveRevImport).not.toHaveBeenCalled()
    expect(result.revOk).toBeUndefined()
    expect(result.ok).toBe(true)
  })
})

// 라운드 5 S-1 — 잠금에 걸리면(10분 안에 시작한 running 실행이 있으면) 아무것도 하지 않고
// 그 실행의 시작 시각을 싣는다. 버튼 화면이 "완료" 대신 "N분 전 시작한 동기화가 도는 중"을 말하는 근거.
describe("runAll — 실행 잠금(skipped)", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("잠금을 잡은 실행이 있으면 startSyncRun 없이 skipped와 runningSince를 돌려준다", async () => {
    findRunningSyncRun.mockResolvedValueOnce({
      id: "run-locked", started_at: "2026-09-23T08:00:00Z", source: "all", trigger: "cron",
    })
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "manual", sources: ["rev"] })

    expect(result).toEqual({ ok: false, skipped: true, runningSince: "2026-09-23T08:00:00Z" })
    expect(startSyncRun).not.toHaveBeenCalled()
    expect(syncRev).not.toHaveBeenCalled()
  })
})

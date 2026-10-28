// 2026-10-28 — runAll 진입 시 쓰기 가드. 크론(app/api/cron/sync-branch)·수동(app/api/admin/branch/sync) 라우트가
// 모두 runAll 을 타므로 가드는 여기 한 곳이다. 운영이 아니면 잠금 조회·런 기록·시트 읽기·미러 교체·재캡처
// 어느 것도 하지 않고 skipped 결과 계약(lib/admin/sync-outcome.ts)으로 돌아간다. 운영이거나 플래그가 있으면
// 돌리되, 런 기록(startSyncRun)에 어느 환경·배포·커밋이 썼는지 runtime 으로 넘긴다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BRANCH_SYNC_NONPROD_WRITE_FLAG } from "@/lib/branch/sync/write-guard"
import { describeSyncOutcome } from "@/lib/admin/sync-outcome"

const syncRev = vi.fn()
const syncHw = vi.fn()
const recaptureActiveRevImport = vi.fn()
const startSyncRun = vi.fn(async () => "run-1")
const finishSyncRun = vi.fn(async () => undefined)
const isAnyRunning = vi.fn(async () => false)

vi.mock("server-only", () => ({}))
vi.mock("@/lib/branch/sync/sync-rev", () => ({ syncRev }))
vi.mock("@/lib/branch/sync/sync-hw", () => ({ syncHw }))
vi.mock("@/lib/repositories/sales-ledger-rev-import", () => ({ recaptureActiveRevImport }))
vi.mock("@/lib/repositories/branch-sync", () => ({ startSyncRun, finishSyncRun, isAnyRunning }))

const HW = { inbound: 1, outbound: 2, stock: 3, sales: 4 }

function stubVercel(env: string | undefined, extra: Record<string, string> = {}) {
  vi.stubEnv("VERCEL_ENV", env ?? "")
  vi.stubEnv(BRANCH_SYNC_NONPROD_WRITE_FLAG, "")
  vi.stubEnv("VERCEL_DEPLOYMENT_ID", "")
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "")
  vi.stubEnv("VERCEL_REGION", "")
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value)
}

describe("runAll — 운영 밖 쓰기 가드", () => {
  beforeEach(() => {
    syncRev.mockResolvedValue({ rows: 385 })
    syncHw.mockResolvedValue(HW)
    recaptureActiveRevImport.mockResolvedValue({ status: "inactive" })
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("preview 배포는 플래그 없이 건너뛴다 — DB·시트를 한 번도 건드리지 않는다", async () => {
    stubVercel("preview", { VERCEL_DEPLOYMENT_ID: "dpl_preview" })
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "manual" })

    expect(result).toEqual({
      ok: false,
      skipped: true,
      outcome: "skipped",
      outcomeReason: expect.stringContaining("운영 환경이 아니라 동기화 쓰기를 건너뜁니다"),
    })
    expect(isAnyRunning).not.toHaveBeenCalled()
    expect(startSyncRun).not.toHaveBeenCalled()
    expect(finishSyncRun).not.toHaveBeenCalled()
    expect(syncRev).not.toHaveBeenCalled()
    expect(syncHw).not.toHaveBeenCalled()
    expect(recaptureActiveRevImport).not.toHaveBeenCalled()
  })

  it("로컬(VERCEL_ENV 없음)도 건너뛰고, 화면은 잠금(running)이 아니라 건너뜀 사유를 보여 준다", async () => {
    stubVercel(undefined)
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "manual", sources: ["rev"] })

    expect(result.skipped).toBe(true)
    expect(result.outcome).toBe("skipped")
    // 화면 4곳이 쓰는 describeSyncOutcome — outcome 을 명시하지 않으면 skipped=true 가 "이미 진행 중"으로 읽힌다.
    const notice = describeSyncOutcome(result)
    expect(notice.tone).toBe("info")
    expect(notice.message).toContain("운영 환경이 아니라 동기화 쓰기를 건너뜁니다")
    expect(notice.message).toContain("환경: local")
    expect(notice.message).not.toContain("이미 동기화가 진행 중")
  })

  it("크론 트리거도 같은 가드를 탄다 — 비운영 크론 호출은 실패가 아니라 건너뜀이다", async () => {
    stubVercel("development")
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "cron" })

    expect(result).toMatchObject({ ok: false, skipped: true, outcome: "skipped" })
    expect(result.error).toBeUndefined()
    expect(startSyncRun).not.toHaveBeenCalled()
  })

  it("운영은 돌리고, 런 기록에 환경·배포·커밋·리전·근거를 runtime 으로 넘긴다", async () => {
    stubVercel("production", {
      VERCEL_DEPLOYMENT_ID: "dpl_prod1",
      VERCEL_GIT_COMMIT_SHA: "e28b23f",
      VERCEL_REGION: "icn1",
    })
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "cron" })

    expect(result.ok).toBe(true)
    expect(result.outcome).toBeUndefined()
    expect(startSyncRun).toHaveBeenCalledWith("all", "cron", {
      env: "production",
      deploymentId: "dpl_prod1",
      sha: "e28b23f",
      region: "icn1",
      allowedBy: "production",
    })
    expect(syncRev).toHaveBeenCalledTimes(1)
    expect(syncHw).toHaveBeenCalledTimes(1)
    expect(finishSyncRun).toHaveBeenCalledWith("run-1", expect.objectContaining({ status: "success" }))
  })

  it("플래그가 있으면 비운영도 돌리되 근거를 nonprod-flag 로 남긴다 — 나중에 가려낼 수 있게", async () => {
    stubVercel(undefined, { [BRANCH_SYNC_NONPROD_WRITE_FLAG]: "1" })
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "manual", sources: ["rev"] })

    expect(result.ok).toBe(true)
    expect(startSyncRun).toHaveBeenCalledWith(
      "rev",
      "manual",
      expect.objectContaining({ env: "local", allowedBy: "nonprod-flag" }),
    )
    expect(syncRev).toHaveBeenCalledTimes(1)
  })

  it("가드가 허용한 뒤에는 기존 잠금 건너뜀 계약(outcome 없음)이 그대로다", async () => {
    stubVercel("production")
    isAnyRunning.mockResolvedValueOnce(true)
    const { runAll } = await import("@/lib/branch/sync/run-all")

    const result = await runAll({ trigger: "manual" })

    expect(result).toEqual({ ok: false, skipped: true })
    expect(startSyncRun).not.toHaveBeenCalled()
  })
})

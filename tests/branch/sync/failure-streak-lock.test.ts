// 시트 고정 뒤 실행 기록 "dsh"·"dsh+hw" 의 연속 실패 판정 — DSH·KPI 성공이 매출 시트("rev" 키)의 성공이고,
// DSH 만 돈 런이 HW 연속 실패를 지우지 않는다(F4: 새 값을 가르치지 않으면 하위 호환 갈래가 "all" 로 읽는다).
import { describe, expect, it } from "vitest"

import { computeSyncFailureStreak, syncRunCoversSource, type SyncRunLike } from "@/lib/branch/sync/failure-streak"

function run(startedAt: string, status: SyncRunLike["status"], source: string, error: string | null = null): SyncRunLike {
  return { started_at: startedAt, status, error, source, trigger: "cron" }
}

describe("syncRunCoversSource — dsh·dsh+hw", () => {
  it("dsh 는 매출 시트(rev 키)만, dsh+hw 는 둘 다", () => {
    expect(syncRunCoversSource({ source: "dsh" }, "rev")).toBe(true)
    expect(syncRunCoversSource({ source: "dsh" }, "hw")).toBe(false)
    expect(syncRunCoversSource({ source: "dsh+hw" }, "rev")).toBe(true)
    expect(syncRunCoversSource({ source: "dsh+hw" }, "hw")).toBe(true)
  })
})

describe("computeSyncFailureStreak — 고정 뒤 기록", () => {
  it("DSH 만 돈 성공은 HW 연속 실패를 지우지 않는다", () => {
    const runs = [
      run("2026-12-02T04:00:00Z", "success", "dsh"),
      run("2026-12-02T00:00:00Z", "failed", "dsh+hw", "hw: boom"),
      run("2026-12-01T08:00:00Z", "success", "dsh+hw"),
    ]
    expect(computeSyncFailureStreak(runs, "hw")).toMatchObject({ failedRuns: 1, lastSuccessAt: "2026-12-01T08:00:00Z" })
    expect(computeSyncFailureStreak(runs, "rev")).toMatchObject({ failedRuns: 0, lastSuccessAt: "2026-12-02T04:00:00Z" })
  })

  it("all 런이 hw 로 실패한 뒤 dsh+hw 성공은 두 원천 모두 0 — rev 는 그 all 런부터 성공이다", () => {
    const runs = [
      run("2026-12-01T00:00:00Z", "success", "dsh+hw"),
      run("2026-11-30T08:00:00Z", "failed", "all", "hw: boom"),
    ]
    expect(computeSyncFailureStreak(runs, "rev").failedRuns).toBe(0)
    expect(computeSyncFailureStreak(runs, "hw").failedRuns).toBe(0)
  })

  it("DSH·KPI 실패('rev: [DSH·KPI] …')는 매출 시트 실패로 세고 HW 는 성공", () => {
    const runs = [
      run("2026-12-03T00:00:00Z", "failed", "dsh+hw", "rev: [DSH·KPI] The caller does not have permission"),
      run("2026-12-02T08:00:00Z", "failed", "dsh+hw", "rev: [DSH·KPI] The caller does not have permission"),
      run("2026-12-01T08:00:00Z", "success", "dsh+hw"),
    ]
    expect(computeSyncFailureStreak(runs, "rev")).toMatchObject({
      failedRuns: 2,
      failedDays: 2,
      lastError: "rev: [DSH·KPI] The caller does not have permission",
    })
    expect(computeSyncFailureStreak(runs, "hw").failedRuns).toBe(0)
  })

  it("REV 를 읽지 않는 고정 기간에도 DSH 성공이 이어지면 매출 시트 마지막 성공이 따라온다(멈춤으로 보이지 않는다)", () => {
    const runs = [
      run("2026-12-05T08:00:00Z", "success", "dsh+hw"),
      run("2026-12-05T04:00:00Z", "success", "dsh+hw"),
      run("2026-11-30T08:00:00Z", "success", "all"),
    ]
    expect(computeSyncFailureStreak(runs, "rev").lastSuccessAt).toBe("2026-12-05T08:00:00Z")
  })
})

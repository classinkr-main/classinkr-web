// P0(2026-09-11) — 동기화 연속 실패 판정. 2026-08-28~09-10 REV 동기화가 매일 403으로
// 실패했는데 화면 배지만 있어 14일간 아무도 복구하지 않았다. 소스별(rev/hw)로 몇 일째
// 실패 중인지 계산하고, 2일째에 한 번, 이후 3일마다 운영방에 다시 알린다.
import { describe, expect, it } from "vitest"

import {
  buildSyncFailureAlert,
  computeSyncFailureStreak,
  shouldAlertSyncFailureStreak,
  type SyncRunLike,
} from "@/lib/branch/sync/failure-streak"

const PERMISSION = "rev: [branch/sheets] '2. REV'!A1:CF1000 failed after retries: Error: The caller does not have permission"

function run(startedAt: string, status: SyncRunLike["status"], error: string | null = null): SyncRunLike {
  return { started_at: startedAt, status, error, source: "all" }
}

describe("computeSyncFailureStreak", () => {
  it("counts distinct KST days of failures back to the last success for that source", () => {
    const runs = [
      run("2026-09-10T08:38:00Z", "failed", PERMISSION),
      run("2026-09-09T08:38:00Z", "failed", PERMISSION),
      run("2026-09-09T01:00:00Z", "failed", PERMISSION), // 같은 KST 날(09-09) 수동 재시도
      run("2026-08-18T02:30:52Z", "success"),
      run("2026-08-17T08:38:00Z", "failed", PERMISSION),
    ]
    const streak = computeSyncFailureStreak(runs, "rev")
    expect(streak.failedRuns).toBe(3)
    expect(streak.failedDays).toBe(2)
    expect(streak.lastSuccessAt).toBe("2026-08-18T02:30:52Z")
    expect(streak.lastError).toBe(PERMISSION)
    expect(streak.truncated).toBe(false)
  })

  it("treats a run where only the other source failed as a success for this source", () => {
    const runs = [
      run("2026-09-10T08:38:00Z", "failed", "hw: boom"),
      run("2026-09-09T08:38:00Z", "failed", PERMISSION),
    ]
    expect(computeSyncFailureStreak(runs, "rev").failedDays).toBe(0)
    expect(computeSyncFailureStreak(runs, "hw").failedDays).toBe(1)
  })

  it("counts an unprefixed whole-run failure against every source", () => {
    const runs = [run("2026-09-10T08:38:00Z", "failed", "connection reset")]
    expect(computeSyncFailureStreak(runs, "rev").failedDays).toBe(1)
    expect(computeSyncFailureStreak(runs, "hw").failedDays).toBe(1)
  })

  it("splits combined errors and ignores running rows; sorts input defensively", () => {
    const runs = [
      run("2026-09-09T08:38:00Z", "failed", `${PERMISSION} | hw: boom`),
      run("2026-09-10T08:38:00Z", "running"),
      run("2026-09-10T07:00:00Z", "failed", PERMISSION),
    ]
    const streak = computeSyncFailureStreak(runs, "rev")
    expect(streak.failedDays).toBe(2)
    expect(streak.lastFailureAt).toBe("2026-09-10T07:00:00Z")
    expect(streak.truncated).toBe(true) // 성공 행을 못 만남 — 창보다 오래 실패 중일 수 있다
    expect(streak.lastSuccessAt).toBeNull()
  })

  it("uses the KST calendar day, not UTC (23:30 UTC is the next KST day)", () => {
    const runs = [
      run("2026-09-09T23:30:00Z", "failed", PERMISSION), // KST 09-10
      run("2026-09-09T02:00:00Z", "failed", PERMISSION), // KST 09-09
      run("2026-09-08T01:00:00Z", "success"),
    ]
    expect(computeSyncFailureStreak(runs, "rev").failedDays).toBe(2)
  })
})

describe("shouldAlertSyncFailureStreak", () => {
  it("alerts on day 2, then every 3 days", () => {
    const alerted = [0, 1, 2, 3, 4, 5, 6, 7, 8, 14].filter(shouldAlertSyncFailureStreak)
    expect(alerted).toEqual([2, 5, 8, 14])
  })
})

describe("buildSyncFailureAlert", () => {
  it("names the source, the duration, and the re-share fix for permission errors", () => {
    const streak = computeSyncFailureStreak(
      [
        run("2026-09-10T08:38:00Z", "failed", PERMISSION),
        run("2026-09-09T08:38:00Z", "failed", PERMISSION),
        run("2026-08-18T02:30:52Z", "success"),
      ],
      "rev",
    )
    const alert = buildSyncFailureAlert(streak, {
      now: new Date("2026-09-10T08:40:00Z"),
      serviceAccountEmail: "classin-admin@classin-home.iam.gserviceaccount.com",
    })
    expect(alert.title).toContain("매출 시트")
    expect(alert.title).toContain("2일째")
    expect(alert.message).toContain("마지막 성공 2026-08-18")
    expect(alert.message).toContain("23일 전")
    expect(alert.message).toContain("classin-admin@classin-home.iam.gserviceaccount.com")
    expect(alert.message).toContain("뷰어")
  })

  it("omits the re-share hint for non-permission errors and says when history is truncated", () => {
    const streak = computeSyncFailureStreak(
      [run("2026-09-10T08:38:00Z", "failed", "hw: timeout"), run("2026-09-09T08:38:00Z", "failed", "hw: timeout")],
      "hw",
    )
    const alert = buildSyncFailureAlert(streak, { now: new Date("2026-09-10T08:40:00Z") })
    expect(alert.title).toContain("하드웨어 시트")
    expect(alert.message).not.toContain("뷰어")
    expect(alert.message).toContain("최근 기록에 성공 없음")
  })
})

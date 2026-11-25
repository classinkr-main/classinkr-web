// 시트 고정(D5) 중 동기화 건강 — REV 는 "12/1 고정"으로 보이고 멈춤·실패 띠가 되지 않는다. 판정은 DSH·KPI 런으로 한다.
import { describe, expect, it } from "vitest"

import {
  computeBranchSourceHealth,
  describeHealthySyncSource,
  describeSyncSourceHealth,
  type BranchSyncRunRow,
} from "@/lib/admin/sync-health"
import { resolveRevSheetLock } from "@/lib/branch/rev-sheet-lock"
import { getSyncFreshness } from "@/lib/crm/sync-freshness"

const NOW = Date.parse("2026-12-05T09:00:00Z") // KST 12-05 18:00
const ACTIVE = resolveRevSheetLock("2026-12-01", "2026-12-05")
const UNSET = resolveRevSheetLock(undefined, "2026-12-05")

function branchRun(startedAt: string, status: "success" | "failed", source: string, error: string | null = null): BranchSyncRunRow {
  return { started_at: startedAt, status, error, source, trigger: "cron" }
}

// 마지막 REV 읽기(all)는 11-30 — 고정 뒤에는 dsh+hw 만 돈다.
const RUNS = [
  branchRun("2026-12-05T08:00:00Z", "success", "dsh+hw"),
  branchRun("2026-12-05T04:00:00Z", "success", "dsh+hw"),
  branchRun("2026-11-30T08:00:00Z", "success", "all"),
]

describe("computeBranchSourceHealth — 시트 고정 중", () => {
  it("DSH·HW 런만 있어도 KR Team 시트는 ok 이고 REV 자리에 '12/1 고정'을 싣는다", () => {
    const sheets = computeBranchSourceHealth(RUNS, "sheets", NOW, ACTIVE)
    expect(sheets.state).toBe("ok")
    expect(sheets.lastSuccessAt).toBe("2026-12-05T08:00:00Z")
    expect(sheets.revFrozen).toEqual({ lockedAt: "2026-12-01", label: "12/1 고정" })
    expect(describeSyncSourceHealth(sheets, NOW)).toBeNull()
    expect(describeHealthySyncSource(sheets, NOW)).toContain("REV는 12/1 고정")
  })

  it("하드웨어에는 고정 라벨이 없다", () => {
    const hw = computeBranchSourceHealth(RUNS, "hw", NOW, ACTIVE)
    expect(hw.state).toBe("ok")
    expect(hw.revFrozen).toBeUndefined()
  })

  it("고정 전에는 지금 그대로 — 라벨 없음", () => {
    const sheets = computeBranchSourceHealth(RUNS, "sheets", NOW, UNSET)
    expect(sheets.revFrozen).toBeUndefined()
    expect(describeHealthySyncSource(sheets, NOW)).not.toContain("고정")
  })

  it("DSH·KPI 가 실제로 멈추면 그것은 경고한다 — 이름은 지금 읽는 탭(DSH·KPI)으로, REV 는 고정이라고 덧붙인다", () => {
    const stale = computeBranchSourceHealth([branchRun("2026-12-01T00:00:00Z", "success", "dsh+hw")], "sheets", NOW, ACTIVE)
    expect(stale.state).toBe("stale")
    const copy = describeSyncSourceHealth(stale, NOW)!
    expect(copy.headline).toContain("KR Team 시트(DSH·KPI)")
    expect(copy.headline).not.toContain("REV·DSH·KPI")
    expect(copy.asOf).toContain("시트(DSH·KPI) 수치는 그 시점 값")
    expect(copy.asOf).toContain("REV는 12/1 고정")
  })

  it("DSH·KPI 실패는 실패 띠 — 오류 분류는 지금과 같다", () => {
    const failing = computeBranchSourceHealth(
      [
        branchRun("2026-12-05T08:00:00Z", "failed", "dsh+hw", "rev: [DSH·KPI] The caller does not have permission"),
        ...RUNS.slice(1),
      ],
      "sheets",
      NOW,
      ACTIVE,
    )
    expect(failing.state).toBe("failing")
    expect(failing.failureClass).toBe("permission")
    const copy = describeSyncSourceHealth(failing, NOW)!
    expect(copy.headline).toBe("KR Team 시트(DSH·KPI) 동기화가 권한 오류로 1회 연속 실패")
    expect(JSON.stringify(copy)).not.toContain("The caller")
  })
})

describe("getSyncFreshness — 고정 라벨", () => {
  it("frozenLabel 을 넘기면 오래돼도 stale 이 아니고 상대시간 대신 라벨을 싣는다", () => {
    const old = "2026-11-30T08:00:00Z"
    expect(getSyncFreshness(old, 36, NOW)).toMatchObject({ stale: true })
    expect(getSyncFreshness(old, 36, NOW, { frozenLabel: "12/1 고정" })).toEqual({
      hours: (NOW - Date.parse(old)) / 3_600_000,
      stale: false,
      relativeLabel: "12/1 고정",
    })
    // 빈 라벨은 넘기지 않은 것과 같다.
    expect(getSyncFreshness(old, 36, NOW, { frozenLabel: " " }).stale).toBe(true)
  })
})

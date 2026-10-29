import { describe, expect, it } from "vitest"

import {
  describeMirrorDelta,
  judgeImportFreshness,
  judgeMirrorPending,
} from "@/components/admin/hardware/inventory/ImportFreshnessStrip"
import { describeHardwareImportOutcome, hardwareImportWarnings } from "@/lib/hardware/import-outcome"
import { summarizeStockAttention } from "@/lib/hardware/stock-attention"

// 하드웨어 라운드 2 — 가져오기 결과 문구(S-4·S-6·S-7), 신선도 상태(S-5·H-11), 미러 대기(S-9), 부족 합집합(H-2).

const NOW = Date.parse("2026-09-23T03:00:00.000Z")

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    status: "success",
    started_at: "2026-09-23T02:00:00.000Z",
    finished_at: "2026-09-23T02:01:00.000Z",
    rows_imported: 385,
    rows_skipped: 0,
    error: null,
    ...overrides,
  }
}

describe("describeHardwareImportOutcome", () => {
  it("says done in success tone with imported rows and snapshot", () => {
    const notice = describeHardwareImportOutcome({
      ok: true,
      outcome: "done",
      import: { imported: 385, skipped: 0, snapshotId: "abcdef123456" },
    })
    expect(notice.tone).toBe("success")
    expect(notice.message).toContain("원장 385건 반영")
    expect(notice.message).toContain("백업 abcdef12")
  })

  it("never says done in green when there is something to review", () => {
    const notice = describeHardwareImportOutcome({
      ok: true,
      outcome: "done",
      import: { imported: 10, skipped: 2 },
      warnings: hardwareImportWarnings({ imported: 10, skipped: 2 }),
    })
    expect(notice.tone).toBe("warning")
    expect(notice.message).toContain("건너뛴 시트 행 2건")
  })

  it("names the voided admin confirmations so they are not silently dropped", () => {
    const notice = describeHardwareImportOutcome({ outcome: "done", import: { imported: 5, skipped: 0, sheetWinsVoided: 2 } })
    expect(notice.message).toContain("어드민 기록 2건은 취소")
  })

  it("reports a locked run as info with how long ago it started, not as done", () => {
    const notice = describeHardwareImportOutcome(
      { ok: false, skipped: true, outcome: "running", startedAt: "2026-09-23T02:57:00.000Z" },
      { now: NOW }
    )
    expect(notice.tone).toBe("info")
    expect(notice.message).toContain("3분 전 시작")
    expect(notice.message).not.toContain("완료")
  })

  it("distinguishes sync-stage and import-stage failures and says the ledger did not change", () => {
    const sync = describeHardwareImportOutcome({ outcome: "failed", stage: "sync", ledgerChanged: false, error: "Sheets 403" }, { httpStatus: 500 })
    expect(sync.tone).toBe("error")
    expect(sync.message).toContain("가져오기를 하지 않았습니다")
    expect(sync.message).toContain("원장은 바뀌지 않았습니다")
    const imp = describeHardwareImportOutcome({ outcome: "failed", stage: "import", ledgerChanged: false, error: "rpc" }, { httpStatus: 500 })
    expect(imp.message).toContain("원장은 가져오기 전 그대로")
  })

  it("treats a missing body (gateway timeout) as unknown, not failure", () => {
    const notice = describeHardwareImportOutcome(null, { httpStatus: 504 })
    expect(notice.tone).toBe("warning")
    expect(notice.message).toContain("반영 여부")
  })

  it("explains permission errors", () => {
    expect(describeHardwareImportOutcome({ error: "Forbidden" }, { httpStatus: 403 }).message).toContain("권한")
  })

  it("keeps the old contract readable (ok + import without outcome)", () => {
    expect(describeHardwareImportOutcome({ ok: true, import: { imported: 1, skipped: 0 } }, { httpStatus: 200 }).tone).toBe("success")
  })
})

describe("judgeImportFreshness — run states", () => {
  it("treats a run started within the lock window as running, not failed, and counts days from the last success", () => {
    const result = judgeImportFreshness(run({ status: "running", finished_at: null, started_at: "2026-09-23T02:55:00.000Z" }), {
      now: NOW,
      lastSuccess: run({ id: "run-0", started_at: "2026-09-20T02:00:00.000Z", finished_at: "2026-09-20T02:01:00.000Z" }),
    })
    expect(result.state).toBe("running")
    expect(result.failed).toBe(false)
    expect(result.runningMinutes).toBe(5)
    expect(result.basisKey).toBe("2026-09-20")
    expect(result.daysAgo).toBe(3)
    expect(result.level).toBe("ok")
  })

  it("treats an old running record as stalled (danger) and still reports the last success basis", () => {
    const result = judgeImportFreshness(run({ status: "running", finished_at: null, started_at: "2026-09-22T00:00:00.000Z" }), {
      now: NOW,
      lastSuccess: run({ id: "run-0", started_at: "2026-09-10T02:00:00.000Z", finished_at: "2026-09-10T02:01:00.000Z" }),
    })
    expect(result.state).toBe("stalled")
    expect(result.failed).toBe(true)
    expect(result.level).toBe("danger")
    expect(result.daysAgo).toBe(13)
  })

  it("keeps a failed run as failed and measures age from the last success", () => {
    const result = judgeImportFreshness(run({ status: "failed", error: "boom" }), {
      now: NOW,
      lastSuccess: run({ id: "run-0", started_at: "2026-09-21T02:00:00.000Z", finished_at: "2026-09-21T02:01:00.000Z" }),
    })
    expect(result.state).toBe("failed")
    expect(result.basisKey).toBe("2026-09-21")
    expect(result.daysAgo).toBe(2)
  })
})

describe("judgeMirrorPending", () => {
  const mirror = { syncedAt: "2026-09-23T08:00:00.000Z", rows: { inbound: 60, outbound: 412, stock: 30 } }

  it("reports rows added to the sheet since the ledger's basis import", () => {
    const pending = judgeMirrorPending(run({ mirror_rows: { inbound: 59, outbound: 409, stock: 30 } }), mirror)
    expect(pending?.changed).toBe(true)
    expect(pending?.delta).toEqual({ inbound: 1, outbound: 3, stock: 0 })
    expect(describeMirrorDelta(pending!.delta!)).toBe("입고 +1 · 출고 +3")
  })

  it("says unchanged when row counts match", () => {
    const pending = judgeMirrorPending(run({ mirror_rows: { inbound: 60, outbound: 412, stock: 30 } }), mirror)
    expect(pending?.changed).toBe(false)
  })

  it("cannot compare runs recorded before mirror_rows existed, but still shows the sync time", () => {
    const pending = judgeMirrorPending(run(), mirror)
    expect(pending).toEqual({ syncedAt: mirror.syncedAt, delta: null, changed: false })
  })

  it("returns null when the mirror state is unavailable", () => {
    expect(judgeMirrorPending(run(), null)).toBeNull()
  })
})

describe("summarizeStockAttention", () => {
  const row = (overrides: Record<string, unknown>) => ({
    warehouseStock: 5,
    plannedOut: 0,
    outbound30d: 3,
    low: false,
    orderRecommended: false,
    ...overrides,
  })

  it("counts a low item once even though it is also order-recommended", () => {
    const summary = summarizeStockAttention([
      row({ low: true, orderRecommended: true }),
      row({ orderRecommended: true }),
      row({}),
    ])
    expect(summary).toMatchObject({ low: 1, orderOnly: 1, total: 2 })
  })

  it("leaves dormant low items and negative-warehouse rows out of the headline, like the alert list", () => {
    const summary = summarizeStockAttention([
      row({ warehouseStock: 0, outbound30d: 0, low: true, orderRecommended: true }),
      row({ warehouseStock: -16, low: true, orderRecommended: true }),
    ])
    expect(summary).toMatchObject({ low: 0, orderOnly: 0, total: 0, dormantLow: 1, ledgerCheck: 1 })
  })
})

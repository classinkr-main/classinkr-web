// P0(2026-09-11) — 크론이 동기화 실패 뒤 연속 실패 일수를 보고 운영방에 알린다.
import { afterEach, describe, expect, it, vi } from "vitest"

const listRecentSyncRunsFresh = vi.fn()
const emitNotificationEvent = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/repositories/branch-sync", () => ({ listRecentSyncRunsFresh }))
vi.mock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))

const PERMISSION = "rev: '2. REV'!A1:CF1000 failed after retries: Error: The caller does not have permission"

function failedDays(n: number) {
  const runs = []
  for (let i = 0; i < n; i += 1) {
    runs.push({ started_at: new Date(Date.UTC(2026, 8, 10 - i, 8, 38)).toISOString(), status: "failed", error: PERMISSION, source: "all", trigger: "cron" })
  }
  runs.push({ started_at: "2026-08-18T02:30:52Z", status: "success", error: null, source: "all", trigger: "manual" })
  return runs
}

describe("notifyBranchSyncFailureStreaks", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("sends one ops-room warning on the 2nd failing day", async () => {
    listRecentSyncRunsFresh.mockResolvedValue(failedDays(2))
    emitNotificationEvent.mockResolvedValue({ deliveryResults: [{ channel: "wecom_webhook", status: "sent" }] })
    const { notifyBranchSyncFailureStreaks } = await import("@/lib/branch/sync/failure-alert")

    const outcomes = await notifyBranchSyncFailureStreaks(new Date("2026-09-10T08:40:00Z"))

    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(emitNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "branch.sync.failure_streak",
      severity: "warning",
      channels: ["wecom_webhook"],
      routeUrl: "/admin/branch/ledger",
    }))
    expect(outcomes).toEqual([{ source: "rev", failedDays: 2, delivered: true }])
  })

  // 2026-09-25 동작 변화 고정 — REV만 돌린 수동 새로고침(source="rev")은 HW 연속 실패를 끊지 않는다.
  // 예전(모든 런이 "all")에는 그 성공이 HW 성공으로 읽혀 HW 2일째 알림이 나가지 않았다.
  it("still alerts HW on day 2 when someone refreshed REV only in between", async () => {
    const HW_DOWN = "hw: 503 Service Unavailable"
    listRecentSyncRunsFresh.mockResolvedValue([
      { started_at: "2026-09-10T08:38:00Z", status: "failed", error: HW_DOWN, source: "all", trigger: "cron" }, // 오늘 크론
      { started_at: "2026-09-09T11:00:00Z", status: "success", error: null, source: "rev", trigger: "manual" }, // 어제 장부 새로고침
      { started_at: "2026-09-09T08:38:00Z", status: "failed", error: HW_DOWN, source: "all", trigger: "cron" }, // 어제 크론
      { started_at: "2026-09-08T08:38:00Z", status: "success", error: null, source: "all" },
    ])
    emitNotificationEvent.mockResolvedValue({ deliveryResults: [{ channel: "wecom_webhook", status: "sent" }] })
    const { notifyBranchSyncFailureStreaks } = await import("@/lib/branch/sync/failure-alert")

    const outcomes = await notifyBranchSyncFailureStreaks(new Date("2026-09-10T08:40:00Z"))

    expect(outcomes).toEqual([{ source: "hw", failedDays: 2, delivered: true }])
    expect(emitNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "hw",
      payload: expect.objectContaining({ failedDays: 2, failedRuns: 2, lastSuccessAt: "2026-09-08T08:38:00Z" }),
    }))
  })

  it("legacy 'all' rows keep the old reading — a successful all-run still resets both sources", async () => {
    listRecentSyncRunsFresh.mockResolvedValue([
      { started_at: "2026-09-10T08:38:00Z", status: "failed", error: "hw: boom", source: "all", trigger: "cron" },
      { started_at: "2026-09-09T11:00:00Z", status: "success", error: null, source: "all", trigger: "manual" },
      { started_at: "2026-09-09T08:38:00Z", status: "failed", error: "hw: boom", source: "all", trigger: "cron" },
    ])
    const { notifyBranchSyncFailureStreaks } = await import("@/lib/branch/sync/failure-alert")

    expect(await notifyBranchSyncFailureStreaks(new Date("2026-09-10T08:40:00Z"))).toEqual([])
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  // 2026-10-22: 크론이 하루 3번(KST 09·13·17시) 돈다. 같은 날 두 번째·세 번째 크론 실패에서는 판정하지 않는다.
  it("alerts once per KST day — the 2nd and 3rd cron failures of the same day stay quiet", async () => {
    const runs = [
      { started_at: "2026-09-10T04:00:00Z", status: "failed", error: PERMISSION, source: "all", trigger: "cron" }, // 오늘 13시
      { started_at: "2026-09-10T00:00:00Z", status: "failed", error: PERMISSION, source: "all", trigger: "cron" }, // 오늘 09시
      { started_at: "2026-09-09T08:00:00Z", status: "failed", error: PERMISSION, source: "all", trigger: "cron" }, // 어제
      { started_at: "2026-09-08T08:00:00Z", status: "success", error: null, source: "all", trigger: "cron" },
    ]
    listRecentSyncRunsFresh.mockResolvedValue(runs)
    const { notifyBranchSyncFailureStreaks } = await import("@/lib/branch/sync/failure-alert")

    expect(await notifyBranchSyncFailureStreaks(new Date("2026-09-10T04:01:00Z"))).toEqual([])
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("a failed manual retry earlier the same day does not swallow that day's cron alert", async () => {
    listRecentSyncRunsFresh.mockResolvedValue([
      { started_at: "2026-09-10T00:00:00Z", status: "failed", error: PERMISSION, source: "all", trigger: "cron" }, // 오늘 첫 크론
      { started_at: "2026-09-09T23:30:00Z", status: "failed", error: PERMISSION, source: "rev", trigger: "manual" }, // 오늘 08:30 KST 수동
      { started_at: "2026-09-09T08:00:00Z", status: "failed", error: PERMISSION, source: "all", trigger: "cron" },
      { started_at: "2026-09-08T08:00:00Z", status: "success", error: null, source: "all", trigger: "cron" },
    ])
    emitNotificationEvent.mockResolvedValue({ deliveryResults: [{ channel: "wecom_webhook", status: "sent" }] })
    const { notifyBranchSyncFailureStreaks } = await import("@/lib/branch/sync/failure-alert")

    const outcomes = await notifyBranchSyncFailureStreaks(new Date("2026-09-10T00:01:00Z"))

    expect(outcomes).toEqual([{ source: "rev", failedDays: 2, delivered: true }])
  })

  it("stays quiet on day 3 (next reminder is day 5)", async () => {
    listRecentSyncRunsFresh.mockResolvedValue(failedDays(3))
    const { notifyBranchSyncFailureStreaks } = await import("@/lib/branch/sync/failure-alert")

    expect(await notifyBranchSyncFailureStreaks(new Date("2026-09-10T08:40:00Z"))).toEqual([])
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("reports delivered=false when the webhook did not go out (off or HTTP error)", async () => {
    listRecentSyncRunsFresh.mockResolvedValue(failedDays(5))
    emitNotificationEvent.mockResolvedValue({ deliveryResults: [{ channel: "wecom_webhook", status: "skipped" }] })
    const { notifyBranchSyncFailureStreaks } = await import("@/lib/branch/sync/failure-alert")

    const outcomes = await notifyBranchSyncFailureStreaks(new Date("2026-09-10T08:40:00Z"))

    expect(outcomes).toEqual([{ source: "rev", failedDays: 5, delivered: false }])
  })
})

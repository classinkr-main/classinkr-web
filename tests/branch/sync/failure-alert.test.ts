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
    runs.push({ started_at: new Date(Date.UTC(2026, 8, 10 - i, 8, 38)).toISOString(), status: "failed", error: PERMISSION, source: "all" })
  }
  runs.push({ started_at: "2026-08-18T02:30:52Z", status: "success", error: null, source: "all" })
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
      { started_at: "2026-09-10T08:38:00Z", status: "failed", error: HW_DOWN, source: "all" }, // 오늘 크론
      { started_at: "2026-09-09T11:00:00Z", status: "success", error: null, source: "rev" }, // 어제 장부 새로고침
      { started_at: "2026-09-09T08:38:00Z", status: "failed", error: HW_DOWN, source: "all" }, // 어제 크론
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
      { started_at: "2026-09-10T08:38:00Z", status: "failed", error: "hw: boom", source: "all" },
      { started_at: "2026-09-09T11:00:00Z", status: "success", error: null, source: "all" },
      { started_at: "2026-09-09T08:38:00Z", status: "failed", error: "hw: boom", source: "all" },
    ])
    const { notifyBranchSyncFailureStreaks } = await import("@/lib/branch/sync/failure-alert")

    expect(await notifyBranchSyncFailureStreaks(new Date("2026-09-10T08:40:00Z"))).toEqual([])
    expect(emitNotificationEvent).not.toHaveBeenCalled()
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

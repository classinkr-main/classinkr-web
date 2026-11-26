import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const emitNotificationEvent = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))
vi.mock("@/lib/crm/renewal-alert-dispatch", () => ({ dispatchRenewalAlerts: vi.fn() }))
vi.mock("@/lib/external-crm/xiaoshouyi-sync", () => ({ syncXiaoshouyiSnapshots: vi.fn() }))
vi.mock("@/lib/repositories/crm-source-links", () => ({ generateExternalCrmLinkCandidates: vi.fn() }))
vi.mock("@/lib/repositories/crm-neo-customer-snapshots", () => ({ refreshCrmNeoCustomerSnapshotsFromExternalRecords: vi.fn() }))

import { notifyExternalCrmSyncOutcome, type ExternalCrmSyncChainResult } from "@/lib/external-crm/sync-chain"

const okSync = { ok: true, objects: [{ status: "success", rowsUpserted: 1, objectApiKey: "a" }] } as unknown as ExternalCrmSyncChainResult["sync"]

beforeEach(() => emitNotificationEvent.mockReset())

describe("notifyExternalCrmSyncOutcome follow-up failures", () => {
  it("sync 성공 + 후속 단계 실패면 경고 이벤트를 낸다", async () => {
    await notifyExternalCrmSyncOutcome({ sync: okSync, neoCustomerSnapshotsError: "no table" }, "cron")
    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(emitNotificationEvent.mock.calls[0][0]).toMatchObject({
      eventType: "crm.external_sync.followup_failed",
      severity: "warning",
    })
    expect(emitNotificationEvent.mock.calls[0][0].message).toContain("no table")
  })

  it("실패가 없으면 이벤트를 내지 않는다", async () => {
    await notifyExternalCrmSyncOutcome({ sync: okSync }, "cron")
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })
})

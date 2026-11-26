import { describe, expect, it } from "vitest"

import {
  getExternalCrmSyncChainHttpStatus,
  getExternalCrmSyncHttpStatus,
  hasFreshExternalCrmSyncData,
} from "@/lib/external-crm/sync-result"

describe("external CRM sync result", () => {
  it("treats partial object success as a cache-worthy multi-status response", () => {
    const result = {
      ok: false,
      objects: [{ status: "success" as const }, { status: "failed" as const }],
    }

    expect(getExternalCrmSyncHttpStatus(result)).toBe(207)
    expect(hasFreshExternalCrmSyncData(result)).toBe(true)
  })

  it("does not invalidate data for a recent cached result", () => {
    const result = {
      ok: true,
      cached: true,
      objects: [{ status: "success" as const }],
    }

    expect(getExternalCrmSyncHttpStatus(result)).toBe(200)
    expect(hasFreshExternalCrmSyncData(result)).toBe(false)
  })

  it("keeps skipped readiness failures distinct from upstream failures", () => {
    expect(
      getExternalCrmSyncHttpStatus({
        ok: false,
        skipped: true,
        objects: [{ status: "skipped" }],
      })
    ).toBe(409)
    expect(
      getExternalCrmSyncHttpStatus({
        ok: false,
        objects: [{ status: "failed" }],
      })
    ).toBe(502)
  })

  it("invalidates caches when an object wrote rows before a later page failed", () => {
    expect(
      hasFreshExternalCrmSyncData({
        ok: false,
        objects: [{ status: "failed", rowsUpserted: 12 }],
      })
    ).toBe(true)
  })

  it("returns 207 when sync is ok but a follow-up step failed", () => {
    const sync = { ok: true, objects: [{ status: "success" as const }] }
    expect(getExternalCrmSyncChainHttpStatus({ sync })).toBe(200)
    expect(getExternalCrmSyncChainHttpStatus({ sync, neoCustomerSnapshotsError: "boom" })).toBe(207)
    expect(getExternalCrmSyncChainHttpStatus({ sync, candidatesError: "boom" })).toBe(207)
    expect(getExternalCrmSyncChainHttpStatus({ sync, renewalAlertsError: "boom" })).toBe(207)
    expect(
      getExternalCrmSyncChainHttpStatus({ sync: { ok: false, objects: [{ status: "failed" as const }] }, candidatesError: "x" })
    ).toBe(502)
  })
})

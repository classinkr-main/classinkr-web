import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ revalidateTag: vi.fn() }))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag, unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/admin-crm-revenue", () => ({ ADMIN_CRM_REVENUE_CACHE_TAG: "admin-crm-revenue" }))
vi.mock("@/lib/admin-crm-revenue-sheet", () => ({ ADMIN_CRM_REVENUE_SHEET_CACHE_TAG: "admin-crm-revenue-sheet" }))
vi.mock("@/lib/repositories/branch-deals", () => ({ BRANCH_REV_DEALS_CACHE_TAG: "branch-rev-deals" }))
vi.mock("@/lib/repositories/branch-dsh-kpi-mirror", () => ({ BRANCH_DSH_CACHE_TAG: "branch-dsh", BRANCH_KPI_CACHE_TAG: "branch-kpi" }))
vi.mock("@/lib/repositories/branch-hw", () => ({ BRANCH_HW_CACHE_TAG: "branch-hw" }))
vi.mock("@/lib/repositories/branch-sync", () => ({ BRANCH_SYNC_RUNS_CACHE_TAG: "branch-sync-runs" }))
vi.mock("@/lib/repositories/hardware-inventory", () => ({ HARDWARE_INVENTORY_CACHE_TAG: "hardware-inventory" }))
vi.mock("@/lib/repositories/sales-ledger-imports", () => ({ SALES_LEDGER_IMPORTS_CACHE_TAG: "sales-ledger-imports" }))
vi.mock("@/lib/external-crm/sync-chain", () => ({}))

import {
  ADMIN_CRM_ACCOUNT_MASTER_CACHE_TAG,
  ADMIN_CRM_COVERAGE_CACHE_TAG,
  ADMIN_CRM_NEO_CUSTOMERS_CACHE_TAG,
  ADMIN_CRM_OVERVIEW_CACHE_TAG,
  ADMIN_CRM_PRIORITY_QUEUE_SNAPSHOT_CACHE_TAG,
  ADMIN_CRM_REGION_MAP_CACHE_TAG,
  ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG,
  ADMIN_OS_SUMMARY_CACHE_TAG,
} from "@/lib/admin/crm/cache-tags"
import { expireExternalCrmSyncCaches, externalCrmSyncCacheBundles } from "@/lib/external-crm/sync-cache"
import type { ExternalCrmSyncChainResult } from "@/lib/external-crm/sync-chain"

const success = { objectApiKey: "account", status: "success" as const, rowsScanned: 10, rowsUpserted: 2 }

function chain(partial: Partial<ExternalCrmSyncChainResult> & { sync?: Partial<ExternalCrmSyncChainResult["sync"]> }) {
  return {
    ...partial,
    sync: { ok: true, objects: [success], ...partial.sync },
  } as ExternalCrmSyncChainResult
}

const candidates = (insertedCandidates: number, autoConfirmed: number) =>
  ({ insertedCandidates, autoConfirmed, scannedExternalRecords: 1 }) as unknown as ExternalCrmSyncChainResult["candidates"]

beforeEach(() => mocks.revalidateTag.mockReset())

describe("externalCrmSyncCacheBundles", () => {
  it("새 데이터(성공 객체 또는 스냅샷 재계산)가 있으면 neoSync", () => {
    expect(externalCrmSyncCacheBundles(chain({}))).toEqual(["neoSync"])
    expect(
      externalCrmSyncCacheBundles(
        chain({ sync: { ok: false, objects: [{ ...success, status: "failed" }] }, neoCustomerSnapshots: {} as never }),
      ),
    ).toEqual(["neoSync"])
  })

  it("잠김·최근 결과 재사용(cached)·전부 건너뜀이면 아무것도 만료하지 않는다", () => {
    expect(
      externalCrmSyncCacheBundles(
        chain({ sync: { ok: true, cached: true, locked: true, skipped: true, objects: [{ ...success, status: "skipped" }] } }),
      ),
    ).toEqual([])
    expect(
      externalCrmSyncCacheBundles(
        chain({ sync: { ok: false, skipped: true, objects: [{ objectApiKey: "all", status: "skipped", rowsScanned: 0, rowsUpserted: 0 }] } }),
      ),
    ).toEqual([])
  })

  it("후보가 새로 생기거나 자동 확정되면 crmSourceLinks 도", () => {
    expect(externalCrmSyncCacheBundles(chain({ candidates: candidates(3, 0) }))).toEqual(["neoSync", "crmSourceLinks"])
    expect(externalCrmSyncCacheBundles(chain({ candidates: candidates(0, 1) }))).toEqual(["neoSync", "crmSourceLinks"])
    expect(externalCrmSyncCacheBundles(chain({ candidates: candidates(0, 0) }))).toEqual(["neoSync"])
  })
})

describe("expireExternalCrmSyncCaches", () => {
  it("NEO 고객 캐시와 그 값을 품은 바깥 캐시까지 { expire: 0 } 으로 한 번씩 만료한다", () => {
    const tags = expireExternalCrmSyncCaches(chain({ candidates: candidates(1, 1) }))
    for (const tag of [
      ADMIN_CRM_NEO_CUSTOMERS_CACHE_TAG,
      ADMIN_CRM_REGION_MAP_CACHE_TAG,
      "admin-crm-revenue",
      ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG,
      ADMIN_CRM_PRIORITY_QUEUE_SNAPSHOT_CACHE_TAG,
      ADMIN_OS_SUMMARY_CACHE_TAG,
      ADMIN_CRM_OVERVIEW_CACHE_TAG,
      "admin-crm-revenue-sheet",
      ADMIN_CRM_COVERAGE_CACHE_TAG,
      ADMIN_CRM_ACCOUNT_MASTER_CACHE_TAG,
    ]) {
      expect(tags).toContain(tag)
      expect(mocks.revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 })
    }
    expect(new Set(tags).size).toBe(tags.length)
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(tags.length)
    expect(mocks.revalidateTag.mock.calls.some(([, profile]) => profile === "max")).toBe(false)
  })

  it("새 데이터가 없으면 부르지 않는다", () => {
    expect(expireExternalCrmSyncCaches(chain({ sync: { ok: true, cached: true, objects: [] } }))).toEqual([])
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })
})

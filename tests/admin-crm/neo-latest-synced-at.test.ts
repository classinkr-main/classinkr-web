// NEO 팀 리포트의 latestSyncedAt — source_system 만 건 테이블 전체 synced_at 정렬
// (85K 인덱스 엔트리 + 힙 1만 회, 프로덕션 370회 × 2.4s) 대신 객체 키별 limit 1 의 최댓값을 쓴다.
import { afterEach, describe, expect, it, vi } from "vitest"

import { createRecordingSupabaseClient, filterValue } from "../helpers/recording-supabase-client"

const SYNCED_AT_BY_OBJECT: Record<string, string> = {
  account: "2026-08-30T01:00:00.000Z",
  opportunity: "2026-08-31T09:30:00.000Z",
  ResourceInformation__c: "2026-08-31T05:00:00.000Z",
}

async function loadReport() {
  vi.resetModules()
  const recorder = createRecordingSupabaseClient((query) => {
    if (query.selectOptions?.head) return { data: null, error: null, count: 0 }
    if (query.table === "external_crm_records" && query.select === "synced_at") {
      const key = filterValue(query, "object_api_key")
      const syncedAt = typeof key === "string" ? SYNCED_AT_BY_OBJECT[key] : undefined
      return { data: syncedAt ? [{ synced_at: syncedAt }] : [], error: null, count: null }
    }
    return { data: [], error: null, count: null }
  })
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => recorder.client),
  }))
  vi.doMock("@/lib/billing/fx", () => ({
    getFxRates: vi.fn(async () => ({
      usdKrw: 1400,
      cnyKrw: 190,
      fetchedAt: "2026-09-01T00:00:00.000Z",
      source: "test",
      isStale: false,
    })),
  }))

  const { getNeoCrmTeamReport } = await import("@/lib/admin-crm-neo")
  const { EXTERNAL_CRM_SNAPSHOT_OBJECT_KEYS } = await import("@/lib/external-crm/latest-synced-at")
  const report = await getNeoCrmTeamReport({ granularity: "month", offset: 0, force: true })
  return { report, queries: recorder.queries, objectKeys: [...EXTERNAL_CRM_SNAPSHOT_OBJECT_KEYS] }
}

describe("getNeoCrmTeamReport latestSyncedAt", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("객체 키별 limit 1 조회의 최댓값을 쓰고 테이블 전체 synced_at 정렬은 내지 않는다", async () => {
    const { report, queries, objectKeys } = await loadReport()

    expect(report.ok).toBe(true)
    expect(report.latestSyncedAt).toBe("2026-08-31T09:30:00.000Z")

    const latestQueries = queries.filter(
      (query) => query.table === "external_crm_records" && query.select === "synced_at"
    )
    expect(latestQueries).toHaveLength(objectKeys.length)
    expect(new Set(latestQueries.map((query) => filterValue(query, "object_api_key")))).toEqual(new Set(objectKeys))
    for (const query of latestQueries) {
      expect(filterValue(query, "source_system")).toBe("xiaoshouyi")
      expect(query.order).toEqual([{ column: "synced_at", ascending: false }])
      expect(query.limit).toBe(1)
    }
  })
})

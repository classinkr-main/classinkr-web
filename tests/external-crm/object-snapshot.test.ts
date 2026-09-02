// getExternalCrmObjectSnapshotTotals — CRM 개요의 외부 스냅샷 집계.
// 이전: active head count(1,163ms) + stale head count + `.in(keys)` synced_at 정렬(2,421ms) = 84K행 스캔 3회.
// 이후: 집계 뷰 external_crm_object_snapshot 1회(≈614ms, 인덱스 온리)로 합산. 뷰가 없으면 이전과
// 같은 의미의 폴백(head count 2 + 객체별 latest)으로 내려간다.
import { describe, expect, it } from "vitest"

import { getExternalCrmObjectSnapshotTotals } from "@/lib/external-crm/object-snapshot"

import {
  createRecordingSupabaseClient,
  filterValue,
  type RecordedQuery,
  type RecordedQueryResolver,
} from "../helpers/recording-supabase-client"

type HelperClient = Parameters<typeof getExternalCrmObjectSnapshotTotals>[0]

const KEYS = ["account", "opportunity"]

const VIEW_ROWS = [
  {
    source_system: "xiaoshouyi",
    object_api_key: "account",
    active_count: 10,
    latest_synced_at: "2026-08-01T00:00:00.000Z",
    stale_count: 2,
  },
  {
    source_system: "xiaoshouyi",
    object_api_key: "opportunity",
    // bigint 가 문자열로 올 수 있다 — 숫자로 정규화해야 한다.
    active_count: "5",
    latest_synced_at: "2026-08-03T00:00:00.000Z",
    stale_count: "0",
  },
  {
    // 요청 키 밖의 객체 — 합계·최신값에서 제외돼야 한다.
    source_system: "xiaoshouyi",
    object_api_key: "ResourceInformation__c",
    active_count: 66_013,
    latest_synced_at: "2026-09-01T00:00:00.000Z",
    stale_count: 100,
  },
]

const VIEW_MISSING = {
  data: null,
  error: { code: "42P01", message: 'relation "public.external_crm_object_snapshot" does not exist' },
}

function clientFor(resolve: RecordedQueryResolver) {
  const recorder = createRecordingSupabaseClient(resolve)
  return { sb: recorder.client as unknown as HelperClient, queries: recorder.queries }
}

function isHeadCount(query: RecordedQuery, stale: boolean) {
  return (
    query.table === "external_crm_records" &&
    query.selectOptions?.head === true &&
    query.selectOptions?.count === "exact" &&
    filterValue(query, "is_stale") === stale
  )
}

describe("getExternalCrmObjectSnapshotTotals", () => {
  it("집계 뷰 1회로 요청 키의 활성·stale 합계와 최신 synced_at 을 만든다", async () => {
    const { sb, queries } = clientFor((query) =>
      query.table === "external_crm_object_snapshot" ? { data: VIEW_ROWS, error: null } : { data: [], error: null }
    )

    const totals = await getExternalCrmObjectSnapshotTotals(sb, { sourceSystem: "xiaoshouyi", objectApiKeys: KEYS })

    expect(totals).toEqual({
      activeCount: 15,
      staleCount: 2,
      latestSyncedAt: "2026-08-03T00:00:00.000Z",
      error: null,
      source: "view",
    })
    expect(queries).toHaveLength(1)
    expect(queries[0]?.table).toBe("external_crm_object_snapshot")
    expect(queries[0]?.select).toContain("active_count")
    expect(filterValue(queries[0]!, "source_system")).toBe("xiaoshouyi")
  })

  it("뷰가 없으면 head count 2개 + 객체별 latest 로 폴백한다(의미 동일)", async () => {
    const syncedAtByKey: Record<string, string> = {
      account: "2026-08-01T00:00:00.000Z",
      opportunity: "2026-08-03T00:00:00.000Z",
    }
    const { sb, queries } = clientFor((query) => {
      if (query.table === "external_crm_object_snapshot") return VIEW_MISSING
      if (isHeadCount(query, false)) return { data: null, error: null, count: 15 }
      if (isHeadCount(query, true)) return { data: null, error: null, count: 2 }
      if (query.select === "synced_at") {
        const syncedAt = syncedAtByKey[String(filterValue(query, "object_api_key"))]
        return { data: syncedAt ? [{ synced_at: syncedAt }] : [], error: null }
      }
      return { data: [], error: null }
    })

    const totals = await getExternalCrmObjectSnapshotTotals(sb, { sourceSystem: "xiaoshouyi", objectApiKeys: KEYS })

    expect(totals).toEqual({
      activeCount: 15,
      staleCount: 2,
      latestSyncedAt: "2026-08-03T00:00:00.000Z",
      error: null,
      source: "fallback",
    })

    const headCounts = queries.filter((query) => isHeadCount(query, false) || isHeadCount(query, true))
    expect(headCounts).toHaveLength(2)
    for (const query of headCounts) {
      expect(filterValue(query, "source_system")).toBe("xiaoshouyi")
      expect(filterValue(query, "object_api_key", "in")).toEqual(KEYS)
    }

    const latestQueries = queries.filter((query) => query.select === "synced_at")
    expect(latestQueries.map((query) => filterValue(query, "object_api_key"))).toEqual(KEYS)
    expect(latestQueries.every((query) => query.limit === 1)).toBe(true)
  })

  it("폴백 쿼리가 실패하면 throw 없이 첫 오류를 돌려주고 실패한 값만 0/null 로 둔다", async () => {
    const { sb } = clientFor((query) => {
      if (query.table === "external_crm_object_snapshot") return VIEW_MISSING
      if (isHeadCount(query, false)) return { data: null, error: { message: "active count failed" } }
      if (isHeadCount(query, true)) return { data: null, error: null, count: 2 }
      if (query.select === "synced_at") return { data: [{ synced_at: "2026-08-03T00:00:00.000Z" }], error: null }
      return { data: [], error: null }
    })

    const totals = await getExternalCrmObjectSnapshotTotals(sb, { sourceSystem: "xiaoshouyi", objectApiKeys: KEYS })

    expect(totals).toEqual({
      activeCount: 0,
      staleCount: 2,
      latestSyncedAt: "2026-08-03T00:00:00.000Z",
      error: { message: "active count failed" },
      source: "fallback",
    })
  })
})

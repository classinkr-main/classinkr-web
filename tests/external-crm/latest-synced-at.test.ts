// getExternalCrmLatestSyncedAt — "가장 최근 synced_at" 을 테이블 전체 정렬
// (source_system 만 걸면 85K 인덱스 엔트리 정렬 + 힙 1만 회, 프로덕션 2.4s) 대신
// 객체 키별 `ORDER BY synced_at DESC LIMIT 1`(external_crm_records_object_idx 프로브, 1.4ms)
// 을 병렬로 내고 최댓값을 취한다. 오류는 던지지 않고 첫 오류를 돌려준다.
import { describe, expect, it } from "vitest"

import {
  EXTERNAL_CRM_SNAPSHOT_OBJECT_KEYS,
  getExternalCrmLatestSyncedAt,
} from "@/lib/external-crm/latest-synced-at"

import {
  createRecordingSupabaseClient,
  filterValue,
  type RecordedQueryResolver,
} from "../helpers/recording-supabase-client"

type HelperClient = Parameters<typeof getExternalCrmLatestSyncedAt>[0]

function clientFor(resolve: RecordedQueryResolver) {
  const recorder = createRecordingSupabaseClient(resolve)
  return { sb: recorder.client as unknown as HelperClient, queries: recorder.queries }
}

describe("getExternalCrmLatestSyncedAt", () => {
  it("객체 키마다 limit 1 조회를 하나씩 내고 최댓값을 돌려준다", async () => {
    const syncedAtByKey: Record<string, string | null> = {
      account: "2026-08-02T00:00:00.000Z",
      opportunity: "2026-08-03T12:00:00.000Z",
      User: null,
    }
    const { sb, queries } = clientFor((query) => {
      const key = String(filterValue(query, "object_api_key"))
      const syncedAt = syncedAtByKey[key]
      return { data: syncedAt ? [{ synced_at: syncedAt }] : [], error: null }
    })

    const result = await getExternalCrmLatestSyncedAt(sb, {
      sourceSystem: "xiaoshouyi",
      objectApiKeys: ["account", "opportunity", "User"],
    })

    expect(result).toEqual({ latestSyncedAt: "2026-08-03T12:00:00.000Z", error: null })
    expect(queries).toHaveLength(3)
    expect(queries.map((query) => filterValue(query, "object_api_key"))).toEqual(["account", "opportunity", "User"])
    for (const query of queries) {
      expect(query.table).toBe("external_crm_records")
      expect(query.select).toBe("synced_at")
      expect(filterValue(query, "source_system")).toBe("xiaoshouyi")
      expect(query.order).toEqual([{ column: "synced_at", ascending: false }])
      expect(query.limit).toBe(1)
      expect(query.range).toBeNull()
    }
  })

  it("행이 없으면 null, 키 목록이 비면 쿼리 없이 null 을 돌려준다", async () => {
    const { sb, queries } = clientFor(() => ({ data: [], error: null }))

    expect(await getExternalCrmLatestSyncedAt(sb, { sourceSystem: "xiaoshouyi", objectApiKeys: ["account"] })).toEqual({
      latestSyncedAt: null,
      error: null,
    })
    expect(queries).toHaveLength(1)

    expect(await getExternalCrmLatestSyncedAt(sb, { sourceSystem: "xiaoshouyi", objectApiKeys: [] })).toEqual({
      latestSyncedAt: null,
      error: null,
    })
    expect(queries).toHaveLength(1)
  })

  it("중복 키는 한 번만 조회한다", async () => {
    const { sb, queries } = clientFor(() => ({ data: [{ synced_at: "2026-08-01T00:00:00.000Z" }], error: null }))

    await getExternalCrmLatestSyncedAt(sb, { sourceSystem: "xiaoshouyi", objectApiKeys: ["account", "account"] })

    expect(queries).toHaveLength(1)
  })

  it("한 키라도 실패하면 throw 없이 첫 오류를 돌려준다", async () => {
    const { sb } = clientFor((query) =>
      filterValue(query, "object_api_key") === "opportunity"
        ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }
        : { data: [{ synced_at: "2026-08-02T00:00:00.000Z" }], error: null }
    )

    const result = await getExternalCrmLatestSyncedAt(sb, {
      sourceSystem: "xiaoshouyi",
      objectApiKeys: ["account", "opportunity"],
    })

    expect(result.latestSyncedAt).toBeNull()
    expect(result.error).toMatchObject({ code: "57014" })
  })

  it("스냅샷 객체 키 목록은 동기화 기본 객체 10종이다", () => {
    expect([...EXTERNAL_CRM_SNAPSHOT_OBJECT_KEYS]).toEqual([
      "User",
      "account",
      "contact",
      "opportunity",
      "ShroffAccount__c",
      "Collection__c",
      "SalesPerformance__c",
      "CollectionPlan__c",
      "FinancialInformation__c",
      "ResourceInformation__c",
    ])
  })
})

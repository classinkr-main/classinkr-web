// fetchExternalRows — 객체별 20페이지 스캔에서 exact count 를 첫 페이지에만 요청하는지 검증.
// fetchSupabasePages 는 첫 count 만 채택하므로(이후 값은 버림) 매 페이지 다시 세는 것은
// 84K행 테이블에서 페이지마다 집계 한 번씩을 더 얹을 뿐이다(프로덕션 1,163ms × 페이지 수).
import { afterEach, describe, expect, it, vi } from "vitest"

import { createRecordingSupabaseClient, filterValue } from "../helpers/recording-supabase-client"

function accountRow(index: number) {
  return {
    external_id: `acc-${index}`,
    display_name: `학원 ${index}`,
    owner_name: "owner-1",
    occurred_at: "2026-08-01T00:00:00.000Z",
    synced_at: "2026-08-02T00:00:00.000Z",
    last_seen_run_id: "run-1",
    payload: { accountName: `학원 ${index}` },
  }
}

async function listFromExternalRecords(totalAccounts: number) {
  vi.resetModules()
  const accounts = Array.from({ length: totalAccounts }, (_, index) => accountRow(index))
  const recorder = createRecordingSupabaseClient((query) => {
    if (query.table === "crm_neo_customer_snapshots") {
      // 스냅샷 테이블 미적용 → 외부 레코드에서 직접 조립하는 경로로 폴백시킨다.
      return {
        data: null,
        error: { code: "42P01", message: 'relation "crm_neo_customer_snapshots" does not exist' },
        count: null,
      }
    }
    if (query.table === "external_crm_records") {
      const rows = filterValue(query, "object_api_key") === "account" ? accounts : []
      const range = query.range ?? { from: 0, to: rows.length - 1 }
      return {
        data: rows.slice(range.from, range.to + 1),
        error: null,
        count: query.selectOptions?.count === "exact" ? rows.length : null,
      }
    }
    return { data: [], error: null, count: null }
  })
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => recorder.client),
  }))

  const { listCrmNeoCustomerSnapshots } = await import("@/lib/repositories/crm-neo-customer-snapshots")
  const result = await listCrmNeoCustomerSnapshots()
  return { result, queries: recorder.queries }
}

describe("crm-neo-customer-snapshots external record paging", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("exact count 는 객체별 첫 페이지에서만 요청하고 이후 페이지는 count 없이 넘긴다", async () => {
    const { result, queries } = await listFromExternalRecords(2_500)

    const accountPages = queries.filter(
      (query) => query.table === "external_crm_records" && filterValue(query, "object_api_key") === "account"
    )
    expect(accountPages.map((query) => query.range?.from)).toEqual([0, 1000, 2000])
    expect(accountPages.map((query) => query.selectOptions?.count)).toEqual(["exact", undefined, undefined])

    // 다른 객체(ShroffAccount__c·opportunity)도 첫 페이지에서만 센다.
    const countedPages = queries.filter(
      (query) => query.table === "external_crm_records" && query.selectOptions?.count === "exact"
    )
    expect(countedPages.length).toBeGreaterThanOrEqual(3)
    expect(countedPages.every((query) => query.range?.from === 0)).toBe(true)

    // 페이지가 이어져 전량이 모인다.
    expect(result.ok).toBe(true)
    expect(result.summary.totalCount).toBe(2_500)
  })
})

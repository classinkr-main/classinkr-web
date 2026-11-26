// fetchExternalRows — 객체별 20페이지 스캔에서 exact count 를 첫 페이지에만 요청하는지 검증.
// fetchSupabasePages 는 첫 count 만 채택하므로(이후 값은 버림) 매 페이지 다시 세는 것은
// 84K행 테이블에서 페이지마다 집계 한 번씩을 더 얹을 뿐이다(프로덕션 1,163ms × 페이지 수).
import { afterEach, describe, expect, it, vi } from "vitest"

import { createRecordingSupabaseClient, filterValue, type RecordedQuery } from "../helpers/recording-supabase-client"

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

    // 페이지 경계가 흔들리지 않도록 모든 스캔 페이지는 유일 키(external_id)로 정렬한다.
    const externalPages = queries.filter((query) => query.table === "external_crm_records")
    expect(externalPages.length).toBeGreaterThanOrEqual(3)
    expect(externalPages.every((query) => JSON.stringify(query.order) === JSON.stringify([{ column: "external_id", ascending: true }]))).toBe(true)

    // 페이지가 이어져 전량이 모인다.
    expect(result.ok).toBe(true)
    expect(result.summary.totalCount).toBe(2_500)
  })
})

// loadBranchRevRegionHints — 단일 .limit(5000)은 PostgREST max-rows(1000)에서 잘렸고 오류는 빈 힌트로 숨겨졌다.
// 빈 힌트가 스냅샷에 구워지면 지역·과금 유형이 전 행에서 덮어써지므로, 페이지로 전량 읽고 오류는 던진다.
describe("crm-neo-customer-snapshots region hints", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  function hintResolver(options: { revError?: boolean; revTotal?: number; accounts?: unknown[] }) {
    return (query: RecordedQuery) => {
      if (query.table === "crm_neo_customer_snapshots" && query.method === "select") {
        return { data: null, error: { code: "42P01", message: 'relation "crm_neo_customer_snapshots" does not exist' }, count: null }
      }
      if (query.table === "branch_rev_deals") {
        if (options.revError) return { data: null, error: { message: "rev boom" }, count: null }
        const total = options.revTotal ?? 0
        const range = query.range ?? { from: 0, to: total - 1 }
        const end = Math.min(range.to, range.from + 999, total - 1)
        const data = []
        for (let i = range.from; i <= end; i += 1) {
          data.push({ id: `rev-${i}`, sheet_row: i, customer_name: `고객 ${i}`, region: "서울", product_version: null, first_payment: null, contract_target: null })
        }
        return { data, error: null, count: query.selectOptions?.count === "exact" ? total : null }
      }
      if (query.table === "external_crm_records") {
        const rows = filterValue(query, "object_api_key") === "account" ? options.accounts ?? [] : []
        return { data: rows, error: null, count: query.selectOptions?.count === "exact" ? rows.length : null }
      }
      return { data: [], error: null, count: null }
    }
  }

  async function load(resolver: ReturnType<typeof hintResolver>) {
    vi.resetModules()
    const recorder = createRecordingSupabaseClient(resolver)
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => recorder.client) }))
    const mod = await import("@/lib/repositories/crm-neo-customer-snapshots")
    return { mod, queries: recorder.queries }
  }

  it("branch_rev_deals 와 확정 링크를 id 정렬 range 로 1000행 너머까지 읽는다", async () => {
    const { mod, queries } = await load(hintResolver({ revTotal: 2_300 }))

    await mod.refreshCrmNeoCustomerSnapshotsFromExternalRecords()

    const revPages = queries.filter((query) => query.table === "branch_rev_deals")
    expect(revPages.map((query) => query.range?.from)).toEqual([0, 1000, 2000])
    expect(revPages.every((query) => query.order[0]?.column === "id")).toBe(true)
    const linkPages = queries.filter((query) => query.table === "crm_source_links")
    expect(linkPages.length).toBe(2)
    expect(linkPages.every((query) => query.range !== null && query.order[0]?.column === "id")).toBe(true)
  })

  it("힌트 조회 오류는 빈 힌트로 숨기지 않고 던지며 스냅샷 upsert 를 하지 않는다", async () => {
    const { mod, queries } = await load(hintResolver({ revError: true, accounts: [accountRow(1)] }))

    await expect(mod.refreshCrmNeoCustomerSnapshotsFromExternalRecords()).rejects.toThrow("rev boom")

    expect(queries.some((query) => query.table === "crm_neo_customer_snapshots" && query.method === "upsert")).toBe(false)
  })

  it("읽기 전용 폴백 목록은 힌트 오류에도 죽지 않고 partial 로 드러낸다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { mod } = await load(hintResolver({ revError: true, accounts: [accountRow(1)] }))

    const result = await mod.listCrmNeoCustomerSnapshots()

    expect(result.ok).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.isPartial).toBe(true)
    expect(result.rows[0]?.partialReason).toContain("지역 힌트")
  })
})

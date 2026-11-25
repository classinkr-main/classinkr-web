// F-29 — 장부 항목을 회계연도 달 범위로 좁혀 .range() 페이지를 끝까지 읽는다(예전: 모든 해 합쳐 최근 1,000건에서 잘림).
// F-04 — (시트 Row ID, 월) 활성 정정 조회. 반영·되돌리기는 장부 항목 태그를 즉시 만료한다(서버 매출 타일이 바로 바뀐다).
// supabase 는 기록용 가짜 클라이언트다(DB 에 붙지 않는다).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createRecordingSupabaseClient, filterValue, type RecordedQuery } from "../helpers/recording-supabase-client"

const mocks = vi.hoisted(() => ({ revalidateTag: vi.fn() }))

function entryRow(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `entry-${String(index).padStart(5, "0")}`,
    draft_id: `draft-${index}`,
    entry_type: "manual-new",
    entry_status: "active",
    source_deal_id: null,
    source_sheet_row: null,
    source_snapshot: {},
    customer_name: `예시학원${index}`,
    manager: "예시A",
    team: "BD",
    ledger_month: "2026-11",
    amount: 10,
    currency: "CNY",
    note: null,
    applied_by: "tester",
    applied_at: "2026-11-20T00:00:00Z",
    reversed_at: null,
    reversed_by: null,
    reversal_reason: null,
    metadata: {},
    created_at: "2026-11-20T00:00:00Z",
    updated_at: "2026-11-20T00:00:00Z",
    ...overrides,
  }
}

let resolver: (query: RecordedQuery) => { data?: unknown[] | null; error?: { message: string; code?: string } | null } = () => ({ data: [] })
const recording = createRecordingSupabaseClient((query) => resolver(query))

vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag, unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => recording.client }))

import {
  applyBranchSalesLedgerDraft,
  BRANCH_SALES_LEDGER_ENTRIES_CACHE_TAG,
  findActiveManualEditEntriesByRowIds,
  listBranchSalesLedgerDrafts,
  listBranchSalesLedgerEntries,
} from "@/lib/repositories/branch-sales-ledger-drafts"

beforeEach(() => {
  recording.queries.length = 0
  mocks.revalidateTag.mockClear()
})

afterEach(() => {
  resolver = () => ({ data: [] })
})

describe("listBranchSalesLedgerEntries({ months }) — 달 범위 페이지 읽기(F-29)", () => {
  it("1,000건을 넘는 회계연도 항목을 페이지로 끝까지 읽는다 — 잘리지 않고 truncated=false", async () => {
    const all = Array.from({ length: 2_345 }, (_, index) => entryRow(index))
    resolver = (query) => {
      const range = query.range ?? { from: 0, to: all.length - 1 }
      return { data: all.slice(range.from, range.to + 1) }
    }

    const result = await listBranchSalesLedgerEntries({ months: { from: "2026-04", to: "2027-03" } })

    expect(result.entries).toHaveLength(2_345)
    expect(result.entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(23_450)
    expect(result.truncated).toBe(false)
    expect(result.health.ok).toBe(true)
    const queries = recording.queries.filter((query) => query.table === "branch_sales_ledger_entries")
    expect(queries.map((query) => query.range)).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2999 },
    ])
    for (const query of queries) {
      expect(filterValue(query, "ledger_month", "gte")).toBe("2026-04")
      expect(filterValue(query, "ledger_month", "lte")).toBe("2027-03")
      expect(filterValue(query, "entry_status")).toBe("active")
      // 유일한 정렬 키(반영 시각 + id) — 페이지 경계에서 행이 겹치거나 빠지지 않는다.
      expect(query.order).toEqual([{ column: "applied_at", ascending: false }, { column: "id", ascending: false }])
      expect(query.limit).toBeNull()
    }
  })

  it("상쇄 목록도 같은 달 범위로 읽는다", async () => {
    resolver = () => ({ data: [entryRow(1, { entry_status: "reversed" })] })
    const result = await listBranchSalesLedgerEntries({ status: "reversed", months: { from: "2026-04", to: "2027-03" } })
    expect(result.entries.map((entry) => entry.entryStatus)).toEqual(["reversed"])
    expect(filterValue(recording.queries[0], "entry_status")).toBe("reversed")
  })

  it("표가 없으면(마이그레이션 전) 빈 목록 + health false, 그 밖의 오류는 던진다", async () => {
    resolver = () => ({ data: null, error: { code: "42P01", message: 'relation "branch_sales_ledger_entries" does not exist' } })
    const notReady = await listBranchSalesLedgerEntries({ months: { from: "2026-04", to: "2027-03" } })
    expect(notReady.health.ok).toBe(false)
    expect(notReady.entries).toEqual([])

    resolver = () => ({ data: null, error: { message: "timeout" } })
    await expect(listBranchSalesLedgerEntries({ months: { from: "2026-04", to: "2027-03" } })).rejects.toThrow("timeout")
  })

  it("잘못된 달 범위는 조회하지 않고 던진다", async () => {
    await expect(listBranchSalesLedgerEntries({ months: { from: "2027-03", to: "2026-04" } })).rejects.toThrow("잘못된 달 범위")
    expect(recording.queries).toHaveLength(0)
  })

  it("적용 초안도 달 범위·상태로 끝까지 읽는다", async () => {
    resolver = () => ({ data: [] })
    await listBranchSalesLedgerDrafts({ statuses: ["applied"], months: { from: "2026-04", to: "2027-03" } })
    const query = recording.queries[0]
    expect(query.table).toBe("branch_sales_ledger_drafts")
    expect(filterValue(query, "status", "in")).toEqual(["applied"])
    expect(filterValue(query, "ledger_month", "gte")).toBe("2026-04")
    expect(query.range).toEqual({ from: 0, to: 999 })
  })
})

describe("findActiveManualEditEntriesByRowIds — (시트 Row ID, 월) 활성 정정(F-04)", () => {
  it("JSON 경로로 Row ID·달을 좁히고, 돌아온 행을 (Row ID, 월) 쌍으로 다시 거른다", async () => {
    const baseline = (rowId: string) => ({ sheetBaseline: { rowId } })
    resolver = () => ({
      data: [
        { id: "e-1", draft_id: "d-1", ledger_month: "2026-11", source_snapshot: baseline("r_000000000001") },
        // 같은 Row ID 다른 달 — 쌍이 아니다.
        { id: "e-2", draft_id: "d-2", ledger_month: "2026-12", source_snapshot: baseline("r_000000000001") },
        { id: "e-3", draft_id: null, ledger_month: "2026-12", source_snapshot: baseline("r_000000000002") },
      ],
    })
    const found = await findActiveManualEditEntriesByRowIds([
      { rowId: "r_000000000001", month: "2026-11" },
      { rowId: "r_000000000002", month: "2026-12" },
    ])
    expect(found).toEqual([
      { id: "e-1", draftId: "d-1", entryType: "manual-edit", entryStatus: "active", month: "2026-11", sourceSnapshot: baseline("r_000000000001") },
      { id: "e-3", draftId: null, entryType: "manual-edit", entryStatus: "active", month: "2026-12", sourceSnapshot: baseline("r_000000000002") },
    ])
    const query = recording.queries[0]
    expect(query.select).toBe("id, draft_id, ledger_month, source_snapshot")
    expect(filterValue(query, "entry_status")).toBe("active")
    expect(filterValue(query, "entry_type")).toBe("manual-edit")
    expect(filterValue(query, "source_snapshot->sheetBaseline->>rowId", "in")).toEqual(["r_000000000001", "r_000000000002"])
    expect(filterValue(query, "ledger_month", "in")).toEqual(["2026-11", "2026-12"])
  })

  it("쌍이 없으면 조회하지 않는다", async () => {
    expect(await findActiveManualEditEntriesByRowIds([])).toEqual([])
    expect(recording.queries).toHaveLength(0)
  })
})

describe("반영 뒤 장부 항목 캐시 — 즉시 만료", () => {
  it("적용하면 장부 항목 태그를 { expire: 0 } 으로 만료한다(다음 조회가 새 값 — 서버 매출 타일)", async () => {
    const client = recording.client as unknown as { rpc?: unknown }
    client.rpc = vi.fn(async () => ({ data: null, error: null }))
    await applyBranchSalesLedgerDraft("draft-1", "tester")
    expect(mocks.revalidateTag).toHaveBeenCalledWith(BRANCH_SALES_LEDGER_ENTRIES_CACHE_TAG, { expire: 0 })
    delete client.rpc
  })
})

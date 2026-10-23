// REV 시트 쓰기(ADR-011) 반영을 받치는 초안 저장소 함수 — supabase 는 목(실제 DB 호출 없음).
//  - applyBranchSalesLedgerDraftIfUnchanged: 시트에 쓰는 사이 초안이 고쳐졌으면 장부에 적지 않는다(RPC 가 던짐 → 번역)
//  - findActiveManualEditEntries: 장부 유일성 인덱스가 막을 반영을 시트에 쓰기 전에 가려낸다
//  - deleteBranchSalesLedgerDraft: 시트 쓰기 감사 행이 있는 초안의 FK(23503)를 레코드 오류로 번역한다
import { afterEach, describe, expect, it, vi } from "vitest"

type RpcResult = { data: unknown; error: { code?: string; message: string; details?: string } | null }

interface Recorded {
  table: string
  method: "select" | "delete"
  select?: string
  eq: Array<[string, unknown]>
  neq: Array<[string, unknown]>
  in: Array<[string, unknown[]]>
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    kind: "edit-row",
    status: "applied",
    source_deal_id: "deal-1",
    source_sheet_row: 3,
    source_snapshot: {},
    customer_name: "가나학원",
    manager: null,
    team: "BD",
    ledger_month: "2026-10",
    amount: 500,
    currency: "CNY",
    note: null,
    created_by: "tester",
    updated_by: "tester",
    checked_by: "tester",
    checked_at: "2026-10-23T02:00:00.000Z",
    applied_by: "tester",
    applied_at: "2026-10-23T03:00:00.000Z",
    metadata: {},
    created_at: "2026-10-23T01:00:00.000Z",
    updated_at: "2026-10-23T03:00:00.000Z",
    ...overrides,
  }
}

async function load(opts: {
  rpc?: (fn: string, params: Record<string, unknown>) => RpcResult
  tableResult?: (query: Recorded) => { data: unknown; error: { code?: string; message: string; details?: string } | null; count?: number }
}) {
  vi.resetModules()
  const queries: Recorded[] = []
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []
  const client = {
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params })
      if (!opts.rpc) throw new Error(`[test] unexpected rpc ${fn}`)
      return opts.rpc(fn, params)
    }),
    from: vi.fn((table: string) => {
      const query: Recorded = { table, method: "select", eq: [], neq: [], in: [] }
      queries.push(query)
      const builder = {
        select: (columns: string) => {
          query.select = columns
          return builder
        },
        delete: () => {
          query.method = "delete"
          return builder
        },
        eq: (column: string, value: unknown) => {
          query.eq.push([column, value])
          return builder
        },
        neq: (column: string, value: unknown) => {
          query.neq.push([column, value])
          return builder
        },
        in: (column: string, values: unknown[]) => {
          query.in.push([column, values])
          return builder
        },
        then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => {
          try {
            resolve(opts.tableResult ? opts.tableResult(query) : { data: [], error: null })
          } catch (error) {
            reject?.(error)
          }
        },
      }
      return builder
    }),
  }
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => client) }))
  vi.doMock("next/cache", () => ({ revalidateTag: vi.fn() }))
  const repository = await import("@/lib/repositories/branch-sales-ledger-drafts")
  return { repository, queries, rpcCalls }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("applyBranchSalesLedgerDraftIfUnchanged — 계획 때 본 초안 그대로일 때만", () => {
  it("계획 때 본 updated_at 을 실어 CAS RPC 를 부르고, 적용된 초안을 돌려준다", async () => {
    const { repository, rpcCalls } = await load({ rpc: () => ({ data: draftRow(), error: null }) })
    const applied = await repository.applyBranchSalesLedgerDraftIfUnchanged("draft-1", "tester", "2026-10-23T02:00:00.123456+00:00")
    expect(rpcCalls).toEqual([
      {
        fn: "apply_branch_sales_ledger_draft_if_unchanged",
        params: { p_actor: "tester", p_draft_id: "draft-1", p_expected_updated_at: "2026-10-23T02:00:00.123456+00:00" },
      },
    ])
    expect(applied).toMatchObject({ id: "draft-1", status: "applied", amount: 500 })
  })

  it("RPC 가 'branch_sales_ledger_draft_changed' 를 던지면 초안 변경 오류로 번역한다(다른 오류와 구분)", async () => {
    const { repository } = await load({
      rpc: () => ({ data: null, error: { code: "P0001", message: "branch_sales_ledger_draft_changed", details: "draft x changed" } }),
    })
    const error = await repository.applyBranchSalesLedgerDraftIfUnchanged("draft-1", "tester", "t").catch((e: unknown) => e)
    expect(repository.isBranchSalesLedgerDraftChangedError(error)).toBe(true)
    // 이 문구는 "미적용"으로 잘못 읽히면 안 된다(isBranchSalesLedgerDraftsNotReadyError 는 "매출 장부" 낱말로 판정).
    expect(repository.isBranchSalesLedgerDraftsNotReadyError(error)).toBe(false)
    expect(repository.isBranchSalesLedgerDuplicateActiveCorrectionError(error)).toBe(false)
  })

  it("checked 가 아니면 null(기존 apply 와 같다), 유일성 위반·함수 없음은 기존 번역", async () => {
    const nullResult = await load({ rpc: () => ({ data: null, error: null }) })
    await expect(nullResult.repository.applyBranchSalesLedgerDraftIfUnchanged("draft-1", "tester", "t")).resolves.toBeNull()

    const duplicate = await load({
      rpc: () => ({
        data: null,
        error: { code: "23505", message: 'duplicate key value violates unique constraint "branch_sales_ledger_entries_active_manual_edit_unique"' },
      }),
    })
    const dupError = await duplicate.repository.applyBranchSalesLedgerDraftIfUnchanged("draft-1", "tester", "t").catch((e: unknown) => e)
    expect(duplicate.repository.isBranchSalesLedgerDuplicateActiveCorrectionError(dupError)).toBe(true)

    const missing = await load({
      rpc: () => ({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function public.apply_branch_sales_ledger_draft_if_unchanged(p_actor, p_draft_id, p_expected_updated_at) in the schema cache" },
      }),
    })
    const missingError = await missing.repository.applyBranchSalesLedgerDraftIfUnchanged("draft-1", "tester", "t").catch((e: unknown) => e)
    expect(missing.repository.isBranchSalesLedgerDraftsNotReadyError(missingError)).toBe(true)
    expect(missing.repository.isBranchSalesLedgerDraftChangedError(missingError)).toBe(false)
  })
})

describe("findActiveManualEditEntries — 장부 유일성 인덱스 대상", () => {
  it("활성 manual-edit 만, 딜 id 로 묻고 달은 짝으로 거른다", async () => {
    const { repository, queries } = await load({
      tableResult: () => ({
        data: [
          { id: "e1", draft_id: "old", source_deal_id: "deal-1", ledger_month: "2026-10" },
          { id: "e2", draft_id: "nov", source_deal_id: "deal-1", ledger_month: "2026-11" },
          { id: "e3", draft_id: "other", source_deal_id: "deal-2", ledger_month: "2026-12" },
        ],
        error: null,
      }),
    })
    const entries = await repository.findActiveManualEditEntries([
      { sourceDealId: "deal-1", month: "2026-10" },
      { sourceDealId: "deal-2", month: "2026-10" },
      { sourceDealId: "deal-1", month: "2026-10" },
    ])
    expect(entries).toEqual([{ id: "e1", draftId: "old", sourceDealId: "deal-1", month: "2026-10" }])
    expect(queries).toHaveLength(1)
    expect(queries[0]).toMatchObject({
      table: "branch_sales_ledger_entries",
      select: "id, draft_id, source_deal_id, ledger_month",
      eq: [["entry_status", "active"], ["entry_type", "manual-edit"]],
      in: [["source_deal_id", ["deal-1", "deal-2"]]],
    })
  })

  it("짝이 없으면 묻지 않고, 조회 실패는 던진다(호출부가 시트에 쓰지 않는다)", async () => {
    const empty = await load({})
    await expect(empty.repository.findActiveManualEditEntries([])).resolves.toEqual([])
    expect(empty.queries).toHaveLength(0)

    const failing = await load({ tableResult: () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }) })
    await expect(failing.repository.findActiveManualEditEntries([{ sourceDealId: "deal-1", month: "2026-10" }])).rejects.toThrow(/활성 정정 조회 실패/)
  })
})

describe("deleteBranchSalesLedgerDraft — 시트 쓰기 감사 행이 있는 초안", () => {
  it("감사 행 FK(23503)는 '취소로 정리' 레코드 오류로 번역한다(원인 없는 500 이 아니다)", async () => {
    const { repository } = await load({
      tableResult: () => ({
        data: null,
        error: {
          code: "23503",
          message: 'update or delete on table "branch_sales_ledger_drafts" violates foreign key constraint "branch_sales_ledger_sheet_writes_draft_id_fkey" on table "branch_sales_ledger_sheet_writes"',
          details: 'Key (id)=(draft-1) is still referenced from table "branch_sales_ledger_sheet_writes".',
        },
      }),
    })
    const error = await repository.deleteBranchSalesLedgerDraft("draft-1").catch((e: unknown) => e)
    expect(repository.isBranchSalesLedgerDraftHasSheetWritesError(error)).toBe(true)
    expect((error as Error).message).toBe("시트 반영 시도 기록이 있는 초안은 삭제할 수 없습니다 — 취소로 정리해 주세요.")
    expect(repository.isBranchSalesLedgerDraftsNotReadyError(error)).toBe(false)
  })

  it("다른 FK 위반은 일반 삭제 실패로 던진다(오탐 방지)", async () => {
    const { repository } = await load({
      tableResult: () => ({ data: null, error: { code: "23503", message: 'violates foreign key constraint "something_else" on table "other"' } }),
    })
    const error = await repository.deleteBranchSalesLedgerDraft("draft-1").catch((e: unknown) => e)
    expect(repository.isBranchSalesLedgerDraftHasSheetWritesError(error)).toBe(false)
    expect((error as Error).message).toMatch(/삭제 실패/)
  })
})

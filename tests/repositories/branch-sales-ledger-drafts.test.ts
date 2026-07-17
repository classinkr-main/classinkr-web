// 웨이브 5 — 되돌리기(reverse) 백엔드 회귀.
// (1) listBranchSalesLedgerEntries 기본 호출이 entry_status='reversed'를 집계에서 제외하는지
//     (item 2 — 반전 항목이 확정 합계에서 빠져야 한다)
// (2) reverseBranchSalesLedgerEntryByDraftId가 draft_id -> entry_id를 해결해 RPC를 부르고,
//     연결 항목이 없으면 RPC를 아예 호출하지 않은 채 null을 반환하는지
// (3) applyBranchSalesLedgerDraft가 활성 정정 유일성 인덱스(23505) 위반을 사용자 친화적
//     409 메시지로 번역하는지 (item 4)
import { afterEach, describe, expect, it, vi } from "vitest"

interface EntryFixtureRow {
  id: string
  draft_id: string | null
  entry_type: "manual-new" | "manual-edit"
  entry_status: "active" | "reversed"
  source_deal_id: string | null
  source_sheet_row: number | null
  source_snapshot: Record<string, unknown> | null
  customer_name: string
  manager: string | null
  team: string | null
  ledger_month: string
  amount: number
  currency: string
  note: string | null
  applied_by: string | null
  applied_at: string
  reversed_at: string | null
  reversed_by: string | null
  reversal_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function entryRow(overrides: Partial<EntryFixtureRow> = {}): EntryFixtureRow {
  return {
    id: "entry-1",
    draft_id: "draft-1",
    entry_type: "manual-new",
    entry_status: "active",
    source_deal_id: "deal-1",
    source_sheet_row: null,
    source_snapshot: {},
    customer_name: "테스트 학원",
    manager: "김지사",
    team: "BD",
    ledger_month: "2026-08",
    amount: 1_000_000,
    currency: "CNY",
    note: null,
    applied_by: "tester",
    applied_at: "2026-07-01T00:00:00Z",
    reversed_at: null,
    reversed_by: null,
    reversal_reason: null,
    metadata: {},
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  }
}

interface Fixture {
  entries?: EntryFixtureRow[]
  entryIdByDraftId?: Record<string, string | undefined>
  rpc?: Record<string, (params: Record<string, unknown>) => { data: unknown; error: { code?: string; message: string } | null }>
}

function makeClient(fixture: Fixture) {
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []

  const from = vi.fn((table: string) => {
    if (table !== "branch_sales_ledger_entries") {
      throw new Error(`[test] unexpected table: ${table}`)
    }
    const filters: Record<string, unknown> = {}
    const builder: {
      select: (cols: string) => typeof builder
      order: (col: string, opts?: unknown) => typeof builder
      limit: (n: number) => typeof builder
      eq: (col: string, value: unknown) => typeof builder
      maybeSingle: () => Promise<{ data: unknown; error: null }>
      then: (resolve: (v: { data: unknown; error: null }) => void) => void
    } = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (col, value) => {
        filters[col] = value
        return builder
      },
      maybeSingle: async () => {
        const draftId = filters.draft_id as string | undefined
        const entryId = draftId ? fixture.entryIdByDraftId?.[draftId] : undefined
        return { data: entryId ? { id: entryId } : null, error: null }
      },
      then: (resolve) => {
        let rows = fixture.entries ?? []
        if (typeof filters.entry_status === "string") {
          rows = rows.filter((row) => row.entry_status === filters.entry_status)
        }
        resolve({ data: rows, error: null })
      },
    }
    return builder
  })

  const rpc = vi.fn((fn: string, params: Record<string, unknown>) => {
    rpcCalls.push({ fn, params })
    const handler = fixture.rpc?.[fn]
    if (!handler) throw new Error(`[test] unexpected rpc: ${fn}`)
    return Promise.resolve(handler(params))
  })

  return { from, rpc, rpcCalls }
}

async function loadRepository(fixture: Fixture) {
  vi.resetModules()
  const client = makeClient(fixture)

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => client),
  }))
  vi.doMock("next/cache", () => ({
    revalidateTag: vi.fn(),
  }))

  const repository = await import("@/lib/repositories/branch-sales-ledger-drafts")
  return { repository, client }
}

describe("listBranchSalesLedgerEntries — reversed 항목 집계 제외 회귀 (item 2)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("옵션 없이 호출하면 entry_status='active'만 반환한다 (기본 집계 소비처 전제)", async () => {
    const { repository } = await loadRepository({
      entries: [
        entryRow({ id: "active-1", entry_status: "active", amount: 500_000 }),
        entryRow({ id: "reversed-1", entry_status: "reversed", amount: 999_999 }),
      ],
    })

    const result = await repository.listBranchSalesLedgerEntries()

    expect(result.entries.map((e) => e.id)).toEqual(["active-1"])
    expect(result.entries.every((e) => e.entryStatus === "active")).toBe(true)
  })

  it("status='all'을 명시하면 reversed도 포함한다 (감사/조회 용도)", async () => {
    const { repository } = await loadRepository({
      entries: [
        entryRow({ id: "active-1", entry_status: "active" }),
        entryRow({ id: "reversed-1", entry_status: "reversed" }),
      ],
    })

    const result = await repository.listBranchSalesLedgerEntries({ status: "all" })

    expect(result.entries.map((e) => e.id).sort()).toEqual(["active-1", "reversed-1"])
  })

  it("status='reversed'을 명시하면 reversed만 반환한다", async () => {
    const { repository } = await loadRepository({
      entries: [
        entryRow({ id: "active-1", entry_status: "active" }),
        entryRow({ id: "reversed-1", entry_status: "reversed" }),
      ],
    })

    const result = await repository.listBranchSalesLedgerEntries({ status: "reversed" })

    expect(result.entries.map((e) => e.id)).toEqual(["reversed-1"])
  })
})

describe("reverseBranchSalesLedgerEntryByDraftId (item 1/3)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("draft_id -> entry_id를 해결해 RPC를 entry_id로 호출하고 매핑된 entry를 반환한다", async () => {
    const reversedRow = entryRow({
      id: "entry-1",
      entry_status: "reversed",
      reversed_at: "2026-07-17T00:00:00Z",
      reversed_by: "tester",
      reversal_reason: null,
    })
    const { repository, client } = await loadRepository({
      entryIdByDraftId: { "draft-1": "entry-1" },
      rpc: {
        reverse_branch_sales_ledger_entry: () => ({ data: reversedRow, error: null }),
      },
    })

    const entry = await repository.reverseBranchSalesLedgerEntryByDraftId("draft-1", "tester")

    expect(entry?.id).toBe("entry-1")
    expect(entry?.entryStatus).toBe("reversed")
    expect(entry?.reversedBy).toBe("tester")
    expect(client.rpcCalls).toEqual([
      { fn: "reverse_branch_sales_ledger_entry", params: { p_entry_id: "entry-1", p_actor: "tester" } },
    ])
  })

  it("reason이 주어지면 p_reason으로 전달한다(트림 후 빈 문자열이면 생략)", async () => {
    const { repository, client } = await loadRepository({
      entryIdByDraftId: { "draft-1": "entry-1" },
      rpc: {
        reverse_branch_sales_ledger_entry: () => ({ data: entryRow({ entry_status: "reversed" }), error: null }),
      },
    })

    await repository.reverseBranchSalesLedgerEntryByDraftId("draft-1", "tester", "  잘못 입력됨  ")

    expect(client.rpcCalls[0].params).toEqual({
      p_entry_id: "entry-1",
      p_actor: "tester",
      p_reason: "잘못 입력됨",
    })
  })

  it("draft에 연결된 entry가 없으면 RPC를 호출하지 않고 null을 반환한다", async () => {
    const { repository, client } = await loadRepository({
      entryIdByDraftId: {},
    })

    const entry = await repository.reverseBranchSalesLedgerEntryByDraftId("draft-missing", "tester")

    expect(entry).toBeNull()
    expect(client.rpcCalls).toEqual([])
  })

  it("이미 reversed인 entry를 RPC가 그대로 반환해도(멱등) 정상 매핑한다", async () => {
    const alreadyReversed = entryRow({
      id: "entry-1",
      entry_status: "reversed",
      reversed_at: "2026-07-01T00:00:00Z",
      reversed_by: "first-actor",
    })
    const { repository } = await loadRepository({
      entryIdByDraftId: { "draft-1": "entry-1" },
      rpc: {
        reverse_branch_sales_ledger_entry: () => ({ data: alreadyReversed, error: null }),
      },
    })

    const entry = await repository.reverseBranchSalesLedgerEntryByDraftId("draft-1", "second-actor")

    // RPC 멱등성 자체는 SQL 레벨(migration test)에서 검증 — 여기서는 repository가 RPC 결과를
    // 있는 그대로(최초 반전자 보존) 매핑해서 돌려주는지만 본다.
    expect(entry?.reversedBy).toBe("first-actor")
  })
})

describe("applyBranchSalesLedgerDraft — 활성 정정 유일성 위반 번역 (item 4)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("23505 + 인덱스명이 매칭되면 사용자 친화적 메시지로 던지고, 매처가 이를 인식한다", async () => {
    const { repository } = await loadRepository({
      rpc: {
        apply_branch_sales_ledger_draft: () => ({
          data: null,
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "branch_sales_ledger_entries_active_manual_edit_unique"',
          },
        }),
      },
    })

    await expect(repository.applyBranchSalesLedgerDraft("draft-1", "tester")).rejects.toThrow(
      "이미 이 딜·월에 적용된 정정 항목이 있습니다. 기존 항목을 먼저 반전한 뒤 다시 적용하세요.",
    )

    try {
      await repository.applyBranchSalesLedgerDraft("draft-1", "tester")
      expect.unreachable()
    } catch (error) {
      expect(repository.isBranchSalesLedgerDuplicateActiveCorrectionError(error)).toBe(true)
    }
  })

  it("무관한 23505(다른 제약)는 일반 실패 메시지로 던진다 — 오탐 방지", async () => {
    const { repository } = await loadRepository({
      rpc: {
        apply_branch_sales_ledger_draft: () => ({
          data: null,
          error: { code: "23505", message: 'duplicate key value violates unique constraint "some_other_constraint"' },
        }),
      },
    })

    await expect(repository.applyBranchSalesLedgerDraft("draft-1", "tester")).rejects.toThrow(
      /적용 실패/,
    )
  })
})

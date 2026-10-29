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

// ── 웨이브7 — 초안 API 서버 강건성(I1 new-row 멱등 방어, I4 낙관적 잠금, I5 관련 에러 번역) ──
// 아래는 branch_sales_ledger_drafts 테이블을 대상으로 하는 별도의 경량 쿼리빌더 목이다(위
// makeClient는 branch_sales_ledger_entries 전용으로 스코프돼 있어 재사용하지 않는다).

interface DraftFixtureRow {
  id: string
  kind: "new-row" | "edit-row"
  status: "draft" | "checked" | "applied" | "cancelled"
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
  created_by: string | null
  updated_by: string | null
  checked_by: string | null
  checked_at: string | null
  applied_by: string | null
  applied_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function draftRow(overrides: Partial<DraftFixtureRow> = {}): DraftFixtureRow {
  return {
    id: "draft-1",
    kind: "new-row",
    status: "draft",
    source_deal_id: null,
    source_sheet_row: null,
    source_snapshot: {},
    customer_name: "테스트 학원",
    manager: null,
    team: null,
    ledger_month: "2026-08",
    amount: 1_000_000,
    currency: "CNY",
    note: null,
    created_by: "tester",
    updated_by: "tester",
    checked_by: null,
    checked_at: null,
    applied_by: null,
    applied_at: null,
    metadata: {},
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
    ...overrides,
  }
}

interface DraftsFixture {
  rows?: DraftFixtureRow[]
  insert?: (payload: Record<string, unknown>) => { data: unknown; error: { code?: string; message: string } | null }
  // 라운드4(P0-2) 자가 체크 재편집은 잠금 해제 UPDATE(.eq("status","checked") 포함)와 본 UPDATE
  // 두 번을 순서대로 부른다 — 필터 검증을 위해 id/updated_at뿐 아니라 실제로 걸린 모든 eq
  // 컬럼(예: status)을 그대로 넘긴다(기존 필드 id/updated_at 접근은 하위호환으로 그대로 동작).
  update?: (
    payload: Record<string, unknown>,
    filters: Record<string, unknown>,
  ) => { data: unknown; error: { code?: string; message: string } | null }
}

function makeDraftsClient(fixture: DraftsFixture) {
  const selectCalls: Array<Record<string, unknown>> = []
  const insertCalls: Array<Record<string, unknown>> = []
  const updateCalls: Array<{ payload: Record<string, unknown>; filters: Record<string, unknown> }> = []

  const from = vi.fn((table: string) => {
    if (table !== "branch_sales_ledger_drafts") {
      throw new Error(`[test] unexpected table: ${table}`)
    }

    let mode: "select" | "insert" | "update" = "select"
    let payload: Record<string, unknown> = {}
    const eqFilters: Record<string, unknown> = {}
    const inFilters: Record<string, unknown[]> = {}
    const gteFilters: Record<string, unknown> = {}

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (p: Record<string, unknown>) => {
        mode = "insert"
        payload = p
        return builder
      },
      update: (p: Record<string, unknown>) => {
        mode = "update"
        payload = p
        return builder
      },
      eq: (col: string, val: unknown) => {
        eqFilters[col] = val
        return builder
      },
      neq: () => builder,
      in: (col: string, vals: unknown[]) => {
        inFilters[col] = vals
        return builder
      },
      gte: (col: string, val: unknown) => {
        gteFilters[col] = val
        return builder
      },
      order: () => builder,
      limit: () => builder,
      single: async () => {
        insertCalls.push(payload)
        return fixture.insert ? fixture.insert(payload) : { data: null, error: { message: "no insert handler" } }
      },
      maybeSingle: async () => {
        if (mode === "insert") {
          insertCalls.push(payload)
          return fixture.insert ? fixture.insert(payload) : { data: null, error: { message: "no insert handler" } }
        }
        if (mode === "update") {
          // 이전에는 id/updated_at만 골라 담았지만, 라운드4(P0-2) 잠금 해제 UPDATE 검증에는
          // .eq("status","checked") 같은 다른 컬럼 필터도 필요해 걸린 eq 전부를 담는다 — 기존
          // 테스트가 읽는 filters.id/filters.updated_at는 그대로 값이 존재해 영향이 없다.
          const filters: Record<string, unknown> = { ...eqFilters }
          updateCalls.push({ payload, filters })
          return fixture.update ? fixture.update(payload, filters) : { data: null, error: null }
        }
        selectCalls.push({ eq: { ...eqFilters }, in: { ...inFilters }, gte: { ...gteFilters } })
        const rows = fixture.rows ?? []
        const matched = rows.filter((row) => {
          for (const [col, val] of Object.entries(eqFilters)) {
            if ((row as unknown as Record<string, unknown>)[col] !== val) return false
          }
          for (const [col, vals] of Object.entries(inFilters)) {
            if (!vals.includes((row as unknown as Record<string, unknown>)[col])) return false
          }
          for (const [col, val] of Object.entries(gteFilters)) {
            const rowVal = (row as unknown as Record<string, unknown>)[col] as string
            if (!(rowVal >= (val as string))) return false
          }
          return true
        })
        const sorted = [...matched].sort((a, b) => (b.created_at > a.created_at ? 1 : a.created_at < b.created_at ? -1 : 0))
        return { data: sorted[0] ?? null, error: null }
      },
    }
    return builder
  })

  return { from, selectCalls, insertCalls, updateCalls }
}

async function loadDraftsRepository(fixture: DraftsFixture) {
  vi.resetModules()
  const client = makeDraftsClient(fixture)

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => client),
  }))
  vi.doMock("next/cache", () => ({
    revalidateTag: vi.fn(),
  }))

  const repository = await import("@/lib/repositories/branch-sales-ledger-drafts")
  return { repository, client }
}

describe("createBranchSalesLedgerDraft — new-row 이중 제출 방어(I1)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("직전 60초 내 동일 (kind=new-row, customer, month, amount) 열린 초안이 있으면 새로 만들지 않고 그대로 반환한다", async () => {
    const recent = draftRow({
      id: "existing-draft",
      status: "draft",
      customer_name: "테스트 학원",
      ledger_month: "2026-08",
      amount: 1_000_000,
      created_at: new Date(Date.now() - 5_000).toISOString(),
    })
    const { repository, client } = await loadDraftsRepository({ rows: [recent] })

    const result = await repository.createBranchSalesLedgerDraft(
      { kind: "new-row", customer: "테스트 학원", month: "2026-08", amount: 1_000_000 },
      "tester",
    )

    expect(result.dedupedRecent).toBe(true)
    expect(result.draft.id).toBe("existing-draft")
    expect(client.insertCalls).toEqual([]) // INSERT를 아예 시도하지 않았다
  })

  it("일치하는 열린 초안이 없으면 정상적으로 INSERT하고 dedupedRecent:false를 반환한다", async () => {
    const inserted = draftRow({ id: "new-draft", customer_name: "새 학원", ledger_month: "2026-09", amount: 500_000 })
    const { repository, client } = await loadDraftsRepository({
      rows: [],
      insert: () => ({ data: inserted, error: null }),
    })

    const result = await repository.createBranchSalesLedgerDraft(
      { kind: "new-row", customer: "새 학원", month: "2026-09", amount: 500_000 },
      "tester",
    )

    expect(result.dedupedRecent).toBe(false)
    expect(result.draft.id).toBe("new-draft")
    expect(client.insertCalls).toHaveLength(1)
  })

  it("checked 상태의 열린 초안도 매칭 대상이다(draft만이 아니라 draft|checked 전체)", async () => {
    const recentChecked = draftRow({
      id: "checked-draft",
      status: "checked",
      customer_name: "테스트 학원",
      ledger_month: "2026-08",
      amount: 1_000_000,
      created_at: new Date(Date.now() - 1_000).toISOString(),
    })
    const { repository, client } = await loadDraftsRepository({ rows: [recentChecked] })

    const result = await repository.createBranchSalesLedgerDraft(
      { kind: "new-row", customer: "테스트 학원", month: "2026-08", amount: 1_000_000 },
      "tester",
    )

    expect(result.dedupedRecent).toBe(true)
    expect(result.draft.id).toBe("checked-draft")
    expect(client.insertCalls).toEqual([])
  })

  it("60초보다 오래된 동일 입력은 매칭하지 않고 새로 INSERT한다(시간창 경계)", async () => {
    const stale = draftRow({
      id: "stale-draft",
      customer_name: "테스트 학원",
      ledger_month: "2026-08",
      amount: 1_000_000,
      created_at: new Date(Date.now() - 120_000).toISOString(),
    })
    const inserted = draftRow({ id: "new-draft-2" })
    const { repository, client } = await loadDraftsRepository({
      rows: [stale],
      insert: () => ({ data: inserted, error: null }),
    })

    const result = await repository.createBranchSalesLedgerDraft(
      { kind: "new-row", customer: "테스트 학원", month: "2026-08", amount: 1_000_000 },
      "tester",
    )

    expect(result.dedupedRecent).toBe(false)
    expect(client.insertCalls).toHaveLength(1)
  })

  it("kind=edit-row는 중복 확인 조회 없이 바로 INSERT한다(정정은 다른 방어선 — 적용 시 유일성 인덱스)", async () => {
    const inserted = draftRow({ id: "edit-draft", kind: "edit-row" })
    const { repository, client } = await loadDraftsRepository({
      rows: [draftRow({ kind: "new-row" })], // 있어도 edit-row 경로는 조회 자체를 안 한다
      insert: () => ({ data: inserted, error: null }),
    })

    const result = await repository.createBranchSalesLedgerDraft(
      { kind: "edit-row", customer: "테스트 학원", month: "2026-08", amount: 1_000_000 },
      "tester",
    )

    expect(result.dedupedRecent).toBe(false)
    expect(client.selectCalls).toEqual([]) // 조회 자체가 없었다
    expect(client.insertCalls).toHaveLength(1)
  })
})

describe("createBranchSalesLedgerDraft — 자가 체크 생성(라운드4 P0-2)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('status:"checked"로 생성하면 insert payload에 status/checked_by/checked_at이 함께 담긴다', async () => {
    const inserted = draftRow({ id: "new-draft", status: "checked", checked_by: "tester" })
    const { repository, client } = await loadDraftsRepository({
      rows: [],
      insert: (payload) => {
        expect(payload.status).toBe("checked")
        expect(payload.checked_by).toBe("tester")
        expect(typeof payload.checked_at).toBe("string")
        return { data: inserted, error: null }
      },
    })

    const result = await repository.createBranchSalesLedgerDraft(
      { kind: "new-row", customer: "테스트 학원", month: "2026-09", amount: 500_000, status: "checked" },
      "tester",
    )

    expect(result.dedupedRecent).toBe(false)
    expect(client.insertCalls).toHaveLength(1)
  })

  it("status를 생략하면 기존과 동일하게 draft로 저장되고 checked_by/checked_at은 없다", async () => {
    const inserted = draftRow({ id: "new-draft-2", status: "draft" })
    const { repository, client } = await loadDraftsRepository({
      rows: [],
      insert: (payload) => {
        expect(payload.status).toBe("draft")
        expect(payload.checked_by).toBeUndefined()
        expect(payload.checked_at).toBeUndefined()
        return { data: inserted, error: null }
      },
    })

    const result = await repository.createBranchSalesLedgerDraft(
      { kind: "new-row", customer: "새 학원", month: "2026-09", amount: 500_000 },
      "tester",
    )

    expect(result.dedupedRecent).toBe(false)
    expect(client.insertCalls).toHaveLength(1)
  })
})

describe("updateBranchSalesLedgerDraft — 낙관적 잠금(I4)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("expectedUpdatedAt을 생략하면 기존과 동일하게 무조건 반영한다(하위호환)", async () => {
    const updated = draftRow({ id: "draft-1", note: "수정됨" })
    const { repository } = await loadDraftsRepository({
      update: (_payload, filters) => {
        expect(filters.id).toBe("draft-1")
        expect(filters.updated_at).toBeUndefined()
        return { data: updated, error: null }
      },
    })

    const result = await repository.updateBranchSalesLedgerDraft("draft-1", { note: "수정됨" }, "tester")

    expect(result.outcome).toBe("updated")
    if (result.outcome === "updated") expect(result.draft.note).toBe("수정됨")
  })

  it("expectedUpdatedAt이 DB의 실제 updated_at과 일치하면 반영하고 updated를 반환한다", async () => {
    const updated = draftRow({ id: "draft-1", note: "반영됨" })
    const { repository } = await loadDraftsRepository({
      update: (_payload, filters) => {
        expect(filters.updated_at).toBe("2026-07-18T00:00:00.000Z")
        return { data: updated, error: null }
      },
    })

    const result = await repository.updateBranchSalesLedgerDraft(
      "draft-1",
      { note: "반영됨" },
      "tester",
      { expectedUpdatedAt: "2026-07-18T00:00:00.000Z" },
    )

    expect(result.outcome).toBe("updated")
  })

  it("expectedUpdatedAt이 어긋나면(다른 곳에서 먼저 수정) conflict + 현재 행을 반환한다", async () => {
    const current = draftRow({ id: "draft-1", note: "다른 사람이 이미 바꿈", updated_at: "2026-07-18T01:00:00.000Z" })
    const { repository, client } = await loadDraftsRepository({
      rows: [current],
      update: () => ({ data: null, error: null }), // CAS 필터에 안 걸려 0행
    })

    const result = await repository.updateBranchSalesLedgerDraft(
      "draft-1",
      { note: "내가 바꾸려던 값" },
      "tester",
      { expectedUpdatedAt: "2026-07-18T00:00:00.000Z" }, // 이미 stale
    )

    expect(result.outcome).toBe("conflict")
    if (result.outcome === "conflict") {
      expect(result.draft.id).toBe("draft-1")
      expect(result.draft.note).toBe("다른 사람이 이미 바꿈")
    }
    // 재조회는 select 경로(.eq("id",...).maybeSingle())를 한 번 더 태운다.
    expect(client.selectCalls.some((c) => (c.eq as Record<string, unknown>)?.id === "draft-1")).toBe(true)
  })

  it("id 자체가 없으면 expectedUpdatedAt이 있어도 conflict가 아니라 not-found다", async () => {
    const { repository } = await loadDraftsRepository({
      rows: [],
      update: () => ({ data: null, error: null }),
    })

    const result = await repository.updateBranchSalesLedgerDraft(
      "missing-draft",
      { note: "x" },
      "tester",
      { expectedUpdatedAt: "2026-07-18T00:00:00.000Z" },
    )

    expect(result.outcome).toBe("not-found")
  })

  it("applied로 잠긴 초안은 expectedUpdatedAt이 있어도 conflict가 아니라 not-found다(기존 404 계약 보존)", async () => {
    const appliedRow = draftRow({ id: "draft-1", status: "applied" })
    const { repository } = await loadDraftsRepository({
      rows: [appliedRow],
      update: () => ({ data: null, error: null }), // neq("status","applied")에 안 걸려 0행
    })

    const result = await repository.updateBranchSalesLedgerDraft(
      "draft-1",
      { note: "x" },
      "tester",
      { expectedUpdatedAt: "2026-07-18T00:00:00.000Z" },
    )

    expect(result.outcome).toBe("not-found")
  })

  it("checked/applied 전이 시 amount>0 CHECK(23514) 위반을 400 대상 친화적 메시지로 번역한다", async () => {
    const { repository } = await loadDraftsRepository({
      update: () => ({
        data: null,
        error: {
          code: "23514",
          message:
            'new row for relation "branch_sales_ledger_drafts" violates check constraint "branch_sales_ledger_drafts_amount_positive_check"',
        },
      }),
    })

    await expect(
      repository.updateBranchSalesLedgerDraft("draft-1", { status: "checked" }, "tester"),
    ).rejects.toThrow("금액이 0 이하인 초안은 체크 완료할 수 없습니다. 금액을 입력한 뒤 다시 시도하세요.")

    try {
      await repository.updateBranchSalesLedgerDraft("draft-1", { status: "checked" }, "tester")
      expect.unreachable()
    } catch (error) {
      expect(repository.isBranchSalesLedgerNonPositiveAmountError(error)).toBe(true)
    }
  })

  it("무관한 23514(다른 제약)는 일반 실패 메시지로 던진다 — 오탐 방지", async () => {
    const { repository } = await loadDraftsRepository({
      update: () => ({
        data: null,
        error: { code: "23514", message: 'violates check constraint "some_other_check"' },
      }),
    })

    await expect(
      repository.updateBranchSalesLedgerDraft("draft-1", { status: "checked" }, "tester"),
    ).rejects.toThrow(/수정 실패/)
  })
})

describe("updateBranchSalesLedgerDraft — 자가 체크 재편집(라운드4 P0-2)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("현재 행이 본인 checked면 잠금 해제 UPDATE 후 본 UPDATE로 이어간다(호출 순서·필터 검증)", async () => {
    const selfChecked = draftRow({
      id: "draft-1",
      status: "checked",
      checked_by: "tester",
      checked_at: "2026-09-01T00:00:00.000Z",
    })
    const unlocked = draftRow({
      id: "draft-1",
      status: "draft",
      checked_by: null,
      checked_at: null,
      updated_at: "2026-09-20T00:00:01.000Z",
    })
    const finalRow = draftRow({ id: "draft-1", status: "checked", amount: 2_000_000, checked_by: "tester" })

    const updateCallOrder: Array<{ payload: Record<string, unknown>; filters: Record<string, unknown> }> = []
    const { repository, client } = await loadDraftsRepository({
      rows: [selfChecked],
      update: (payload, filters) => {
        updateCallOrder.push({ payload, filters })
        if (updateCallOrder.length === 1) return { data: unlocked, error: null }
        return { data: finalRow, error: null }
      },
    })

    const result = await repository.updateBranchSalesLedgerDraft(
      "draft-1",
      { amount: 2_000_000, status: "checked" },
      "tester",
    )

    expect(result.outcome).toBe("updated")
    if (result.outcome === "updated") expect(result.draft.amount).toBe(2_000_000)
    expect(updateCallOrder).toHaveLength(2)

    // 1차: 잠금 해제 UPDATE — 현재 checked인 행만 대상으로 draft로 되돌린다.
    expect(updateCallOrder[0].filters.id).toBe("draft-1")
    expect(updateCallOrder[0].filters.status).toBe("checked")
    expect(updateCallOrder[0].payload).toMatchObject({
      status: "draft",
      checked_by: null,
      checked_at: null,
      updated_by: "tester",
    })

    // 2차: 본 UPDATE — 내용 + status:"checked" 재전이(buildUpdate 경로 — checked_by/checked_at 재기록).
    expect(updateCallOrder[1].payload).toMatchObject({
      amount: 2_000_000,
      status: "checked",
      checked_by: "tester",
    })

    // fetchBranchSalesLedgerDraftById로 현재 행을 먼저 읽었다(자가 체크 여부 판정을 위해).
    expect(client.selectCalls.some((c) => (c.eq as Record<string, unknown>)?.id === "draft-1")).toBe(true)
  })

  it("현재 행이 다른 사람 checked면 checked-by-other를 반환하고 UPDATE는 호출하지 않는다", async () => {
    const othersChecked = draftRow({ id: "draft-1", status: "checked", checked_by: "other-actor" })
    const { repository, client } = await loadDraftsRepository({
      rows: [othersChecked],
      update: () => {
        throw new Error("[test] update should not be called when checked by another actor")
      },
    })

    const result = await repository.updateBranchSalesLedgerDraft(
      "draft-1",
      { amount: 2_000_000, status: "checked" },
      "tester",
    )

    expect(result.outcome).toBe("checked-by-other")
    if (result.outcome === "checked-by-other") {
      expect(result.draft.id).toBe("draft-1")
      expect(result.draft.checkedBy).toBe("other-actor")
    }
    expect(client.updateCalls).toEqual([])
  })

  it('{status:"checked"}만 있으면(내용 변경 없음) 현재 행 조회 없이 기존 단일 UPDATE로 처리한다(토글 경로 불변)', async () => {
    const updated = draftRow({ id: "draft-1", status: "checked" })
    const { repository, client } = await loadDraftsRepository({
      // 다른 사람이 체크한 행이 fixture에 있어도, 이 경로는 애초에 현재 행을 조회하면 안 된다 —
      // 조회했다면(그리고 그 결과를 써서) checked-by-other가 됐을 텐데 그러지 않아야 회귀가 잡힌다.
      rows: [draftRow({ id: "draft-1", status: "checked", checked_by: "other-actor" })],
      update: (_payload, filters) => {
        expect(filters.id).toBe("draft-1")
        return { data: updated, error: null }
      },
    })

    const result = await repository.updateBranchSalesLedgerDraft("draft-1", { status: "checked" }, "tester")

    expect(result.outcome).toBe("updated")
    expect(client.selectCalls).toEqual([]) // fetchBranchSalesLedgerDraftById 조회 자체가 없었다
    expect(client.updateCalls).toHaveLength(1)
  })
})

// ── P2-9 "적용된 값을 한 번에 바꾸기" — supersedeBranchSalesLedgerEntry / probeSupersedeAvailable ──
describe("supersedeBranchSalesLedgerEntry — 원자 대체 RPC 성공 매핑", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("RPC에 4개 파라미터(reason 포함)를 넘기고 반환된 새 초안을 매핑한다", async () => {
    const appliedDraft = draftRow({ id: "new-draft", status: "applied", applied_by: "tester" })
    const { repository, client } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({ data: appliedDraft, error: null }),
      },
    })

    const draft = await repository.supersedeBranchSalesLedgerEntry(
      "old-draft",
      "new-draft",
      "tester",
      "  더 정확한 금액으로 정정  ",
    )

    expect(draft?.id).toBe("new-draft")
    expect(draft?.status).toBe("applied")
    expect(client.rpcCalls).toEqual([
      {
        fn: "supersede_branch_sales_ledger_entry",
        params: {
          p_old_draft_id: "old-draft",
          p_new_draft_id: "new-draft",
          p_actor: "tester",
          p_reason: "더 정확한 금액으로 정정",
        },
      },
    ])
  })

  it("reason을 생략하면 p_reason 없이 3개 파라미터만 보낸다", async () => {
    const appliedDraft = draftRow({ id: "new-draft", status: "applied" })
    const { repository, client } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({ data: appliedDraft, error: null }),
      },
    })

    await repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester")

    expect(client.rpcCalls).toEqual([
      {
        fn: "supersede_branch_sales_ledger_entry",
        params: { p_old_draft_id: "old-draft", p_new_draft_id: "new-draft", p_actor: "tester" },
      },
    ])
  })

  it("성공 시 drafts·entries 두 캐시 태그를 모두 revalidate한다", async () => {
    vi.resetModules()
    const client = makeClient({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({
          data: draftRow({ id: "new-draft", status: "applied" }),
          error: null,
        }),
      },
    })
    const revalidateTag = vi.fn()
    vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => client) }))
    vi.doMock("next/cache", () => ({ revalidateTag }))

    const repository = await import("@/lib/repositories/branch-sales-ledger-drafts")
    await repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester")

    expect(revalidateTag).toHaveBeenCalledWith("branch-sales-ledger-drafts", "max")
    expect(revalidateTag).toHaveBeenCalledWith("branch-sales-ledger-entries", "max")
  })
})

describe("supersedeBranchSalesLedgerEntry — fail-closed 에러 번역(폴백 절대 금지)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("RPC 부재는 unavailable 메시지로 던지고, reverse/apply RPC는 절대 호출하지 않는다", async () => {
    const { repository, client } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({
          data: null,
          error: { code: "PGRST202", message: "Could not find the function public.supersede_branch_sales_ledger_entry(uuid,uuid,text,text) in the schema cache" },
        }),
      },
    })

    await expect(
      repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester"),
    ).rejects.toThrow(
      "운영 DB에 '적용값 한 번에 바꾸기' 마이그레이션이 아직 적용되지 않았습니다 — 체크 큐에서 되돌리기 후 새 값을 적용하세요.",
    )

    try {
      await repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester")
      expect.unreachable()
    } catch (error) {
      expect(repository.isBranchSalesLedgerSupersedeUnavailableError(error)).toBe(true)
    }

    // 폴백 금지 — 이 RPC 하나만 호출되고 reverse_branch_sales_ledger_entry/
    // apply_branch_sales_ledger_draft는 fixture에 handler조차 없다(호출되면 makeClient의
    // rpc mock이 즉시 던져 이 테스트가 실패한다).
    expect(client.rpcCalls.every((call) => call.fn === "supersede_branch_sales_ledger_entry")).toBe(true)
    expect(client.rpcCalls.length).toBeGreaterThan(0)
  })

  it("42883(함수 없음)도 unavailable로 판정한다", async () => {
    const { repository } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({
          data: null,
          error: { code: "42883", message: "function public.supersede_branch_sales_ledger_entry(uuid, uuid, text, text) does not exist" },
        }),
      },
    })

    await expect(
      repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester"),
    ).rejects.toThrow(/마이그레이션이 아직 적용되지 않았습니다/)
  })

  it("P0002는 '대체 대상을 찾을 수 없습니다' 문구로 번역한다(옛 entry·새 초안 공통)", async () => {
    const { repository } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({
          data: null,
          error: { code: "P0002", message: "supersede: old draft has no applied entry (old_draft_id=old-draft)" },
        }),
      },
    })

    await expect(
      repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester"),
    ).rejects.toThrow("대체 대상을 찾을 수 없습니다 — 기존 적용 항목 또는 새 초안이 존재하지 않습니다.")

    try {
      await repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester")
      expect.unreachable()
    } catch (error) {
      expect(repository.isBranchSalesLedgerSupersedeNotFoundError(error)).toBe(true)
    }
  })

  it("P0001 + 'must be checked'는 '체크 상태가 아닙니다' 문구로 번역한다", async () => {
    const { repository } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({
          data: null,
          error: { code: "P0001", message: "supersede: new draft must be checked (new_draft_id=new-draft, status=draft)" },
        }),
      },
    })

    await expect(
      repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester"),
    ).rejects.toThrow("새 값 초안이 체크 상태가 아닙니다.")

    try {
      await repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester")
      expect.unreachable()
    } catch (error) {
      expect(repository.isBranchSalesLedgerSupersedeNotCheckedError(error)).toBe(true)
    }
  })

  it("P0001 + 'target mismatch'는 '다른 딜·월입니다' 문구로 번역한다", async () => {
    const { repository } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({
          data: null,
          error: { code: "P0001", message: "supersede: target mismatch (ledger_month 2026-08 <> 2026-09)" },
        }),
      },
    })

    await expect(
      repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester"),
    ).rejects.toThrow("대체 대상이 새 값 초안과 다른 딜·월입니다.")

    try {
      await repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester")
      expect.unreachable()
    } catch (error) {
      expect(repository.isBranchSalesLedgerSupersedeTargetMismatchError(error)).toBe(true)
    }
  })

  it("23505(활성 정정 유일성 위반)는 기존 중복 정정 문구로 번역한다", async () => {
    const { repository } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({
          data: null,
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "branch_sales_ledger_entries_active_manual_edit_unique"',
          },
        }),
      },
    })

    await expect(
      repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester"),
    ).rejects.toThrow("이미 이 딜·월에 적용된 정정 항목이 있습니다. 기존 항목을 먼저 반전한 뒤 다시 적용하세요.")

    try {
      await repository.supersedeBranchSalesLedgerEntry("old-draft", "new-draft", "tester")
      expect.unreachable()
    } catch (error) {
      expect(repository.isBranchSalesLedgerDuplicateActiveCorrectionError(error)).toBe(true)
    }
  })
})

describe("probeSupersedeAvailable — 함수의 에러 없는 프로브 경로(두 id NULL)로 존재만 확인", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.useRealTimers()
  })

  it("두 id를 NULL로 넘겨 프로브 경로를 부르고, 에러가 없으면 사용 가능(true)", async () => {
    const { repository, client } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({ data: null, error: null }),
      },
    })

    await expect(repository.probeSupersedeAvailable()).resolves.toBe(true)
    expect(client.rpcCalls).toHaveLength(1)
    expect(client.rpcCalls[0].fn).toBe("supersede_branch_sales_ledger_entry")
    expect(client.rpcCalls[0].params).toMatchObject({ p_old_draft_id: null, p_new_draft_id: null })
  })

  it("RPC 부재 에러면 false로 판단한다", async () => {
    const { repository } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({
          data: null,
          error: { code: "PGRST202", message: "Could not find the function public.supersede_branch_sales_ledger_entry in the schema cache" },
        }),
      },
    })

    await expect(repository.probeSupersedeAvailable()).resolves.toBe(false)
  })

  it("그 외 에러(권한·P0002 등 예상 밖 응답)도 false로 보수적으로 판단한다(fail-closed)", async () => {
    for (const error of [
      { code: "28000", message: "permission denied for function supersede_branch_sales_ledger_entry" },
      { code: "P0002", message: "supersede: old draft has no applied entry" },
    ]) {
      vi.resetModules()
      const { repository } = await loadRepository({
        rpc: { supersede_branch_sales_ledger_entry: () => ({ data: null, error }) },
      })
      await expect(repository.probeSupersedeAvailable()).resolves.toBe(false)
    }
  })

  it("60초 TTL 안에서는 캐시된 결과를 반환하고 RPC를 재호출하지 않는다", async () => {
    vi.useFakeTimers()
    const { repository, client } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({ data: null, error: null }),
      },
    })

    await expect(repository.probeSupersedeAvailable()).resolves.toBe(true)
    await expect(repository.probeSupersedeAvailable()).resolves.toBe(true)
    expect(client.rpcCalls).toHaveLength(1)
  })

  it("60초가 지나면 다시 실제 호출한다(음성 결과를 오래 들고 있지 않음)", async () => {
    vi.useFakeTimers()
    const { repository, client } = await loadRepository({
      rpc: {
        supersede_branch_sales_ledger_entry: () => ({ data: null, error: null }),
      },
    })

    await repository.probeSupersedeAvailable()
    vi.advanceTimersByTime(60_001)
    await repository.probeSupersedeAvailable()

    expect(client.rpcCalls).toHaveLength(2)
  })
})

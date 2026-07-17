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
  update?: (
    payload: Record<string, unknown>,
    filters: { id?: string; updated_at?: string },
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
          const filters = { id: eqFilters.id as string | undefined, updated_at: eqFilters.updated_at as string | undefined }
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

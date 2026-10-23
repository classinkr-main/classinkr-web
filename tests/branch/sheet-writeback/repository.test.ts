// branch-sales-ledger-sheet-writes 저장소 — supabase 는 목. 실제 DB 호출 없음.
import { afterEach, describe, expect, it, vi } from "vitest"

interface Recorded {
  table: string
  op: string
  values?: unknown
  filters: Array<[string, string, unknown]>
  order?: [string, boolean]
  limit?: number
}

type Result = { data: unknown; error: { code?: string; message: string } | null }

function makeClient(resolve: (query: Recorded) => Result) {
  const queries: Recorded[] = []
  const from = (table: string) => {
    const query: Recorded = { table, op: "select", filters: [] }
    queries.push(query)
    const builder = {
      insert(values: unknown) { query.op = "insert"; query.values = values; return builder },
      update(values: unknown) { query.op = "update"; query.values = values; return builder },
      select() { return builder },
      eq(column: string, value: unknown) { query.filters.push(["eq", column, value]); return builder },
      in(column: string, value: unknown) { query.filters.push(["in", column, value]); return builder },
      order(column: string, opts?: { ascending?: boolean }) { query.order = [column, opts?.ascending ?? true]; return builder },
      limit(n: number) { query.limit = n; return builder },
      maybeSingle: async () => resolve(query),
      then(onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(resolve(query)).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  return { client: { from }, queries }
}

async function load(resolve: (query: Recorded) => Result) {
  vi.resetModules()
  const { client, queries } = makeClient(resolve)
  const revalidateTag = vi.fn()
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }))
  vi.doMock("next/cache", () => ({ revalidateTag }))
  const repo = await import("@/lib/repositories/branch-sales-ledger-sheet-writes")
  return { repo, queries, revalidateTag }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "w1",
    draft_id: "d1",
    batch_id: "b1",
    status: "sending",
    code: "written",
    row_id: "r_0123456789ab",
    sheet_row: 3,
    ledger_month: "2026-10",
    cells: [{ a1: "BB3" }],
    actor: "tester",
    error: null,
    entry_id: null,
    created_at: "2026-10-23T03:00:00Z",
    written_at: null,
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("insertSheetWriteAttempts / updateSheetWriteAttempt", () => {
  it("칸 이름을 표 칸으로 바꿔 넣고 캐시 태그를 무효화한다", async () => {
    const { repo, queries, revalidateTag } = await load(() => ({ data: [row()], error: null }))
    const inserted = await repo.insertSheetWriteAttempts([
      { draftId: "d1", batchId: "b1", status: "sending", code: "written", rowId: "r_0123456789ab", sheetRow: 3, month: "2026-10", cells: [{ a1: "BB3" }], actor: "tester", error: "x".repeat(600) },
    ])
    expect(queries[0]).toMatchObject({ table: "branch_sales_ledger_sheet_writes", op: "insert" })
    const values = (queries[0].values as Array<Record<string, unknown>>)[0]
    expect(values).toMatchObject({ draft_id: "d1", batch_id: "b1", status: "sending", code: "written", row_id: "r_0123456789ab", sheet_row: 3, ledger_month: "2026-10", actor: "tester" })
    expect((values.error as string).length).toBeLessThanOrEqual(501)
    expect(inserted[0]).toMatchObject({ id: "w1", draftId: "d1", month: "2026-10", writtenAt: null })
    expect(revalidateTag).toHaveBeenCalledWith("branch-sales-ledger-sheet-writes", "max")
  })

  it("갱신은 상태 칸만 보낸다", async () => {
    const { repo, queries } = await load(() => ({ data: null, error: null }))
    await repo.updateSheetWriteAttempt("w1", { status: "written", code: "written", writtenAt: "2026-10-23T03:00:00Z", entryId: "e1" })
    expect(queries[0]).toMatchObject({ op: "update", filters: [["eq", "id", "w1"]] })
    expect(queries[0].values).toEqual({ status: "written", code: "written", written_at: "2026-10-23T03:00:00Z", entry_id: "e1" })
  })

  it("표가 없으면(42P01·PGRST205) 미적용 오류로 던지고 isSheetWritesNotReadyError 가 알아본다", async () => {
    for (const error of [
      { code: "42P01", message: 'relation "public.branch_sales_ledger_sheet_writes" does not exist' },
      { code: "PGRST205", message: "Could not find the table 'public.branch_sales_ledger_sheet_writes' in the schema cache" },
    ]) {
      const { repo } = await load(() => ({ data: null, error }))
      const thrown = await repo.insertSheetWriteAttempts([
        { draftId: "d1", batchId: "b1", status: "refused", code: "conflict", rowId: null, sheetRow: null, month: "2026-10", cells: [], actor: "t" },
      ]).catch((e) => e)
      expect(repo.isSheetWritesNotReadyError(thrown)).toBe(true)
      expect(repo.isSheetWritesNotReadyError(error)).toBe(true)
    }
  })

  it("그 밖 DB 오류는 미적용으로 보지 않는다", async () => {
    const { repo } = await load(() => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }))
    const thrown = await repo.updateSheetWriteAttempt("w1", { status: "failed" }).catch((e) => e)
    expect(thrown).toBeInstanceOf(Error)
    expect(repo.isSheetWritesNotReadyError(thrown)).toBe(false)
  })
})

describe("latestSheetWritesByDraftIds", () => {
  it("초안마다 가장 최근 시도 하나(created_at 내림차순 첫 행)", async () => {
    const { repo, queries } = await load(() => ({
      data: [
        row({ id: "new", draft_id: "d1", created_at: "2026-10-23T05:00:00Z", status: "written" }),
        row({ id: "old", draft_id: "d1", created_at: "2026-10-23T04:00:00Z", status: "unknown" }),
        row({ id: "only", draft_id: "d2" }),
      ],
      error: null,
    }))
    const latest = await repo.latestSheetWritesByDraftIds(["d1", "d2", "d1", ""])
    expect([...latest.keys()]).toEqual(["d1", "d2"])
    expect(latest.get("d1")?.id).toBe("new")
    expect(queries[0].filters).toEqual([["in", "draft_id", ["d1", "d2"]]])
    expect(queries[0].order).toEqual(["created_at", false])
  })

  it("빈 목록이면 DB 를 부르지 않는다", async () => {
    const { repo, queries } = await load(() => ({ data: [], error: null }))
    expect((await repo.latestSheetWritesByDraftIds([])).size).toBe(0)
    expect(queries).toHaveLength(0)
  })
})

describe("lastSuccessfulRevSyncStartedAt", () => {
  it("성공한 all·rev 동기화 중 최신 시작 시각", async () => {
    const { repo, queries } = await load(() => ({ data: { started_at: "2026-10-23T08:00:00Z" }, error: null }))
    expect(await repo.lastSuccessfulRevSyncStartedAt()).toBe("2026-10-23T08:00:00Z")
    expect(queries[0]).toMatchObject({ table: "branch_sync_runs", filters: [["eq", "status", "success"], ["in", "source", ["all", "rev"]]], order: ["started_at", false], limit: 1 })
  })

  it("없으면 null", async () => {
    const { repo } = await load(() => ({ data: null, error: null }))
    expect(await repo.lastSuccessfulRevSyncStartedAt()).toBeNull()
  })
})

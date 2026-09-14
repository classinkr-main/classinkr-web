import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * MKT(Compass) 처리 결과를 리드 상태에 반영하는 저장소 함수.
 * 조건부 UPDATE 가 핵심이다 — 판정과 쓰기 사이에 사람이 상태를 바꿨으면(예: 전환) 그 행은 건드리지 않는다.
 * 호출 모양이 아니라 쓰기 뒤 테이블 상태를 본다: 필터를 흉내 내는 메모리 테이블을 세운다.
 */

interface FakeLeadRow {
  id: string
  phone: string | null
  status: "new" | "contacted" | "converted" | "closed"
  confirmed_at: string | null
  created_at: string
}

interface UpdateCall {
  values: Record<string, unknown>
  inFilters: Array<[string, unknown[]]>
  affected: number
}

function fakeLeadsTable(initial: FakeLeadRow[], options: { failUpdate?: boolean } = {}) {
  const rows = initial.map((row) => ({ ...row }))
  const updates: UpdateCall[] = []

  const from = vi.fn(() => {
    let mode: "select" | "update" = "select"
    let values: Record<string, unknown> = {}
    let returning = false
    let count: string | undefined
    const filters: Array<(row: FakeLeadRow) => boolean> = []
    const inFilters: Array<[string, unknown[]]> = []

    const builder = {
      select(_columns: string, opts?: { count?: string }) {
        if (mode === "update") returning = true
        else count = opts?.count
        return builder
      },
      update(next: Record<string, unknown>) {
        mode = "update"
        values = next
        return builder
      },
      in(column: keyof FakeLeadRow, list: unknown[]) {
        inFilters.push([column, list])
        filters.push((row) => list.includes(row[column]))
        return builder
      },
      is(column: keyof FakeLeadRow, value: null) {
        filters.push((row) => (row[column] ?? null) === value)
        return builder
      },
      eq(column: keyof FakeLeadRow, value: unknown) {
        filters.push((row) => row[column] === value)
        return builder
      },
      order() {
        return builder
      },
      range(start: number, end: number) {
        return Promise.resolve({
          data: rows.slice(start, end + 1).map((row) => ({ ...row })),
          error: null,
          count: count === "exact" ? rows.length : null,
        })
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        if (options.failUpdate) {
          return Promise.resolve({ data: null, error: { message: "update denied" } }).then(resolve, reject)
        }
        const matched = rows.filter((row) => filters.every((filter) => filter(row)))
        for (const row of matched) Object.assign(row, values)
        updates.push({ values, inFilters, affected: matched.length })
        return Promise.resolve({
          data: returning ? matched.map((row) => ({ id: row.id })) : null,
          error: null,
        }).then(resolve, reject)
      },
    }
    return builder
  })

  return { from, rows, updates }
}

function lead(partial: Partial<FakeLeadRow> & { id: string }): FakeLeadRow {
  return {
    phone: "010-1234-5678",
    status: "new",
    confirmed_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    ...partial,
  }
}

const revalidateTag = vi.fn()

async function loadRepository(table: ReturnType<typeof fakeLeadsTable>) {
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({ from: table.from })),
  }))
  vi.doMock("next/cache", () => ({ revalidateTag }))
  return import("@/lib/repositories/leads")
}

describe("리드 상태 MKT 반영 저장소", () => {
  const originalUseSupabaseLeads = process.env.USE_SUPABASE_LEADS

  beforeEach(() => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
  })

  afterEach(() => {
    if (originalUseSupabaseLeads === undefined) delete process.env.USE_SUPABASE_LEADS
    else process.env.USE_SUPABASE_LEADS = originalUseSupabaseLeads
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe("getLeadsForCompassContactSync", () => {
    it("전화가 있는 신규·연락함 리드만 id·전화·상태로 돌려준다", async () => {
      const table = fakeLeadsTable([
        lead({ id: "new-with-phone" }),
        lead({ id: "contacted-with-phone", status: "contacted" }),
        lead({ id: "new-blank-phone", phone: "  " }),
        lead({ id: "new-null-phone", phone: null }),
        lead({ id: "converted", status: "converted" }),
        lead({ id: "closed", status: "closed" }),
      ])
      const repo = await loadRepository(table)

      const leads = await repo.getLeadsForCompassContactSync()

      expect(leads).toEqual([
        { id: "new-with-phone", phone: "010-1234-5678", status: "new" },
        { id: "contacted-with-phone", phone: "010-1234-5678", status: "contacted" },
      ])
    })
  })

  describe("applyCompassLeadStatusSync", () => {
    it("연락함은 아직 신규인 행만 바꾼다 — 그사이 전환된 리드는 그대로 둔다", async () => {
      const table = fakeLeadsTable([
        lead({ id: "a" }),
        lead({ id: "b", status: "converted" }),
        lead({ id: "c", status: "contacted" }),
      ])
      const repo = await loadRepository(table)

      const result = await repo.applyCompassLeadStatusSync({ contactedIds: ["a", "b", "c"], closedIds: [] })

      expect(result).toEqual({ contacted: ["a"], closed: [] })
      expect(table.rows.map((row) => [row.id, row.status])).toEqual([
        ["a", "contacted"],
        ["b", "converted"],
        ["c", "contacted"],
      ])
    })

    it("종료는 신규·연락함 행만 바꾸고 전환·종료 행은 건드리지 않는다", async () => {
      const table = fakeLeadsTable([
        lead({ id: "n" }),
        lead({ id: "k", status: "contacted" }),
        lead({ id: "v", status: "converted" }),
        lead({ id: "x", status: "closed", confirmed_at: "2026-08-01T00:00:00.000Z" }),
      ])
      const repo = await loadRepository(table)

      const result = await repo.applyCompassLeadStatusSync({ contactedIds: [], closedIds: ["n", "k", "v", "x"] })

      expect(result).toEqual({ contacted: [], closed: ["n", "k"] })
      expect(table.rows.map((row) => row.status)).toEqual(["closed", "closed", "converted", "closed"])
    })

    it("바뀐 행에만 확인 도장을 찍고, 이미 찍힌 도장은 보존한다", async () => {
      const table = fakeLeadsTable([
        lead({ id: "fresh" }),
        lead({ id: "stamped", confirmed_at: "2026-08-01T00:00:00.000Z" }),
        lead({ id: "untouched" }),
      ])
      const repo = await loadRepository(table)

      await repo.applyCompassLeadStatusSync(
        { contactedIds: ["fresh", "stamped"], closedIds: [] },
        new Date("2026-09-14T10:00:00.000Z")
      )

      expect(table.rows.map((row) => [row.id, row.confirmed_at])).toEqual([
        ["fresh", "2026-09-14T10:00:00.000Z"],
        ["stamped", "2026-08-01T00:00:00.000Z"],
        ["untouched", null],
      ])
    })

    it("바뀐 행이 있을 때만 리드 캐시를 무효화한다", async () => {
      const table = fakeLeadsTable([lead({ id: "a", status: "converted" })])
      const repo = await loadRepository(table)

      await repo.applyCompassLeadStatusSync({ contactedIds: ["a"], closedIds: [] })
      expect(revalidateTag).not.toHaveBeenCalled()
      expect(table.updates.some((call) => "confirmed_at" in call.values)).toBe(false)

      const changedTable = fakeLeadsTable([lead({ id: "b" })])
      vi.resetModules()
      const changedRepo = await loadRepository(changedTable)
      await changedRepo.applyCompassLeadStatusSync({ contactedIds: ["b"], closedIds: [] })
      expect(revalidateTag).toHaveBeenCalled()
    })

    it("id 는 100개씩 나눠 UPDATE 한다 — URL 길이 상한 대비", async () => {
      const initial = Array.from({ length: 250 }, (_, index) => lead({ id: `lead-${index}` }))
      const table = fakeLeadsTable(initial)
      const repo = await loadRepository(table)

      const result = await repo.applyCompassLeadStatusSync({
        contactedIds: initial.map((row) => row.id),
        closedIds: [],
      })

      expect(result.contacted).toHaveLength(250)
      const idChunkSizes = table.updates
        .filter((call) => call.values.status === "contacted")
        .map((call) => (call.inFilters.find(([column]) => column === "id")?.[1] ?? []).length)
      expect(idChunkSizes).toEqual([100, 100, 50])
    })

    it("쓰기 실패는 성공으로 삼키지 않고 던진다", async () => {
      const table = fakeLeadsTable([lead({ id: "a" })], { failUpdate: true })
      const repo = await loadRepository(table)

      await expect(repo.applyCompassLeadStatusSync({ contactedIds: ["a"], closedIds: [] })).rejects.toThrow(
        /update denied/
      )
    })

    it("JSON 폴백 모드에서는 아무것도 바꾸지 않는다 — Compass 가 없는 로컬 픽스처다", async () => {
      delete process.env.USE_SUPABASE_LEADS
      const table = fakeLeadsTable([lead({ id: "a" })])
      const repo = await loadRepository(table)

      const result = await repo.applyCompassLeadStatusSync({ contactedIds: ["a"], closedIds: [] })

      expect(result).toEqual({ contacted: [], closed: [] })
      expect(table.from).not.toHaveBeenCalled()
    })
  })
})

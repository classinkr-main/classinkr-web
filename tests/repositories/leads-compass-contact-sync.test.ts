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

function fakeLeadsTable(initial: FakeLeadRow[], options: { failUpdateCall?: number } = {}) {
  const rows = initial.map((row) => ({ ...row }))
  const updates: UpdateCall[] = []
  let updateCalls = 0

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
        updateCalls += 1
        if (options.failUpdateCall === updateCalls) {
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

const NOW = new Date("2026-09-14T10:00:00.000Z")
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

    it("페이지 경계에서 같은 행이 두 번 와도 한 번만 돌려준다", async () => {
      const table = fakeLeadsTable([lead({ id: "dup" }), lead({ id: "dup" }), lead({ id: "other" })])
      const repo = await loadRepository(table)

      const leads = await repo.getLeadsForCompassContactSync()

      expect(leads.map((row) => row.id)).toEqual(["dup", "other"])
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

      const result = await repo.applyCompassLeadStatusSync({ contactedIds: ["a", "b", "c"], closedIds: [] }, { now: NOW })

      expect(result).toMatchObject({ contacted: ["a"], closed: [], stoppedEarly: false })
      expect(table.rows.map((row) => [row.id, row.status])).toEqual([
        ["a", "contacted"],
        ["b", "converted"],
        ["c", "contacted"],
      ])
    })

    it("종료는 신규·연락함 행만 바꾸고, 바뀌기 전 상태를 DB가 실제로 바꾼 기준으로 싣는다", async () => {
      const table = fakeLeadsTable([
        lead({ id: "n" }),
        lead({ id: "k", status: "contacted", confirmed_at: "2026-08-01T00:00:00.000Z" }),
        lead({ id: "v", status: "converted" }),
        lead({ id: "x", status: "closed", confirmed_at: "2026-08-01T00:00:00.000Z" }),
      ])
      const repo = await loadRepository(table)

      const result = await repo.applyCompassLeadStatusSync({ contactedIds: [], closedIds: ["n", "k", "v", "x"] }, { now: NOW })

      expect(result.closed).toEqual([
        { id: "n", from: "new" },
        { id: "k", from: "contacted" },
      ])
      expect(table.rows.map((row) => row.status)).toEqual(["closed", "closed", "converted", "closed"])
    })

    it("바뀐 행 중 도장이 비어 있던 행에만 도장을 찍고, 찍은 id·시각을 돌려준다", async () => {
      const table = fakeLeadsTable([
        lead({ id: "fresh" }),
        lead({ id: "stamped", confirmed_at: "2026-08-01T00:00:00.000Z" }),
        lead({ id: "untouched" }),
      ])
      const repo = await loadRepository(table)

      const result = await repo.applyCompassLeadStatusSync({ contactedIds: ["fresh", "stamped"], closedIds: [] }, { now: NOW })

      expect(result).toMatchObject({ stamped: ["fresh"], confirmedAt: "2026-09-14T10:00:00.000Z" })
      expect([...result.contacted].sort()).toEqual(["fresh", "stamped"])
      expect(table.rows.map((row) => [row.id, row.confirmed_at])).toEqual([
        ["fresh", "2026-09-14T10:00:00.000Z"],
        ["stamped", "2026-08-01T00:00:00.000Z"],
        ["untouched", null],
      ])
    })

    it("상태와 도장은 한 UPDATE 로 함께 바뀐다 — 중간에 실패해도 도장 빠진 연락함 행이 남지 않는다", async () => {
      // 1번째 UPDATE(상태+도장)는 성공, 2번째(도장이 이미 있던 행의 상태만)에서 실패
      const table = fakeLeadsTable([lead({ id: "a" }), lead({ id: "b", confirmed_at: "2026-08-01T00:00:00.000Z" })], {
        failUpdateCall: 2,
      })
      const repo = await loadRepository(table)

      const error = await repo
        .applyCompassLeadStatusSync({ contactedIds: ["a", "b"], closedIds: [] }, { now: NOW })
        .catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(repo.CompassLeadStatusSyncError)
      expect((error as InstanceType<typeof repo.CompassLeadStatusSyncError>).partial).toMatchObject({
        contacted: ["a"],
        stamped: ["a"],
      })
      expect(table.rows.filter((row) => row.status === "contacted" && row.confirmed_at === null)).toEqual([])
      expect(revalidateTag).toHaveBeenCalled()
    })

    it("중간 덩어리에서 실패하면 그때까지 실제로 바뀐 행을 담아 던진다 — 감사 기록의 근거다", async () => {
      const initial = Array.from({ length: 150 }, (_, index) => lead({ id: `lead-${index}` }))
      // 덩어리당 UPDATE 2번(상태+도장 / 상태만) — 3번째 호출이 둘째 덩어리의 첫 UPDATE다.
      const table = fakeLeadsTable(initial, { failUpdateCall: 3 })
      const repo = await loadRepository(table)

      const error = await repo
        .applyCompassLeadStatusSync({ contactedIds: initial.map((row) => row.id), closedIds: [] }, { now: NOW })
        .catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(repo.CompassLeadStatusSyncError)
      expect((error as Error).message).toMatch(/update denied/)
      const partial = (error as InstanceType<typeof repo.CompassLeadStatusSyncError>).partial
      expect(partial.contacted).toHaveLength(100)
      expect(table.rows.filter((row) => row.status === "contacted")).toHaveLength(100)
    })

    it("shouldContinue 가 false 면 다음 덩어리를 시작하지 않고 멈춘다", async () => {
      const initial = Array.from({ length: 250 }, (_, index) => lead({ id: `lead-${index}` }))
      const table = fakeLeadsTable(initial)
      const repo = await loadRepository(table)
      let checks = 0

      const result = await repo.applyCompassLeadStatusSync(
        { contactedIds: initial.map((row) => row.id), closedIds: [] },
        { now: NOW, shouldContinue: () => ++checks <= 1 }
      )

      expect(result.stoppedEarly).toBe(true)
      expect(result.contacted).toHaveLength(100)
      expect(table.rows.filter((row) => row.status === "contacted")).toHaveLength(100)
    })

    it("바뀐 행이 있을 때만 리드 캐시를 무효화한다", async () => {
      const table = fakeLeadsTable([lead({ id: "a", status: "converted" })])
      const repo = await loadRepository(table)

      await repo.applyCompassLeadStatusSync({ contactedIds: ["a"], closedIds: [] }, { now: NOW })
      expect(revalidateTag).not.toHaveBeenCalled()

      const changedTable = fakeLeadsTable([lead({ id: "b" })])
      vi.resetModules()
      const changedRepo = await loadRepository(changedTable)
      await changedRepo.applyCompassLeadStatusSync({ contactedIds: ["b"], closedIds: [] }, { now: NOW })
      expect(revalidateTag).toHaveBeenCalled()
    })

    it("id 는 100개씩 나눠 UPDATE 한다 — URL 길이 상한 대비", async () => {
      const initial = Array.from({ length: 250 }, (_, index) => lead({ id: `lead-${index}` }))
      const table = fakeLeadsTable(initial)
      const repo = await loadRepository(table)

      const result = await repo.applyCompassLeadStatusSync(
        { contactedIds: initial.map((row) => row.id), closedIds: [] },
        { now: NOW }
      )

      expect(result.contacted).toHaveLength(250)
      const stampChunkSizes = table.updates
        .filter((call) => "confirmed_at" in call.values)
        .map((call) => (call.inFilters.find(([column]) => column === "id")?.[1] ?? []).length)
      expect(stampChunkSizes).toEqual([100, 100, 50])
    })

    it("JSON 폴백 모드에서는 아무것도 바꾸지 않는다 — Compass 가 없는 로컬 픽스처다", async () => {
      delete process.env.USE_SUPABASE_LEADS
      const table = fakeLeadsTable([lead({ id: "a" })])
      const repo = await loadRepository(table)

      const result = await repo.applyCompassLeadStatusSync({ contactedIds: ["a"], closedIds: [] }, { now: NOW })

      expect(result).toMatchObject({ contacted: [], closed: [], stamped: [] })
      expect(table.from).not.toHaveBeenCalled()
    })
  })
})

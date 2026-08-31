/**
 * 지역 분배 저장소 계약.
 *
 * 고정하는 것 셋:
 *  1) 마이그레이션 미적용은 예외가 아니라 available=false 로 내려간다 — 화면이 "아무도
 *     안 맡음"과 "표가 아직 없음"을 구분할 수 있어야 한다.
 *  2) 17개 시도를 언제나 전부 싣는다(공백을 숨기지 않는다).
 *  3) 같은 담당자로 다시 지정하면 이력을 남기지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

interface FakeState {
  rows: Row[]
  selectError: { code?: string; message?: string } | null
  updates: Array<{ id: unknown; patch: Row }>
  inserts: Row[]
}

const state: FakeState = { rows: [], selectError: null, updates: [], inserts: [] }

function makeQuery() {
  const query: Record<string, unknown> = {}
  const chain = () => query
  const result = () => ({ data: state.selectError ? null : state.rows, error: state.selectError })

  Object.assign(query, {
    select: chain,
    eq: chain,
    is: () => ({ ...result(), ...query }),
    maybeSingle: async () => ({
      data: state.selectError ? null : (state.rows[0] ?? null),
      error: state.selectError,
    }),
    update: (patch: Row) => ({
      eq: async (_column: string, id: unknown) => {
        state.updates.push({ id, patch })
        return { error: null }
      },
    }),
    insert: async (row: Row) => {
      state.inserts.push(row)
      return { error: null }
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  })
  return query
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: () => makeQuery() }),
}))

async function loadRepo() {
  return import("@/lib/repositories/crm-region-assignments")
}

beforeEach(() => {
  state.rows = []
  state.selectError = null
  state.updates = []
  state.inserts = []
  vi.clearAllMocks()
})

describe("listCrmRegionAssignments", () => {
  it("표가 없으면 예외 대신 available=false 와 안내를 돌려준다", async () => {
    state.selectError = { code: "42P01", message: 'relation "crm_region_assignments" does not exist' }
    const { listCrmRegionAssignments } = await loadRepo()

    const list = await listCrmRegionAssignments()
    expect(list.available).toBe(false)
    expect(list.warning).toContain("20260828_crm_region_assignments.sql")
    expect(list.regions).toHaveLength(17)
    expect(list.regions.every((row) => row.assignment === null)).toBe(true)
    expect(list.assignedCount).toBe(0)
  })

  it("표가 없는 게 아닌 오류는 삼키지 않는다", async () => {
    state.selectError = { code: "57014", message: "canceling statement due to statement timeout" }
    const { listCrmRegionAssignments } = await loadRepo()
    await expect(listCrmRegionAssignments()).rejects.toThrow(/timeout/)
  })

  it("배정이 없는 시도도 전부 싣는다", async () => {
    state.rows = [
      { region_label: "서울", owner_key: "han", owner_name: "Han Park", effective_from: "2026-08-01", note: null },
    ]
    const { listCrmRegionAssignments } = await loadRepo()

    const list = await listCrmRegionAssignments()
    expect(list.regions).toHaveLength(17)
    expect(list.assignedCount).toBe(1)
    expect(list.regions.find((row) => row.label === "서울")?.assignment?.ownerKey).toBe("han")
    expect(list.regions.find((row) => row.label === "제주")?.assignment).toBeNull()
  })

  it("저장된 표기가 흔들려도 17개 시도 표준으로 접어 읽는다", async () => {
    state.rows = [
      { region_label: "서울특별시", owner_key: "han", owner_name: "Han Park", effective_from: "2026-08-01", note: null },
    ]
    const { listCrmRegionAssignments } = await loadRepo()

    const list = await listCrmRegionAssignments()
    expect(list.regions.find((row) => row.label === "서울")?.assignment?.ownerKey).toBe("han")
  })

  it("담당자별 부하를 지역 수 내림차순으로 묶는다", async () => {
    state.rows = [
      { region_label: "서울", owner_key: "han", owner_name: "Han", effective_from: "2026-08-01", note: null },
      { region_label: "경기", owner_key: "han", owner_name: "Han", effective_from: "2026-08-01", note: null },
      { region_label: "부산", owner_key: "somang", owner_name: "Somang", effective_from: "2026-08-01", note: null },
    ]
    const { listCrmRegionAssignments } = await loadRepo()

    const list = await listCrmRegionAssignments()
    expect(list.workload.map((entry) => [entry.ownerKey, entry.regions.length])).toEqual([
      ["han", 2],
      ["somang", 1],
    ])
  })
})

describe("setCrmRegionAssignment", () => {
  it("17개 시도가 아니면 거절한다", async () => {
    const { setCrmRegionAssignment } = await loadRepo()
    expect(await setCrmRegionAssignment({ regionLabel: "Detroit", ownerKey: "han" })).toEqual({
      ok: false,
      reason: "invalid_region",
    })
  })

  it("표가 없으면 unavailable 로 알린다", async () => {
    state.selectError = { code: "42P01", message: 'relation "crm_region_assignments" does not exist' }
    const { setCrmRegionAssignment } = await loadRepo()
    expect(await setCrmRegionAssignment({ regionLabel: "서울", ownerKey: "han" })).toEqual({
      ok: false,
      reason: "unavailable",
    })
  })

  it("같은 담당자로 다시 지정하면 아무 이력도 남기지 않는다", async () => {
    state.rows = [{ id: "row-1", owner_key: "han" }]
    const { setCrmRegionAssignment } = await loadRepo()

    expect(await setCrmRegionAssignment({ regionLabel: "서울", ownerKey: "han" })).toEqual({
      ok: true,
      changed: false,
    })
    expect(state.updates).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
  })

  it("교체는 이전 행을 닫고 새 행을 넣는다(삭제하지 않는다)", async () => {
    state.rows = [{ id: "row-1", owner_key: "han" }]
    const { setCrmRegionAssignment } = await loadRepo()

    expect(await setCrmRegionAssignment({ regionLabel: "서울", ownerKey: "somang", ownerName: "Somang Jin" })).toEqual({
      ok: true,
      changed: true,
    })
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].id).toBe("row-1")
    expect(state.updates[0].patch).toHaveProperty("effective_to")
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ region_label: "서울", owner_key: "somang", owner_name: "Somang Jin" })
  })

  it("배정 해제는 이전 행만 닫고 새 행을 넣지 않는다", async () => {
    state.rows = [{ id: "row-1", owner_key: "han" }]
    const { setCrmRegionAssignment } = await loadRepo()

    expect(await setCrmRegionAssignment({ regionLabel: "서울", ownerKey: null })).toEqual({
      ok: true,
      changed: true,
    })
    expect(state.updates).toHaveLength(1)
    expect(state.inserts).toHaveLength(0)
  })
})

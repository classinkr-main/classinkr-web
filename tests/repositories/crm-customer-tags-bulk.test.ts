import { beforeEach, describe, expect, it, vi } from "vitest"

// 세그먼트 일괄 태그(SG6) 저장소 + 전체 태그 맵 range 페이지네이션(F5)을 인메모리 테이블로 고정한다.
//  - 추가: 같은 묶음(대소문자·공백 무시) 태그가 있으면 skipped, 없으면 upsert(ignoreDuplicates)로 반영.
//  - 제거: 같은 묶음 태그 행을 id 로 지우고, 대상 단위로 applied/skipped/failed 를 센다.
//  - 쓰기 뒤 전체 태그 맵 캐시 무효화, 읽기 중 쓰기가 끼면 그 결과를 캐시하지 않는다(세대 가드).
//  - getAllCustomerTagsMap: 첫 페이지 count, 실제 받은 행 수만큼 전진, 서버 상한이 작아도 절단 없음.

interface TagRow {
  id: string
  target_type: string
  target_id: string
  tag: string
  created_at: string
  created_by: string | null
}

type Filter = (row: TagRow) => boolean

let table: TagRow[] = []
let nextId = 1
let maxRows = Number.POSITIVE_INFINITY
let rangeCalls: Array<{ from: number; to: number; withCount: boolean }> = []
let upsertPayloads: Array<Array<Record<string, unknown>>> = []
let deletePayloads: string[][] = []
let upsertError: { message: string } | null = null
let beforeUpsert: (() => void) | null = null
let deleteShouldFail: ((ids: string[]) => boolean) | null = null
let selectError: { message: string } | null = null
let rangeGateOnce: Promise<void> | null = null

function makeRow(target_type: string, target_id: string, tag: string): TagRow {
  const id = `row-${String(nextId).padStart(6, "0")}`
  nextId += 1
  return { id, target_type, target_id, tag, created_at: "2026-09-01T00:00:00Z", created_by: null }
}

function selectBuilder(options?: { count?: string }) {
  const filters: Filter[] = []
  const builder = {
    eq(field: keyof TagRow, value: string) {
      filters.push((row) => row[field] === value)
      return builder
    },
    in(field: keyof TagRow, values: string[]) {
      filters.push((row) => values.includes(row[field] as string))
      return builder
    },
    order() {
      return builder
    },
    async range(from: number, to: number) {
      rangeCalls.push({ from, to, withCount: options?.count === "exact" })
      // 결과는 호출 시점의 테이블로 먼저 만든다 — 게이트가 걸린 호출은 "쓰기 이전에 읽힌" 응답을 늦게 돌려준다.
      const matched = table.filter((row) => filters.every((filter) => filter(row)))
      const end = Math.min(to + 1, from + maxRows)
      const result = selectError
        ? { data: null, error: selectError, count: null }
        : {
            data: matched.slice(from, end).map((row) => ({ ...row })),
            error: null,
            count: options?.count === "exact" ? matched.length : null,
          }
      if (rangeGateOnce) {
        const gate = rangeGateOnce
        rangeGateOnce = null
        await gate
      }
      return result
    },
  }
  return builder
}

const from = vi.fn(() => ({
  select: (_columns: string, options?: { count?: string }) => selectBuilder(options),
  upsert: (rows: Array<Record<string, unknown>>) => ({
    async select() {
      upsertPayloads.push(rows)
      beforeUpsert?.()
      if (upsertError) return { data: null, error: upsertError }
      const inserted: TagRow[] = []
      for (const input of rows) {
        const exists = table.some(
          (row) => row.target_type === input.target_type && row.target_id === input.target_id && row.tag === input.tag
        )
        if (exists) continue
        const row = {
          ...makeRow(input.target_type as string, input.target_id as string, input.tag as string),
          created_by: (input.created_by as string | null) ?? null,
        }
        table.push(row)
        inserted.push(row)
      }
      return { data: inserted.map(({ target_type, target_id }) => ({ target_type, target_id })), error: null }
    },
  }),
  delete: () => ({
    in: (_field: string, ids: string[]) => ({
      async select() {
        deletePayloads.push(ids)
        if (deleteShouldFail?.(ids)) return { data: null, error: { message: "delete boom" } }
        const removed = table.filter((row) => ids.includes(row.id))
        table = table.filter((row) => !ids.includes(row.id))
        return { data: removed.map(({ target_type, target_id }) => ({ target_type, target_id })), error: null }
      },
    }),
  }),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

// 모듈 캐시(전체 태그 맵 30초)를 테스트마다 비우기 위해 매번 새로 import 한다.
async function loadRepo() {
  vi.resetModules()
  return import("@/lib/repositories/crm-customer-tags")
}

const LEAD_A = "11111111-1111-4111-8111-111111111111"
const LEAD_B = "22222222-2222-4222-8222-222222222222"
const CUSTOMER_C = "33333333-3333-4333-8333-333333333333"

function leadTarget(id: string) {
  return { key: `lead:${id}`, targetType: "lead" as const, targetId: id }
}
function neoTarget(id: string) {
  return { key: `neo:${id}`, targetType: "neo_account" as const, targetId: id }
}
function customerTarget(id: string) {
  return { key: `customer:${id}`, targetType: "customer" as const, targetId: id }
}

beforeEach(() => {
  table = []
  nextId = 1
  maxRows = Number.POSITIVE_INFINITY
  rangeCalls = []
  upsertPayloads = []
  deletePayloads = []
  upsertError = null
  beforeUpsert = null
  deleteShouldFail = null
  selectError = null
  rangeGateOnce = null
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("addCustomerTagToTargets", () => {
  it("같은 묶음 태그가 이미 있으면 skipped, 없는 대상만 대상 타입 그대로 upsert 한다", async () => {
    table = [makeRow("lead", LEAD_A, "VIP"), makeRow("neo_account", "acc-1", "재계약")]
    const { addCustomerTagToTargets } = await loadRepo()

    const result = await addCustomerTagToTargets(
      [leadTarget(LEAD_A), neoTarget("acc-1"), customerTarget(CUSTOMER_C)],
      "  vip ",
      "김매니저"
    )

    expect(result).toEqual({ applied: 2, skipped: 1, failed: [] })
    expect(upsertPayloads).toEqual([
      [
        { target_type: "neo_account", target_id: "acc-1", tag: "vip", created_by: "김매니저" },
        { target_type: "customer", target_id: CUSTOMER_C, tag: "vip", created_by: "김매니저" },
      ],
    ])
    // "VIP" 가 있던 리드에 "vip" 행이 새로 생기지 않는다.
    expect(table.filter((row) => row.target_id === LEAD_A).map((row) => row.tag)).toEqual(["VIP"])
  })

  it("사전 조회 뒤 다른 요청이 먼저 같은 태그를 붙였으면(충돌) applied 가 아니라 skipped 로 센다", async () => {
    const { addCustomerTagToTargets } = await loadRepo()
    beforeUpsert = () => {
      table.push(makeRow("lead", LEAD_B, "VIP"))
    }
    const result = await addCustomerTagToTargets([leadTarget(LEAD_A), leadTarget(LEAD_B)], "VIP")
    expect(result).toEqual({ applied: 1, skipped: 1, failed: [] })
  })

  it("쓰기가 실패하면 대상 키를 failed 로 돌려주고 던지지 않는다", async () => {
    const { addCustomerTagToTargets } = await loadRepo()
    upsertError = { message: "boom" }
    const result = await addCustomerTagToTargets([leadTarget(LEAD_A), neoTarget("acc-1")], "VIP")
    expect(result).toEqual({ applied: 0, skipped: 0, failed: [`lead:${LEAD_A}`, "neo:acc-1"] })
  })

  it("사전 조회가 실패하면 쓰지 않고 던진다(중복 판정 없이 쓰지 않는다)", async () => {
    const { addCustomerTagToTargets } = await loadRepo()
    selectError = { message: "read boom" }
    await expect(addCustomerTagToTargets([leadTarget(LEAD_A)], "VIP")).rejects.toThrow("read boom")
    expect(upsertPayloads).toEqual([])
  })

  it("같은 대상이 두 번 들어와도 한 번만 쓴다", async () => {
    const { addCustomerTagToTargets } = await loadRepo()
    const result = await addCustomerTagToTargets([leadTarget(LEAD_A), leadTarget(LEAD_A)], "VIP")
    expect(result).toEqual({ applied: 1, skipped: 0, failed: [] })
    expect(upsertPayloads[0]).toHaveLength(1)
  })

  it("사전 조회는 target_id in(...) 을 100개 단위로 나눈다(URL 길이)", async () => {
    const { addCustomerTagToTargets } = await loadRepo()
    const targets = Array.from({ length: 250 }, (_, i) => neoTarget(`acc-${i}`))
    const result = await addCustomerTagToTargets(targets, "VIP")
    expect(result.applied).toBe(250)
    expect(rangeCalls.filter((call) => call.from === 0)).toHaveLength(3)
  })
})

describe("removeCustomerTagFromTargets", () => {
  it("대소문자·공백 무시로 같은 묶음 태그 행을 전부 지우고, 태그 없는 대상은 skipped", async () => {
    table = [
      makeRow("lead", LEAD_A, "VIP"),
      makeRow("lead", LEAD_A, "vip"),
      makeRow("lead", LEAD_A, "재계약"),
      makeRow("lead", LEAD_B, "Vip"),
      makeRow("neo_account", "acc-1", "재계약"),
    ]
    const { removeCustomerTagFromTargets } = await loadRepo()

    const result = await removeCustomerTagFromTargets(
      [leadTarget(LEAD_A), leadTarget(LEAD_B), neoTarget("acc-1")],
      "VIP"
    )

    expect(result).toEqual({ applied: 2, skipped: 1, failed: [] })
    expect(table.map((row) => [row.target_type, row.target_id, row.tag])).toEqual([
      ["lead", LEAD_A, "재계약"],
      ["neo_account", "acc-1", "재계약"],
    ])
  })

  it("삭제 묶음 하나가 실패하면 그 대상들만 failed, 나머지는 반영한다(부분 실패)", async () => {
    table = Array.from({ length: 150 }, (_, i) => makeRow("neo_account", `acc-${i}`, "VIP"))
    const { removeCustomerTagFromTargets } = await loadRepo()
    let batch = 0
    deleteShouldFail = () => {
      batch += 1
      return batch === 2
    }
    const targets = Array.from({ length: 150 }, (_, i) => neoTarget(`acc-${i}`))
    const result = await removeCustomerTagFromTargets(targets, "VIP")
    expect(deletePayloads.map((ids) => ids.length)).toEqual([100, 50])
    expect(result.applied).toBe(100)
    expect(result.skipped).toBe(0)
    expect(result.failed).toEqual(targets.slice(100).map((target) => target.key))
  })

  it("지울 태그가 하나도 없으면 삭제 요청 없이 전부 skipped", async () => {
    const { removeCustomerTagFromTargets } = await loadRepo()
    const result = await removeCustomerTagFromTargets([leadTarget(LEAD_A)], "VIP")
    expect(result).toEqual({ applied: 0, skipped: 1, failed: [] })
    expect(deletePayloads).toEqual([])
  })
})

describe("getAllCustomerTagsMap (F5 range)", () => {
  it("서버 상한(max-rows)이 요청보다 작아도 받은 행 수만큼 전진해 전량을 모은다", async () => {
    table = Array.from({ length: 2345 }, (_, i) => makeRow("lead", `l${i}`, "대량"))
    maxRows = 500
    const { getAllCustomerTagsMap } = await loadRepo()
    const map = await getAllCustomerTagsMap()
    expect(Object.keys(map)).toHaveLength(2345)
    expect(rangeCalls.map((call) => call.from)).toEqual([0, 500, 1000, 1500, 2000])
    // count 는 첫 페이지에서만 요청하고, 총 행 수에 닿으면 빈 페이지를 더 부르지 않는다.
    expect(rangeCalls.map((call) => call.withCount)).toEqual([true, false, false, false, false])
  })

  it("읽기 실패는 던지고 캐시에 넣지 않는다 — 다음 호출이 다시 읽는다", async () => {
    table = [makeRow("lead", LEAD_A, "VIP")]
    const { getAllCustomerTagsMap } = await loadRepo()
    selectError = { message: "boom" }
    await expect(getAllCustomerTagsMap()).rejects.toThrow("boom")
    selectError = null
    expect(await getAllCustomerTagsMap()).toEqual({ [`lead:${LEAD_A}`]: ["VIP"] })
  })

  it("일괄 쓰기 뒤에는 캐시를 버리고 새로 읽는다(무효화)", async () => {
    const { addCustomerTagToTargets, getAllCustomerTagsMap, removeCustomerTagFromTargets } = await loadRepo()
    expect(await getAllCustomerTagsMap()).toEqual({})

    await addCustomerTagToTargets([leadTarget(LEAD_A)], "VIP")
    expect(await getAllCustomerTagsMap()).toEqual({ [`lead:${LEAD_A}`]: ["VIP"] })

    await removeCustomerTagFromTargets([leadTarget(LEAD_A)], "vip")
    expect(await getAllCustomerTagsMap()).toEqual({})
  })

  it("캐시가 살아 있으면 다시 읽지 않는다", async () => {
    table = [makeRow("lead", LEAD_A, "VIP")]
    const { getAllCustomerTagsMap } = await loadRepo()
    await getAllCustomerTagsMap()
    const callsAfterFirst = rangeCalls.length
    await getAllCustomerTagsMap()
    expect(rangeCalls.length).toBe(callsAfterFirst)
  })

  it("전량 읽기 도중 쓰기가 끼면 그 읽기 결과를 캐시하지 않는다(세대 가드)", async () => {
    const { addCustomerTagToTargets, getAllCustomerTagsMap } = await loadRepo()
    let release: () => void = () => {}
    rangeGateOnce = new Promise<void>((resolve) => {
      release = resolve
    })

    const staleLoad = getAllCustomerTagsMap()
    await Promise.resolve()
    await addCustomerTagToTargets([leadTarget(LEAD_A)], "VIP")
    release()
    await staleLoad

    // 끼어든 쓰기 이후 첫 읽기는 캐시가 아니라 새로 읽은 값이어야 한다.
    expect(await getAllCustomerTagsMap()).toEqual({ [`lead:${LEAD_A}`]: ["VIP"] })
  })
})

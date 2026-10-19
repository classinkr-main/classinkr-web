import { beforeEach, describe, expect, it, vi } from "vitest"

// 오늘 연락(C안 ①) 전용 브리지 조회 둘 — getCompassNextActionsInRange(지난 다음 액션 포함 기간 조회)와
// getCompassLeadIndexByPhoneKeys(전화 키 → Compass 리드, 스캔 1회 + 교집합). @/lib/supabase/admin 만 목으로 세우고
// 브리지 구현을 그대로 통과시킨다(bridge-range-pagination.test.ts 와 같은 층위).

const SERVER_MAX_ROWS = 1000

interface QueryLog {
  view: string
  selectColumns: string
  selectOptions: unknown
  filters: Array<[string, string, unknown]>
  orders: string[]
  /** 내림차순으로 요청된 칼럼 */
  descending: Set<string>
  range: [number, number] | null
}

let datasets: Record<string, Array<Record<string, unknown>>>
let failViews: Set<string>
let logs: QueryLog[]

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right
  const a = String(left)
  const b = String(right)
  return a === b ? 0 : a < b ? -1 : 1
}

function makeQuery(view: string) {
  const log: QueryLog = {
    view,
    selectColumns: "",
    selectOptions: undefined,
    filters: [],
    orders: [],
    descending: new Set(),
    range: null,
  }
  logs.push(log)
  const run = () => {
    if (failViews.has(view)) return { data: null, error: { message: `${view} missing` }, count: null }
    let rows = [...(datasets[view] ?? [])]
    for (const [op, column, value] of log.filters) {
      if (op === "gte") rows = rows.filter((row) => row[column] != null && String(row[column]) >= String(value))
      if (op === "lte") rows = rows.filter((row) => row[column] != null && String(row[column]) <= String(value))
    }
    const total = rows.length
    rows.sort((a, b) => {
      for (const column of log.orders) {
        const delta = compareValues(a[column], b[column])
        if (delta !== 0) return log.descending.has(column) ? -delta : delta
      }
      return 0
    })
    const [from, to] = log.range ?? [0, rows.length - 1]
    const take = Math.min(to - from + 1, SERVER_MAX_ROWS)
    const withCount = (log.selectOptions as { count?: string } | undefined)?.count === "exact"
    return { data: rows.slice(from, from + take), error: null, count: withCount ? total : null }
  }
  const query = {
    select: (columns: string, options?: unknown) => {
      log.selectColumns = columns
      log.selectOptions = options
      return query
    },
    gte: (column: string, value: unknown) => {
      log.filters.push(["gte", column, value])
      return query
    },
    lte: (column: string, value: unknown) => {
      log.filters.push(["lte", column, value])
      return query
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      log.orders.push(column)
      if (options?.ascending === false) log.descending.add(column)
      return query
    },
    range: (from: number, to: number) => {
      log.range = [from, to]
      return query
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve().then(run).then(resolve, reject),
  }
  return query
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (view: string) => makeQuery(view) }),
}))

import {
  __resetCompassBridgeMemoForTests,
  getCompassLeadIndexByPhoneKeys,
  getCompassNextActionsInRange,
} from "@/lib/compass/bridge"

function lead(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    academy: `학원 ${id}`,
    name: null,
    phone_key: `0101234${String(id).padStart(4, "0")}`,
    stage: "contact",
    owner: "이콤",
    caller: null,
    bd_owner: null,
    care_stage: null,
    next_action_at: null,
    next_action: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: null,
    last_inflow_at: null,
    paid_amount: 999_000,
    ...overrides,
  }
}

beforeEach(() => {
  __resetCompassBridgeMemoForTests()
  datasets = {}
  failViews = new Set()
  logs = []
})

describe("getCompassNextActionsInRange", () => {
  it("[from, to] 경계를 포함해 지난 다음 액션까지 읽고, 금액 칼럼은 읽지 않는다", async () => {
    datasets.compass_leads_v = [
      lead(1, { next_action_at: "2026-09-01T00:00:00.000Z" }),
      lead(2, { next_action_at: "2026-09-25T14:59:59.999Z" }),
      lead(3, { next_action_at: "2026-09-26T00:00:00.000Z" }),
      lead(4, { next_action_at: null }),
    ]
    const result = await getCompassNextActionsInRange("2020-01-01T00:00:00.000Z", "2026-09-25T14:59:59.999Z")
    expect(result.down).toBe(false)
    expect(result.truncated).toBe(false)
    expect(result.rows.map((row) => row.id)).toEqual([1, 2])
    const [log] = logs
    expect(log.view).toBe("compass_leads_v")
    expect(log.selectColumns).not.toContain("paid_amount")
    expect(log.selectColumns).not.toContain("*")
    expect(log.selectColumns).toContain("next_action")
    expect(log.orders).toEqual(["next_action_at", "id"])
  })

  it("상한에 닿으면 truncated, 잘못된 ISO·조회 실패는 down(던지지 않음)", async () => {
    datasets.compass_leads_v = Array.from({ length: 5 }, (_, index) =>
      lead(index + 1, { next_action_at: `2026-09-2${index}T00:00:00.000Z` })
    )
    const capped = await getCompassNextActionsInRange("2020-01-01T00:00:00.000Z", "2026-09-30T00:00:00.000Z", { maxRows: 3 })
    expect(capped.rows).toHaveLength(3)
    expect(capped.truncated).toBe(true)

    const invalid = await getCompassNextActionsInRange("어제", "2026-09-30T00:00:00.000Z")
    expect(invalid).toMatchObject({ down: true, rows: [], truncated: false })

    failViews.add("compass_leads_v")
    const failed = await getCompassNextActionsInRange("2020-01-02T00:00:00.000Z", "2026-09-30T00:00:00.000Z")
    expect(failed.down).toBe(true)
  })

  it("같은 기간(분 단위)은 60초 메모를 공유한다 — 정렬 방향이 다르면 따로 읽는다", async () => {
    datasets.compass_leads_v = [lead(1, { next_action_at: "2026-09-20T00:00:00.000Z" })]
    await getCompassNextActionsInRange("2020-01-01T00:00:00.000Z", "2026-09-25T14:59:59.999Z")
    await getCompassNextActionsInRange("2020-01-01T00:00:10.000Z", "2026-09-25T14:59:30.000Z")
    expect(logs).toHaveLength(1)
    await getCompassNextActionsInRange("2020-01-01T00:00:00.000Z", "2026-09-25T14:59:59.999Z", { order: "desc" })
    expect(logs).toHaveLength(2)
  })

  it("order desc 는 최근 행부터 받아 상한에서 가장 오래된 행이 먼저 잘린다(타이브레이커 id 도 내림차순)", async () => {
    datasets.compass_leads_v = [
      lead(1, { next_action_at: "2021-01-01T00:00:00.000Z" }),
      lead(2, { next_action_at: "2026-09-09T00:00:00.000Z" }),
      lead(3, { next_action_at: "2026-09-09T00:00:00.000Z" }),
      lead(4, { next_action_at: "2024-05-05T00:00:00.000Z" }),
    ]
    const capped = await getCompassNextActionsInRange("2020-01-01T00:00:00.000Z", "2026-09-10T15:00:00.000Z", {
      maxRows: 3,
      order: "desc",
    })
    expect(capped.truncated).toBe(true)
    expect(capped.rows.map((row) => row.id)).toEqual([3, 2, 4])
    const [log] = logs
    expect(log.orders).toEqual(["next_action_at", "id"])
    expect([...log.descending].sort()).toEqual(["id", "next_action_at"])
  })
})

describe("getCompassLeadIndexByPhoneKeys", () => {
  it("한 번 훑고 우리 키와의 교집합만 돌려준다(같은 키 다건 포함) · 9자리 미만 키는 버린다", async () => {
    datasets.compass_leads_v = [
      lead(1, { phone_key: "01011112222" }),
      lead(2, { phone_key: "01011112222", last_inflow_at: "2026-09-20T00:00:00.000Z" }),
      lead(3, { phone_key: "01099990000" }),
      lead(4, { phone_key: null }),
    ]
    const result = await getCompassLeadIndexByPhoneKeys(["01011112222", " 01011112222 ", "12345", ""])
    expect(result.down).toBe(false)
    expect(result.rows.map((row) => row.id)).toEqual([1, 2])
    expect(result.rows.every((row) => row.phone_key === "01011112222")).toBe(true)
    expect(logs).toHaveLength(1)
    expect(logs[0].selectColumns).not.toContain("academy")
    expect(logs[0].selectColumns).not.toContain("paid_amount")
  })

  it("키가 없으면 조회하지 않고, 실패는 down", async () => {
    expect(await getCompassLeadIndexByPhoneKeys(["123"])).toEqual({ rows: [], down: false })
    expect(logs).toHaveLength(0)
    failViews.add("compass_leads_v")
    const failed = await getCompassLeadIndexByPhoneKeys(["01011112222"])
    expect(failed.down).toBe(true)
    expect(failed.rows).toEqual([])
  })
})

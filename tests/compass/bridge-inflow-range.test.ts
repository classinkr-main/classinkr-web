import { beforeEach, describe, expect, it, vi } from "vitest"

// getCompassLeadsByInflowRange — "오늘 유입" 카드의 Compass 원천(2026-09-14 R2 F12).
// 예전: .gte("last_inflow_at", from).limit(500) → Compass 신규 리드(last_inflow_at null)가 전부 빠졌다.
// 지금: created_at 또는 last_inflow_at 이 기간 안(OR) + 페이지네이션 + truncated = count > rows.
//
// 가짜 PostgREST 는 브리지가 보낸 .or() 문자열을 실제로 해석해 걸러낸다 — 필터 문자열 모양이 틀리면
// 결과가 틀려서 잡힌다. 서버 max-rows(1000)로 오류 없이 자르는 것도 흉내 낸다.

const SERVER_MAX_ROWS = 1000

interface QueryLog {
  view: string
  selectOptions: unknown
  orFilter: string | null
  otherFilters: string[]
  orders: Array<[string, { ascending?: boolean } | undefined]>
  range: [number, number] | null
}

let dataset: Array<Record<string, unknown>>
let failing: boolean
let logs: QueryLog[]

/** `col.op.value` 하나 — value 에는 점·콜론이 들어 있으므로 앞 두 점만 가른다. */
function evalCondition(row: Record<string, unknown>, condition: string): boolean {
  const first = condition.indexOf(".")
  const second = condition.indexOf(".", first + 1)
  const column = condition.slice(0, first)
  const op = condition.slice(first + 1, second)
  const value = condition.slice(second + 1)
  const cell = row[column]
  if (cell == null) return false
  const left = Date.parse(String(cell))
  const right = Date.parse(value)
  if (op === "gte") return left >= right
  if (op === "lte") return left <= right
  throw new Error(`unsupported op ${op}`)
}

/** 최상위 쉼표로 가른다(and(...) 괄호 안 쉼표는 건너뛴다). */
function splitTopLevel(filter: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < filter.length; index += 1) {
    const char = filter[index]
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === "," && depth === 0) {
      parts.push(filter.slice(start, index))
      start = index + 1
    }
  }
  parts.push(filter.slice(start))
  return parts
}

function evalOr(row: Record<string, unknown>, filter: string): boolean {
  return splitTopLevel(filter).some((part) => {
    const match = /^and\((.*)\)$/.exec(part)
    if (match) return splitTopLevel(match[1]).every((condition) => evalCondition(row, condition))
    return evalCondition(row, part)
  })
}

function makeQuery(view: string) {
  const log: QueryLog = { view, selectOptions: undefined, orFilter: null, otherFilters: [], orders: [], range: null }
  logs.push(log)

  const run = () => {
    if (failing) return { data: null, error: { message: `${view} missing` }, count: null }
    let rows = [...dataset]
    if (log.orFilter) rows = rows.filter((row) => evalOr(row, log.orFilter as string))
    const total = rows.length
    rows.sort((a, b) => {
      for (const [column, options] of log.orders) {
        const delta = Number(a[column]) - Number(b[column])
        if (delta !== 0) return options?.ascending === false ? -delta : delta
      }
      return 0
    })
    const [from, to] = log.range ?? [0, rows.length - 1]
    const take = Math.min(to - from + 1, SERVER_MAX_ROWS)
    const withCount = (log.selectOptions as { count?: string } | undefined)?.count === "exact"
    return { data: rows.slice(from, from + take), error: null, count: withCount ? total : null }
  }

  const record = (name: string) => (column: string, value: unknown) => {
    log.otherFilters.push(`${name}:${column}:${String(value)}`)
    return query
  }

  const query = {
    select: (_columns: string, options?: unknown) => {
      log.selectOptions = options
      return query
    },
    or: (filter: string) => {
      log.orFilter = filter
      return query
    },
    gte: record("gte"),
    lte: record("lte"),
    limit: (value: number) => {
      log.otherFilters.push(`limit:${value}`)
      return query
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      log.orders.push([column, options])
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

import { __resetCompassBridgeMemoForTests, getCompassLeadsByInflowRange } from "@/lib/compass/bridge"

const FROM = "2026-09-12T15:00:00.000Z" // 어제 00:00 KST
const NOW = "2026-09-14T05:30:00.000Z" // 오늘 14:30 KST

beforeEach(() => {
  __resetCompassBridgeMemoForTests()
  dataset = []
  failing = false
  logs = []
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("getCompassLeadsByInflowRange", () => {
  it("F12 회귀: last_inflow_at 이 비어 있는 오늘 신규 리드와 재유입 리드를 둘 다 받는다", async () => {
    dataset = [
      { id: 1, created_at: "2026-09-14T01:00:00.000Z", last_inflow_at: null }, // 오늘 신규
      { id: 2, created_at: "2026-07-01T00:00:00.000Z", last_inflow_at: "2026-09-14T02:00:00.000Z" }, // 오늘 재유입
      { id: 3, created_at: "2026-09-13T01:00:00.000Z", last_inflow_at: null }, // 어제 신규
      { id: 4, created_at: "2026-07-01T00:00:00.000Z", last_inflow_at: "2026-08-01T00:00:00.000Z" }, // 창 밖
      { id: 5, created_at: "2026-09-12T14:59:59.000Z", last_inflow_at: null }, // 창 직전
      { id: 6, created_at: "2026-09-14T05:31:00.000Z", last_inflow_at: null }, // 창 뒤
    ]
    const result = await getCompassLeadsByInflowRange(FROM, NOW)

    expect(result.down).toBe(false)
    expect(result.truncated).toBe(false)
    expect(result.rows.map((row) => row.id)).toEqual([1, 2, 3])
  })

  it("한 쿼리: OR 필터 + 유일 정렬 키 id + 첫 페이지만 count:exact — 예전 limit(500)·last_inflow_at 단독 필터는 없다", async () => {
    dataset = [{ id: 1, created_at: "2026-09-14T01:00:00.000Z", last_inflow_at: null }]
    await getCompassLeadsByInflowRange(FROM, NOW)

    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      view: "compass_leads_v",
      selectOptions: { count: "exact" },
      orFilter:
        `and(created_at.gte.${FROM},created_at.lte.${NOW}),` + `and(last_inflow_at.gte.${FROM},last_inflow_at.lte.${NOW})`,
      otherFilters: [],
      orders: [["id", { ascending: true }]],
      range: [0, 999],
    })
  })

  it("1000행을 넘어도 페이지로 전부 받고, 상한(2000)을 넘으면 truncated=true", async () => {
    dataset = Array.from({ length: 1500 }, (_, index) => ({
      id: index + 1,
      created_at: "2026-09-14T01:00:00.000Z",
      last_inflow_at: null,
    }))
    const full = await getCompassLeadsByInflowRange(FROM, NOW)
    expect(full.rows).toHaveLength(1500)
    expect(full.truncated).toBe(false)
    expect(new Set(full.rows.map((row) => row.id)).size).toBe(1500)

    __resetCompassBridgeMemoForTests()
    dataset = Array.from({ length: 2500 }, (_, index) => ({
      id: index + 1,
      created_at: "2026-09-14T01:00:00.000Z",
      last_inflow_at: null,
    }))
    const capped = await getCompassLeadsByInflowRange(FROM, NOW)
    expect(capped.rows).toHaveLength(2000)
    expect(capped.truncated).toBe(true)
    expect(capped.down).toBe(false)
  })

  it("뷰 오류는 down — throw 하지 않는다", async () => {
    failing = true
    const result = await getCompassLeadsByInflowRange(FROM, NOW)
    expect(result).toMatchObject({ rows: [], down: true })
  })

  it("깨진 시각은 조회하지 않고 down(필터 구문에 원문을 끼우지 않는다)", async () => {
    const result = await getCompassLeadsByInflowRange("x),id.gt.(0", NOW)
    expect(result).toMatchObject({ rows: [], down: true })
    expect(logs).toHaveLength(0)
  })

  it("같은 분 안의 재호출은 메모를 탄다(분 단위 캐시 키 유지)", async () => {
    dataset = [{ id: 1, created_at: "2026-09-14T01:00:00.000Z", last_inflow_at: null }]
    await getCompassLeadsByInflowRange(FROM, "2026-09-14T05:30:10.000Z")
    await getCompassLeadsByInflowRange(FROM, "2026-09-14T05:30:50.000Z")
    expect(logs).toHaveLength(1)
  })
})

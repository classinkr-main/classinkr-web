import { beforeEach, describe, expect, it, vi } from "vitest"

// Compass 브리지 기간 조회 4개(ads·adsets·demos·calEvents)의 절단 방지(2026-09-14, R5 X3·B3)와
// 데모 역조회용 id → phone_key 조회. bridge-memo.test.ts 와 같은 층위 — @/lib/supabase/admin 만
// 목으로 세우고 브리지 구현을 그대로 통과시킨다.
//
// 가짜 PostgREST: 뷰별 dataset 을 order 대로 정렬해 range 로 자르고, 서버 max-rows(1000)로 한 번 더
// 자른다(오류 없이 — 실제 PostgREST 와 같다). select 두 번째 인자에 count 가 있으면 총 행수를 준다.

const SERVER_MAX_ROWS = 1000

interface QueryLog {
  view: string
  selectColumns: string
  selectOptions: unknown
  filters: Array<[string, string, unknown]>
  orders: Array<[string, { ascending?: boolean } | undefined]>
  range: [number, number] | null
}

let datasets: Record<string, Array<Record<string, unknown>>>
let failViews: Set<string>
let logs: QueryLog[]

function makeQuery(view: string) {
  const log: QueryLog = { view, selectColumns: "", selectOptions: undefined, filters: [], orders: [], range: null }
  logs.push(log)

  const run = () => {
    if (failViews.has(view)) return { data: null, error: { message: `${view} missing` }, count: null }
    let rows = [...(datasets[view] ?? [])]
    for (const [op, column, value] of log.filters) {
      if (op === "gte") rows = rows.filter((row) => String(row[column]) >= String(value))
      if (op === "lte") rows = rows.filter((row) => String(row[column]) <= String(value))
      if (op === "in") rows = rows.filter((row) => (value as unknown[]).includes(row[column]))
    }
    const total = rows.length
    rows.sort((a, b) => {
      for (const [column] of log.orders) {
        const left = String(a[column])
        const right = String(b[column])
        if (left !== right) return left < right ? -1 : 1
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
    in: (column: string, value: unknown) => {
      log.filters.push(["in", column, value])
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

import {
  __resetCompassBridgeMemoForTests,
  getCompassAdsDaily,
  getCompassAdsetsDaily,
  getCompassCalEvents,
  getCompassDemos,
  getCompassLeadPhoneKeysByIds,
} from "@/lib/compass/bridge"

/** 2026-06-01 부터 days 일 × perDay 개 광고 — (day, ad_id) 유일. */
function adRows(days: number, perDay: number) {
  const rows: Array<Record<string, unknown>> = []
  for (let d = 0; d < days; d += 1) {
    const day = new Date(Date.UTC(2026, 5, 1 + d)).toISOString().slice(0, 10)
    for (let a = 0; a < perDay; a += 1) rows.push({ day, ad_id: `ad-${String(a).padStart(3, "0")}`, spend_usd: 1 })
  }
  return rows
}

beforeEach(() => {
  __resetCompassBridgeMemoForTests()
  datasets = {}
  failViews = new Set()
  logs = []
})

describe("getCompassAdsDaily — 페이지네이션", () => {
  it("X3 회귀: 90일 × 30소재(2700행)를 max-rows 1000 서버에서 최신 일자까지 받는다", async () => {
    datasets.compass_ads_v = adRows(90, 30)
    const result = await getCompassAdsDaily("2026-06-01", "2026-08-29")

    expect(result.down).toBe(false)
    expect(result.rows).toHaveLength(2700)
    expect(result.truncated).toBe(false)
    // 잘리던 쪽(최신 일자)이 들어 있다.
    expect(result.rows.at(-1)).toMatchObject({ day: "2026-08-29", ad_id: "ad-029" })
    // (day, ad_id) 가 중복 없이 모두 있다.
    expect(new Set(result.rows.map((row) => `${row.day}|${row.ad_id}`)).size).toBe(2700)
    expect(logs).toHaveLength(3)
  })

  it("첫 페이지만 count:exact, 정렬은 유일 키 (day, ad_id) 오름차순, 필터는 그대로", async () => {
    datasets.compass_ads_v = adRows(3, 2)
    await getCompassAdsDaily("2026-06-01", "2026-06-03")

    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      view: "compass_ads_v",
      selectColumns: "*",
      selectOptions: { count: "exact" },
      filters: [
        ["gte", "day", "2026-06-01"],
        ["lte", "day", "2026-06-03"],
      ],
      orders: [
        ["day", { ascending: true }],
        ["ad_id", { ascending: true }],
      ],
      range: [0, 999],
    })
  })

  it("상한(3000)을 넘으면 3000행까지만 받고 truncated=true", async () => {
    datasets.compass_ads_v = adRows(100, 35) // 3500행
    const result = await getCompassAdsDaily("2026-06-01", "2026-09-08")
    expect(result.rows).toHaveLength(3000)
    expect(result.truncated).toBe(true)
    expect(result.down).toBe(false)
  })

  it("뷰 오류는 down(throw 하지 않음) — truncated 는 채우지 않는다", async () => {
    failViews.add("compass_ads_v")
    const result = await getCompassAdsDaily("2026-06-01", "2026-06-03")
    expect(result.down).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.truncated).toBeUndefined()
  })

  it("메모 적중에도 truncated 가 유지된다", async () => {
    datasets.compass_ads_v = adRows(100, 35)
    await getCompassAdsDaily("2026-06-01", "2026-09-08")
    const callsAfterFirst = logs.length
    const cached = await getCompassAdsDaily("2026-06-01", "2026-09-08")
    expect(logs.length).toBe(callsAfterFirst)
    expect(cached.truncated).toBe(true)
  })
})

describe("나머지 기간 조회 — 같은 규칙", () => {
  it("getCompassAdsetsDaily: (day, adset_id) 정렬, 1000행 넘어도 전부", async () => {
    datasets.compass_adsets_v = adRows(60, 20).map(({ day, ad_id }) => ({ day, adset_id: ad_id }))
    const result = await getCompassAdsetsDaily("2026-06-01", "2026-07-30")
    expect(result.rows).toHaveLength(1200)
    expect(result.truncated).toBe(false)
    expect(logs[0].orders.map(([column]) => column)).toEqual(["day", "adset_id"])
  })

  it("getCompassDemos: 예전엔 limit 없이 1000행에서 잘렸다 — (day, id) 정렬로 전부 받는다", async () => {
    datasets.compass_demos_v = Array.from({ length: 1500 }, (_, i) => ({
      id: i + 1,
      lead_id: i + 1,
      day: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
    }))
    const result = await getCompassDemos("2026-09-01", "2026-09-30")
    expect(result.rows).toHaveLength(1500)
    expect(result.truncated).toBe(false)
    expect(new Set(result.rows.map((row) => row.id)).size).toBe(1500)
    expect(logs[0].orders.map(([column]) => column)).toEqual(["day", "id"])
  })

  it("getCompassCalEvents: (day, key) 정렬로 전부 받는다", async () => {
    datasets.compass_cal_events_v = Array.from({ length: 1100 }, (_, i) => ({
      key: `evt-${String(i).padStart(5, "0")}`,
      day: `2026-10-${String((i % 30) + 1).padStart(2, "0")}`,
    }))
    const result = await getCompassCalEvents("2026-10-01", "2026-10-31")
    expect(result.rows).toHaveLength(1100)
    expect(result.truncated).toBe(false)
    expect(logs[0].orders.map(([column]) => column)).toEqual(["day", "key"])
  })
})

describe("getCompassLeadPhoneKeysByIds — 데모 역조회", () => {
  beforeEach(() => {
    datasets.compass_leads_v = Array.from({ length: 900 }, (_, i) => ({
      id: i + 1,
      phone_key: `010${String(i + 1).padStart(8, "0")}`,
      name: "개인정보",
    }))
  })

  it("id 두 컬럼만 PK in() 으로 읽는다", async () => {
    const result = await getCompassLeadPhoneKeysByIds([3, 1, 3, 2])
    expect(result.down).toBe(false)
    expect(result.rows.map((row) => row.id).sort((a, b) => a - b)).toEqual([1, 2, 3])
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ view: "compass_leads_v", selectColumns: "id,phone_key" })
    expect(logs[0].filters).toEqual([["in", "id", [1, 2, 3]]])
  })

  it("id 가 많으면 200개씩 나눠 읽고 합친다", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i + 1)
    const result = await getCompassLeadPhoneKeysByIds(ids)
    expect(result.rows).toHaveLength(450)
    expect(logs.map((log) => (log.filters[0][2] as number[]).length)).toEqual([200, 200, 50])
  })

  it("빈 입력은 조회하지 않는다", async () => {
    const result = await getCompassLeadPhoneKeysByIds([])
    expect(result).toEqual({ rows: [], down: false })
    expect(logs).toHaveLength(0)
  })

  it("오류는 down", async () => {
    failViews.add("compass_leads_v")
    const result = await getCompassLeadPhoneKeysByIds([1])
    expect(result.down).toBe(true)
    expect(result.rows).toEqual([])
  })
})

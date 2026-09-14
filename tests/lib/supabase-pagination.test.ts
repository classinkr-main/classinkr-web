import { describe, expect, it, vi } from "vitest"

import { fetchSupabasePages } from "@/lib/supabase/pagination"

// PostgREST range 페이지네이션 공용 헬퍼(2026-09-14 후속 수정 — lib/compass/paginate.ts 를 합쳤다).
// 가짜 PostgREST: 정렬된 dataset 에서 range 를 자르고, 서버 max-rows 로 한 번 더 자른다(오류 없이).
// count 는 호출부 규약대로 from === 0 첫 페이지에서만 준다.

interface FakeServerOptions {
  /** 서버 max-rows — 요청 range 가 더 커도 이만큼만 준다 */
  maxRows?: number
  /** count 를 요청하지 않는 호출부(첫 페이지에도 count 없음) */
  noCount?: boolean
  /** 특정 호출(0-based)에서 오류 */
  failOnCall?: number
  /** 특정 from 에서만 행을 덜 준다(병렬 구간이 짧은 경우) */
  shortAt?: { from: number; take: number }
  /** count 는 이 값으로 알려 주되 실제 행은 dataset 뿐(조회 중 행 감소) */
  reportedCount?: number
}

function fakeServer(dataset: number[], options: FakeServerOptions = {}) {
  const calls: Array<[number, number]> = []
  const fetchPage = vi.fn(async (from: number, to: number) => {
    const call = calls.length
    calls.push([from, to])
    if (options.failOnCall === call) return { data: null, error: { message: "boom" } }
    let take = to - from + 1
    if (options.maxRows != null) take = Math.min(take, options.maxRows)
    if (options.shortAt && options.shortAt.from === from) take = Math.min(take, options.shortAt.take)
    const data = dataset.slice(from, from + take)
    const count = from === 0 && !options.noCount ? (options.reportedCount ?? dataset.length) : null
    return { data, error: null, count }
  })
  return { fetchPage, calls }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

describe("fetchSupabasePages — 서버 클램프 안전 전진", () => {
  it("회귀: max-rows 가 요청(1000)보다 작은 서버에서 짧은 첫 페이지를 끝으로 보지 않는다", async () => {
    // 예전 규칙(rows < requested → 종료)은 500행만 받고 truncated=false 로 끝났다.
    const dataset = range(1200)
    const { fetchPage, calls } = fakeServer(dataset, { maxRows: 500 })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000 })
    expect(result.data).toEqual(dataset)
    expect(result.count).toBe(1200)
    expect(result.truncated).toBe(false)
    expect(result.error).toBeNull()
    // 간격은 실제로 받은 행 수 — 중간 행을 건너뛰지 않는다.
    expect(calls).toEqual([
      [0, 999],
      [500, 1199],
      [1000, 1199],
    ])
  })

  it("count 를 모르면 짧은 페이지가 끝이다 — 클램프와 끝을 가를 근거가 없어 예전 규칙을 유지한다(문서화된 한계)", async () => {
    const { fetchPage, calls } = fakeServer(range(1200), { maxRows: 500, noCount: true })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000 })
    expect(result.data).toEqual(range(500))
    expect(result.count).toBeNull()
    expect(calls).toEqual([[0, 999]])
  })

  it("count 를 알면 한 페이지로 끝나는 조회는 왕복 1회", async () => {
    const { fetchPage, calls } = fakeServer(range(645))
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000 })
    expect(result).toEqual({ data: range(645), error: null, count: 645, truncated: false, pages: 1 })
    expect(calls).toEqual([[0, 999]])
  })

  it("count 를 모르는 호출부의 짧은 조회도 왕복 1회 — 빈 페이지 확인을 더하지 않는다", async () => {
    const { fetchPage, calls } = fakeServer(range(645), { noCount: true })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000 })
    expect(result).toEqual({ data: range(645), error: null, count: null, truncated: false, pages: 1 })
    expect(calls).toEqual([[0, 999]])
  })

  it("count 를 모르면 가득 찬 페이지 뒤를 이어 읽고, 짧은(또는 빈) 페이지에서 멈춘다", async () => {
    const { fetchPage, calls } = fakeServer(range(2300), { maxRows: 1000, noCount: true })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 5000 })
    expect(result.data).toEqual(range(2300))
    expect(result.truncated).toBe(false)
    expect(calls.map(([from]) => from)).toEqual([0, 1000, 2000])

    const exact = fakeServer(range(2000), { maxRows: 1000, noCount: true })
    const exactResult = await fetchSupabasePages<number>({ fetchPage: exact.fetchPage, maxRows: 5000 })
    expect(exactResult.data).toEqual(range(2000))
    expect(exact.calls.map(([from]) => from)).toEqual([0, 1000, 2000])
  })

  it("빈 결과는 왕복 1회로 끝난다(count 유무 무관)", async () => {
    for (const noCount of [false, true]) {
      const { fetchPage, calls } = fakeServer([], { noCount })
      const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000 })
      expect(result.data).toEqual([])
      expect(result.truncated).toBe(false)
      expect(calls).toHaveLength(1)
    }
  })

  it("max-rows 1000 서버에서 2500행을 최신 행까지 빠짐없이 받는다(기본 순차)", async () => {
    const dataset = range(2500)
    const { fetchPage, calls } = fakeServer(dataset, { maxRows: 1000 })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000 })
    expect(result.data).toEqual(dataset)
    expect(result.data.at(-1)).toBe(2499)
    expect(result.truncated).toBe(false)
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2499],
    ])
  })

  it("총 행수가 상한보다 많으면 상한까지만 받고 truncated=true(count > rows)", async () => {
    const { fetchPage, calls } = fakeServer(range(4000), { maxRows: 1000 })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000 })
    expect(result.data).toEqual(range(3000))
    expect(result.count).toBe(4000)
    expect(result.truncated).toBe(true)
    expect(Math.max(...calls.map(([, to]) => to))).toBe(2999)
  })

  it("상한이 정확히 총 행수와 같으면 잘리지 않았다", async () => {
    const { fetchPage } = fakeServer(range(3000), { maxRows: 1000 })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000 })
    expect(result.data).toHaveLength(3000)
    expect(result.truncated).toBe(false)
  })

  it("count 를 모르고 상한에 닿으면 truncated=true", async () => {
    const { fetchPage } = fakeServer(range(2300), { maxRows: 1000, noCount: true })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 2000 })
    expect(result.data).toEqual(range(2000))
    expect(result.truncated).toBe(true)
  })

  it("조회 중 행이 줄어 count 보다 적게 받으면 truncated=true(전체라고 부르지 않는다)", async () => {
    const { fetchPage } = fakeServer(range(1500), { maxRows: 1000, reportedCount: 2000 })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000 })
    expect(result.data).toEqual(range(1500))
    expect(result.truncated).toBe(true)
  })

  it("상한이 페이지 크기보다 작으면 첫 요청부터 상한까지만 청한다", async () => {
    const { fetchPage, calls } = fakeServer(range(50))
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 20, pageSize: 1000 })
    expect(calls[0]).toEqual([0, 19])
    expect(result.data).toEqual(range(20))
    expect(result.truncated).toBe(true)
  })

  it("페이지 크기는 PostgREST 기본 max-rows(1000)를 넘지 않는다", async () => {
    const { fetchPage, calls } = fakeServer(range(10))
    await fetchSupabasePages<number>({ fetchPage, maxRows: 5000, pageSize: 5000 })
    expect(calls[0]).toEqual([0, 999])
  })

  it("오류는 그 전까지 받은 행과 함께 error 로 돌려준다(truncated=false)", async () => {
    const first = fakeServer(range(10), { failOnCall: 0 })
    const firstResult = await fetchSupabasePages<number>({ fetchPage: first.fetchPage, maxRows: 3000 })
    expect(firstResult).toMatchObject({ data: [], error: { message: "boom" }, truncated: false, pages: 1 })

    const later = fakeServer(range(2500), { maxRows: 1000, failOnCall: 2 })
    const laterResult = await fetchSupabasePages<number>({ fetchPage: later.fetchPage, maxRows: 3000 })
    expect(laterResult.error).toEqual({ message: "boom" })
    expect(laterResult.data).toEqual(range(2000))
  })
})

describe("fetchSupabasePages — concurrent", () => {
  it("count 를 알면 첫 페이지 길이 간격으로 남은 구간을 병렬로 청한다", async () => {
    const dataset = range(2500)
    const { fetchPage, calls } = fakeServer(dataset, { maxRows: 1000 })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000, concurrent: true })
    expect(result.data).toEqual(dataset)
    expect(result.truncated).toBe(false)
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2499],
    ])
  })

  it("서버 클램프가 있으면 실제 받은 행 수 간격으로 구간을 나눈다", async () => {
    const dataset = range(1200)
    const { fetchPage, calls } = fakeServer(dataset, { maxRows: 500 })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000, concurrent: true })
    expect(result.data).toEqual(dataset)
    expect(calls.slice(1)).toEqual([
      [500, 999],
      [1000, 1199],
    ])
  })

  it("병렬 구간 하나가 짧으면 뒤 구간을 버리고 그 지점부터 순차로 채운다(중복·누락 없음)", async () => {
    const dataset = range(3500)
    const { fetchPage } = fakeServer(dataset, { maxRows: 1000, shortAt: { from: 1000, take: 400 } })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 5000, concurrent: true })
    expect(result.data).toEqual(dataset)
    expect(new Set(result.data).size).toBe(result.data.length)
    expect(result.truncated).toBe(false)
  })

  it("count 를 모르면 concurrent 여도 순차로 읽는다", async () => {
    const dataset = range(2300)
    const { fetchPage, calls } = fakeServer(dataset, { maxRows: 1000, noCount: true })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 5000, concurrent: true })
    expect(result.data).toEqual(dataset)
    expect(calls.map(([from]) => from)).toEqual([0, 1000, 2000])
  })

  it("병렬 구간 오류도 error 로 돌려준다", async () => {
    const { fetchPage } = fakeServer(range(2500), { maxRows: 1000, failOnCall: 2 })
    const result = await fetchSupabasePages<number>({ fetchPage, maxRows: 3000, concurrent: true })
    expect(result.error).toEqual({ message: "boom" })
  })
})

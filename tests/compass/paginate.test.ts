import { describe, expect, it, vi } from "vitest"

import { fetchCompassPages, type CompassPageRange } from "@/lib/compass/paginate"

// Compass 브리지 기간 조회 페이지네이션(2026-09-14, R5 X3·B3).
// 가짜 PostgREST: 정렬된 dataset 에서 range 를 자르고, 서버 max-rows 로 한 번 더 자른다(오류 없이).

interface FakeServerOptions {
  /** 서버 max-rows — 요청 range 가 더 커도 이만큼만 준다 */
  maxRows?: number
  /** 첫 페이지 count 를 주지 않는 서버(드묾) */
  noCount?: boolean
  /** 특정 호출(0-based)에서 오류 */
  failOnCall?: number
  /** 특정 from 에서만 행을 덜 준다(병렬 구간이 짧은 경우) */
  shortAt?: { from: number; take: number }
  /** count 는 이 값으로 알려 주되 실제 행은 dataset 뿐(조회 중 행 감소) */
  reportedCount?: number
}

function fakeServer(dataset: number[], options: FakeServerOptions = {}) {
  const calls: CompassPageRange[] = []
  const fetchPage = vi.fn(async (range: CompassPageRange) => {
    const call = calls.length
    calls.push(range)
    if (options.failOnCall === call) return { data: null, error: { message: "boom" } }
    let take = range.to - range.from + 1
    if (options.maxRows != null) take = Math.min(take, options.maxRows)
    if (options.shortAt && options.shortAt.from === range.from) take = Math.min(take, options.shortAt.take)
    const data = dataset.slice(range.from, range.from + take)
    const count = range.withCount && !options.noCount ? (options.reportedCount ?? dataset.length) : null
    return { data, error: null, count }
  })
  return { fetchPage, calls }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

describe("fetchCompassPages", () => {
  it("한 페이지로 끝나면 왕복 1회(count 요청 포함), truncated=false", async () => {
    const { fetchPage, calls } = fakeServer(range(645))
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 3000 })
    expect(result.rows).toEqual(range(645))
    expect(result.count).toBe(645)
    expect(result.truncated).toBe(false)
    expect(result.error).toBeNull()
    expect(calls).toEqual([{ from: 0, to: 999, withCount: true }])
  })

  it("빈 결과는 왕복 1회로 끝난다", async () => {
    const { fetchPage, calls } = fakeServer([])
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 3000 })
    expect(result).toEqual({ rows: [], count: 0, truncated: false, error: null })
    expect(calls).toHaveLength(1)
  })

  it("X3 회귀: max-rows 1000 서버에서 2500행을 최신 일자까지 빠짐없이 받는다", async () => {
    const dataset = range(2500)
    const { fetchPage, calls } = fakeServer(dataset, { maxRows: 1000 })
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 3000 })
    expect(result.rows).toEqual(dataset)
    expect(result.rows.at(-1)).toBe(2499)
    expect(result.truncated).toBe(false)
    expect(calls.slice(1)).toEqual([
      { from: 1000, to: 1999, withCount: false },
      { from: 2000, to: 2499, withCount: false },
    ])
  })

  it("서버 max-rows 가 요청보다 작으면 실제 받은 행 수 간격으로 전진한다(중간 행을 건너뛰지 않는다)", async () => {
    const dataset = range(1200)
    const { fetchPage, calls } = fakeServer(dataset, { maxRows: 500 })
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 3000 })
    expect(result.rows).toEqual(dataset)
    expect(result.truncated).toBe(false)
    expect(calls.slice(1).map((c) => [c.from, c.to])).toEqual([
      [500, 999],
      [1000, 1199],
    ])
  })

  it("총 행수가 상한보다 많으면 상한까지만 받고 truncated=true(count > rows)", async () => {
    const { fetchPage, calls } = fakeServer(range(4000), { maxRows: 1000 })
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 3000 })
    expect(result.rows).toEqual(range(3000))
    expect(result.count).toBe(4000)
    expect(result.truncated).toBe(true)
    expect(Math.max(...calls.map((c) => c.to))).toBe(2999)
  })

  it("상한이 정확히 총 행수와 같으면 잘리지 않았다(예전 >= 근사의 거짓 양성 제거)", async () => {
    const { fetchPage } = fakeServer(range(3000), { maxRows: 1000 })
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 3000 })
    expect(result.rows).toHaveLength(3000)
    expect(result.truncated).toBe(false)
  })

  it("병렬 구간 하나가 짧으면 뒤 구간을 버리고 그 지점부터 순차로 채운다(중복·누락 없음)", async () => {
    const dataset = range(3500)
    const { fetchPage } = fakeServer(dataset, { maxRows: 1000, shortAt: { from: 1000, take: 400 } })
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 5000 })
    expect(result.rows).toEqual(dataset)
    expect(new Set(result.rows).size).toBe(result.rows.length)
    expect(result.truncated).toBe(false)
  })

  it("count 를 모르면 빈 페이지가 나올 때까지 순차로 읽는다", async () => {
    const dataset = range(2300)
    const { fetchPage, calls } = fakeServer(dataset, { maxRows: 1000, noCount: true })
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 5000 })
    expect(result.rows).toEqual(dataset)
    expect(result.count).toBeNull()
    expect(result.truncated).toBe(false)
    expect(calls.map((c) => c.from)).toEqual([0, 1000, 2000, 2300])
  })

  it("count 를 모르고 상한에 닿으면 truncated=true", async () => {
    const { fetchPage } = fakeServer(range(2300), { maxRows: 1000, noCount: true })
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 2000 })
    expect(result.rows).toEqual(range(2000))
    expect(result.truncated).toBe(true)
  })

  it("조회 중 행이 줄어 count 보다 적게 받으면 truncated=true(전체라고 부르지 않는다)", async () => {
    const { fetchPage } = fakeServer(range(1500), { maxRows: 1000, reportedCount: 2000 })
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 3000 })
    expect(result.rows).toEqual(range(1500))
    expect(result.truncated).toBe(true)
  })

  it("첫 페이지 오류는 error 와 빈 rows", async () => {
    const { fetchPage } = fakeServer(range(10), { failOnCall: 0 })
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 3000 })
    expect(result.rows).toEqual([])
    expect(result.error).toEqual({ message: "boom" })
  })

  it("뒤 페이지 오류도 반쪽 결과를 내지 않는다", async () => {
    const { fetchPage } = fakeServer(range(2500), { maxRows: 1000, failOnCall: 2 })
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 3000 })
    expect(result.rows).toEqual([])
    expect(result.error).toEqual({ message: "boom" })
  })

  it("순차 채움 중 오류도 반쪽 결과를 내지 않는다", async () => {
    const { fetchPage } = fakeServer(range(2300), { maxRows: 1000, noCount: true, failOnCall: 2 })
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 5000 })
    expect(result.rows).toEqual([])
    expect(result.error).toEqual({ message: "boom" })
  })

  it("상한이 페이지 크기보다 작으면 첫 요청부터 상한까지만 청한다", async () => {
    const { fetchPage, calls } = fakeServer(range(50))
    const result = await fetchCompassPages<number>(fetchPage, { maxRows: 20, pageSize: 1000 })
    expect(calls[0]).toEqual({ from: 0, to: 19, withCount: true })
    expect(result.rows).toEqual(range(20))
    expect(result.truncated).toBe(true)
  })
})

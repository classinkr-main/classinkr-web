import { beforeEach, describe, expect, it, vi } from "vitest"
import { compassOwnerCacheKey, compassOwnerFilter } from "@/lib/compass/owner-filter"
const mocks = vi.hoisted(() => ({ from: vi.fn(), queries: [] as string[][] }))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: mocks.from }) }))
import { __resetCompassBridgeMemoForTests, getCompassBdOpenCount, getCompassUpcomingActions } from "@/lib/compass/bridge"

beforeEach(() => {
  __resetCompassBridgeMemoForTests()
  mocks.queries = []
  mocks.from.mockImplementation(() => {
    const calls: string[] = []
    mocks.queries.push(calls)
    const query = {
      select: () => query, eq: () => query, is: () => query, gte: () => query, lte: () => query,
      order: () => query, limit: () => { calls.push("limit"); return query },
      or: (filter: string) => { calls.push(filter); return query },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], count: 3, error: null }).then(resolve),
    }
    return query
  })
})

describe("Compass 개인 집계와 캐시 격리", () => {
  it("담당자 필터를 count와 페이지 상한 전 쿼리에 포함하며 계정·전체 캐시를 분리한다", async () => {
    mocks.from.mockClear()
    await getCompassBdOpenCount(["Junhyuk"])
    await getCompassBdOpenCount(["Somang"])
    await getCompassBdOpenCount()
    await getCompassBdOpenCount(["Junhyuk"])
    expect(mocks.from).toHaveBeenCalledTimes(3)
    expect(mocks.queries[0]).toContain('owner.in.("Junhyuk"),caller.in.("Junhyuk"),bd_owner.in.("Junhyuk")')
    expect(mocks.queries[1].join()).not.toContain("Junhyuk")
    expect(mocks.queries[2]).toEqual([])
    await getCompassUpcomingActions(48, ["Somang"])
    expect(mocks.queries[3]).toHaveLength(2)
    expect(mocks.queries[3][1]).toContain('owner.in.("Somang")')
  })
  it("별명 순서와 중복은 같은 캐시이며 필터 값의 따옴표·역슬래시를 인용한다", () => {
    expect(compassOwnerCacheKey(["b", "a", "a"])).toBe(compassOwnerCacheKey(["a", "b"]))
    expect(compassOwnerCacheKey([])).not.toBe(compassOwnerCacheKey())
    expect(compassOwnerFilter(['a"b\\c'], ["owner"])).toBe('owner.in.("a\\"b\\\\c")')
    expect(compassOwnerFilter([])).toContain("__no_current_admin_owner__")
    expect(compassOwnerFilter(undefined)).toBeUndefined()
  })
})

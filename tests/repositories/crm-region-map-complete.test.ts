import { beforeEach, describe, expect, it, vi } from "vitest"
import { createRecordingSupabaseClient, type RecordedQuery } from "../helpers/recording-supabase-client"

let failSecondPage = false
let queries: RecordedQuery[] = []
const regions = Array.from({ length: 1501 }, (_, id) => ({ id, region: id < 1000 ? "서울" : "부산" }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn, revalidateTag: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => {
  const recorded = createRecordingSupabaseClient(query => {
    queries.push(query)
    if (query.table !== "branch_rev_deals") return { data: [], count: 0, error: null }
    const start = query.range?.from ?? 0
    if (failSecondPage && start > 0) return { data: null, error: { message: "temporarily unavailable" }, count: null }
    return { data: regions.slice(start, Math.min(start + 1000, (query.range?.to ?? 999) + 1)), count: regions.length, error: null }
  })
  return recorded.client
} }))
import { getCrmRegionMap } from "@/lib/repositories/crm-region-map"

beforeEach(() => { failSecondPage = false; queries = [] })
describe("지역 전체 집계", () => {
  it("PostgREST가 1000행으로 자르더라도 다음 페이지까지 집계한다", async () => {
    const data = await getCrmRegionMap({ force: true })
    const deals = data.layers.find(layer => layer.key === "deal")!
    expect(deals.total).toBe(1501)
    expect(deals.regions).toEqual({ 서울: 1000, 부산: 501 })
    expect(queries.filter(query => query.table === "branch_rev_deals").map(query => query.range?.from)).toEqual([0, 1000])
    expect(data.layers.some(layer => layer.key === "compass")).toBe(true)
  })
  it("뒤 페이지의 실패를 정상 부분 합계로 돌려주지 않는다", async () => {
    failSecondPage = true
    await expect(getCrmRegionMap({ force: true })).rejects.toThrow("전체 분포를 확인하지 못했습니다")
  })
})

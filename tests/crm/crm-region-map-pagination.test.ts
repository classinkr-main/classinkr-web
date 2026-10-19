/**
 * C9 — CRM 지역 지도 원천 조회: 단일 `.limit(5000)` → 1,000행 range 페이지네이션, 절단·실패 표시,
 * 리드층 지역 산식 통일(deriveLeadRegionLabel — 통합 고객 목록과 같은 규칙).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createRecordingSupabaseClient,
  type RecordedQuery,
  type RecordedQueryResolver,
} from "../helpers/recording-supabase-client"

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}))

let fakeFrom: ReturnType<typeof createRecordingSupabaseClient>["client"]["from"]
let recorded: RecordedQuery[] = []

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fakeFrom }),
}))

function install(resolve: RecordedQueryResolver) {
  const { client, queries } = createRecordingSupabaseClient(resolve)
  fakeFrom = client.from
  recorded = queries
}

async function loadModule() {
  vi.resetModules()
  return import("@/lib/repositories/crm-region-map")
}

function page<T>(rows: T[], query: RecordedQuery) {
  const from = query.range?.from ?? 0
  const to = query.range?.to ?? rows.length - 1
  return rows.slice(from, to + 1)
}

/** 캐시 콜백이 정상 반환한 값(= unstable_cache가 저장할 값). 콜백이 던지면 저장되지 않는다. */
let cacheStored: unknown[] = []

beforeEach(() => {
  mocks.unstableCache.mockReset()
  cacheStored = []
  // 캐시 래퍼는 콜백을 그대로 부르게 해 실제 계산 경로를 타고, 저장될 값(정상 반환)만 기록한다.
  mocks.unstableCache.mockImplementation((fn: () => Promise<unknown>) => async () => {
    const value = await fn()
    cacheStored.push(value)
    return value
  })
  mocks.revalidateTag.mockClear()
})

describe("crm-region-map — range 페이지네이션(C9)", () => {
  it("1,000행을 넘는 원천을 실제 받은 행 수만큼 전진하며 끝까지 읽고, 유일 키로 정렬한다", async () => {
    const deals = Array.from({ length: 1_500 }, (_, index) => ({ id: `d${index}`, region: index % 2 ? "서울" : "부산" }))
    install((query) => {
      if (query.table === "branch_rev_deals") {
        return {
          data: page(deals, query),
          error: null,
          count: query.selectOptions?.count === "exact" ? deals.length : null,
        }
      }
      return { data: [], error: null, count: query.selectOptions?.count === "exact" ? 0 : null }
    })
    const { getCrmRegionMap } = await loadModule()

    const map = await getCrmRegionMap({ force: true })
    const deal = map.layers.find((layer) => layer.key === "deal")!

    expect(deal.total).toBe(1_500)
    expect(deal.regions).toEqual({ 서울: 750, 부산: 750 })
    expect(deal.truncated).toBeUndefined()

    const dealQueries = recorded.filter((query) => query.table === "branch_rev_deals")
    expect(dealQueries.map((query) => query.range)).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1499 },
    ])
    expect(dealQueries[0].selectOptions).toEqual({ count: "exact" })
    expect(dealQueries.every((query) => query.order.some((order) => order.column === "id"))).toBe(true)
    // 단일 limit 조회는 더 이상 없다
    expect(recorded.every((query) => query.limit === null)).toBe(true)
  })

  it("count가 받은 행보다 많으면(조회 중 절단) truncated와 경고 문구를 싣는다", async () => {
    install((query) => {
      if (query.table === "leads") {
        // 첫 페이지 1,000행을 주고 count는 1,200이라 말한 뒤, 다음 페이지는 비어 있다.
        const rows = (query.range?.from ?? 0) === 0
          ? Array.from({ length: 1_000 }, (_, index) => ({ id: `l${index}`, branch: "서울", message: null }))
          : []
        return { data: rows, error: null, count: query.selectOptions?.count === "exact" ? 1_200 : null }
      }
      return { data: [], error: null }
    })
    const { getCrmRegionMap } = await loadModule()

    // 첫 읽기(캐시 경로) — 절단 지도는 캐시에 넣지 않고 "부분값" 표시를 달아 돌려준다.
    const map = await getCrmRegionMap()
    const lead = map.layers.find((layer) => layer.key === "lead")!

    expect(lead.total).toBe(1_000)
    expect(lead.truncated).toBe(true)
    expect(lead.notes[0]).toContain("일부만 셌다")
    expect(cacheStored).toEqual([])
    // 담당자 범위로 좁혀도 절단 표시가 따라간다(전체처럼 읽히지 않는다).
    const { scopeRegionLayer } = await import("@/lib/crm/region-map-summary")
    const scoped = scopeRegionLayer(lead, ["아무개"])
    expect(scoped.truncated).toBe(true)
    expect(scoped.notes[0]).toContain("일부만 셌다")

    // 새로고침(force)은 부분 합계로 화면의 최근 확인값을 덮지 않는다 — 던져서 화면이 유지하게 한다.
    await expect(getCrmRegionMap({ force: true })).rejects.toThrow("전체 분포를 확인하지 못했습니다")
  })

  it("원천 조회 실패는 0건이 아니라 '모름'으로 표시하고, 캐시 경로에서도 저장하지 않고 그대로 돌려준다", async () => {
    install((query) => {
      if (query.table === "crm_neo_customer_snapshots") {
        return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }
      }
      return { data: [], error: null }
    })
    const { getCrmRegionMap } = await loadModule()

    // 비-force 경로(unstable_cache 래퍼) — 실패 지도는 캐시 콜백에서 던져져 저장되지 않지만 응답은 나간다.
    const map = await getCrmRegionMap()
    const customer = map.layers.find((layer) => layer.key === "customer")!

    expect(customer.failed).toBe(true)
    expect(customer.total).toBe(0)
    expect(customer.notes[0]).toContain("모름")
    expect(cacheStored).toEqual([])
    // 원문 DB 오류는 싣지 않는다
    expect(JSON.stringify(map)).not.toContain("statement timeout")
  })
})

describe("crm-region-map — 캐시 저장 조건", () => {
  it("모든 원천을 끝까지 읽은 지도만 캐시 경로에서 저장된다(대조군)", async () => {
    install(() => ({ data: [], error: null }))
    const { getCrmRegionMap } = await loadModule()

    const map = await getCrmRegionMap()

    expect(map.layers.every((layer) => !layer.failed && !layer.truncated)).toBe(true)
    expect(cacheStored).toEqual([map])
  })
})

describe("crm-region-map — 리드층 지역 산식(deriveLeadRegionLabel)", () => {
  it("branch가 비어도 메타 폼 답변·영문 도시명으로 시도를 정하고, 온라인은 nonGeo로 둔다", async () => {
    const leads = [
      { id: "a", branch: "서울 강남구", message: null },
      { id: "b", branch: null, message: "city=Busan" },
      { id: "c", branch: "Seoul", message: null },
      { id: "d", branch: "온라인", message: null },
      { id: "e", branch: null, message: null },
    ]
    install((query) => {
      if (query.table === "leads") {
        return { data: page(leads, query), error: null, count: query.selectOptions?.count === "exact" ? leads.length : null }
      }
      return { data: [], error: null }
    })
    const { getCrmRegionMap } = await loadModule()
    const { deriveLeadRegionLabel } = await import("@/lib/crm/lead-message")

    const map = await getCrmRegionMap({ force: true })
    const lead = map.layers.find((layer) => layer.key === "lead")!

    // 지도와 목록이 같은 함수로 같은 답을 낸다.
    const expected: Record<string, number> = {}
    for (const row of leads) {
      const label = deriveLeadRegionLabel(row)
      if (label) expected[label] = (expected[label] ?? 0) + 1
    }
    expect(lead.regions).toEqual(expected)
    expect(lead.regions["서울"]).toBe(2)
    expect(lead.nonGeo).toBe(1)
    expect(lead.total).toBe(5)
    expect(lead.located + lead.unknown + lead.nonGeo).toBe(5)

    const leadQuery = recorded.find((query) => query.table === "leads")!
    expect(leadQuery.select).toContain("message")
  })
})

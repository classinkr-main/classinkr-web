import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * PostgREST 는 서버 max-rows 를 넘는 행을 오류 없이 잘라 준다. 리드 전량을 전제로 하는
 * 화면(리드 보드·우선순위 큐·캠페인 귀속)에서 이 절단은 "그런 리드는 없다"로 보이므로,
 * 조회는 페이지를 끝까지 넘겨야 한다.
 */

interface RangeCall {
  from: number
  to: number
  columns: string
  count: string | undefined
}

function makeLeadRow(index: number) {
  return {
    id: `lead-${index}`,
    source: "contact_page",
    name: `리드 ${index}`,
    org: null,
    role: null,
    size: null,
    email: null,
    phone: null,
    message: null,
    branch: null,
    status: "new",
    notes: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  }
}

/**
 * @param pageCap 서버가 한 요청에 돌려주는 최대 행 수(PostgREST max-rows 흉내).
 */
function mockSupabaseLeads(totalRows: number, pageCap = 1000) {
  const rows = Array.from({ length: totalRows }, (_, index) => makeLeadRow(index))
  const calls: RangeCall[] = []

  const from = vi.fn(() => ({
    select: (columns: string, options?: { count?: string }) => {
      const builder = {
        order: () => builder,
        range: (rangeFrom: number, rangeTo: number) => {
          calls.push({ from: rangeFrom, to: rangeTo, columns, count: options?.count })
          const span = Math.min(rangeTo - rangeFrom + 1, pageCap)
          return Promise.resolve({
            data: rows.slice(rangeFrom, rangeFrom + span),
            error: null,
            count: options?.count === "exact" ? rows.length : null,
          })
        },
      }
      return builder
    },
  }))

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({ from })),
  }))

  return { calls, rows }
}

describe("getLeads pagination", () => {
  const originalUseSupabaseLeads = process.env.USE_SUPABASE_LEADS

  afterEach(() => {
    if (originalUseSupabaseLeads === undefined) delete process.env.USE_SUPABASE_LEADS
    else process.env.USE_SUPABASE_LEADS = originalUseSupabaseLeads
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("한 페이지에 다 들어오면 추가 요청 없이 끝낸다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    const { calls } = mockSupabaseLeads(300)

    const { getLeads } = await import("@/lib/repositories/leads")
    const leads = await getLeads()

    expect(leads).toHaveLength(300)
    expect(calls).toHaveLength(1)
    // 총량을 알아야 다음 페이지가 필요한지 판단한다.
    expect(calls[0]?.count).toBe("exact")
  })

  it("max-rows 상한을 넘는 리드도 전량을 모은다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    const { calls } = mockSupabaseLeads(2_500)

    const { getLeads } = await import("@/lib/repositories/leads")
    const leads = await getLeads()

    expect(leads).toHaveLength(2_500)
    expect(calls.map((call) => call.from)).toEqual([0, 1000, 2000])
    // 이어지는 페이지에서 매번 전체 카운트를 다시 세지 않는다.
    expect(calls.slice(1).every((call) => call.count === undefined)).toBe(true)
    expect(new Set(leads.map((lead) => lead.id)).size).toBe(2_500)
  })

  it("서버 상한이 요청 크기보다 작아도 건너뛰지 않는다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    // 요청은 1000행이지만 서버는 400행만 돌려준다 — 페이지 전진을 요청 크기로 하면 600행이 사라진다.
    const { calls } = mockSupabaseLeads(1_000, 400)

    const { getLeads } = await import("@/lib/repositories/leads")
    const leads = await getLeads()

    expect(leads).toHaveLength(1_000)
    expect(calls.map((call) => call.from)).toEqual([0, 400, 800])
    expect(new Set(leads.map((lead) => lead.id)).size).toBe(1_000)
  })

  it("빈 테이블에서도 한 번만 조회하고 끝낸다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    const { calls } = mockSupabaseLeads(0)

    const { getLeads } = await import("@/lib/repositories/leads")

    expect(await getLeads()).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it("대시보드 조회는 경량 컬럼만 요청하면서 같은 페이지네이션을 쓴다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    const { calls } = mockSupabaseLeads(1_600)

    const { getDashboardLeads } = await import("@/lib/repositories/leads")
    const leads = await getDashboardLeads()

    expect(leads).toHaveLength(1_600)
    expect(calls[0]?.columns).toContain("confirmed_at")
    expect(calls[0]?.columns).not.toBe("*")
    expect(calls.map((call) => call.from)).toEqual([0, 1000])
  })
})

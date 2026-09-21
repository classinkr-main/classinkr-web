import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * getMarketingLeads() 의 SELECT 목록에는 뒤늦게 추가된 선택 컬럼이 들어 있다(naver_ad, confirmed_at).
 * 마이그레이션보다 코드가 먼저 나가는 순서 사고는 반드시 일어난다 — 그때 마케팅 허브의 리드 집계가
 * 42703 으로 통째로 죽지 않고, 없는 컬럼만 빼고 다시 읽어야 한다(docs/active/db-migration-runbook.md
 * "읽기 경로는 강등한다"). 2026-09-21 통합 전에는 confirmed_at 에만 폴백이 있고 naver_ad 에는 없었다.
 */

function makeLeadRow(index: number) {
  return {
    id: `lead-${index}`,
    source: "contact_page",
    name: `리드 ${index}`,
    org: null,
    role: null,
    email: null,
    phone: null,
    message: null,
    branch: null,
    status: "new",
    notes: null,
    created_at: "2026-09-01T00:00:00.000Z",
  }
}

/** missingColumns 에 든 컬럼을 SELECT 하면 PostgREST 처럼 42703 을 돌려주는 가짜 Supabase. */
function mockSupabaseLeads(missingColumns: string[], options: { otherError?: boolean } = {}) {
  const selects: string[] = []

  const from = vi.fn(() => ({
    select: (columns: string) => {
      selects.push(columns)
      const requested = columns.split(",").map((column) => column.trim())
      const missing = missingColumns.find((column) => requested.includes(column))
      const builder = {
        order: () => builder,
        range: () => {
          if (options.otherError) {
            return Promise.resolve({ data: null, error: { code: "57014", message: "statement timeout" }, count: null })
          }
          if (missing) {
            return Promise.resolve({
              data: null,
              error: { code: "42703", message: `column leads.${missing} does not exist` },
              count: null,
            })
          }
          return Promise.resolve({ data: [makeLeadRow(1), makeLeadRow(2)], error: null, count: 2 })
        },
      }
      return builder
    },
  }))

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({ from })),
  }))

  return { selects }
}

function columnsOf(select: string) {
  return select.split(",").map((column) => column.trim())
}

describe("getMarketingLeads — 선택 컬럼 폴백", () => {
  const originalUseSupabaseLeads = process.env.USE_SUPABASE_LEADS

  afterEach(() => {
    if (originalUseSupabaseLeads === undefined) delete process.env.USE_SUPABASE_LEADS
    else process.env.USE_SUPABASE_LEADS = originalUseSupabaseLeads
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("컬럼이 다 있으면 한 번에 읽고 naver_ad·confirmed_at 을 함께 요청한다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    const { selects } = mockSupabaseLeads([])

    const { getMarketingLeads } = await import("@/lib/repositories/leads")
    const leads = await getMarketingLeads()

    expect(leads).toHaveLength(2)
    expect(selects).toHaveLength(1)
    expect(columnsOf(selects[0])).toEqual(expect.arrayContaining(["naver_ad", "confirmed_at"]))
  })

  it("naver_ad 마이그레이션이 아직 없으면 그 컬럼만 빼고 다시 읽는다(집계가 죽지 않는다)", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { selects } = mockSupabaseLeads(["naver_ad"])

    const { getMarketingLeads } = await import("@/lib/repositories/leads")
    const leads = await getMarketingLeads()

    expect(leads).toHaveLength(2)
    expect(selects).toHaveLength(2)
    expect(columnsOf(selects[1])).not.toContain("naver_ad")
    // 멀쩡한 컬럼까지 버리지 않는다 — 없는 컬럼 하나만 덜어낸다.
    expect(columnsOf(selects[1])).toEqual(expect.arrayContaining(["confirmed_at", "utm_source", "gclid"]))
    // 강등은 무음이 아니다.
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("naver_ad"))
  })

  it("두 선택 컬럼이 모두 없어도 차례로 덜어내고 끝까지 읽는다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { selects } = mockSupabaseLeads(["naver_ad", "confirmed_at"])

    const { getMarketingLeads } = await import("@/lib/repositories/leads")
    const leads = await getMarketingLeads()

    expect(leads).toHaveLength(2)
    expect(selects).toHaveLength(3)
    const last = columnsOf(selects[2])
    expect(last).not.toContain("naver_ad")
    expect(last).not.toContain("confirmed_at")
    expect(last).toEqual(expect.arrayContaining(["id", "source", "created_at"]))
  })

  it("컬럼 부재가 아닌 오류는 삼키지 않고 그대로 던진다", async () => {
    vi.resetModules()
    process.env.USE_SUPABASE_LEADS = "true"
    const { selects } = mockSupabaseLeads([], { otherError: true })

    const { getMarketingLeads } = await import("@/lib/repositories/leads")

    await expect(getMarketingLeads()).rejects.toThrow(/statement timeout/)
    expect(selects).toHaveLength(1)
  })
})

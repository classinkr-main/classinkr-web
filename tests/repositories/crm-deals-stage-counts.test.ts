/**
 * CRM T1 원천 — lib/repositories/crm-deals.ts의 getCrmDealStageCounts.
 *
 * 7단계(consult·demo·quote·decision·order·won·lost)를 head count로 병렬 집계하고, count가
 * null이면 0으로 취급하며, 어느 한 쿼리라도 에러면(테이블 미존재 포함) throw 대신 null을
 * 돌려준다(호출부 getCrmInsights가 "딜 집계 실패면 stageFunnel 전체 null"을 강제하기 위해).
 */
import { afterEach, describe, expect, it, vi } from "vitest"

type StageResult = { count: number | null; error: { message: string; code?: string } | null }

function mockCrmDealsStageCounts(byStage: Record<string, StageResult>) {
  const from = vi.fn(() => ({
    select: () => ({
      eq: (_column: string, stage: string) => Promise.resolve(byStage[stage] ?? { count: 0, error: null }),
    }),
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({ from })),
  }))
  return from
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock("@/lib/supabase/admin")
})

describe("getCrmDealStageCounts", () => {
  it("7개 단계를 head count로 병렬 집계하고 total을 합산한다", async () => {
    mockCrmDealsStageCounts({
      consult: { count: 3, error: null },
      demo: { count: 2, error: null },
      quote: { count: 1, error: null },
      decision: { count: 1, error: null },
      order: { count: 1, error: null },
      won: { count: 5, error: null },
      lost: { count: 2, error: null },
    })

    const { getCrmDealStageCounts } = await import("@/lib/repositories/crm-deals")
    const result = await getCrmDealStageCounts()

    expect(result).toEqual({ consult: 3, demo: 2, quote: 1, decision: 1, order: 1, won: 5, lost: 2, total: 15 })
  })

  it("count가 null이면 0으로 취급한다", async () => {
    mockCrmDealsStageCounts({
      consult: { count: null, error: null },
      demo: { count: 4, error: null },
    })

    const { getCrmDealStageCounts } = await import("@/lib/repositories/crm-deals")
    const result = await getCrmDealStageCounts()

    expect(result?.consult).toBe(0)
    expect(result?.demo).toBe(4)
    expect(result?.total).toBe(4)
  })

  it("한 단계라도 쿼리 에러면 throw 대신 null을 돌려준다", async () => {
    mockCrmDealsStageCounts({
      consult: { count: 3, error: null },
      demo: { count: null, error: { message: "boom" } },
    })

    const { getCrmDealStageCounts } = await import("@/lib/repositories/crm-deals")
    await expect(getCrmDealStageCounts()).resolves.toBeNull()
  })

  it("crm_deals 테이블이 아직 없으면(마이그레이션 전) null을 돌려준다", async () => {
    mockCrmDealsStageCounts({
      consult: {
        count: null,
        error: { message: 'relation "crm_deals" does not exist', code: "42P01" },
      },
    })

    const { getCrmDealStageCounts } = await import("@/lib/repositories/crm-deals")
    await expect(getCrmDealStageCounts()).resolves.toBeNull()
  })
})

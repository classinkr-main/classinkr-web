import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * listCrmDeals의 summary는 total만 DB 전체 건수(count: "exact")이고
 * open/won/lost/openAmount는 이번 페이지(rows)만 센 값이다. 둘을 구분하지 않으면
 * 화면에 "딜 25건"인데 예상금액은 20건 합계인 상태가 그대로 나간다.
 * aggregateTruncated는 그 불일치를 화면이 알 수 있게 하는 유일한 신호다.
 */

function makeDealRow(index: number, expectedAmount: number) {
  return {
    id: `deal-${index}`,
    target_type: "neo_account",
    target_id: "acc-1",
    target_label: "큰학원",
    owner_key: null,
    owner_name_snapshot: null,
    title: `딜 ${index}`,
    stage: "consult",
    status: "open",
    expected_amount: expectedAmount,
    expected_close_at: null,
    next_task_id: null,
    quote_ref: null,
    order_ref: null,
    risk_note: null,
    created_by: null,
    closed_at: null,
    closed_by: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  }
}

function mockDeals(rowCount: number, total: number) {
  const rows = Array.from({ length: rowCount }, (_, index) => makeDealRow(index, 1_000_000))

  const builder = {
    select: () => builder,
    order: () => builder,
    range: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (value: { data: unknown; error: null; count: number }) => unknown) =>
      resolve({ data: rows, error: null, count: total }),
  }

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({ from: () => builder })),
  }))
}

describe("listCrmDeals summary", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("페이지가 전체를 덮으면 집계가 잘리지 않았다고 표시한다", async () => {
    vi.resetModules()
    mockDeals(8, 8)

    const { listCrmDeals } = await import("@/lib/repositories/crm-deals")
    const result = await listCrmDeals({ targetType: "neo_account", targetId: "acc-1", limit: 20 })

    expect(result.summary.total).toBe(8)
    expect(result.summary.returned).toBe(8)
    expect(result.summary.openAmount).toBe(8_000_000)
    expect(result.summary.aggregateTruncated).toBe(false)
  })

  it("전체 건수가 페이지보다 많으면 집계가 부분임을 표시한다", async () => {
    vi.resetModules()
    // 25건 중 20건만 받아온 상태 — openAmount는 20건 합계인데 total은 25다.
    mockDeals(20, 25)

    const { listCrmDeals } = await import("@/lib/repositories/crm-deals")
    const result = await listCrmDeals({ targetType: "neo_account", targetId: "acc-1", limit: 20 })

    expect(result.summary.total).toBe(25)
    expect(result.summary.returned).toBe(20)
    expect(result.summary.openAmount).toBe(20_000_000)
    // 이 플래그가 없으면 부분 합계가 총액처럼 읽힌다.
    expect(result.summary.aggregateTruncated).toBe(true)
  })
})

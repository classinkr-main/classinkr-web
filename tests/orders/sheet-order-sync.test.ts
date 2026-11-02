// lib/orders/sheet-order-sync.ts — 가져오기 직후 시트 출고 줄 ↔ 오더 연결(연결 로직 §4-4).
// 같은 오더·품목의 앱 예정·출고는 취소(시트가 이긴다), 실제 출고가 실린 오더의 딜은 설치 단계로.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Result = { data: unknown; error: unknown }
interface Call {
  table: string
  op: "select" | "update"
  payload?: unknown
  filters: Array<[string, string, unknown]>
}

let queue: Result[]
let calls: Call[]

function makeBuilder(table: string) {
  let current: Call | null = null
  const filter = (kind: string) => (column: string, value: unknown) => {
    current?.filters.push([kind, column, value])
    return b
  }
  const b = {
    select: vi.fn(() => {
      if (!current) {
        current = { table, op: "select", filters: [] }
        calls.push(current)
      }
      return b
    }),
    update: vi.fn((payload: unknown) => {
      current = { table, op: "update", payload, filters: [] }
      calls.push(current)
      return b
    }),
    eq: vi.fn(filter("eq")),
    in: vi.fn(filter("in")),
    is: vi.fn(filter("is")),
    then: (resolve: (value: Result) => void) => resolve(queue.shift() ?? { data: null, error: null }),
  }
  return b
}

const { advanceDealStageSafely } = vi.hoisted(() => ({ advanceDealStageSafely: vi.fn() }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: (table: string) => makeBuilder(table) })),
}))
vi.mock("@/lib/orders/deal-stage", () => ({ advanceDealStageSafely }))

import { linkSheetOutboundToOrders, SHEET_ORDER_REPLACE_REASON } from "@/lib/orders/sheet-order-sync"

function imported(overrides: Record<string, unknown>) {
  return { product_name: '86" IFP', movement_type: "outbound", status: "출고", raw: { order_no: "ORD-2610-002" }, ...overrides }
}

beforeEach(() => {
  queue = []
  calls = []
  advanceDealStageSafely.mockReset()
  advanceDealStageSafely.mockResolvedValue(true)
})

describe("linkSheetOutboundToOrders", () => {
  it("오더번호가 적힌 시트 줄이 없으면 DB 를 건드리지 않는다", async () => {
    const result = await linkSheetOutboundToOrders([imported({ raw: {} }), imported({ movement_type: "inbound" })])

    expect(result).toEqual({ appRowsReplaced: 0, dealsAdvanced: 0, error: null })
    expect(calls).toHaveLength(0)
  })

  it("같은 오더·품목의 앱 기록을 사유와 함께 취소하고, 실제 출고 오더의 딜을 설치로 올린다", async () => {
    queue.push({
      data: [
        { id: "app-planned", product_name: '86" IFP', status: "배송 예정", raw: { order_no: "ORD-2610-002" } },
        { id: "app-t1", product_name: "T1", status: "배송 예정", raw: { order_no: "ORD-2610-002" } },
      ],
      error: null,
    })
    queue.push({ data: null, error: null }) // void
    queue.push({ data: [{ order_no: "ORD-2610-002", deal_id: "deal_1", status: "approved" }], error: null })

    const result = await linkSheetOutboundToOrders([imported({})], { actor: "자동 가져오기" })

    expect(result).toEqual({ appRowsReplaced: 1, dealsAdvanced: 1, error: null })
    expect(calls[0].filters).toEqual(
      expect.arrayContaining([
        ["eq", "source", "admin_manual"],
        ["in", "raw->>order_no", ["ORD-2610-002"]],
      ])
    )
    expect(calls[1]).toMatchObject({ op: "update", payload: { void_reason: SHEET_ORDER_REPLACE_REASON, voided_by: "자동 가져오기" } })
    expect(calls[1].filters).toContainEqual(["in", "id", ["app-planned"]])
    expect(advanceDealStageSafely).toHaveBeenCalledWith("deal_1", "installation")
  })

  it("시트에 예정 줄만 있으면 앱 예정은 대체하되 딜 단계는 그대로 둔다", async () => {
    queue.push({ data: [{ id: "app-planned", product_name: '86" IFP', status: "배송 예정", raw: { order_no: "ORD-2610-002" } }], error: null })
    queue.push({ data: null, error: null })

    const result = await linkSheetOutboundToOrders([imported({ status: "배송 예정" })])

    expect(result.appRowsReplaced).toBe(1)
    expect(advanceDealStageSafely).not.toHaveBeenCalled()
    expect(calls.some((call) => call.table === "sales_orders")).toBe(false)
  })

  it("오더 테이블이 아직 없어도 대체는 하고 오류로 적지 않는다", async () => {
    queue.push({ data: [], error: null })
    queue.push({ data: null, error: { code: "PGRST205", message: "missing" } })

    const result = await linkSheetOutboundToOrders([imported({})])

    expect(result).toEqual({ appRowsReplaced: 0, dealsAdvanced: 0, error: null })
  })

  it("조회가 실패하면 throw 하지 않고 문구로 돌려준다 — 가져오기를 실패로 만들지 않는다", async () => {
    queue.push({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } })

    const result = await linkSheetOutboundToOrders([imported({})])

    expect(result.error).toContain("statement timeout")
    expect(result.appRowsReplaced).toBe(0)
  })
})

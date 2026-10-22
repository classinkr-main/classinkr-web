// lib/repositories/sales-orders.ts — 견적 승인 → 오더, 하드웨어 승인 → 오더번호 + 배송 예정, 반려·취소.
// docs/active/hardware-order-revenue-link-plan-2026-10-22.md §4-3.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Result = { data: unknown; error: unknown }
interface Call {
  table: string
  op: "select" | "insert" | "update"
  payload?: unknown
  filters: Array<[string, string, unknown]>
}

let queue: Result[]
let calls: Call[]

function makeBuilder(table: string) {
  let current: Call | null = null
  const start = (op: Call["op"], payload?: unknown) => {
    current = { table, op, payload, filters: [] }
    calls.push(current)
  }
  const filter = (kind: string) => (column: string, value: unknown) => {
    current?.filters.push([kind, column, value])
    return b
  }
  const b = {
    select: vi.fn(() => {
      if (!current) start("select")
      return b
    }),
    insert: vi.fn((payload: unknown) => {
      start("insert", payload)
      return b
    }),
    update: vi.fn((payload: unknown) => {
      start("update", payload)
      return b
    }),
    eq: vi.fn(filter("eq")),
    in: vi.fn(filter("in")),
    is: vi.fn(filter("is")),
    like: vi.fn(filter("like")),
    order: vi.fn(() => b),
    limit: vi.fn(() => b),
    single: vi.fn(() => b),
    then: (resolve: (value: Result) => void) => resolve(queue.shift() ?? { data: null, error: null }),
  }
  return b
}

const {
  revalidateTag,
  createHardwareMovements,
  voidHardwareMovement,
  getQuoteDocument,
  getResolvableQuoteVersion,
  getDeal,
  updateDeal,
  getCustomer,
  emitNotificationEvent,
} = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  createHardwareMovements: vi.fn(),
  voidHardwareMovement: vi.fn(),
  getQuoteDocument: vi.fn(),
  getResolvableQuoteVersion: vi.fn(),
  getDeal: vi.fn(),
  updateDeal: vi.fn(),
  getCustomer: vi.fn(),
  emitNotificationEvent: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: (table: string) => makeBuilder(table) })),
}))
vi.mock("next/cache", () => ({ revalidateTag }))
vi.mock("@/lib/repositories/hardware-inventory", () => ({
  createHardwareMovements,
  voidHardwareMovement,
  HARDWARE_INVENTORY_CACHE_TAG: "hardware-inventory",
}))
vi.mock("@/lib/portal/repositories/quote-documents", () => ({ getQuoteDocument, getResolvableQuoteVersion }))
vi.mock("@/lib/portal/repositories/deals", () => ({ getDeal, updateDeal }))
vi.mock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))
vi.mock("@/lib/portal/repositories/customers", () => ({ getCustomer }))

import {
  approveSalesOrder,
  cancelApprovedSalesOrder,
  ensureSalesOrderForAcceptedQuote,
  ensureSalesOrderForAcceptedQuoteSafely,
  listSalesOrders,
  notifyHardwareOrderApprovalRequested,
  rejectSalesOrder,
  SalesOrderError,
} from "@/lib/repositories/sales-orders"

const NOW = new Date("2026-10-22T03:00:00Z")

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "so_1",
    order_no: null,
    status: "pending_approval",
    needs_hardware_approval: true,
    quote_document_id: "qd_1",
    quote_version_id: "qv_1",
    quote_number: "Q-2026-0042",
    deal_id: "deal_1",
    customer_id: "cust_1",
    customer_name: "한빛학원",
    lines: [
      {
        lineNumber: 1,
        itemType: "hardware",
        itemCode: "board-86",
        itemName: "ClassIn Board 86",
        quantity: 2,
        unitPrice: 3_000_000,
        lineSupplyAmount: 6_000_000,
        hardwareProducts: [{ product: '86" IFP', quantity: 2 }],
        unmappedHardware: false,
        quoteLineRef: "portal-quote:qd_1:line:a",
      },
      {
        lineNumber: 2,
        itemType: "installation",
        itemCode: null,
        itemName: "설치비",
        quantity: 1,
        unitPrice: 300_000,
        lineSupplyAmount: 300_000,
        hardwareProducts: [],
        unmappedHardware: false,
        quoteLineRef: "portal-quote:qd_1:line:b",
      },
    ],
    total_amount: "6930000",
    currency: "KRW",
    accepted_via: "customer_link",
    requested_by: null,
    requested_at: "2026-10-22T02:00:00Z",
    decided_by: null,
    decided_at: null,
    decision_reason: null,
    planned_movement_ids: [],
    ...overrides,
  }
}

function setupQuote(lineItems: unknown[]) {
  getQuoteDocument.mockResolvedValue({ id: "qd_1", deal_id: "deal_1", quote_number: "Q-2026-0042" })
  getResolvableQuoteVersion.mockResolvedValue({
    id: "qv_1",
    total_amount: 6_930_000,
    structured_json: { quoteDetails: { lineItems } },
  })
  getDeal.mockResolvedValue({ id: "deal_1", customer_id: "cust_1", title: "본관 전자칠판", current_stage: "quote" })
  getCustomer.mockResolvedValue({ id: "cust_1", name: " 한빛학원 ", campus_name: null, contact_name: null })
}

beforeEach(() => {
  queue = []
  calls = []
  vi.clearAllMocks()
  for (const mock of [
    createHardwareMovements,
    voidHardwareMovement,
    getQuoteDocument,
    getResolvableQuoteVersion,
    getDeal,
    updateDeal,
    getCustomer,
    emitNotificationEvent,
  ]) {
    mock.mockReset()
  }
})

describe("ensureSalesOrderForAcceptedQuote", () => {
  it("하드웨어 줄이 있으면 오더번호 없이 승인 대기로 만든다", async () => {
    setupQuote([
      { id: "a", itemType: "hardware", itemCode: "board-86", itemName: "ClassIn Board 86", quantity: 2, unitPrice: 3_000_000 },
      { id: "b", itemType: "installation", itemName: "설치비", quantity: 1, unitPrice: 300_000 },
    ])
    queue.push({ data: [], error: null }) // 살아 있는 오더 없음
    queue.push({ data: [], error: null }) // 같은 버전의 반려·취소 오더 없음
    queue.push({ data: orderRow(), error: null }) // insert

    const result = await ensureSalesOrderForAcceptedQuote({ quoteDocumentId: "qd_1", acceptedVia: "customer_link", now: NOW })

    expect(result.created).toBe(true)
    expect(result.order.status).toBe("pending_approval")
    const insert = calls.find((call) => call.op === "insert")?.payload as Record<string, unknown>
    expect(insert).toMatchObject({
      status: "pending_approval",
      order_no: null,
      needs_hardware_approval: true,
      customer_name: "한빛학원",
      currency: "KRW",
      accepted_via: "customer_link",
      total_amount: 6_930_000,
    })
    expect((insert.lines as Array<{ hardwareProducts: unknown[] }>)[0].hardwareProducts).toEqual([
      { product: '86" IFP', quantity: 2 },
    ])
    // 승인 전에는 딜 단계를 건드리지 않는다.
    expect(updateDeal).not.toHaveBeenCalled()
  })

  it("하드웨어가 없으면 바로 승인하고 이번 달 다음 오더번호를 붙인다", async () => {
    setupQuote([{ id: "s", itemType: "service", itemName: "ClassIn 라이선스", quantity: 10, unitPrice: 100_000 }])
    queue.push({ data: [], error: null })
    queue.push({ data: [], error: null })
    queue.push({ data: [{ order_no: "ORD-2610-003" }, { order_no: "ORD-2610-011" }], error: null }) // 이번 달 번호
    queue.push({ data: orderRow({ status: "approved", order_no: "ORD-2610-012", needs_hardware_approval: false }), error: null })

    const result = await ensureSalesOrderForAcceptedQuote({ quoteDocumentId: "qd_1", acceptedVia: "staff", actor: "담당자", now: NOW })

    expect(result.order.orderNo).toBe("ORD-2610-012")
    const insert = calls.find((call) => call.op === "insert")?.payload as Record<string, unknown>
    expect(insert).toMatchObject({
      status: "approved",
      order_no: "ORD-2610-012",
      needs_hardware_approval: false,
      decided_by: "자동(하드웨어 없음)",
      requested_by: "담당자",
    })
    expect(calls.find((call) => call.op === "select" && call.filters.some(([kind]) => kind === "like"))?.filters).toContainEqual([
      "like",
      "order_no",
      "ORD-2610-%",
    ])
    // 오더번호가 붙었으니 딜을 확정으로 올린다.
    expect(updateDeal).toHaveBeenCalledWith("deal_1", { current_stage: "confirmed" })
  })

  it("살아 있는 오더가 이미 있으면 새로 만들지 않는다(멱등)", async () => {
    queue.push({ data: [orderRow()], error: null })

    const result = await ensureSalesOrderForAcceptedQuote({ quoteDocumentId: "qd_1", acceptedVia: "customer_link" })

    expect(result).toMatchObject({ created: false, order: { id: "so_1" } })
    expect(getQuoteDocument).not.toHaveBeenCalled()
    expect(calls.some((call) => call.op === "insert")).toBe(false)
  })

  it("같은 견적 버전이 반려됐으면 고객이 다시 눌러도 승인 대기로 되살리지 않는다", async () => {
    setupQuote([{ id: "a", itemType: "hardware", itemCode: "board-86", itemName: "보드", quantity: 1 }])
    queue.push({ data: [], error: null })
    queue.push({ data: [orderRow({ status: "rejected", decision_reason: "재고 부족" })], error: null })

    const result = await ensureSalesOrderForAcceptedQuote({ quoteDocumentId: "qd_1", acceptedVia: "customer_link" })

    expect(result).toMatchObject({ created: false, order: { status: "rejected" } })
    expect(calls.some((call) => call.op === "insert")).toBe(false)
    const closedLookup = calls[1]
    expect(closedLookup.filters).toContainEqual(["eq", "quote_version_id", "qv_1"])
    expect(closedLookup.filters).toContainEqual(["in", "status", ["rejected", "cancelled"]])
  })

  it("동시에 두 번 눌려 유니크 충돌이 나면 먼저 만들어진 오더를 돌려준다", async () => {
    setupQuote([{ id: "a", itemType: "hardware", itemCode: "board-86", itemName: "보드", quantity: 1 }])
    queue.push({ data: [], error: null })
    queue.push({ data: [], error: null })
    queue.push({ data: null, error: { code: "23505", message: "duplicate key" } })
    queue.push({ data: [orderRow({ id: "so_other" })], error: null })

    const result = await ensureSalesOrderForAcceptedQuote({ quoteDocumentId: "qd_1", acceptedVia: "customer_link" })

    expect(result).toMatchObject({ created: false, order: { id: "so_other" } })
  })

  it("테이블이 아직 없으면 503 안내로 바꾸고, Safely 는 null 로 삼킨다", async () => {
    queue.push({ data: null, error: { code: "PGRST205", message: "Could not find the table" } })
    await expect(ensureSalesOrderForAcceptedQuote({ quoteDocumentId: "qd_1", acceptedVia: "staff" })).rejects.toMatchObject({
      status: 503,
    })

    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined)
    queue.push({ data: null, error: { code: "42P01", message: "relation does not exist" } })
    await expect(ensureSalesOrderForAcceptedQuoteSafely({ quoteDocumentId: "qd_1", acceptedVia: "staff" })).resolves.toBeNull()

    queue.push({ data: [orderRow()], error: null })
    await expect(ensureSalesOrderForAcceptedQuoteSafely({ quoteDocumentId: "qd_1", acceptedVia: "staff" })).resolves.toMatchObject({
      created: false,
      order: { id: "so_1" },
    })
    expect(errorLog).toHaveBeenCalled()
    errorLog.mockRestore()
  })
})

describe("approveSalesOrder", () => {
  it("오더번호를 잡고 견적 줄마다 배송 예정을 만든다", async () => {
    getDeal.mockResolvedValue({ id: "deal_1", current_stage: "quote" })
    queue.push({ data: [orderRow()], error: null }) // 현재 오더
    queue.push({ data: [{ order_no: "ORD-2610-001" }], error: null }) // 이번 달 번호
    queue.push({ data: [orderRow({ status: "approved", order_no: "ORD-2610-002", decided_by: "이왕찬" })], error: null }) // claim
    queue.push({
      data: [orderRow({ status: "approved", order_no: "ORD-2610-002", decided_by: "이왕찬", planned_movement_ids: ["mv_1"] })],
      error: null,
    })
    createHardwareMovements.mockResolvedValue([{ id: "mv_1" }])

    const order = await approveSalesOrder("so_1", { actor: "이왕찬", now: NOW })

    expect(order).toMatchObject({ status: "approved", orderNo: "ORD-2610-002", plannedMovementIds: ["mv_1"] })
    const claim = calls.find((call) => call.op === "update")
    expect(claim?.payload).toMatchObject({ status: "approved", order_no: "ORD-2610-002", decided_by: "이왕찬" })
    expect(claim?.filters).toContainEqual(["eq", "status", "pending_approval"])

    expect(createHardwareMovements).toHaveBeenCalledTimes(1)
    const inputs = createHardwareMovements.mock.calls[0][0]
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toMatchObject({
      productName: '86" IFP',
      movementType: "outbound",
      quantity: 2,
      fromLocation: "창고",
      toLocation: "한빛학원",
      status: "배송 예정",
      referenceNo: "portal-quote:qd_1:line:a",
      createdBy: "이왕찬",
      raw: { order_no: "ORD-2610-002", sales_order_id: "so_1", quote_document_id: "qd_1" },
    })
    expect(inputs[0].memo).toContain("ORD-2610-002")
    expect(revalidateTag).toHaveBeenCalledWith("hardware-inventory", "max")
    expect(updateDeal).toHaveBeenCalledWith("deal_1", { current_stage: "confirmed" })
  })

  it("딜이 이미 확정 이후 단계면 되돌리지 않고, 딜 갱신이 실패해도 승인은 유지한다", async () => {
    queue.push({ data: [orderRow({ lines: [] })], error: null })
    queue.push({ data: [], error: null })
    queue.push({ data: [orderRow({ status: "approved", order_no: "ORD-2610-001", lines: [] })], error: null })
    getDeal.mockResolvedValueOnce({ id: "deal_1", current_stage: "installation" })
    await approveSalesOrder("so_1", { actor: "이왕찬", now: NOW })
    expect(updateDeal).not.toHaveBeenCalled()

    queue.push({ data: [orderRow({ lines: [] })], error: null })
    queue.push({ data: [], error: null })
    queue.push({ data: [orderRow({ status: "approved", order_no: "ORD-2610-001", lines: [] })], error: null })
    getDeal.mockResolvedValueOnce({ id: "deal_1", current_stage: "contract" })
    updateDeal.mockRejectedValueOnce(new Error("db down"))
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await expect(approveSalesOrder("so_1", { actor: "이왕찬", now: NOW })).resolves.toMatchObject({ status: "approved" })
    errorLog.mockRestore()
  })

  it("배송 예정을 못 만들면 승인 대기로 되돌린다", async () => {
    queue.push({ data: [orderRow()], error: null })
    queue.push({ data: [], error: null })
    queue.push({ data: [orderRow({ status: "approved", order_no: "ORD-2610-001" })], error: null })
    queue.push({ data: null, error: null }) // revert
    createHardwareMovements.mockRejectedValue(new Error("같은 CRM 오더와 품목이 이미 있습니다."))

    await expect(approveSalesOrder("so_1", { actor: "이왕찬", now: NOW })).rejects.toMatchObject({ status: 422 })

    const revert = calls.filter((call) => call.op === "update").at(-1)
    expect(revert?.payload).toMatchObject({ status: "pending_approval", order_no: null, decided_by: null })
    expect(revert?.filters).toContainEqual(["eq", "order_no", "ORD-2610-001"])
  })

  it("오더번호가 겹치면 다음 번호로 다시 잡는다", async () => {
    queue.push({ data: [orderRow({ lines: [] })], error: null })
    queue.push({ data: [], error: null })
    queue.push({ data: null, error: { code: "23505", message: "duplicate key" } })
    queue.push({ data: [{ order_no: "ORD-2610-001" }], error: null })
    queue.push({ data: [orderRow({ status: "approved", order_no: "ORD-2610-002", lines: [] })], error: null })

    const order = await approveSalesOrder("so_1", { actor: "이왕찬", now: NOW })

    expect(order.orderNo).toBe("ORD-2610-002")
    const updates = calls.filter((call) => call.op === "update").map((call) => (call.payload as { order_no: string }).order_no)
    expect(updates).toEqual(["ORD-2610-001", "ORD-2610-002"])
    expect(createHardwareMovements).not.toHaveBeenCalled()
  })

  it("이미 처리된 오더나 다른 사람이 먼저 승인한 오더는 409", async () => {
    queue.push({ data: [orderRow({ status: "rejected" })], error: null })
    await expect(approveSalesOrder("so_1", { actor: "이왕찬" })).rejects.toMatchObject({ status: 409 })

    queue.push({ data: [orderRow()], error: null })
    queue.push({ data: [], error: null })
    queue.push({ data: [], error: null }) // claim 0행 — 동시 승인
    await expect(approveSalesOrder("so_1", { actor: "이왕찬" })).rejects.toMatchObject({ status: 409 })
    expect(createHardwareMovements).not.toHaveBeenCalled()
  })

  it("없는 오더는 404", async () => {
    queue.push({ data: [], error: null })
    await expect(approveSalesOrder("nope", { actor: "이왕찬" })).rejects.toBeInstanceOf(SalesOrderError)
  })
})

describe("rejectSalesOrder", () => {
  it("사유가 없으면 400, 있으면 반려로 닫는다", async () => {
    await expect(rejectSalesOrder("so_1", { actor: "이왕찬", reason: "  " })).rejects.toMatchObject({ status: 400 })

    queue.push({ data: [orderRow()], error: null })
    queue.push({ data: [orderRow({ status: "rejected", decision_reason: "재고 부족" })], error: null })
    const order = await rejectSalesOrder("so_1", { actor: "이왕찬", reason: " 재고 부족 " })

    expect(order.status).toBe("rejected")
    const update = calls.find((call) => call.op === "update")
    expect(update?.payload).toMatchObject({ status: "rejected", decision_reason: "재고 부족", decided_by: "이왕찬" })
    expect(update?.filters).toContainEqual(["eq", "status", "pending_approval"])
  })
})

describe("cancelApprovedSalesOrder", () => {
  const approved = () => orderRow({ status: "approved", order_no: "ORD-2610-002", planned_movement_ids: ["mv_1", "mv_2"] })

  it("출고 확정된 줄이 하나라도 있으면 막는다", async () => {
    queue.push({ data: [approved()], error: null })
    queue.push({ data: [{ id: "mv_actual" }], error: null })

    await expect(cancelApprovedSalesOrder("so_1", { actor: "이왕찬", reason: "고객 취소" })).rejects.toMatchObject({ status: 409 })
    expect(voidHardwareMovement).not.toHaveBeenCalled()
  })

  it("남은 배송 예정만 취소하고 오더번호는 남긴다", async () => {
    queue.push({ data: [approved()], error: null })
    queue.push({ data: [], error: null }) // 출고 확정 없음
    queue.push({ data: [{ id: "mv_1", voided_at: null }, { id: "mv_2", voided_at: "2026-10-21T00:00:00Z" }], error: null })
    queue.push({ data: [approved()].map((row) => ({ ...row, status: "cancelled" })), error: null })

    const order = await cancelApprovedSalesOrder("so_1", { actor: "이왕찬", reason: "고객 취소" })

    expect(order).toMatchObject({ status: "cancelled", orderNo: "ORD-2610-002" })
    expect(voidHardwareMovement).toHaveBeenCalledTimes(1)
    expect(voidHardwareMovement).toHaveBeenCalledWith("mv_1", { reason: "오더 ORD-2610-002 취소: 고객 취소", actor: "이왕찬" })
    const update = calls.filter((call) => call.op === "update").at(-1)
    expect(update?.payload).toMatchObject({ status: "cancelled", decision_reason: "취소(ORD-2610-002): 고객 취소" })
    expect(update?.payload).not.toHaveProperty("order_no")
  })

  it("승인 대기 오더는 취소가 아니라 반려 대상이다", async () => {
    queue.push({ data: [orderRow()], error: null })
    await expect(cancelApprovedSalesOrder("so_1", { actor: "이왕찬", reason: "x" })).rejects.toMatchObject({ status: 409 })
  })
})

describe("listSalesOrders", () => {
  it("상태로 거르고 숫자 문자열 합계를 숫자로 바꾼다", async () => {
    queue.push({ data: [orderRow()], error: null })

    const orders = await listSalesOrders({ statuses: ["pending_approval"] })

    expect(orders[0].totalAmount).toBe(6_930_000)
    expect(calls[0].filters).toContainEqual(["in", "status", ["pending_approval"]])
  })
})

describe("notifyHardwareOrderApprovalRequested", () => {
  it("승인 대기 오더면 품목 요약과 확인 필요 줄을 담아 승인 요청을 보낸다", async () => {
    emitNotificationEvent.mockResolvedValue({ id: "evt" })
    queue.push({ data: [orderRow()], error: null })
    const [order] = await listSalesOrders()
    order.lines.push({ ...order.lines[0], itemName: "특주 브래킷", hardwareProducts: [], unmappedHardware: true, quoteLineRef: "x" })

    notifyHardwareOrderApprovalRequested({ ...order, requestedBy: "영업 담당" })

    const call = emitNotificationEvent.mock.calls[0][0]
    expect(call).toMatchObject({
      eventType: "hardware.order.approval_requested",
      notificationType: "approval_required",
      routeUrl: "/admin/hardware",
      sourceId: "so_1",
    })
    expect(call.title).toContain("한빛학원")
    expect(call.message).toContain('86" IFP ×2')
    expect(call.message).toContain("재고 품목 확인 필요: 특주 브래킷")
    expect(call.message).toContain("영업 담당")
  })

  it("승인 대기가 아니면 보내지 않는다", async () => {
    queue.push({ data: [orderRow({ status: "approved", order_no: "ORD-2610-001" })], error: null })
    const [order] = await listSalesOrders()

    notifyHardwareOrderApprovalRequested(order)

    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })
})

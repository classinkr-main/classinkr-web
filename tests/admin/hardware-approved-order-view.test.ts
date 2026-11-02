// components/admin/hardware/inventory/approved-order-view.ts — 승인됨 탭 보기 모델(시안 2026-10-26 "승인됨 A").
// 렌더 하네스가 없어(tests/admin/hardware-planned-selection.test.ts 참고) 화면이 쓰는 순수 규칙만 고정한다.
import { describe, expect, it } from "vitest"

import {
  approvedOrderNextActions,
  approvedOrderSheetHints,
  approvedOrderStage,
  buildFulfillmentBars,
  isNoHardwareOrder,
  sortApprovedOrders,
  type ApprovedOrderInput,
} from "@/components/admin/hardware/inventory/approved-order-view"
import type { SalesOrderLine } from "@/lib/orders/order-lines"
import type { SheetOrderCheck } from "@/lib/orders/sheet-order-check"

function line(product: string, quantity: number, overrides: Partial<SalesOrderLine> = {}): SalesOrderLine {
  return {
    lineNumber: 1,
    itemType: "hardware",
    itemCode: null,
    itemName: product,
    quantity,
    unitPrice: null,
    lineSupplyAmount: null,
    hardwareProducts: [{ product, quantity }],
    unmappedHardware: false,
    quoteLineRef: `ref:${product}`,
    ...overrides,
  }
}

function order(overrides: Partial<ApprovedOrderInput> & { id?: string } = {}): ApprovedOrderInput & { id: string } {
  return {
    id: "so",
    orderNo: "ORD-2610-004",
    customerName: "해솔학원",
    needsHardwareApproval: true,
    lines: [line('86" IFP', 2)],
    fulfillment: [{ product: '86" IFP', ordered: 2, shipped: 1, planned: 1 }],
    ...overrides,
  }
}

function check(overrides: Omit<Partial<SheetOrderCheck>, "row"> & { row?: Partial<SheetOrderCheck["row"]> }): SheetOrderCheck {
  const { row, ...rest } = overrides
  return {
    kind: "missing_order_no",
    orderNo: null,
    orderStatus: null,
    orderCustomer: null,
    message: "",
    ...rest,
    row: {
      id: "r1",
      productName: '86" IFP',
      quantity: 2,
      occurredAt: "2026-10-25",
      status: "출고",
      customer: "해솔학원",
      orderNoRaw: null,
      ...row,
    },
  }
}

describe("buildFulfillmentBars", () => {
  it("주문 기준 폭으로 출고·예정을 나누고 미등록을 센다", () => {
    expect(buildFulfillmentBars([{ product: "T1", ordered: 4, shipped: 1, planned: 1 }])).toEqual([
      { product: "T1", ordered: 4, shipped: 1, planned: 1, unregistered: 2, over: 0, shippedPct: 25, plannedPct: 25 },
    ])
  })

  it("출고+예정이 주문을 넘으면 그 합을 기준으로 그리고 초과를 센다", () => {
    const [bar] = buildFulfillmentBars([{ product: '75" IFP', ordered: 3, shipped: 3, planned: 1 }])
    expect(bar).toMatchObject({ over: 1, unregistered: 0, shippedPct: 75, plannedPct: 25 })
  })

  it("출고 기록이 없으면 빈 목록", () => {
    expect(buildFulfillmentBars(undefined)).toEqual([])
  })
})

describe("approvedOrderStage", () => {
  it("출고 전 · 일부 출고 · 출고 완료를 가른다(주문 초과분은 완료 판정에 넣지 않는다)", () => {
    expect(approvedOrderStage(order({ fulfillment: [{ product: '86" IFP', ordered: 2, shipped: 0, planned: 2 }] }))).toBe(
      "not_shipped"
    )
    expect(approvedOrderStage(order())).toBe("partial")
    expect(approvedOrderStage(order({ fulfillment: [{ product: '86" IFP', ordered: 2, shipped: 2, planned: 0 }] }))).toBe(
      "shipped"
    )
    expect(
      approvedOrderStage(
        order({
          lines: [line('86" IFP', 2), line("T1", 2)],
          fulfillment: [
            { product: '86" IFP', ordered: 2, shipped: 3, planned: 0 },
            { product: "T1", ordered: 2, shipped: 0, planned: 2 },
          ],
        })
      )
    ).toBe("partial")
  })

  it("하드웨어 없는 자동 승인 오더는 따로 접는다 — 품목 확인 필요 줄이 있으면 하드웨어 오더다", () => {
    const software = order({
      needsHardwareApproval: false,
      lines: [line("라이선스", 10, { itemType: "service", hardwareProducts: [] })],
      fulfillment: [],
    })
    expect(isNoHardwareOrder(software)).toBe(true)
    expect(approvedOrderStage(software)).toBe("no_hardware")

    const unmappedOnly = order({
      lines: [line("특주 브래킷", 1, { hardwareProducts: [], unmappedHardware: true })],
      fulfillment: [],
    })
    expect(isNoHardwareOrder(unmappedOnly)).toBe(false)
    expect(approvedOrderStage(unmappedOnly)).toBe("not_shipped")
  })
})

describe("approvedOrderNextActions", () => {
  it("배송 예정이 있으면 출고 확정, 주문 대비 미등록이 있으면 예정 등록", () => {
    expect(
      approvedOrderNextActions(
        order({
          lines: [line('86" IFP', 2), line("T1", 2)],
          fulfillment: [
            { product: '86" IFP', ordered: 2, shipped: 1, planned: 1 },
            { product: "T1", ordered: 2, shipped: 0, planned: 0 },
          ],
        })
      )
    ).toEqual([
      { kind: "confirm_planned", quantity: 1 },
      { kind: "register", quantity: 2 },
    ])
    expect(approvedOrderNextActions(order({ fulfillment: [{ product: '86" IFP', ordered: 2, shipped: 2, planned: 0 }] }))).toEqual([])
  })
})

describe("approvedOrderSheetHints", () => {
  it("번호 없이 적힌 같은 고객(덧붙인 이름 포함)·같은 품목 시트 출고를 이 오더 후보로 묶는다", () => {
    const hints = approvedOrderSheetHints(order({ customerName: "그린 수학" }), [
      check({ row: { id: "match", customer: "그린수학학원" } }),
      check({ row: { id: "other-product", customer: "그린수학", productName: "T1" } }),
      check({ row: { id: "other-customer", customer: "해솔학원" } }),
      check({ kind: "unknown_order_no", row: { id: "typo", customer: "그린수학" } }),
    ])
    expect(hints.possibleUnnumbered.map((entry) => entry.row.id)).toEqual(["match"])
  })

  it("이 오더번호의 수량 초과만 고른다", () => {
    const hints = approvedOrderSheetHints(order(), [
      check({ kind: "over_order_quantity", orderNo: "ORD-2610-004", row: { id: "mine" } }),
      check({ kind: "over_order_quantity", orderNo: "ORD-2610-002", row: { id: "other" } }),
    ])
    expect(hints.overQuantity.map((entry) => entry.row.id)).toEqual(["mine"])
  })
})

describe("sortApprovedOrders", () => {
  it("일부 출고 → 출고 전 → 출고 완료 순, 같은 단계는 받은 순서", () => {
    const shipped = order({ id: "shipped", fulfillment: [{ product: '86" IFP', ordered: 2, shipped: 2, planned: 0 }] })
    const before1 = order({ id: "before1", fulfillment: [{ product: '86" IFP', ordered: 2, shipped: 0, planned: 2 }] })
    const partial = order({ id: "partial" })
    const before2 = order({ id: "before2", fulfillment: [{ product: '86" IFP', ordered: 2, shipped: 0, planned: 0 }] })

    expect(sortApprovedOrders([shipped, before1, partial, before2]).map((entry) => entry.id)).toEqual([
      "partial",
      "before1",
      "before2",
      "shipped",
    ])
  })
})

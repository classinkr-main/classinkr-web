// lib/orders/sheet-order-check.ts — 시트 출고 줄 ↔ 오더(연결 로직 §4-4)의 순수 규칙.
import { describe, expect, it } from "vitest"

import type { SalesOrder, SalesOrderLine } from "@/lib/orders/order-lines"
import {
  classifySheetOrderChecks,
  normalizeOrderNo,
  orderNosWithActualSheetOutbound,
  rawOrderNo,
  sameCustomerName,
  selectAppRowsReplacedBySheet,
  suggestOrdersForSheetCheck,
  summarizeOrderFulfillment,
  type SheetOutboundRow,
} from "@/lib/orders/sheet-order-check"

function line(product: string, quantity: number): SalesOrderLine {
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
  }
}

function order(overrides: Partial<SalesOrder>): Pick<SalesOrder, "orderNo" | "status" | "customerName" | "lines"> {
  return { orderNo: "ORD-2610-002", status: "approved", customerName: "한빛학원", lines: [line('86" IFP', 2)], ...overrides }
}

function sheetRow(overrides: Partial<SheetOutboundRow>): SheetOutboundRow {
  return {
    id: "r1",
    productName: '86" IFP',
    quantity: 1,
    occurredAt: "2026-10-23",
    status: "출고",
    customer: "한빛학원",
    orderNoRaw: "ORD-2610-002",
    ...overrides,
  }
}

describe("normalizeOrderNo · rawOrderNo", () => {
  it("손으로 적은 대소문자·공백을 정리한다", () => {
    expect(normalizeOrderNo(" ord - 2610-002 ")).toBe("ORD-2610-002")
    expect(normalizeOrderNo("ORD-2610-002")).toBe("ORD-2610-002")
    expect(normalizeOrderNo("   ")).toBeNull()
    expect(normalizeOrderNo(42)).toBeNull()
  })

  it("raw.order_no 만 읽는다", () => {
    expect(rawOrderNo({ order_no: "ord-2610-002" })).toBe("ORD-2610-002")
    expect(rawOrderNo({})).toBeNull()
    expect(rawOrderNo(null)).toBeNull()
    expect(rawOrderNo(["ORD-2610-002"])).toBeNull()
  })
})

describe("selectAppRowsReplacedBySheet — 시트가 이긴다", () => {
  it("시트에 같은 오더·품목이 있으면 앱 예정·출고를 고르고, 다른 품목·다른 오더는 남긴다", () => {
    const sheet = [{ id: "s1", productName: '86" IFP', status: "출고", orderNo: "ORD-2610-002" }]
    const app = [
      { id: "a-planned", productName: '86" IFP', status: "배송 예정", orderNo: "ORD-2610-002" },
      { id: "a-shipped", productName: '86"  IFP', status: "출고", orderNo: "ORD-2610-002" },
      { id: "a-t1", productName: "T1", status: "배송 예정", orderNo: "ORD-2610-002" },
      { id: "a-other", productName: '86" IFP', status: "배송 예정", orderNo: "ORD-2610-003" },
    ]

    expect(selectAppRowsReplacedBySheet(sheet, app)).toEqual(["a-planned", "a-shipped"])
  })

  it("시트 줄에 오더번호가 없으면 아무것도 대체하지 않는다 — 고객·품목 짐작으로 묶지 않는다", () => {
    const sheet = [{ id: "s1", productName: '86" IFP', status: "출고", orderNo: null }]
    const app = [{ id: "a", productName: '86" IFP', status: "배송 예정", orderNo: "ORD-2610-002" }]
    expect(selectAppRowsReplacedBySheet(sheet, app)).toEqual([])
  })
})

describe("orderNosWithActualSheetOutbound", () => {
  it("예정 줄만 있는 오더는 빼고 실제 출고가 있는 오더만 고른다", () => {
    expect(
      orderNosWithActualSheetOutbound([
        { id: "1", productName: "T1", status: "배송 예정", orderNo: "ORD-2610-001" },
        { id: "2", productName: "T1", status: "설치 완료", orderNo: "ORD-2610-002" },
        { id: "3", productName: "T1", status: null, orderNo: "ORD-2610-002" },
      ])
    ).toEqual(["ORD-2610-002"])
  })
})

describe("summarizeOrderFulfillment", () => {
  it("주문 수량 대비 출고·예정을 품목별로 센다", () => {
    const result = summarizeOrderFulfillment(order({ lines: [line('86" IFP', 2), line("T1", 2)] }), [
      { orderNo: "ORD-2610-002", productName: '86" IFP', quantity: 1, status: "출고" },
      { orderNo: "ORD-2610-002", productName: '86" IFP', quantity: 1, status: "배송 예정" },
      { orderNo: "ORD-2610-009", productName: "T1", quantity: 5, status: "출고" },
    ])
    expect(result).toEqual([
      { product: '86" IFP', ordered: 2, shipped: 1, planned: 1 },
      { product: "T1", ordered: 2, shipped: 0, planned: 0 },
    ])
  })
})

describe("classifySheetOrderChecks — 시트 확인 필요", () => {
  it("오더번호 없음 · 모르는 번호 · 취소된 오더를 가른다", () => {
    const checks = classifySheetOrderChecks(
      [
        sheetRow({ id: "none", orderNoRaw: null }),
        sheetRow({ id: "unknown", orderNoRaw: "ORD-2610-099" }),
        sheetRow({ id: "cancelled", orderNoRaw: "ord-2610-005" }),
        sheetRow({ id: "ok", orderNoRaw: "ORD-2610-002" }),
      ],
      [order({}), order({ orderNo: "ORD-2610-005", status: "cancelled" })]
    )

    expect(checks.map((check) => [check.kind, check.row.id])).toEqual([
      ["missing_order_no", "none"],
      ["unknown_order_no", "unknown"],
      ["order_not_approved", "cancelled"],
    ])
    expect(checks[2].message).toContain("취소된")
  })

  it("오더에 없는 품목과, 같은 오더·품목의 시트 합계가 주문 수량을 넘는 경우를 잡는다(예정 줄 포함)", () => {
    const checks = classifySheetOrderChecks(
      [
        sheetRow({ id: "t1", productName: "T1" }),
        sheetRow({ id: "b1", quantity: 2 }),
        sheetRow({ id: "b2", quantity: 1, status: "배송 예정", occurredAt: null }),
      ],
      [order({})]
    )

    expect(checks.map((check) => check.kind)).toEqual(["product_not_in_order", "over_order_quantity"])
    expect(checks[1].message).toContain("2대인데 시트에는 3대")
    expect(checks[1]).toMatchObject({ ordered: 2, sheetTotal: 3 })
  })

  it("주문 수량 안이면 아무것도 띄우지 않는다", () => {
    expect(classifySheetOrderChecks([sheetRow({ quantity: 1 }), sheetRow({ id: "r2", quantity: 1 })], [order({})])).toEqual([])
  })
})

describe("sameCustomerName", () => {
  it("공백·덧붙인 이름(학원)까지 같은 곳으로 보고, 한 글자짜리는 묶지 않는다", () => {
    expect(sameCustomerName("그린 수학", "그린수학학원")).toBe(true)
    expect(sameCustomerName("해솔학원", "그린수학")).toBe(false)
    expect(sameCustomerName("A", "A학원")).toBe(false)
    expect(sameCustomerName(null, "그린수학")).toBe(false)
  })
})

describe("suggestOrdersForSheetCheck — 고칠 번호 후보", () => {
  const approved = [
    order({ orderNo: "ORD-2610-004", customerName: "해솔학원", lines: [line('86" IFP', 2), line("T1", 2)] }),
    order({ orderNo: "ORD-2610-005", customerName: "그린수학", lines: [line('86" IFP', 2)] }),
    order({ orderNo: "ORD-2610-006", customerName: "그린수학", status: "cancelled", lines: [line('86" IFP', 2)] }),
  ]

  it("번호 없음: 같은 고객·품목의 승인 오더(취소된 오더는 빼고)", () => {
    const suggestions = suggestOrdersForSheetCheck(
      { kind: "missing_order_no", orderNo: null, row: sheetRow({ customer: "그린수학학원", orderNoRaw: null }) },
      approved
    )
    expect(suggestions).toEqual([
      { orderNo: "ORD-2610-005", customerName: "그린수학", products: '86" IFP ×2', reason: "same_customer_product" },
    ])
  })

  it("없는 번호: 2글자 이내로 다른 번호를 오타 후보로, 같은 고객을 앞에", () => {
    const suggestions = suggestOrdersForSheetCheck(
      { kind: "unknown_order_no", orderNo: "ORD-2610-014", row: sheetRow({ productName: "T1", customer: "해솔학원" }) },
      approved
    )
    expect(suggestions.map((entry) => [entry.orderNo, entry.reason])).toEqual([
      ["ORD-2610-004", "similar_number"],
      ["ORD-2610-005", "similar_number"],
    ])
  })

  it("없는 번호인데 비슷한 번호가 없으면 같은 고객·품목 오더로 물러난다", () => {
    const suggestions = suggestOrdersForSheetCheck(
      { kind: "unknown_order_no", orderNo: "ORD-2699-999", row: sheetRow({ productName: "T1", customer: "해솔학원" }) },
      approved
    )
    expect(suggestions.map((entry) => [entry.orderNo, entry.reason])).toEqual([["ORD-2610-004", "same_customer_product"]])
  })

  it("취소된 오더·수량 초과는 번호를 바꿀 일이 아니라 후보가 없다", () => {
    for (const kind of ["order_not_approved", "over_order_quantity"] as const) {
      expect(suggestOrdersForSheetCheck({ kind, orderNo: "ORD-2610-005", row: sheetRow({ customer: "그린수학" }) }, approved)).toEqual([])
    }
  })
})

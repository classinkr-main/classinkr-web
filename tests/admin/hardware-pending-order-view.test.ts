// 승인 대기 탭 보기 모델(시안 2026-10-26 "승인 대기 A") — 재고 영향·기다린 시간·정렬.
import { describe, expect, it } from "vitest"

import {
  isLongWait,
  pendingStockImpact,
  sortPendingOrders,
  waitingLabel,
} from "@/components/admin/hardware/inventory/pending-order-view"
import type { SalesOrderLine } from "@/lib/orders/order-lines"

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

const STOCK = [
  { product: '86" IFP', availableStock: 9 },
  { product: "T1", availableStock: 1 },
  { product: '75"  IFP', availableStock: 4 },
]

describe("pendingStockImpact", () => {
  it("주문 · 지금 가용 · 승인 후를 계산하고 모자라는 대수를 센다", () => {
    const order = { id: "a", lines: [line('86" IFP', 2), line("T1", 2)] }

    expect(pendingStockImpact(order, STOCK, [order])).toEqual([
      { product: '86" IFP', ordered: 2, available: 9, after: 7, shortage: 0, afterAllPending: null, noStockRecord: false },
      { product: "T1", ordered: 2, available: 1, after: -1, shortage: 1, afterAllPending: null, noStockRecord: false },
    ])
  })

  it("다른 승인 대기의 같은 품목을 합산해 보여 주고, 자기 자신은 빼고 센다", () => {
    const mine = { id: "seoyeon", lines: [line('75" IFP', 1)] }
    const other = { id: "bada", lines: [line('75" IFP', 3)] }

    const [row] = pendingStockImpact(mine, STOCK, [mine, other])

    expect(row).toMatchObject({ available: 4, after: 3, shortage: 0, afterAllPending: 0 })
  })

  it("재고현황에 줄이 없는 품목은 가용 0 · 기록 없음으로 본다", () => {
    const order = { id: "a", lines: [line('110" IFP', 1)] }
    expect(pendingStockImpact(order, STOCK, [order])[0]).toMatchObject({ available: 0, after: -1, shortage: 1, noStockRecord: true })
  })

  it("재고 품목을 못 찾은 줄은 표에 넣지 않는다(화면이 따로 경고 줄로 보인다)", () => {
    const order = { id: "a", lines: [line("특주 브래킷", 1, { hardwareProducts: [], unmappedHardware: true })] }
    expect(pendingStockImpact(order, STOCK, [order])).toEqual([])
  })
})

describe("waitingLabel · isLongWait", () => {
  const now = new Date("2026-10-28T06:00:00Z")

  it("분·시간·일로 줄인다", () => {
    expect(waitingLabel("2026-10-28T05:25:00Z", now)).toBe("35분")
    expect(waitingLabel("2026-10-28T01:00:00Z", now)).toBe("5시간")
    expect(waitingLabel("2026-10-26T05:00:00Z", now)).toBe("2일")
  })

  it("4시간부터 강조한다", () => {
    expect(isLongWait("2026-10-28T02:01:00Z", now)).toBe(false)
    expect(isLongWait("2026-10-28T02:00:00Z", now)).toBe(true)
  })
})

describe("sortPendingOrders", () => {
  it("오래 기다린 오더부터", () => {
    const orders = [
      { id: "new", requestedAt: "2026-10-28T04:00:00Z" },
      { id: "old", requestedAt: "2026-10-27T23:00:00Z" },
      { id: "mid", requestedAt: "2026-10-28T01:00:00Z" },
    ]
    expect(sortPendingOrders(orders).map((order) => order.id)).toEqual(["old", "mid", "new"])
  })
})

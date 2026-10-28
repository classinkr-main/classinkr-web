// 반려·취소(시안 B)·시트 확인(시안 A) 탭 보기 모델 — 렌더 하네스가 없어 화면이 쓰는 순수 규칙만 고정한다.
import { describe, expect, it } from "vitest"

import {
  closedOrderReason,
  closedOrderTodo,
  sortClosedOrders,
  type ClosedOrderInput,
} from "@/components/admin/hardware/inventory/closed-order-view"
import { groupSheetChecks, sheetCheckFixText } from "@/components/admin/hardware/inventory/sheet-check-view"
import type { SheetOrderCheck } from "@/lib/orders/sheet-order-check"

function closed(overrides: Partial<ClosedOrderInput> & { id?: string } = {}): ClosedOrderInput & { id: string } {
  return { id: "so", status: "rejected", orderNo: null, decisionReason: "단가 확인 필요", successor: null, ...overrides }
}

function check(overrides: Omit<Partial<SheetOrderCheck>, "row"> & { row?: Partial<SheetOrderCheck["row"]> } = {}): SheetOrderCheck {
  const { row, ...rest } = overrides
  return {
    kind: "order_not_approved",
    orderNo: "ORD-2610-001",
    orderStatus: "cancelled",
    orderCustomer: "다온국어",
    message: "",
    ...rest,
    row: {
      id: "r1",
      productName: '86" IFP',
      quantity: 1,
      occurredAt: null,
      status: "배송 예정",
      customer: "다온국어",
      orderNoRaw: "ORD-2610-001",
      ...row,
    },
  }
}

describe("closedOrderTodo", () => {
  it("반려됐고 다시 올라온 오더가 없으면 견적 수정이 할 일이다", () => {
    expect(closedOrderTodo(closed(), [])).toEqual({ kind: "requote", sheetLeftovers: [] })
  })

  it("같은 견적으로 새 오더가 올라왔으면 해결됨", () => {
    const successor = { id: "so2", status: "pending_approval" as const, orderNo: null, requestedAt: "2026-10-26T02:15:00Z" }
    expect(closedOrderTodo(closed({ successor }), []).kind).toBe("resolved")
  })

  it("취소된 오더번호가 시트에 남아 있으면 시트 정리가 먼저다 — 다른 번호의 줄은 보지 않는다", () => {
    const cancelled = closed({ status: "cancelled", orderNo: "ORD-2610-001", decisionReason: "취소(ORD-2610-001): 고객 취소" })
    const leftover = check()
    const todo = closedOrderTodo(cancelled, [leftover, check({ orderNo: "ORD-2610-009", row: { id: "r2" } })])

    expect(todo.kind).toBe("clean_sheet")
    expect(todo.sheetLeftovers).toEqual([leftover])
    expect(closedOrderTodo(cancelled, []).kind).toBe("none")
  })
})

describe("closedOrderReason", () => {
  it("취소 사유 앞의 번호 표기를 떼고, 비면 null", () => {
    expect(closedOrderReason({ decisionReason: "취소(ORD-2610-001): 고객 취소" })).toBe("고객 취소")
    expect(closedOrderReason({ decisionReason: "재고 부족 — 11월 입고 뒤 다시" })).toBe("재고 부족 — 11월 입고 뒤 다시")
    expect(closedOrderReason({ decisionReason: null })).toBeNull()
  })
})

describe("sortClosedOrders", () => {
  it("견적 수정 → 시트 정리 → 해결됨 → 할 일 없음, 같은 칸은 받은 순서", () => {
    const successor = { id: "x", status: "approved" as const, orderNo: "ORD-2610-007", requestedAt: "2026-10-26T00:00:00Z" }
    const orders = [
      closed({ id: "none", status: "cancelled", orderNo: "ORD-2610-008" }),
      closed({ id: "resolved", successor }),
      closed({ id: "sheet", status: "cancelled", orderNo: "ORD-2610-001" }),
      closed({ id: "requote-1" }),
      closed({ id: "requote-2" }),
    ]

    expect(sortClosedOrders(orders, [check()]).map((order) => order.id)).toEqual([
      "requote-1",
      "requote-2",
      "sheet",
      "resolved",
      "none",
    ])
  })
})

describe("groupSheetChecks · sheetCheckFixText", () => {
  it("정해진 종류 순서로 묶고 빈 종류는 뺀다", () => {
    const groups = groupSheetChecks([
      check({ kind: "over_order_quantity", row: { id: "a" } }),
      check({ kind: "missing_order_no", row: { id: "b" } }),
      check({ kind: "missing_order_no", row: { id: "c" } }),
    ])
    expect(groups.map((group) => [group.kind, group.checks.map((entry) => entry.row.id)])).toEqual([
      ["missing_order_no", ["b", "c"]],
      ["over_order_quantity", ["a"]],
    ])
  })

  it("취소된 오더 줄은 지우라고, 승인 전 오더 줄은 승인 뒤 출고하라고 안내한다", () => {
    expect(sheetCheckFixText(check())).toContain("ORD-2610-001는 취소된 오더")
    expect(sheetCheckFixText(check({ orderStatus: "rejected" }))).toContain("아직 승인되지 않은")
  })
})

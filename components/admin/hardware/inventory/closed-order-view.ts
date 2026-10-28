// 반려·취소 탭 보기 모델 — 오더마다 "다음 할 일"을 정하고 할 일이 남은 것부터 세운다(시안 2026-10-26 "반려·취소 B").
// 순수 함수라 OrderApprovalSection 과 테스트가 같은 규칙을 쓴다.
import type { SalesOrder, SalesOrderStatus } from "@/lib/orders/order-lines"
import type { SheetOrderCheck } from "@/lib/orders/sheet-order-check"

export interface ClosedOrderInput extends Pick<SalesOrder, "status" | "orderNo" | "decisionReason"> {
  successor?: { id: string; status: SalesOrderStatus; orderNo: string | null; requestedAt: string } | null
}

/**
 * - requote: 반려됐고 같은 견적으로 다시 올라온 오더가 없다 → 영업이 견적을 고쳐 새 버전으로 승인받아야 한다
 * - clean_sheet: 취소된 오더번호가 시트에 아직 적혀 있다 → 시트에서 그 줄을 지운다
 * - resolved: 같은 견적으로 새 오더가 올라왔다(승인 대기·승인됨)
 * - none: 남은 할 일이 없다(취소, 시트도 깨끗)
 */
export type ClosedOrderTodoKind = "requote" | "clean_sheet" | "resolved" | "none"

export interface ClosedOrderTodo {
  kind: ClosedOrderTodoKind
  /** clean_sheet 일 때 — 취소된 번호가 적힌 시트 줄들. */
  sheetLeftovers: SheetOrderCheck[]
}

export function closedOrderTodo(order: ClosedOrderInput, sheetChecks: readonly SheetOrderCheck[]): ClosedOrderTodo {
  const sheetLeftovers =
    order.status === "cancelled" && order.orderNo
      ? sheetChecks.filter((check) => check.kind === "order_not_approved" && check.orderNo === order.orderNo)
      : []
  if (sheetLeftovers.length > 0) return { kind: "clean_sheet", sheetLeftovers }
  if (order.successor) return { kind: "resolved", sheetLeftovers }
  if (order.status === "rejected") return { kind: "requote", sheetLeftovers }
  return { kind: "none", sheetLeftovers }
}

/** 취소 사유는 서버가 "취소(ORD-2610-001): 고객 취소"로 남긴다 — 카드에는 사유만 보인다. */
export function closedOrderReason(order: Pick<SalesOrder, "decisionReason">): string | null {
  const reason = order.decisionReason?.replace(/^취소\([^)]*\):\s*/, "").trim()
  return reason || null
}

const TODO_ORDER: Record<ClosedOrderTodoKind, number> = { requote: 0, clean_sheet: 1, resolved: 2, none: 3 }

/** 할 일이 남은 것부터 — 견적 수정 → 시트 정리 → 해결됨 → 할 일 없음. 같은 칸 안에서는 받은 순서를 지킨다. */
export function sortClosedOrders<T extends ClosedOrderInput>(orders: readonly T[], sheetChecks: readonly SheetOrderCheck[]): T[] {
  return orders
    .map((order, index) => ({ order, index, rank: TODO_ORDER[closedOrderTodo(order, sheetChecks).kind] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.order)
}

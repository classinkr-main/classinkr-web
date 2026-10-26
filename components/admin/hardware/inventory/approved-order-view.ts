// 승인됨 탭 보기 모델 — 오더마다 품목별 진행 바(출고·배송 예정·미등록), 출고 단계, 다음 할 일, 시트 힌트.
// 순수 함수라 OrderApprovalSection 과 테스트가 같은 규칙을 쓴다(시안 2026-10-26 "승인됨 A").
import type { SalesOrder } from "@/lib/orders/order-lines"
import type { SalesOrderFulfillmentLine, SheetOrderCheck } from "@/lib/orders/sheet-order-check"

export type ApprovedOrderInput = Pick<SalesOrder, "orderNo" | "customerName" | "needsHardwareApproval" | "lines"> & {
  fulfillment?: SalesOrderFulfillmentLine[]
}

export interface FulfillmentBar {
  product: string
  ordered: number
  shipped: number
  planned: number
  /** 주문했는데 아직 출고도 예정도 없는 대수. */
  unregistered: number
  /** 출고 + 예정이 주문을 넘은 대수(시트 중복·추가분). */
  over: number
  /** 막대 폭(%) — 기준은 주문과 출고+예정 중 큰 쪽. */
  shippedPct: number
  plannedPct: number
}

export type ApprovedOrderStage = "no_hardware" | "not_shipped" | "partial" | "shipped"

export const APPROVED_ORDER_STAGE_LABELS: Record<ApprovedOrderStage, string> = {
  no_hardware: "하드웨어 없음",
  not_shipped: "출고 전",
  partial: "일부 출고",
  shipped: "출고 완료",
}

function percent(part: number, total: number) {
  if (total <= 0) return 0
  return Math.round((part / total) * 1000) / 10
}

export function buildFulfillmentBars(lines: readonly SalesOrderFulfillmentLine[] | undefined): FulfillmentBar[] {
  return (lines ?? []).map((line) => {
    const filled = line.shipped + line.planned
    const base = Math.max(line.ordered, filled)
    return {
      product: line.product,
      ordered: line.ordered,
      shipped: line.shipped,
      planned: line.planned,
      unregistered: Math.max(0, line.ordered - filled),
      over: Math.max(0, filled - line.ordered),
      shippedPct: percent(line.shipped, base),
      plannedPct: percent(line.planned, base),
    }
  })
}

/** 하드웨어가 없는 오더(자동 승인) — 출고 대상이 아니라 목록 아래로 접는다. 품목 확인 필요 줄이 있으면 하드웨어 오더다. */
export function isNoHardwareOrder(order: ApprovedOrderInput) {
  if (order.needsHardwareApproval) return false
  if (order.lines.some((line) => line.unmappedHardware || line.hardwareProducts.length > 0)) return false
  return !(order.fulfillment ?? []).some((line) => line.ordered > 0 || line.shipped > 0 || line.planned > 0)
}

export function approvedOrderStage(order: ApprovedOrderInput): ApprovedOrderStage {
  if (isNoHardwareOrder(order)) return "no_hardware"
  const bars = buildFulfillmentBars(order.fulfillment)
  const ordered = bars.reduce((sum, bar) => sum + bar.ordered, 0)
  const shipped = bars.reduce((sum, bar) => sum + Math.min(bar.shipped, bar.ordered), 0)
  if (ordered > 0 && shipped >= ordered) return "shipped"
  if (bars.some((bar) => bar.shipped > 0)) return "partial"
  return "not_shipped"
}

export type ApprovedOrderNextAction =
  | { kind: "confirm_planned"; quantity: number }
  | { kind: "register"; quantity: number }

/** 다음 할 일 — 배송 예정이 있으면 출고 확정, 주문 대비 미등록이 있으면 예정 등록. 둘 다 없으면 빈 목록. */
export function approvedOrderNextActions(order: ApprovedOrderInput): ApprovedOrderNextAction[] {
  const bars = buildFulfillmentBars(order.fulfillment)
  const planned = bars.reduce((sum, bar) => sum + bar.planned, 0)
  const unregistered = bars.reduce((sum, bar) => sum + bar.unregistered, 0)
  const actions: ApprovedOrderNextAction[] = []
  if (planned > 0) actions.push({ kind: "confirm_planned", quantity: planned })
  if (unregistered > 0) actions.push({ kind: "register", quantity: unregistered })
  return actions
}

function nameKey(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").toLowerCase()
}

/** 시트 출고처와 오더 고객이 같은 곳인지 — 시트에는 "그린수학학원"처럼 덧붙여 적히기도 해 포함 관계까지 본다. */
function sameCustomer(a: string | null | undefined, b: string | null | undefined) {
  const left = nameKey(a)
  const right = nameKey(b)
  if (left.length < 2 || right.length < 2) return false
  return left === right || left.includes(right) || right.includes(left)
}

export interface ApprovedOrderSheetHints {
  /** 오더번호 없이 시트에 적힌 같은 고객·품목 출고 — 이 오더일 수 있다. */
  possibleUnnumbered: SheetOrderCheck[]
  /** 이 오더번호로 시트에 주문보다 많이 적혔다. */
  overQuantity: SheetOrderCheck[]
}

export function approvedOrderSheetHints(order: ApprovedOrderInput, checks: readonly SheetOrderCheck[]): ApprovedOrderSheetHints {
  const products = new Set(
    [
      ...order.lines.flatMap((line) => line.hardwareProducts.map((item) => item.product)),
      ...(order.fulfillment ?? []).map((line) => line.product),
    ].map((product) => product.replace(/\s+/g, " ").trim())
  )
  return {
    possibleUnnumbered: checks.filter(
      (check) =>
        check.kind === "missing_order_no" &&
        sameCustomer(check.row.customer, order.customerName) &&
        products.has(check.row.productName.replace(/\s+/g, " ").trim())
    ),
    overQuantity: order.orderNo
      ? checks.filter((check) => check.kind === "over_order_quantity" && check.orderNo === order.orderNo)
      : [],
  }
}

const STAGE_ORDER: Record<ApprovedOrderStage, number> = { partial: 0, not_shipped: 1, shipped: 2, no_hardware: 3 }

/** 할 일이 남은 오더가 위로 — 일부 출고 → 출고 전 → 출고 완료 → 하드웨어 없음. 같은 단계 안에서는 받은 순서를 지킨다. */
export function sortApprovedOrders<T extends ApprovedOrderInput>(orders: readonly T[]): T[] {
  return orders
    .map((order, index) => ({ order, index, rank: STAGE_ORDER[approvedOrderStage(order)] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.order)
}

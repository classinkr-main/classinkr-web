// 시트 출고 줄 ↔ 오더 — 오더번호로 묶고, 묶이지 않거나 어긋난 줄을 "시트 확인 필요"로 고른다.
// 순수 함수라 가져오기(lib/orders/sheet-order-sync.ts)·목록 API·테스트가 같은 규칙을 쓴다.
// docs/active/hardware-order-revenue-link-plan-2026-10-22.md §4-4.

import type { SalesOrder, SalesOrderStatus } from "@/lib/orders/order-lines"

const PLANNED_STATUS_PATTERN = /예정|예약|대기|planned/i

/** 원장 상태 문자열이 "아직 안 나간 예정"인지 — 저장소 isPlannedStatus 와 같은 어휘. */
export function isPlannedLedgerStatus(status: string | null | undefined): boolean {
  return PLANNED_STATUS_PATTERN.test(status ?? "")
}

/**
 * 오더번호 표기 정리 — 시트에 손으로 적으므로 대소문자·공백·하이픈 앞뒤 공백이 섞인다.
 * `ord - 2610-002` → `ORD-2610-002`. 비어 있으면 null.
 */
export function normalizeOrderNo(value: unknown): string | null {
  if (typeof value !== "string") return null
  const text = value.replace(/\s*-\s*/g, "-").replace(/\s+/g, "").toUpperCase()
  return text || null
}

/** 원장 raw 에 실린 오더번호(시트 파서·앱 배송 예정 모두 raw.order_no). */
export function rawOrderNo(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  return normalizeOrderNo((raw as Record<string, unknown>).order_no)
}

function productKey(name: string | null | undefined) {
  return (name ?? "").replace(/\s+/g, " ").trim()
}

// ---------------------------------------------------------------------------
// 앱 기록 대체 — 시트가 같은 오더·품목을 실으면 앱이 만든 예정·출고를 취소한다(§8-6 "시트가 이긴다").

export interface LedgerOrderRow {
  id: string
  productName: string | null
  status: string | null
  orderNo: string | null
}

/**
 * 시트 줄(오더번호 있는 것)이 덮는 (오더번호, 품목)에 해당하는 앱 기록 id. 시트에 그 오더·품목이 한 줄이라도
 * 있으면 시트가 그 묶음을 맡는다 — 부분 출고라면 나머지도 시트에 예정 줄로 적는다(시트가 원본인 과도기 규칙).
 * 시트에 없는 품목의 앱 기록은 남긴다.
 */
export function selectAppRowsReplacedBySheet(
  sheetRows: readonly LedgerOrderRow[],
  appRows: readonly LedgerOrderRow[]
): string[] {
  const covered = new Set<string>()
  for (const row of sheetRows) {
    if (!row.orderNo) continue
    covered.add(`${row.orderNo}\u0000${productKey(row.productName)}`)
  }
  return appRows
    .filter((row) => row.orderNo && covered.has(`${row.orderNo}\u0000${productKey(row.productName)}`))
    .map((row) => row.id)
}

/** 시트에 실제 출고(예정 아님) 줄이 있는 오더번호 — 그 오더의 딜을 설치 단계로 올린다. */
export function orderNosWithActualSheetOutbound(sheetRows: readonly LedgerOrderRow[]): string[] {
  const numbers = new Set<string>()
  for (const row of sheetRows) {
    if (row.orderNo && !isPlannedLedgerStatus(row.status)) numbers.add(row.orderNo)
  }
  return [...numbers]
}

// ---------------------------------------------------------------------------
// 오더 대비 출고 — 승인된 오더 목록에 "출고 1/2 · 예정 1"을 보인다.

export interface OrderLedgerMovement {
  orderNo: string | null
  productName: string | null
  quantity: number
  status: string | null
}

export interface SalesOrderFulfillmentLine {
  product: string
  ordered: number
  shipped: number
  planned: number
}

export function summarizeOrderFulfillment(
  order: Pick<SalesOrder, "orderNo" | "lines">,
  movements: readonly OrderLedgerMovement[]
): SalesOrderFulfillmentLine[] {
  const orderNo = normalizeOrderNo(order.orderNo)
  const byProduct = new Map<string, SalesOrderFulfillmentLine>()
  const entry = (product: string) => {
    const current = byProduct.get(product) ?? { product, ordered: 0, shipped: 0, planned: 0 }
    byProduct.set(product, current)
    return current
  }
  for (const line of order.lines) {
    for (const item of line.hardwareProducts ?? []) entry(productKey(item.product)).ordered += item.quantity
  }
  if (orderNo) {
    for (const movement of movements) {
      if (movement.orderNo !== orderNo || !(movement.quantity > 0)) continue
      const current = entry(productKey(movement.productName))
      if (isPlannedLedgerStatus(movement.status)) current.planned += movement.quantity
      else current.shipped += movement.quantity
    }
  }
  return [...byProduct.values()]
}

// ---------------------------------------------------------------------------
// 시트 확인 필요 — 승인 규칙을 지키는 장치. 과도기에는 시트에 직접 적는 출고가 앱 승인을 우회할 수 있다.

export type SheetOrderCheckKind =
  | "missing_order_no"
  | "unknown_order_no"
  | "order_not_approved"
  | "product_not_in_order"
  | "over_order_quantity"

export interface SheetOutboundRow {
  id: string
  productName: string
  quantity: number
  occurredAt: string | null
  status: string | null
  customer: string | null
  orderNoRaw: string | null
}

export interface SheetOrderCheck {
  kind: SheetOrderCheckKind
  /** 같은 오더·품목 초과는 묶음 단위라 대표 줄 하나만 싣는다. */
  row: SheetOutboundRow
  orderNo: string | null
  orderStatus: SalesOrderStatus | null
  orderCustomer: string | null
  message: string
}

export const SHEET_ORDER_CHECK_LABELS: Record<SheetOrderCheckKind, string> = {
  missing_order_no: "오더번호 없음",
  unknown_order_no: "없는 오더번호",
  order_not_approved: "승인 안 된 오더",
  product_not_in_order: "오더에 없는 품목",
  over_order_quantity: "오더 수량 초과",
}

/**
 * 시트 출고 줄(고객에게 나간 것만 넘긴다)을 오더와 대조한다.
 * orders 는 시트에 적힌 번호로 찾은 오더들(상태 무관). 판정 순서: 번호 없음 → 모르는 번호 → 승인 안 됨(취소된 오더)
 * → 오더에 없는 품목 → 오더 수량 초과(같은 오더·품목의 시트 줄 합계 기준, 예정 줄 포함).
 */
export function classifySheetOrderChecks(
  rows: readonly SheetOutboundRow[],
  orders: readonly Pick<SalesOrder, "orderNo" | "status" | "customerName" | "lines">[]
): SheetOrderCheck[] {
  const ordersByNo = new Map<string, (typeof orders)[number]>()
  for (const order of orders) {
    const orderNo = normalizeOrderNo(order.orderNo)
    if (orderNo) ordersByNo.set(orderNo, order)
  }

  const checks: SheetOrderCheck[] = []
  const totals = new Map<string, { quantity: number; row: SheetOutboundRow; ordered: number; order: (typeof orders)[number]; orderNo: string }>()

  for (const row of rows) {
    const orderNo = normalizeOrderNo(row.orderNoRaw)
    if (!orderNo) {
      checks.push({
        kind: "missing_order_no",
        row,
        orderNo: null,
        orderStatus: null,
        orderCustomer: null,
        message: "승인된 오더번호가 적혀 있지 않습니다.",
      })
      continue
    }
    const order = ordersByNo.get(orderNo)
    if (!order) {
      checks.push({
        kind: "unknown_order_no",
        row,
        orderNo,
        orderStatus: null,
        orderCustomer: null,
        message: `${orderNo}는 앱에 없는 오더번호입니다.`,
      })
      continue
    }
    if (order.status !== "approved") {
      checks.push({
        kind: "order_not_approved",
        row,
        orderNo,
        orderStatus: order.status,
        orderCustomer: order.customerName,
        message: `${orderNo}는 ${order.status === "cancelled" ? "취소된" : "승인되지 않은"} 오더입니다.`,
      })
      continue
    }
    const product = productKey(row.productName)
    const ordered = order.lines
      .flatMap((line) => line.hardwareProducts ?? [])
      .filter((item) => productKey(item.product) === product)
      .reduce((sum, item) => sum + item.quantity, 0)
    if (ordered <= 0) {
      checks.push({
        kind: "product_not_in_order",
        row,
        orderNo,
        orderStatus: order.status,
        orderCustomer: order.customerName,
        message: `${orderNo} 오더에 ${product}가 없습니다.`,
      })
      continue
    }
    const key = `${orderNo}\u0000${product}`
    const total = totals.get(key) ?? { quantity: 0, row, ordered, order, orderNo }
    total.quantity += row.quantity
    totals.set(key, total)
  }

  for (const total of totals.values()) {
    if (total.quantity <= total.ordered) continue
    checks.push({
      kind: "over_order_quantity",
      row: total.row,
      orderNo: total.orderNo,
      orderStatus: total.order.status,
      orderCustomer: total.order.customerName,
      message: `${total.orderNo} 오더의 ${productKey(total.row.productName)}는 ${total.ordered}대인데 시트에는 ${total.quantity}대입니다.`,
    })
  }
  return checks
}

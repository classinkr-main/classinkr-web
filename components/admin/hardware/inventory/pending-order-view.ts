// 승인 대기 탭 보기 모델 — 오더마다 재고 영향(주문 · 지금 가용 · 승인 후), 기다린 시간, 오래 기다린 순서
// (시안 2026-10-26 "승인 대기 A"). 순수 함수라 OrderApprovalSection 과 테스트가 같은 규칙을 쓴다.
import { summarizeSalesOrderProducts, type SalesOrder } from "@/lib/orders/order-lines"

export interface StockAvailability {
  product: string
  availableStock: number
}

export interface PendingStockImpactRow {
  product: string
  ordered: number
  /** 지금 가용 재고(대시보드 재고현황). 재고 기록이 없는 품목은 0 으로 본다. */
  available: number
  /** 이 오더만 승인했을 때 남는 가용. */
  after: number
  /** 모자라는 대수(after 가 음수일 때). */
  shortage: number
  /** 다른 승인 대기 오더까지 모두 승인했을 때 남는 가용 — 다른 대기에 같은 품목이 없으면 null. */
  afterAllPending: number | null
  /** 재고현황에 그 품목 줄이 없다(한 번도 입출고가 없던 품목). */
  noStockRecord: boolean
}

function productKey(name: string) {
  return name.replace(/\s+/g, " ").trim()
}

export function pendingStockImpact(
  order: Pick<SalesOrder, "id" | "lines">,
  stockRows: readonly StockAvailability[],
  pendingOrders: readonly Pick<SalesOrder, "id" | "lines">[]
): PendingStockImpactRow[] {
  const availableByProduct = new Map(stockRows.map((row) => [productKey(row.product), row.availableStock]))
  const othersByProduct = new Map<string, number>()
  for (const other of pendingOrders) {
    if (other.id === order.id) continue
    for (const entry of summarizeSalesOrderProducts(other.lines)) {
      const key = productKey(entry.product)
      othersByProduct.set(key, (othersByProduct.get(key) ?? 0) + entry.quantity)
    }
  }

  return summarizeSalesOrderProducts(order.lines).map((entry) => {
    const key = productKey(entry.product)
    const noStockRecord = !availableByProduct.has(key)
    const available = availableByProduct.get(key) ?? 0
    const after = available - entry.quantity
    const others = othersByProduct.get(key) ?? 0
    return {
      product: entry.product,
      ordered: entry.quantity,
      available,
      after,
      shortage: Math.max(0, -after),
      afterAllPending: others > 0 ? after - others : null,
      noStockRecord,
    }
  })
}

/** 기다린 시간 — "35분", "5시간", "2일". */
export function waitingLabel(requestedAt: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(requestedAt).getTime()) / 60000))
  if (!Number.isFinite(minutes)) return ""
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간`
  return `${Math.floor(hours / 24)}일`
}

/** 4시간 넘게 기다리면 강조한다(같은 날 안에 승인받는 게 기준). */
export function isLongWait(requestedAt: string, now: Date): boolean {
  return now.getTime() - new Date(requestedAt).getTime() >= 4 * 60 * 60 * 1000
}

/** 오래 기다린 오더부터. 요청 시각이 같으면 받은 순서. */
export function sortPendingOrders<T extends Pick<SalesOrder, "requestedAt">>(orders: readonly T[]): T[] {
  return orders
    .map((order, index) => ({ order, index, at: new Date(order.requestedAt).getTime() }))
    .sort((a, b) => a.at - b.at || a.index - b.index)
    .map((entry) => entry.order)
}

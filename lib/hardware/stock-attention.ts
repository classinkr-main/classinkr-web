// 재고 주의 품목 집계 — 서버 알림(getHardwareDashboard의 alerts)과 홈 요약 밴드가 같은 규칙으로 세게 한다.
// 순수 모듈(서버·클라이언트 공용). 하드웨어 라운드 2 H-2.
//
// 예전 요약 밴드는 totals.lowItems + totals.orderRecommended를 그냥 더했다. 그런데 low(가용 < 최소)이면
// orderRecommended(가용 ≤ 추세 주문점, 추세 주문점 ≥ 최소)도 반드시 참이라 부족 품목이 두 번 세졌고,
// 알림 목록이 접어 두는 미가동 품목과 원장 점검(음수 창고) 품목까지 셌다. 알림과 같은 분기 순서로 센다.

import { isPromotedProduct } from "./product"

export interface StockAttentionRow {
  warehouseStock: number
  plannedOut: number
  outbound30d: number
  low: boolean
  orderRecommended: boolean
}

// 미가동(취급 중단) 품목 판정 — 창고가 정확히 0이고 예정·최근 30일 출고가 없으면 "부족" 알림은
// 상시 소음이다. 음수 창고는 원장 이상 실신호이므로 0 초과·미만이 아닌 0 일치로만 본다.
export function isDormantStockRow(row: Pick<StockAttentionRow, "warehouseStock" | "plannedOut" | "outbound30d">): boolean {
  return row.warehouseStock === 0 && row.plannedOut === 0 && row.outbound30d === 0
}

export interface StockAttentionSummary {
  // 부족(최소재고 미만) — 미가동 제외. 알림 "최소재고 미만"과 같은 수.
  low: number
  // 주문 검토만(부족 아님). 알림 "주문 검토 시점"과 같은 수.
  orderOnly: number
  // 두 신호의 합집합 — 품목 하나는 한 번만 센다.
  total: number
  // 접어 둔 미가동 부족 품목 수(참고 표기용).
  dormantLow: number
  // 음수 창고 = 원장 점검 필요(부족으로 세지 않는다).
  ledgerCheck: number
}

export function summarizeStockAttention(rows: readonly StockAttentionRow[]): StockAttentionSummary {
  let low = 0
  let orderOnly = 0
  let dormantLow = 0
  let ledgerCheck = 0
  for (const row of rows) {
    if (row.warehouseStock < 0) {
      ledgerCheck += 1
      continue
    }
    if (row.low) {
      if (isDormantStockRow(row)) dormantLow += 1
      else low += 1
    } else if (row.orderRecommended) {
      orderOnly += 1
    }
  }
  return { low, orderOnly, total: low + orderOnly, dormantLow, ledgerCheck }
}

export interface StockTotalsRow {
  product: string
  warehouseStock: number
  availableStock: number
}

export interface StockTotalsSummary {
  // 실판매 라인 합 — 판촉(promoted) 라인 제외. 카테고리 카드·사무실·샘플 풀 합계와 같은 기준.
  warehouse: number
  available: number
  // 판촉 라인 합(창고·가용). 판촉 라인이 없으면 null.
  promoted: { warehouse: number; available: number } | null
}

/**
 * 홈 요약 밴드 "창고 재고·가용 재고" 합계(하드웨어 라운드 3 H-10). 예전 밴드는 서버 totals(판촉 포함)를 그대로 써서
 * 판촉 라인의 원장 이상(예: STD1(promoted) −16)이 실판매 헤드라인을 깎았다 — 카드는 판촉을 따로 세는데 밴드만 달랐다.
 */
export function summarizeStockTotals(rows: readonly StockTotalsRow[]): StockTotalsSummary {
  let warehouse = 0
  let available = 0
  let promotedWarehouse = 0
  let promotedAvailable = 0
  let hasPromoted = false
  for (const row of rows) {
    if (isPromotedProduct(row.product)) {
      hasPromoted = true
      promotedWarehouse += row.warehouseStock
      promotedAvailable += row.availableStock
    } else {
      warehouse += row.warehouseStock
      available += row.availableStock
    }
  }
  return {
    warehouse,
    available,
    promoted: hasPromoted ? { warehouse: promotedWarehouse, available: promotedAvailable } : null,
  }
}

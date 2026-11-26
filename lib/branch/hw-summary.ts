// KR Team HW 재고 요약 — GET /api/admin/branch/hw 응답 계약(브라우저 안전).
// 출고 = 최근 30일 실제 출고(예정 제외), 재고 = 창고 실재고(입고 − 완료 출고), 예정 = 출고 예정(아직 창고에 있음),
// 가용 = 재고 − 예정. 원천은 입출고 원장(hardware_movements, 하드웨어 콘솔과 같은 수치) — 원장이 없을 때만 시트 스테이징.

export interface BranchHwStockRow {
  product: string
  /** 실재고(창고): 입고 − 완료 출고 */
  io_stock: number
  /** 최근 30일 실제 출고(예정 제외) */
  outbound_30d: number
  /** 출고 예정(아직 창고에 있음) */
  planned_out: number
  /** 가용 재고: 실재고 − 출고 예정 */
  available_stock: number
  sheet_stock: number
  low: boolean
}

export interface BranchHwTotals {
  outbound_30d: number
  io_stock: number
  planned_out: number
  available_stock: number
  low_items: number
}

export interface BranchHwResponse {
  stock: BranchHwStockRow[]
  /** 주요 품목 합계(이전 캐시에는 없을 수 있음 — 그때는 stock에서 다시 더한다) */
  totals?: BranchHwTotals
  recent_installs?: Array<{ customer: string; quantity: number; date: string | null }>
  source?: "ledger" | "sheet_staging"
}

export function hwTotalsOf(data: Pick<BranchHwResponse, "stock" | "totals">): BranchHwTotals {
  if (data.totals) return data.totals
  return data.stock.reduce<BranchHwTotals>(
    (acc, row) => ({
      outbound_30d: acc.outbound_30d + (row.outbound_30d ?? 0),
      io_stock: acc.io_stock + row.io_stock,
      planned_out: acc.planned_out + row.planned_out,
      available_stock: acc.available_stock + row.available_stock,
      low_items: acc.low_items + (row.low ? 1 : 0),
    }),
    { outbound_30d: 0, io_stock: 0, planned_out: 0, available_stock: 0, low_items: 0 },
  )
}

/** 실제로 쓰는 품목(재고·출고·예정 중 하나라도 있음) 가운데 부족 — 원장에 없는 품목의 '부족'은 빼고 센다. */
export function hwActiveLowCount(data: Pick<BranchHwResponse, "stock">): number {
  return data.stock.filter((row) => row.low && (row.io_stock > 0 || row.planned_out > 0 || (row.outbound_30d ?? 0) > 0)).length
}

/** "HW 출고 12 · 재고 34 · 예정 5" — 장부 머리 칩 문구 */
export function hwChipLabel(totals: BranchHwTotals): string {
  return `HW 출고 ${totals.outbound_30d} · 재고 ${totals.io_stock} · 예정 ${totals.planned_out}`
}

/** 칩 title — 기준과 품목별 내역 */
export function hwChipTitle(data: Pick<BranchHwResponse, "stock" | "totals" | "source">): string {
  const totals = hwTotalsOf(data)
  const rows = data.stock
    .filter((row) => row.outbound_30d || row.io_stock || row.planned_out)
    .map((row) => `${row.product} 출고 ${row.outbound_30d} · 재고 ${row.io_stock} · 예정 ${row.planned_out}${row.low ? " (부족)" : ""}`)
  return [
    `최근 30일 출고 ${totals.outbound_30d}대 · 창고 재고 ${totals.io_stock}대 · 출고 예정 ${totals.planned_out}대 · 가용 ${totals.available_stock}대${totals.low_items ? ` · 부족 ${totals.low_items}품목` : ""}`,
    ...rows,
    data.source === "sheet_staging" ? "원천: 시트 스테이징(원장 미구축)" : "원천: 입출고 원장(하드웨어 콘솔과 같은 수치)",
    "누르면 하드웨어 재고 콘솔",
  ].join("\n")
}

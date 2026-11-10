import { HOME_STOCK_BOTTOM_RANK, homeStockRank } from "@/lib/hardware/product"

import type { HardwareStockRow } from "./shared"

export interface HomeRecordDraft {
  preset: "inbound" | "sale" | "planned"
  itemId: string
  quantity: string
  customer: string
  source: string
  date: string
  memo: string
}

export function previewHomeRecord(row: HardwareStockRow, preset: HomeRecordDraft["preset"], quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return null
  const delta = preset === "inbound" ? quantity : -quantity
  return {
    warehouse: row.warehouseStock + (preset === "planned" ? 0 : delta),
    available: row.availableStock + delta,
    planned: row.plannedOut + (preset === "planned" ? quantity : 0),
  }
}

export function filterHomeStock(rows: readonly HardwareStockRow[], query: string, needsAttention: boolean, plannedOnly: boolean) {
  const needle = query.trim().toLocaleLowerCase("ko-KR")
  return rows.filter(row => (!needle || `${row.product} ${row.category ?? ""}`.toLocaleLowerCase("ko-KR").includes(needle))
    && (!needsAttention || row.low || row.orderRecommended)
    && (!plannedOnly || row.plannedOut > 0 || (row.unallocatedPlannedOut ?? 0) > 0))
}

/**
 * 홈 재고표 행 순서 — 86" · 75" · T1 이 위, 110" 은 맨 아래, 나머지는 접어 둔다(homeStockRank).
 * showHidden 이면 접어 둔 품목을 주력 품목과 110" 사이에 펼친다(110" 은 늘 맨 아래). 검색어가 있으면 호출부가
 * showHidden 을 켠다 — 찾는 품목이 접혀서 안 보이면 안 된다.
 */
export function orderHomeStock<T extends Pick<HardwareStockRow, "product">>(rows: readonly T[], showHidden: boolean) {
  const ranked = rows.map((row, index) => ({ row, index, rank: homeStockRank(row.product) }))
  const byRank = (a: { rank: number | null; index: number }, b: { rank: number | null; index: number }) =>
    (a.rank ?? 0) - (b.rank ?? 0) || a.index - b.index
  const main = ranked.filter((entry) => entry.rank != null && entry.rank < HOME_STOCK_BOTTOM_RANK).sort(byRank)
  const bottom = ranked.filter((entry) => entry.rank === HOME_STOCK_BOTTOM_RANK)
  const hidden = ranked.filter((entry) => entry.rank == null)
  return {
    rows: [...main, ...(showHidden ? hidden : []), ...bottom].map((entry) => entry.row),
    hiddenCount: hidden.length,
  }
}

/** 요약 밴드용 86" · 75" 합계(판촉 라인 제외). 같은 크기 품목이 여럿이면 더한다. */
export function coreBoardTotals(rows: readonly HardwareStockRow[]) {
  const pick = (rank: number) => {
    const matched = rows.filter((row) => homeStockRank(row.product) === rank)
    return {
      present: matched.length > 0,
      warehouse: matched.reduce((sum, row) => sum + row.warehouseStock, 0),
      available: matched.reduce((sum, row) => sum + row.availableStock, 0),
      unallocated: matched.reduce((sum, row) => sum + (row.unallocatedPlannedOut ?? 0), 0),
    }
  }
  return { ifp86: pick(0), ifp75: pick(1) }
}

function csvLabel(value: string) {
  // 품목·분류 문자열이 스프레드시트 수식으로 실행되지 않게 한다.
  const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function buildHardwareStockCsv(rows: readonly HardwareStockRow[]) {
  return "\uFEFF" + ["품목,분류,창고,예정,가용,최소재고", ...rows.map(row => [
    csvLabel(row.product), csvLabel(row.category ?? ""), row.warehouseStock, row.plannedOut, row.availableStock, row.reorderPoint,
  ].join(","))].join("\r\n")
}

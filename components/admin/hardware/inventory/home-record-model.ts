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
    && (!plannedOnly || row.plannedOut > 0))
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

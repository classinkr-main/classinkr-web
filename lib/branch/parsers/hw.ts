import type { CellFormat, FormattedCell } from "@/lib/branch/google-sheets"
import { FISCAL_MONTH_ORDER } from "@/lib/branch/fiscal"

export const HW_RANGES = {
  sales:    "판매대시보드!A1:Z100",
  stock:    "재고현황!A1:Z200",
  inbound:  "'2.입고 현황'!A1:Z500",
  outbound: "'3.출고 현황'!A1:Z500",
} as const

const s = (v: unknown) => { if (v == null) return null; const t = String(v).trim(); return t.length ? t : null }
const n = (v: unknown) => {
  if (v == null || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const cleaned = String(v).replace(/[¥₩$€£,\s]/g, "")
  if (cleaned === "" || cleaned === "-") return null
  const x = Number(cleaned)
  return Number.isFinite(x) ? x : null
}
const date = (v: unknown) => {
  const t = s(v); if (!t) return null
  const m = t.match(/^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}` : null
}
const arr = (v: unknown): string[] => { const t = s(v); return t ? t.split(/[,;\s]+/).filter(Boolean) : [] }
const rawValues = (row: FormattedCell[]) => row.map((c) => c?.value ?? null)
const isPlannedOutboundBg = (bg: CellFormat | null | undefined): boolean => {
  if (!bg) return false
  const red = bg.red ?? 1
  const green = bg.green ?? 1
  const blue = bg.blue ?? 1
  // The sheet uses a muted pink/lavender fill for 예정 rows, not pure red.
  return red >= 0.8 && green < 0.75 && blue < 0.85
}

export interface HwInboundParsed { logistics_no: string|null; inbound_date: string|null; product: string; quantity: number; unit_price: number|null; amount: number|null; serials: string[]; storage: string|null; importer: string|null; remarks: string|null; raw: unknown }
export interface HwOutboundParsed { logistics_no: string|null; outbound_date: string|null; owner: string|null; product: string; quantity: number; revenue: number|null; destination: string|null; serials: string[]; progress: string|null; type: string|null; remarks: string|null; raw: unknown }
export interface HwStockParsed { product: string; category: string|null; quantity: number; raw: unknown }
export interface HwSalesMonthlyParsed { fiscal_year: number; fiscal_month: number; product: string; quantity: number; raw: unknown }

export function parseInbound(grid: FormattedCell[][]): HwInboundParsed[] {
  const out: HwInboundParsed[] = []
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const product = s(row[2]?.value); if (!product) continue
    out.push({
      logistics_no: s(row[0]?.value), inbound_date: date(row[1]?.value),
      product, quantity: n(row[3]?.value) ?? 0,
      unit_price: n(row[4]?.value), amount: n(row[5]?.value),
      serials: arr(row[7]?.value), storage: s(row[8]?.value),
      importer: s(row[9]?.value), remarks: s(row[10]?.value),
      raw: rawValues(row),
    })
  }
  return out
}

export function parseOutbound(grid: FormattedCell[][]): HwOutboundParsed[] {
  const out: HwOutboundParsed[] = []
  let lastDestination: string | null = null
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const product = s(row[3]?.value)
    if (!product) {
      if (row.every((cell) => !s(cell?.value))) lastDestination = null
      continue
    }
    const explicitDestination = s(row[8]?.value)
    const destination = explicitDestination ?? lastDestination
    if (explicitDestination) lastDestination = explicitDestination
    const plannedByColor = isPlannedOutboundBg(row[10]?.bg)
    const progress = s(row[10]?.value) ?? (plannedByColor ? "배송 예정" : null)
    out.push({
      logistics_no: s(row[0]?.value), outbound_date: date(row[1]?.value),
      owner: s(row[2]?.value), product, quantity: n(row[4]?.value) ?? 0,
      revenue: n(row[6]?.value), destination,
      serials: arr(row[9]?.value), progress,
      type: s(row[11]?.value), remarks: s(row[12]?.value),
      raw: {
        values: rawValues(row),
        destination,
        destination_cell_value: explicitDestination,
        destination_filled_from_previous: !explicitDestination && Boolean(destination),
        planned_by_color: plannedByColor,
        progress_cell_bg: row[10]?.bg ?? null,
      },
    })
  }
  return out
}

export function parseStock(grid: FormattedCell[][]): HwStockParsed[] {
  const out: HwStockParsed[] = []
  const header = grid[0] ?? []
  const logisticsHeader = grid[1] ?? []
  const totalCol = header.findIndex((cell) => s(cell?.value) === "합계")
  const firstLogisticsCol = 3
  const lastLogisticsCol = totalCol > firstLogisticsCol ? totalCol : logisticsHeader.length
  const logisticsCols = Array.from({ length: Math.max(0, lastLogisticsCol - firstLogisticsCol) }, (_, i) => {
    const col = firstLogisticsCol + i
    return { col, label: s(logisticsHeader[col]?.value) ?? `col_${col + 1}` }
  }).filter((entry) => entry.label)

  type StockAccumulator = { category: string | null; total: number; byLogistics: Record<string, number> }
  const inbound = new Map<string, StockAccumulator>()
  const outbound = new Map<string, StockAccumulator>()
  const ensure = (map: Map<string, StockAccumulator>, product: string, category: string | null) => {
    const current = map.get(product)
    if (current) {
      if (!current.category && category) current.category = category
      return current
    }
    const next: StockAccumulator = { category, total: 0, byLogistics: {} }
    map.set(product, next)
    return next
  }
  const sectionTotal = (row: FormattedCell[]) => {
    if (totalCol >= 0) {
      const total = n(row[totalCol]?.value)
      if (total != null) return total
    }
    return logisticsCols.reduce((sum, entry) => sum + (n(row[entry.col]?.value) ?? 0), 0)
  }

  let mode: "inbound" | "outbound" | "stock" | null = null
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? []
    const label = s(row[0]?.value)
    if (label?.includes("입고")) mode = "inbound"
    else if (label?.includes("출고")) mode = "outbound"
    else if (label?.includes("재고")) mode = "stock"

    const product = s(row[1]?.value); if (!product) continue
    if (product === "제품명" || product.toLowerCase() === "product") continue
    const category = s(row[2]?.value)

    if (mode === "inbound" || mode === "outbound") {
      const acc = ensure(mode === "inbound" ? inbound : outbound, product, category)
      acc.total += sectionTotal(row)
      for (const entry of logisticsCols) {
        acc.byLogistics[entry.label] = (acc.byLogistics[entry.label] ?? 0) + (n(row[entry.col]?.value) ?? 0)
      }
      continue
    }

    if (mode === "stock") {
      const qty = sectionTotal(row)
      if (qty === 0) continue
      out.push({ product, category, quantity: qty, raw: rawValues(row) })
    }
  }

  for (const product of new Set([...inbound.keys(), ...outbound.keys()])) {
    const inRow = inbound.get(product)
    const outRow = outbound.get(product)
    const byLogistics: Record<string, { inbound: number; outbound: number; stock: number }> = {}
    for (const label of new Set([...Object.keys(inRow?.byLogistics ?? {}), ...Object.keys(outRow?.byLogistics ?? {})])) {
      const inboundQty = inRow?.byLogistics[label] ?? 0
      const outboundQty = outRow?.byLogistics[label] ?? 0
      byLogistics[label] = { inbound: inboundQty, outbound: outboundQty, stock: inboundQty - outboundQty }
    }
    out.push({
      product,
      category: inRow?.category ?? outRow?.category ?? null,
      quantity: (inRow?.total ?? 0) - (outRow?.total ?? 0),
      raw: {
        source: "재고현황",
        inbound_total: inRow?.total ?? 0,
        outbound_total: outRow?.total ?? 0,
        by_logistics: byLogistics,
      },
    })
  }
  return out
}

export function parseSalesMonthly(grid: FormattedCell[][], refFy: number): HwSalesMonthlyParsed[] {
  if (grid.length === 0) return []
  const out: HwSalesMonthlyParsed[] = []
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const product = s(row[0]?.value); if (!product) continue
    for (let c = 1; c < Math.min(13, row.length); c++) {
      const month = FISCAL_MONTH_ORDER[c - 1]
      const qty = n(row[c]?.value) ?? 0
      out.push({ fiscal_year: refFy, fiscal_month: month, product, quantity: qty, raw: { value: row[c]?.value ?? null } })
    }
  }
  return out
}

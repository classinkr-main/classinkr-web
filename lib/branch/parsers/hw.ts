import type { FormattedCell } from "@/lib/branch/google-sheets"
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
  const m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}` : null
}
const arr = (v: unknown): string[] => { const t = s(v); return t ? t.split(/[,;\s]+/).filter(Boolean) : [] }

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
      serials: arr(row[6]?.value), storage: s(row[7]?.value),
      importer: s(row[8]?.value), remarks: s(row[9]?.value),
      raw: row.map((c) => c?.value ?? null),
    })
  }
  return out
}

export function parseOutbound(grid: FormattedCell[][]): HwOutboundParsed[] {
  const out: HwOutboundParsed[] = []
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const product = s(row[3]?.value); if (!product) continue
    out.push({
      logistics_no: s(row[0]?.value), outbound_date: date(row[1]?.value),
      owner: s(row[2]?.value), product, quantity: n(row[4]?.value) ?? 0,
      revenue: n(row[5]?.value), destination: s(row[6]?.value),
      serials: arr(row[7]?.value), progress: s(row[8]?.value),
      type: s(row[9]?.value), remarks: s(row[10]?.value),
      raw: row.map((c) => c?.value ?? null),
    })
  }
  return out
}

export function parseStock(grid: FormattedCell[][]): HwStockParsed[] {
  const out: HwStockParsed[] = []
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? []
    const product = s(row[0]?.value); if (!product) continue
    // Skip header bands (where col B is non-numeric label like "카테고리")
    const qtyRaw = row[2]?.value
    const qty = n(qtyRaw)
    if (qty == null) continue   // requires a real number in qty column
    if (product.includes("재고") && product.includes("현황")) continue
    if (product.toLowerCase() === "product" || product === "제품명") continue
    out.push({ product, category: s(row[1]?.value), quantity: qty, raw: row.map((c) => c?.value ?? null) })
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

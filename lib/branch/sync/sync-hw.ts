import "server-only"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { HW_RANGES, parseInbound, parseOutbound, parseStock, parseSalesMonthly } from "@/lib/branch/parsers/hw"
import { replaceHwInbound, replaceHwOutbound, replaceHwStock, replaceHwSalesMonthly } from "@/lib/repositories/branch-hw"
import { fyOf } from "@/lib/branch/fiscal"

export async function syncHw(): Promise<{ inbound: number; outbound: number; stock: number; sales: number }> {
  const sheetId = envSheetId("hardware")
  const refFy = fyOf(new Date())
  const [inboundGrid, outboundGrid, stockGrid, salesGrid] = await Promise.all([
    readRangeWithFormat(sheetId, HW_RANGES.inbound),
    readRangeWithFormat(sheetId, HW_RANGES.outbound),
    readRangeWithFormat(sheetId, HW_RANGES.stock),
    readRangeWithFormat(sheetId, HW_RANGES.sales),
  ])
  const inbound = parseInbound(inboundGrid).map((p) => ({
    ...p,
    quantity: String(p.quantity),
    unit_price: p.unit_price == null ? "" : String(p.unit_price),
    amount: p.amount == null ? "" : String(p.amount),
  }))
  const outbound = parseOutbound(outboundGrid).map((p) => ({
    ...p, quantity: String(p.quantity),
    revenue: p.revenue == null ? "" : String(p.revenue),
  }))
  const stock = parseStock(stockGrid).map((p) => ({ ...p, quantity: String(p.quantity) }))
  const sales = parseSalesMonthly(salesGrid, refFy).map((p) => ({ ...p, quantity: String(p.quantity), fiscal_year: String(p.fiscal_year), fiscal_month: String(p.fiscal_month) }))
  const [iN, oN, sN, mN] = await Promise.all([
    replaceHwInbound(inbound), replaceHwOutbound(outbound),
    replaceHwStock(stock), replaceHwSalesMonthly(sales),
  ])
  return { inbound: iN, outbound: oN, stock: sN, sales: mN }
}

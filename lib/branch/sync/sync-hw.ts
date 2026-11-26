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
  // 입고·출고 원장은 비는 일이 없다 — 0행이면 빈 시트/열 이동으로 보고 replace(truncate+insert)를 막는다.
  // 검증은 네 replace 보다 앞이라, 파싱 이상이 일부 테이블만 교체된 상태를 만들지 않는다.
  const problems: string[] = []
  if (inbound.length === 0) problems.push("입고 0행")
  if (outbound.length === 0) problems.push("출고 0행")
  if (sales.length === 0 && salesGrid.length > 1) problems.push("월별 판매 0행(데이터 행은 있음)")
  if (problems.length > 0) {
    throw new Error(`HW 시트 읽기 이상 — ${problems.join(", ")}. 기존 미러는 건드리지 않았습니다.`)
  }
  const [iN, oN, sN, mN] = await Promise.all([
    replaceHwInbound(inbound), replaceHwOutbound(outbound),
    replaceHwStock(stock), replaceHwSalesMonthly(sales),
  ])
  return { inbound: iN, outbound: oN, stock: sN, sales: mN }
}

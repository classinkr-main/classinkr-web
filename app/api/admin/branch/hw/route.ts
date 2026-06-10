import { NextRequest, NextResponse } from "next/server"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { listHwInbound, listHwOutbound, listHwStock, listHwSalesMonthly } from "@/lib/repositories/branch-hw"

const HW_PATTERNS: Array<{ key: string; match: RegExp; threshold: number; thresholdSheet: number }> = [
  { key: "IFP86",  match: /86[""]?\s*IFP/i, threshold: 2, thresholdSheet: 5 },
  { key: "IFP75",  match: /75[""]?\s*IFP/i, threshold: 2, thresholdSheet: 5 },
  { key: "IFP65",  match: /65[""]?\s*IFP/i, threshold: 1, thresholdSheet: 3 },
  { key: "T1",     match: /\bT1\b/i, threshold: 2, thresholdSheet: 5 },
  { key: "S1",     match: /\bS1\b/i, threshold: 2, thresholdSheet: 5 },
  { key: "STD1",   match: /\bSTD1\b/i, threshold: 2, thresholdSheet: 5 },
  { key: "OPS",    match: /\bOPS\b/i, threshold: 5, thresholdSheet: 5 },
]

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES); if (err) return err
  try {
    const [inbound, outbound, stock, sales] = await Promise.all([
      listHwInbound(), listHwOutbound(), listHwStock(), listHwSalesMonthly(),
    ])
    // 출고 시트의 "예정" 행(배송 예정 등)은 아직 창고에 있는 물량이다.
    // 실재고(장부) = 입고 − 완료된 출고, 가용 재고 = 실재고 − 출고 예정.
    const isPlannedOutbound = (progress: string | null) => (progress ?? "").includes("예정")
    const stockByPattern = HW_PATTERNS.map((p) => {
      const inboundRows = inbound.filter((r) => p.match.test(r.product))
      const outboundRows = outbound.filter((r) => p.match.test(r.product))
      const inSum = inboundRows.reduce((s, r) => s + r.quantity, 0)
      const outSum = outboundRows.filter((r) => !isPlannedOutbound(r.progress)).reduce((s, r) => s + r.quantity, 0)
      const plannedOut = outboundRows.filter((r) => isPlannedOutbound(r.progress)).reduce((s, r) => s + r.quantity, 0)
      const fromIO = inSum - outSum
      const available = fromIO - plannedOut
      const fromSheet = stock.filter((r) => p.match.test(r.product)).reduce((s, r) => s + r.quantity, 0)
      const hasIoLedger = inboundRows.length > 0 || outboundRows.length > 0
      return {
        product: p.key,
        io_stock: fromIO,
        planned_out: plannedOut,
        available_stock: available,
        sheet_stock: fromSheet,
        low: (hasIoLedger && available <= p.threshold) || fromSheet <= p.thresholdSheet,
      }
    })
    const progress = outbound.reduce<Record<string, number>>((acc, r) => {
      const k = r.progress ?? "미정"
      acc[k] = (acc[k] ?? 0) + r.quantity
      return acc
    }, {})
    const installRows = outbound.filter((r) => (r.progress ?? "").includes("설치"))
    const byCustomer = new Map<string, { quantity: number; latest: string | null }>()
    for (const r of installRows) {
      const customer = (r.destination ?? "").trim()
      if (!customer) continue
      const cur = byCustomer.get(customer) ?? { quantity: 0, latest: null }
      cur.quantity += r.quantity
      if (r.outbound_date && (!cur.latest || r.outbound_date > cur.latest)) cur.latest = r.outbound_date
      byCustomer.set(customer, cur)
    }
    const recent_installs = Array.from(byCustomer.entries())
      .map(([customer, v]) => ({ customer, quantity: v.quantity, date: v.latest }))
      .sort((a, b) => {
        if (a.date && b.date) return b.date.localeCompare(a.date)
        if (a.date) return -1
        if (b.date) return 1
        return b.quantity - a.quantity
      })
      .slice(0, 8)
    return NextResponse.json({ stock: stockByPattern, sales_monthly: sales, progress, recent_installs })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

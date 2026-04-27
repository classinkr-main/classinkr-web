import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { listHwInbound, listHwOutbound, listHwStock, listHwSalesMonthly } from "@/lib/repositories/branch-hw"

const HW_PATTERNS: Array<{ key: string; match: RegExp; threshold: number; thresholdSheet: number }> = [
  { key: "IFP86",  match: /86[""]?\s*IFP/i, threshold: 2, thresholdSheet: 5 },
  { key: "IFP75",  match: /75[""]?\s*IFP/i, threshold: 2, thresholdSheet: 5 },
  { key: "CAM_T1", match: /T1\s*카메라|카메라\s*T1/i, threshold: 2, thresholdSheet: 5 },
  { key: "CAM_S1", match: /S1\s*카메라|카메라\s*S1/i, threshold: 2, thresholdSheet: 5 },
  { key: "OPS",    match: /\bOPS\b/i, threshold: 5, thresholdSheet: 5 },
]

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  try {
    const [inbound, outbound, stock, sales] = await Promise.all([
      listHwInbound(), listHwOutbound(), listHwStock(), listHwSalesMonthly(),
    ])
    const stockByPattern = HW_PATTERNS.map((p) => {
      const inSum = inbound.filter((r) => p.match.test(r.product)).reduce((s, r) => s + r.quantity, 0)
      const outSum = outbound.filter((r) => p.match.test(r.product)).reduce((s, r) => s + r.quantity, 0)
      const fromIO = inSum - outSum
      const fromSheet = stock.filter((r) => p.match.test(r.product)).reduce((s, r) => s + r.quantity, 0)
      return { product: p.key, io_stock: fromIO, sheet_stock: fromSheet, low: fromIO <= p.threshold || fromSheet <= p.thresholdSheet }
    })
    const progress = outbound.reduce<Record<string, number>>((acc, r) => {
      const k = r.progress ?? "미정"
      acc[k] = (acc[k] ?? 0) + r.quantity
      return acc
    }, {})
    return NextResponse.json({ stock: stockByPattern, sales_monthly: sales, progress })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

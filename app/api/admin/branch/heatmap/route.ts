import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { computeHeatmap } from "@/lib/branch/computations/heatmap"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const team = url.searchParams.get("team") ?? "ALL"
  const period = (url.searchParams.get("period") ?? "Q") as "M"|"Q"|"Y"
  try {
    const deals = await listBranchRevDeals()
    const rows = computeHeatmap(deals, period, new Date(), team)
    return NextResponse.json({ rows })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

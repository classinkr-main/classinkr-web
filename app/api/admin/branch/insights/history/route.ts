import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { listInsightHistory } from "@/lib/repositories/branch-insights"
import type { TeamScope } from "@/lib/branch/insights/input-builder"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const team = (url.searchParams.get("team") ?? "ALL") as TeamScope
  const limitRaw = Number(url.searchParams.get("limit") ?? "10")
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50 ? Math.floor(limitRaw) : 10
  try {
    const items = await listInsightHistory(team, limit)
    return NextResponse.json({
      items: items.map((i) => ({
        id: i.id,
        generated_at: i.generated_at,
        one_liner: i.one_liner,
        next_actions: i.next_actions,
        fiscal_period: i.fiscal_period,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

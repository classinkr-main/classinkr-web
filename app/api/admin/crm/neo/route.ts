import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getNeoCrmTeamReport, type NeoCrmGranularity } from "@/lib/admin-crm-neo"

const MAX_OFFSET_BACK = 60
const GRANULARITIES: NeoCrmGranularity[] = ["week", "month", "quarter", "year"]

function parseGranularity(value: string | null): NeoCrmGranularity {
  return GRANULARITIES.includes(value as NeoCrmGranularity) ? (value as NeoCrmGranularity) : "month"
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const { searchParams } = new URL(req.url)
  const granularity = parseGranularity(searchParams.get("granularity"))
  const rawOffset = Number(searchParams.get("offset") ?? "0")
  const offset = Number.isFinite(rawOffset) ? Math.max(-MAX_OFFSET_BACK, Math.min(0, Math.trunc(rawOffset))) : 0
  const force = searchParams.has("force")

  try {
    const report = await getNeoCrmTeamReport({ granularity, offset, force })
    const response = NextResponse.json(report)
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120")
    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/neo]", error)
    return NextResponse.json({ error: "Failed to load Neo CRM team report" }, { status: 500 })
  }
}

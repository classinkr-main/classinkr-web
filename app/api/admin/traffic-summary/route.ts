import { type NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCachedTrafficSummary } from "@/lib/admin/traffic-summary"
import { parseVisitorStatsRange } from "@/lib/admin-visitor-stats"

// 집계 본체·캐시는 lib/admin/traffic-summary.ts — 홈 MCP(site_traffic)도 같은 값을 쓴다.
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const rangeDays = parseVisitorStatsRange(req.nextUrl.searchParams.get("range"))

  try {
    return adminCachedJson(await getCachedTrafficSummary(rangeDays))
  } catch (error) {
    console.error("[GET /api/admin/traffic-summary]", error)
    return NextResponse.json({ error: "Failed to fetch traffic summary" }, { status: 500 })
  }
}

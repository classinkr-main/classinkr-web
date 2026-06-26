import { type NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import {
  getAdminVisitorStats,
  parseVisitorStatsRange,
} from "@/lib/admin-visitor-stats"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const rangeDays = parseVisitorStatsRange(req.nextUrl.searchParams.get("range"))

  try {
    const stats = await getAdminVisitorStats(rangeDays)
    const response = NextResponse.json(stats)
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120")
    return response
  } catch (error) {
    console.error("[GET /api/admin/visitor-stats]", error)
    return NextResponse.json(
      { error: "Failed to fetch visitor stats" },
      { status: 500 }
    )
  }
}

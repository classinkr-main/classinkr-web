import { type NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getLeadMagnetMetrics } from "@/lib/repositories/lead-magnet-metrics"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const parsedDays = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10)
  const days = Number.isFinite(parsedDays) && parsedDays > 0 && parsedDays <= 90
    ? parsedDays
    : 30

  const metrics = await getLeadMagnetMetrics(days)
  const response = NextResponse.json(metrics)
  response.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=180")
  return response
}

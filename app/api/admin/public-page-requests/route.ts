import { type NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getPublicPageRequests } from "@/lib/admin/public-page-requests"
import { parseVisitorStatsRange } from "@/lib/admin-visitor-stats"

// 운영 Vercel의 조회가 느려도 기존 동의 기반 방문자 통계는 지연시키지 않는다.
export const maxDuration = 40

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  const range = parseVisitorStatsRange(req.nextUrl.searchParams.get("range"))
  const stats = await getPublicPageRequests(range)
  if (!stats) return NextResponse.json({ error: "Page request metrics unavailable" }, { status: 503 })
  return NextResponse.json(stats, { headers: { "Cache-Control": "private, no-store" } })
}

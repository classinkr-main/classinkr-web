import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  fetchCsInquiryDashboard,
  type CsDashboardPeriod,
} from "@/lib/cs/inquiry-dashboard"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const searchParams = req.nextUrl.searchParams
  const rawPeriod = searchParams.get("period")
  const period: CsDashboardPeriod =
    rawPeriod === "today" ||
    rawPeriod === "7d" ||
    rawPeriod === "30d" ||
    rawPeriod === "90d" ||
    rawPeriod === "all"
      ? rawPeriod
      : "7d"

  try {
    const data = await fetchCsInquiryDashboard({ period })
    return adminCachedJson(data)
  } catch (error) {
    console.error("[GET /api/admin/cs/dashboard] error:", error)
    return NextResponse.json(
      { error: "CS 문의 대시보드 데이터를 조회하지 못했습니다." },
      { status: 500 }
    )
  }
}

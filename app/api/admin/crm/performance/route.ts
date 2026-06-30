import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCrmRevenuePerformance } from "@/lib/crm/revenue-performance"

// 현황 성과 분석 — CRM 매출 데이터(rev 딜)를 팀/개인/월로 집계. deals 탭과 독립.
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const months = Number(new URL(req.url).searchParams.get("months") ?? 6)
    return adminCachedJson(await getCrmRevenuePerformance(months))
  } catch (error) {
    console.error("[GET /api/admin/crm/performance]", error)
    return NextResponse.json({ error: "Failed to load CRM revenue performance" }, { status: 500 })
  }
}

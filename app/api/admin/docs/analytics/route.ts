import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getAdminDocsAnalytics } from "@/lib/admin-docs"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const result = await getAdminDocsAnalytics(req.nextUrl.searchParams.get("days"))
    return adminCachedJson(result)
  } catch (error) {
    console.error("[GET /api/admin/docs/analytics] error:", error)
    return NextResponse.json(
      { error: "문서 분석 데이터를 조회하지 못했습니다." },
      { status: 500 }
    )
  }
}

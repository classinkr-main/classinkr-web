import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { getInternalCsMetrics } from "@/lib/internal-cs-chat/metrics"
import { isInternalCsChatNotReadyError } from "@/lib/repositories/internal-cs-chat"

// 운영 계기판(계약 1) — tools 탭 지표 카드 행이 소비한다. 인증 가드는 기존 cs-chat 라우트와 동일.
// 마이그레이션 미적용/빈 데이터는 repo 가 빈 집계로 흡수하므로 0/None shape 로 200 응답한다.
const ALLOWED_DAYS = new Set([7, 30])

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const requestedDays = Number(req.nextUrl.searchParams.get("days"))
  const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : 7

  try {
    const metrics = await getInternalCsMetrics(days)
    return adminCachedJson(metrics)
  } catch (error) {
    console.error("[GET /api/admin/cs-chat/metrics]", error)
    if (isInternalCsChatNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to load internal CS metrics" }, { status: 500 })
  }
}

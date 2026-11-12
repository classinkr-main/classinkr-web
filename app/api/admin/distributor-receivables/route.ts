import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  listDistributorReceivables,
  listDistributorSettlementReviews,
} from "@/lib/repositories/distributor-settlements"

// 총판 미수금(2026-10-23) — 발행된 총판 견적서 중 아직 다 받지 못한 건.
//
// GET ?includePaid=1 — 입금 완료 건까지. { available, warning, receivables[], reviews[] }.
//     reviews = 검토 대기(발행 전 + 검토 사유 있음 — 설치 완료 자동 준비·자동 발행 보류).
//     표 미적용이면 200 available:false.

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const includePaid = req.nextUrl.searchParams.get("includePaid") === "1"
    const [read, reviews] = await Promise.all([
      listDistributorReceivables({ includePaid }),
      listDistributorSettlementReviews(),
    ])
    return NextResponse.json(
      { available: read.available, warning: read.warning, receivables: read.value ?? [], reviews: reviews.value ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("[GET /api/admin/distributor-receivables]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "총판 미수금을 불러오지 못했습니다." }, { status: 500 })
  }
}

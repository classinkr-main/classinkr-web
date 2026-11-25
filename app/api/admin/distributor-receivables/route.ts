import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  listDistributorReceivablePayments,
  listDistributorReceivables,
  listDistributorSettlementReviews,
} from "@/lib/repositories/distributor-settlements"

// 총판 미수금(2026-10-23) — 발행된 총판 견적서 중 아직 다 받지 못한 건.
//
// GET ?includePaid=1 — 입금 완료 건까지. { available, warning, receivables[], reviews[], payments[], truncated }.
//     reviews = 검토 대기(발행 전 + 검토 사유 있음 — 설치 완료 자동 준비·자동 발행 보류).
//     payments = receivables 각 건의 입금 요약 [{ settlementId, amount, paidOn }](메모·기록자 없음).
//     truncated = 미수/완납 조회 중 하나가 행 수 한도에 닿아 일부를 읽지 못했다.
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
    const receivables = read.value ?? []
    const payments = read.available ? await listDistributorReceivablePayments(receivables.map((row) => row.id)) : []
    return NextResponse.json(
      {
        available: read.available,
        warning: read.warning,
        receivables,
        reviews: reviews.value ?? [],
        payments,
        truncated: read.available ? read.truncated : false,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("[GET /api/admin/distributor-receivables]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "총판 미수금을 불러오지 못했습니다." }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { QUAD_PARTNER_KEY, summarizePartnerSettlement } from "@/lib/partner-settlement"
import { getPartnerSettlementSnapshot } from "@/lib/repositories/partner-settlement-snapshot"

// 쿼드러닝 정산 스냅샷(2026-11-23) — 견적·문서 › 총판 미수금 위쪽 보드와 Overview 카드.
//
// GET            { available, warning, snapshot, updatedAt } — snapshot 은 보드 전체 데이터(없으면 null).
// GET ?summary=1 { available, warning, summary } — 청구·쿼드 이체·고객 카드·잔액·스냅샷 시각만.
//     표 미적용이면 200 available:false. 행 없음·모양 다름은 snapshot/summary null.

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const read = await getPartnerSettlementSnapshot(QUAD_PARTNER_KEY)
    const headers = { "Cache-Control": "no-store" }
    if (req.nextUrl.searchParams.get("summary") === "1") {
      return NextResponse.json(
        {
          available: read.available,
          warning: read.warning,
          summary: read.value ? summarizePartnerSettlement(read.value.snapshot) : null,
        },
        { headers }
      )
    }
    return NextResponse.json(
      {
        available: read.available,
        warning: read.warning,
        snapshot: read.value?.snapshot ?? null,
        updatedAt: read.value?.updatedAt ?? null,
      },
      { headers }
    )
  } catch (error) {
    console.error("[GET /api/admin/partner-settlement]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "정산 스냅샷을 불러오지 못했습니다." }, { status: 500 })
  }
}

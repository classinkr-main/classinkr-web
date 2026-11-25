import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { SalesOrderError, sumApprovedOrderUnitsByCustomer } from "@/lib/repositories/sales-orders"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET ?customerId= — 그 고객의 승인된 오더 품목 코드별 누적 수량 { units: { "board-86": 9, ... } }.
 * 견적 작성기의 "누적 대수 구간가" 추천(넛지)용 읽기 전용. 오더 표 미적용이면 200 { units: {} }.
 */
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const customerId = req.nextUrl.searchParams.get("customerId")?.trim() ?? ""
  if (!UUID_RE.test(customerId)) {
    return NextResponse.json({ error: "customerId 가 올바르지 않습니다." }, { status: 400 })
  }

  try {
    const units = await sumApprovedOrderUnitsByCustomer(customerId)
    return NextResponse.json({ units }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof SalesOrderError && error.status === 503) {
      return NextResponse.json({ units: {} }, { headers: { "Cache-Control": "no-store" } })
    }
    console.error("[GET /api/admin/hardware/customer-units]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "고객 누적 구매 대수를 불러오지 못했습니다." }, { status: 500 })
  }
}

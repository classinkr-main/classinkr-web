import { NextRequest, NextResponse } from "next/server"

import { toErrorResponse } from "@/app/api/admin/hardware/_validation"
import {
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  HARDWARE_FINALIZE_CAPABILITY,
  hasAdminCapability,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { listSalesOrders, SalesOrderError, type SalesOrderStatus } from "@/lib/repositories/sales-orders"

const STATUS_FILTERS: Record<string, SalesOrderStatus[] | undefined> = {
  pending: ["pending_approval"],
  approved: ["approved"],
  closed: ["rejected", "cancelled"],
  all: undefined,
}

/**
 * 오더 목록 — 하드웨어 탭의 "하드웨어 승인 대기"가 읽는다. 읽기는 하드웨어 편집 역할 전원,
 * 승인·반려·취소는 [id] 라우트에서 hardware.finalize 로 막는다. viewer.canApprove 는 버튼 표시용이다.
 */
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const filter = req.nextUrl.searchParams.get("status") ?? "pending"
  if (!(filter in STATUS_FILTERS)) {
    return NextResponse.json({ error: "status 는 pending·approved·closed·all 중 하나여야 합니다." }, { status: 400 })
  }

  try {
    const orders = await listSalesOrders({ statuses: STATUS_FILTERS[filter], limit: 100 })
    return NextResponse.json({
      orders,
      viewer: { canApprove: hasAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY) },
    })
  } catch (error) {
    if (error instanceof SalesOrderError) {
      // 마이그레이션 미적용(503)은 화면이 안내로 강등한다.
      return NextResponse.json({ error: error.message, available: error.status !== 503 }, { status: error.status })
    }
    return toErrorResponse(error, "오더 목록을 불러오지 못했습니다.")
  }
}

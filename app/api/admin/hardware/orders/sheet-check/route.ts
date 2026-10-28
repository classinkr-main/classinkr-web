import { NextRequest, NextResponse } from "next/server"

import { toErrorResponse } from "@/app/api/admin/hardware/_validation"
import {
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  HARDWARE_FINALIZE_CAPABILITY,
  hasAdminCapability,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { listSheetOrderChecks, SalesOrderError } from "@/lib/repositories/sales-orders"

/**
 * 시트 확인 필요 — 오더번호 없이(또는 승인 안 된 번호로) 시트에 적힌 고객 출고 줄(연결 로직 §4-4).
 * 과도기에는 시트 출고가 앱 승인을 우회할 수 있어, 이 목록을 이왕찬·지사장이 본다. 읽기 전용.
 */
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const result = await listSheetOrderChecks()
    return NextResponse.json({
      ...result,
      viewer: { canApprove: hasAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY) },
    })
  } catch (error) {
    if (error instanceof SalesOrderError) {
      return NextResponse.json({ error: error.message, available: error.status !== 503 }, { status: error.status })
    }
    return toErrorResponse(error, "시트 확인 목록을 불러오지 못했습니다.")
  }
}

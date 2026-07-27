import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  isInternalCsChatNotReadyError,
  listInternalCsRegressionCandidates,
} from "@/lib/repositories/internal-cs-chat"

// 회귀 검수 후보 목록 (계약 5) — 워크스페이스 판정 패널이 소비한다.
// limit 50, 미판정(not_evaluated) 우선 정렬.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const items = await listInternalCsRegressionCandidates(50)
    return adminCachedJson({ items })
  } catch (error) {
    console.error("[GET /api/admin/cs-chat/regression-candidates]", error)
    if (isInternalCsChatNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to list regression candidates" }, { status: 500 })
  }
}

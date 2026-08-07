import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getHwRevReconcile } from "@/lib/repositories/hw-rev-reconcile"

// 하드웨어 출고 ↔ REV 매출 존재성 대사 — 규칙은 lib/repositories/hw-rev-reconcile.ts 참조.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  // 저장소가 던지면 프레임워크 기본 500이 나가 본문에 { error }가 없다. 클라이언트는
  // 그 응답에서 사유를 못 읽고, 서버 로그에도 경로가 안 남는다. 나머지 CRM 라우트와 형태를 맞춘다.
  try {
    const result = await getHwRevReconcile()
    return adminCachedJson(result)
  } catch (error) {
    console.error("[GET /api/admin/crm/reconcile/hw-rev]", error)
    return NextResponse.json({ error: "Failed to load hardware/REV reconciliation" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getHwRevReconcile } from "@/lib/repositories/hw-rev-reconcile"

// 하드웨어 출고 ↔ REV 매출 존재성 대사 — 규칙은 lib/repositories/hw-rev-reconcile.ts 참조.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const result = await getHwRevReconcile()
  return adminCachedJson(result)
}

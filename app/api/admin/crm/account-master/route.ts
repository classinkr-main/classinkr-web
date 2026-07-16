import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getAccountMaster } from "@/lib/repositories/account-master"

// Account 360 스파인 읽기 뷰 — 확정 링크 기준 계정 목록 + 'needs link' 미연결 REV 계정.
// 자세한 합성 규칙은 lib/repositories/account-master.ts 주석 참조.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const result = await getAccountMaster()
  return adminCachedJson(result)
}

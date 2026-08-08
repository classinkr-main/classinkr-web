import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getAccountMaster } from "@/lib/repositories/account-master"

// Account 360 스파인 읽기 뷰 — 확정 링크 기준 계정 목록 + 'needs link' 미연결 REV 계정.
// 자세한 합성 규칙은 lib/repositories/account-master.ts 주석 참조.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  // 저장소가 던지면 프레임워크 기본 500이 나가 본문에 { error }가 없다. 클라이언트는
  // 그 응답에서 사유를 못 읽어 "불러오지 못했습니다"만 띄우고, 서버 로그에도 경로가 안 남는다.
  // 나머지 CRM 라우트와 같은 형태로 맞춘다.
  try {
    const result = await getAccountMaster()
    return adminCachedJson(result)
  } catch (error) {
    console.error("[GET /api/admin/crm/account-master]", error)
    return NextResponse.json({ error: "Failed to load CRM account master" }, { status: 500 })
  }
}

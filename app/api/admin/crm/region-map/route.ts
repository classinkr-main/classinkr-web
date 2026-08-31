import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCrmRegionMap } from "@/lib/repositories/crm-region-map"

// CRM 지도 탭의 시도 분포 집계. 레이어별 커버리지(분모)를 항상 함께 내려보낸다 —
// 근거는 lib/repositories/crm-region-map.ts 상단 주석 참조.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    return adminCachedJson(await getCrmRegionMap({ force: req.nextUrl.searchParams.has("force") }))
  } catch (error) {
    console.error("[GET /api/admin/crm/region-map]", error)
    return NextResponse.json({ error: "지역 분포를 불러오지 못했습니다." }, { status: 500 })
  }
}

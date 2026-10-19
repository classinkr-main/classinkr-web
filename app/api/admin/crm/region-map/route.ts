import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { isIncompleteRegionMap } from "@/lib/crm/region-map-summary"
import { getCrmRegionMap } from "@/lib/repositories/crm-region-map"

// CRM 지도 탭의 시도 분포 집계. 레이어별 커버리지(분모)를 항상 함께 내려보낸다 —
// 근거는 lib/repositories/crm-region-map.ts 상단 주석 참조.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const map = await getCrmRegionMap({ force: req.nextUrl.searchParams.has("force") })
    // 부분 지도(원천 실패·절단 — "모름"·"부분값" 레이어)는 브라우저 캐시에 두지 않는다. 원천이 돌아와도 캐시
    // 수명 동안 같은 부분 지도가 재사용되지 않게(오늘 연락 isTodayContactsCacheable 과 같은 규약 — 화면도 같은
    // 판정으로 요청 캐시에서 지운다).
    const response = adminCachedJson(map)
    if (isIncompleteRegionMap(map)) response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    console.error("[GET /api/admin/crm/region-map]", error)
    return NextResponse.json({ error: "지역 분포를 불러오지 못했습니다." }, { status: 500 })
  }
}

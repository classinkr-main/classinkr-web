import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getBusinessDateParts } from "@/lib/business-time"
import { getCompassBdOpenCount, getCompassDemos, getCompassUpcomingActions } from "@/lib/compass/bridge"

// CRM 홈 "마케팅 파이프라인(Compass)" 밴드(M7) 전용 집계 — 브리지 뷰 3장을 한 번에 묶는다.
// down이면 무음 실패 금지: 화면은 이 down 플래그로 "Compass 연결 끊김" 한 줄로 강등한다.
const UPCOMING_ACTION_WINDOW_HOURS = 48

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    // 오늘 KST 하루 — business-time.ts가 사내 KST 계약의 단일 진실원.
    const today = getBusinessDateParts().date

    const [demos, upcoming, bdOpen] = await Promise.all([
      getCompassDemos(today, today),
      getCompassUpcomingActions(UPCOMING_ACTION_WINDOW_HOURS),
      getCompassBdOpenCount(),
    ])

    const down = demos.down || upcoming.down || bdOpen.down

    return adminCachedJson({
      down,
      todayDemoCount: demos.rows.length,
      upcomingActionCount: upcoming.rows.length,
      bdOpenCount: bdOpen.count,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[GET /api/admin/crm/compass-pipeline]", error)
    return NextResponse.json({ error: "Failed to fetch Compass pipeline band" }, { status: 500 })
  }
}

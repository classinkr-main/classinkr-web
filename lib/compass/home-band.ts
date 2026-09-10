import "server-only"

import { getBusinessDateParts } from "@/lib/business-time"
import { getCompassBdOpenCount, getCompassDemos, getCompassUpcomingActions } from "@/lib/compass/bridge"

/**
 * CRM 홈 "마케팅 파이프라인(Compass)" 밴드(M7)의 조립 정본.
 *
 * 브리지 뷰 3장을 한 번에 묶는다. down이면 무음 실패 금지 — 화면은 이 플래그로
 * "Compass 연결 끊김" 한 줄로 강등한다.
 *
 * 라우트(GET /api/admin/crm/compass-pipeline)와 서버 프리페치(lib/admin/crm/home-prefetch)가
 * 같은 함수를 부른다. 조립 규칙이 두 곳에 복제되면 첫 화면(HTML)과 새로고침(라우트)이
 * 서로 다른 수치를 낼 수 있다.
 */
const UPCOMING_ACTION_WINDOW_HOURS = 48

export interface CompassPipelineBand {
  down: boolean
  todayDemoCount: number
  upcomingActionCount: number
  bdOpenCount: number
  generatedAt: string
}

export async function buildCompassPipelineBand(): Promise<CompassPipelineBand> {
  // 오늘 KST 하루 — business-time.ts가 사내 KST 계약의 단일 진실원.
  const today = getBusinessDateParts().date

  const [demos, upcoming, bdOpen] = await Promise.all([
    getCompassDemos(today, today),
    getCompassUpcomingActions(UPCOMING_ACTION_WINDOW_HOURS),
    getCompassBdOpenCount(),
  ])

  return {
    down: demos.down || upcoming.down || bdOpen.down,
    todayDemoCount: demos.rows.length,
    upcomingActionCount: upcoming.rows.length,
    bdOpenCount: bdOpen.count,
    generatedAt: new Date().toISOString(),
  }
}

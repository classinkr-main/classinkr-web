import { NextRequest, NextResponse } from "next/server"

import { getEventsByRangeWithDiagnostics, type CalendarEvent } from "@/lib/calendar-data"
import { daysBetween, isDateString } from "@/lib/admin-calendar/range"
import { checkCronAuth } from "@/lib/server/cron-auth"

/**
 * Compass(mkt.classin.co.kr) 전용 읽기 전용 캘린더 피드.
 *
 * Compass 의 calendar-sync 크론(crm lib/adminCal.ts fetchAdminCalendar)이 매시 두 구간
 * (−60~+30일, +31~+90일)을 받아 crm.cal_events_ext 에 미러하고, 미션 달력(/tasks)이 그 표를 그린다.
 *
 * 왜 /api/admin/calendar 를 그냥 못 쓰나: 그쪽은 verifyAdmin → getVerifiedAdminContext 가
 * 어드민 세션 쿠키를 요구한다. 크론에는 세션이 없고, 기계가 어드민 세션을 흉내 내게 만들면
 * 이 앱의 인증 모델이 무너진다. 그래서 전용 Bearer 토큰을 쓴다.
 *
 * CRON_SECRET 을 재사용하지 않는다 — 그 값 하나가 /api/cron/* 전부를 연다. 달력 하나 때문에
 * 그 권한을 넘길 이유가 없고, 나중에 Compass 쪽만 회수할 수도 없어진다. 비교는 checkCronAuth 의
 * timing-safe 판정을 시크릿만 바꿔 쓴다. Compass 는 같은 값을 ADMIN_CALENDAR_TOKEN 으로 보관한다.
 *
 * 소스는 allowlist 다(Compass lib/calSources.ts 의 origin: "admin" 일곱 개와 같다).
 * - compass_demo: 원본이 Compass 자신(compass_cal_events_v)이라 돌려주면 자기가 보낸 것을 되받는다.
 * - team_event: 2026-09-30 부터 Compass 가 팀원 구글 캘린더를 직접 읽고 쓴다(crm.member_cal_events).
 * 빼는 방식이 아니라 일곱 개만 통과시키므로, 어드민에 새 소스가 생겨도 조용히 흘러가지 않는다.
 *
 * 필드도 Compass 가 쓰는 것만 내보낸다 — description·구글 동기화 오류 문구 같은 건 미러에 필요 없다.
 */
export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_RANGE_DAYS = 120

const COMPASS_MIRRORED_SOURCES: ReadonlySet<string> = new Set([
  "calendar",
  "partner",
  "event",
  "notion",
  "showroom",
  "showroom_booking",
  "holiday",
])

function toFeedEvent(e: CalendarEvent) {
  return {
    id: e.id,
    title: e.title,
    date: e.date,
    endDate: e.endDate,
    time: e.time,
    endTime: e.endTime,
    allDay: e.allDay,
    source: e.source,
    sourceLabel: e.sourceLabel,
    assignees: e.assignees,
    href: e.href,
  }
}

export async function GET(req: NextRequest) {
  if (checkCronAuth(req, process.env.COMPASS_CALENDAR_TOKEN) !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const from = req.nextUrl.searchParams.get("from")
  const to = req.nextUrl.searchParams.get("to")
  if (!isDateString(from) || !isDateString(to)) {
    return NextResponse.json({ error: "from/to 는 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 })
  }
  const span = daysBetween(from, to)
  if (span < 0) {
    return NextResponse.json({ error: "from 이 to 보다 뒤일 수 없습니다." }, { status: 400 })
  }
  if (span > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.` }, { status: 400 })
  }

  try {
    const { events, diagnostics } = await getEventsByRangeWithDiagnostics(from, to)
    return NextResponse.json(
      {
        events: events
          .filter((e) => e.source !== undefined && COMPASS_MIRRORED_SOURCES.has(e.source))
          .map(toFeedEvent),
        // Compass 는 diagnostics 에 있고 · degraded 가 아니고 · 1건 이상일 때만 그 소스 미러를 교체한다.
        // 그래서 소스별 진단을 빠짐없이 같이 내려야 빈 결과가 기존 미러를 지우지 않는다.
        diagnostics: diagnostics
          .filter((d) => COMPASS_MIRRORED_SOURCES.has(d.source))
          .map((d) => ({ source: d.source, count: d.count, durationMs: d.durationMs, degraded: d.degraded, ageMs: d.ageMs })),
      },
      // 받는 쪽은 브라우저가 아니라 서버 크론이다. 중복 계산은 월 단위 unstable_cache(60초)가 이미 막는다.
      { headers: { "cache-control": "no-store" } }
    )
  } catch (error) {
    console.error("[compass-calendar] 조회 실패", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "캘린더 조회 실패" }, { status: 500 })
  }
}

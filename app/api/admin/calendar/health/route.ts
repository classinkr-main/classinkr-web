import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  deriveFeedHealth,
  derivePublicEventsHealth,
  deriveStoredHealth,
  deriveTeamAccessHealth,
  type CalendarHealthPayload,
  type SourceHealth,
  type SourceTiming,
} from "@/lib/admin-calendar/health"
import { readSourceCacheStats } from "@/lib/admin-calendar/source-cache"
import { getBusinessDateParts } from "@/lib/business-time"
import {
  getPublicEventsAsCalendarEvents,
  type CalendarEvent,
  type EventSource,
} from "@/lib/calendar-data"
import { getCompassCalendarEventsWithHealth } from "@/lib/compass/calendar"
import { getNotionMarketingCalendarEvents } from "@/lib/notion-marketing-calendar"
import { probeTeamCalendarAccess } from "@/lib/team-member-calendars"
import { getShowroomCalendarEvents } from "@/lib/showroom-ics-calendar"
import { summarizeStoredCalendarEvents } from "@/lib/repositories/admin-calendar-events"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/admin/calendar/health — 소스별 연결 상태
 *
 * 캘린더가 비어 있을 때 "일정이 없는 것"과 "연동이 끊긴 것"을 화면이 구분하게 하는
 * 유일한 데이터 경로. 소스마다 가장 싼 진실을 묻는다:
 *   팀·파트너 = 테이블 전량 카운트, 공개 행사 = 회차 날짜 전체,
 *   노션·쇼룸 = 최근 3개월+다음 달 윈도(월 캐시 재사용), 팀원 행사 = 접근 프로브.
 * 개별 소스 조회 실패는 그 소스만 "확인 불가"로 눕히고 나머지는 살린다.
 */

/** 노션·쇼룸 피드의 과거 조회 하한(개월) — dead 문구("N개월+ 없음")의 정직한 근거 */
const FEED_LOOKBACK_MONTHS = 3

function unknownHealth(source: SourceHealth["source"]): SourceHealth {
  return { source, status: "stale", headline: "확인 불가" }
}

function monthWindow(todayMonth: string, back: number, forward: number) {
  const [year, month] = todayMonth.split("-").map(Number)
  const months: Array<{ year: number; month: number }> = []
  for (let offset = -back; offset <= forward; offset += 1) {
    const total = year * 12 + (month - 1) + offset
    months.push({ year: Math.floor(total / 12), month: (total % 12) + 1 })
  }
  return months
}

function eventDates(events: CalendarEvent[]): string[] {
  return events.map((event) => event.endDate ?? event.date)
}

async function feedDatesByMonths(
  fetcher: (opts: { year: number; month: number }) => Promise<CalendarEvent[]>,
  months: Array<{ year: number; month: number }>
): Promise<string[]> {
  const perMonth = await Promise.all(months.map((m) => fetcher(m)))
  // 멀티데이가 걸치는 달마다 중복될 수 있으니 id 로 눌러준다
  const byId = new Map<string, CalendarEvent>()
  for (const events of perMonth) for (const event of events) byId.set(event.id, event)
  return eventDates(Array.from(byId.values()))
}

/**
 * Compass 브리지는 "일정이 없다"와 "연결이 끊겼다"가 다른 사실이다 —
 * down 이면 날짜가 0건이어도 dead("연결 끊김")로 말하고, 정상이면 다른 외부 피드와
 * 같은 최근성 규칙(deriveFeedHealth)을 쓴다.
 */
async function compassCalendarDates(
  months: Array<{ year: number; month: number }>
): Promise<{ dates: string[]; down: boolean }> {
  const results = await Promise.all(
    months.map((m) => getCompassCalendarEventsWithHealth(m).catch(() => ({ events: [], down: true })))
  )
  const byId = new Map<string, CalendarEvent>()
  for (const result of results) for (const event of result.events) byId.set(event.id, event)
  return {
    dates: eventDates(Array.from(byId.values())),
    down: results.some((result) => result.down),
  }
}

async function partnerScheduleSummary(): Promise<{ count: number; lastDate: string | null }> {
  const supabase = createSupabaseAdminClient()
  const [countRes, latestRes] = await Promise.all([
    supabase.from("partner_schedule_items").select("id", { count: "exact", head: true }),
    supabase
      .from("partner_schedule_items")
      .select("starts_at")
      .order("starts_at", { ascending: false })
      .limit(1),
  ])
  if (countRes.error) throw new Error(countRes.error.message)
  if (latestRes.error) throw new Error(latestRes.error.message)
  const lastIso = (latestRes.data?.[0] as { starts_at?: string } | undefined)?.starts_at ?? null
  return { count: countRes.count ?? 0, lastDate: lastIso ? lastIso.slice(0, 10) : null }
}

/**
 * 소스별 타이밍 수집 — 판정과 분리된 관측 레이어다.
 * 대기 시간은 여기서 재고, 캐시 나이·degraded 는 공용 SWR 캐시가 남긴 마지막 관측치에서 읽는다.
 * 팀원 행사의 사실 원천은 접근 프로브라 그 라벨(team_event_access)의 캐시 상태를 본다.
 */
const CACHE_LABEL_BY_SOURCE: Partial<Record<EventSource, string>> = {
  notion: "notion",
  showroom: "showroom",
  holiday: "holiday",
  compass_demo: "compass_demo",
  team_event: "team_event_access",
}

async function timed<T>(promise: Promise<T>): Promise<{ value: T; durationMs: number }> {
  const startedAt = Date.now()
  const value = await promise
  return { value, durationMs: Date.now() - startedAt }
}

function timingFor(source: EventSource, durationMs: number): SourceTiming {
  const label = CACHE_LABEL_BY_SOURCE[source]
  const stats = label ? readSourceCacheStats(label) : null
  return {
    durationMs,
    ageMs: stats?.ageMs ?? null,
    degraded: stats?.degraded ?? false,
  }
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { date: today, month: todayMonth } = getBusinessDateParts()
    const months = monthWindow(todayMonth, FEED_LOOKBACK_MONTHS, 1)

    const notionDbId = process.env.NOTION_MARKETING_CALENDAR_DB_ID?.trim()
    const notionHref = notionDbId
      ? `https://www.notion.so/${notionDbId.replace(/-/g, "")}`
      : undefined

    const [stored, partner, publicEvents, notionDates, showroomDates, teamAccess, compass] =
      await Promise.all([
        timed(summarizeStoredCalendarEvents().catch(() => null)),
        timed(partnerScheduleSummary().catch(() => null)),
        timed(getPublicEventsAsCalendarEvents().catch(() => null)),
        timed(feedDatesByMonths(getNotionMarketingCalendarEvents, months).catch(() => null)),
        timed(feedDatesByMonths(getShowroomCalendarEvents, months).catch(() => null)),
        timed(probeTeamCalendarAccess().catch(() => null)),
        timed(compassCalendarDates(months).catch(() => null)),
      ])

    const sources: SourceHealth[] = [
      stored.value
        ? deriveStoredHealth({
            source: "calendar",
            count: stored.value.count,
            lastDate: stored.value.lastDate,
          })
        : unknownHealth("calendar"),
      partner.value
        ? deriveStoredHealth({
            source: "partner",
            count: partner.value.count,
            lastDate: partner.value.lastDate,
            href: "/admin/partners",
          })
        : unknownHealth("partner"),
      publicEvents.value
        ? derivePublicEventsHealth({
            dates: eventDates(publicEvents.value),
            today,
            href: "/admin/events",
          })
        : unknownHealth("event"),
      notionDates.value
        ? deriveFeedHealth({
            source: "notion",
            dates: notionDates.value,
            today,
            lookbackMonths: FEED_LOOKBACK_MONTHS,
            href: notionHref,
          })
        : unknownHealth("notion"),
      showroomDates.value
        ? deriveFeedHealth({
            source: "showroom",
            dates: showroomDates.value,
            today,
            lookbackMonths: FEED_LOOKBACK_MONTHS,
          })
        : unknownHealth("showroom"),
      teamAccess.value ? deriveTeamAccessHealth(teamAccess.value) : unknownHealth("team_event"),
      !compass.value
        ? unknownHealth("compass_demo")
        : compass.value.down
          ? {
              source: "compass_demo",
              status: "dead",
              headline: "Compass 연결 끊김",
              detail: "브리지 뷰 조회 실패",
            }
          : deriveFeedHealth({
              source: "compass_demo",
              dates: compass.value.dates,
              today,
              lookbackMonths: FEED_LOOKBACK_MONTHS,
            }),
      { source: "holiday", status: "ok", headline: "자동 제공" },
    ]

    // 판정은 위에서 끝났다 — 아래는 관측치만 얹는다(status/headline 불변).
    const durationBySource = new Map<EventSource, number>([
      ["calendar", stored.durationMs],
      ["partner", partner.durationMs],
      ["event", publicEvents.durationMs],
      ["notion", notionDates.durationMs],
      ["showroom", showroomDates.durationMs],
      ["team_event", teamAccess.durationMs],
      ["compass_demo", compass.durationMs],
      // 공휴일은 이 라우트가 조회하지 않는다(자동 제공) — 캐시 상태만 있으면 함께 싣는다.
      ["holiday", 0],
    ])

    const payload: CalendarHealthPayload = {
      checkedAt: new Date().toISOString(),
      sources: sources.map((source) => ({
        ...source,
        timing: timingFor(source.source, durationBySource.get(source.source) ?? 0),
      })),
    }
    return adminCachedJson(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "연결 상태 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}

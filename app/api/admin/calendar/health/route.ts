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
} from "@/lib/admin-calendar/health"
import { getBusinessDateParts } from "@/lib/business-time"
import { getPublicEventsAsCalendarEvents, type CalendarEvent } from "@/lib/calendar-data"
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

    const [stored, partner, publicEvents, notionDates, showroomDates, teamAccess] =
      await Promise.all([
        summarizeStoredCalendarEvents().catch(() => null),
        partnerScheduleSummary().catch(() => null),
        getPublicEventsAsCalendarEvents().catch(() => null),
        feedDatesByMonths(getNotionMarketingCalendarEvents, months).catch(() => null),
        feedDatesByMonths(getShowroomCalendarEvents, months).catch(() => null),
        probeTeamCalendarAccess().catch(() => null),
      ])

    const sources: SourceHealth[] = [
      stored
        ? deriveStoredHealth({ source: "calendar", count: stored.count, lastDate: stored.lastDate })
        : unknownHealth("calendar"),
      partner
        ? deriveStoredHealth({
            source: "partner",
            count: partner.count,
            lastDate: partner.lastDate,
            href: "/admin/partners",
          })
        : unknownHealth("partner"),
      publicEvents
        ? derivePublicEventsHealth({
            dates: eventDates(publicEvents),
            today,
            href: "/admin/events",
          })
        : unknownHealth("event"),
      notionDates
        ? deriveFeedHealth({
            source: "notion",
            dates: notionDates,
            today,
            lookbackMonths: FEED_LOOKBACK_MONTHS,
            href: notionHref,
          })
        : unknownHealth("notion"),
      showroomDates
        ? deriveFeedHealth({
            source: "showroom",
            dates: showroomDates,
            today,
            lookbackMonths: FEED_LOOKBACK_MONTHS,
          })
        : unknownHealth("showroom"),
      teamAccess ? deriveTeamAccessHealth(teamAccess) : unknownHealth("team_event"),
      { source: "holiday", status: "ok", headline: "자동 제공" },
    ]

    const payload: CalendarHealthPayload = { checkedAt: new Date().toISOString(), sources }
    return adminCachedJson(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "연결 상태 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}

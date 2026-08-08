/**
 * korea-holidays.ts — 구글 공개 공휴일 캘린더 읽기 전용 연동.
 *
 * 회의(2026-07-29): "공휴일 같은 거 반영되고 하면 얘도 쓸 만할 것 같아요."
 * EventType의 'holiday'는 원래 손으로 넣는 타입이었고 자동 주입이 없었다.
 *
 * 팀원 개인 캘린더(lib/team-member-calendars.ts)와 달리 이 캘린더는 공개라
 * 서비스 계정 공유 설정이 필요 없다(누구나 읽을 수 있는 구글 공식 캘린더).
 * 다만 Calendar API 호출 자체는 여전히 인증된 클라이언트가 필요하므로,
 * 서비스 계정 자격이 없으면 호출을 시도하지 않고 조용히 빈 배열을 반환한다
 * (team-member-calendars.ts와 동일 규약 — 캘린더 화면 전체를 막지 않는다).
 */
import "server-only"

import type { calendar_v3 } from "googleapis"

import type { CalendarEvent } from "@/lib/calendar-data"
import { calendar as googleCalendar } from "@/lib/google"

export const KOREA_HOLIDAY_CALENDAR_ID = "ko.south_korea#holiday@group.v.calendar.google.com"

// 공휴일은 거의 안 바뀐다 — 팀원 캘린더(5분, team-member-calendars.ts)보다 훨씬 길게 잡는다.
const CACHE_TTL_MS = 60 * 60_000
// 한 달/한 창(210일)에 공휴일이 100건을 넘을 일은 없다 — team-member-calendars의
// MAX_PER_CALENDAR(개인 일정, 250)보다 훨씬 낮게 잡아도 안전하다.
const MAX_RESULTS = 100

interface CacheEntry {
  at: number
  data: CalendarEvent[]
}
const cache = new Map<string, CacheEntry>()

function hasServiceAccount(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() && process.env.GOOGLE_PRIVATE_KEY?.trim()
  )
}

/** 구글 이벤트 하나를 읽기 전용 공휴일 CalendarEvent로 매핑한다. 제목/종일 시작일이 없으면 null. */
export function toHolidayEvent(raw: calendar_v3.Schema$Event): CalendarEvent | null {
  const title = raw.summary?.trim()
  const date = raw.start?.date?.trim()
  if (!title || !date) return null

  const stamp = raw.updated ?? `${date}T00:00:00.000Z`

  return {
    id: `holiday:${raw.id ?? `${date}-${title}`}`,
    title,
    date,
    // 구글의 종일 end는 배타적(다음 날)이라 하루짜리는 endDate를 비운다.
    // 구글 한국 공휴일 캘린더는 연휴도 날짜별 개별 이벤트로 내려주므로(설날/추석 등)
    // 멀티데이 endDate 계산이 필요 없다.
    type: "holiday",
    allDay: true,
    source: "holiday",
    sourceLabel: "공휴일",
    readonly: true,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

interface QueryOptions {
  year?: number
  month?: number
}

// KST 월 경계를 UTC ISO로 변환 (KST = UTC+9) — team-member-calendars.ts의 monthRangeIso와 동일 공식.
function monthRangeIso(year: number, month: number): { timeMin: string; timeMax: string } {
  const startUtcMs = Date.UTC(year, month - 1, 1, 0, 0, 0) - 9 * 3_600_000
  const endUtcMs = Date.UTC(year, month, 1, 0, 0, 0) - 9 * 3_600_000
  return { timeMin: new Date(startUtcMs).toISOString(), timeMax: new Date(endUtcMs).toISOString() }
}

export async function getKoreaHolidayEvents(opts: QueryOptions = {}): Promise<CalendarEvent[]> {
  // 자격 없으면 조용히 빈 배열 — team-member-calendars와 같은 규약(화면 전체를 막지 않는다).
  if (!hasServiceAccount()) return []

  const { year, month } = opts
  const cacheKey = year && month ? `${year}-${month}` : "all"
  const cached = cache.get(cacheKey)
  const nowMs = Date.now()
  if (cached && nowMs - cached.at < CACHE_TTL_MS) return cached.data

  // 월 지정이 없으면(getAllEvents) 최근 30일 ~ 향후 180일 창으로 제한 — team-member-calendars와 동일.
  const range =
    year && month
      ? monthRangeIso(year, month)
      : {
          timeMin: new Date(nowMs - 30 * 86_400_000).toISOString(),
          timeMax: new Date(nowMs + 180 * 86_400_000).toISOString(),
        }

  try {
    const res = await googleCalendar.events.list({
      calendarId: KOREA_HOLIDAY_CALENDAR_ID,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: MAX_RESULTS,
      timeMin: range.timeMin,
      timeMax: range.timeMax,
    })

    const events = (res.data.items ?? [])
      .map(toHolidayEvent)
      .filter((event): event is CalendarEvent => event !== null)

    cache.set(cacheKey, { at: nowMs, data: events })
    return events
  } catch (error) {
    // 실패해도 캘린더의 나머지 소스는 살아야 하므로 빈 배열로 물러난다(다른 소스와 동일 규약).
    console.warn("[korea-holidays] failed to fetch holiday calendar:", error)
    return []
  }
}

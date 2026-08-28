/**
 * compass/calendar.ts — Compass(마케팅팀 앱)의 구글 'MKT 데모일정' 캘린더 미러를
 * 어드민 운영 캘린더의 8번째 소스(`compass_demo`)로 얹는 어댑터.
 *
 * 원천은 `compass_cal_events_v` 뷰(lib/compass/bridge.ts) — 읽기 전용이다.
 * 쇼룸 ICS·팀원 구글 캘린더와 마찬가지로 Supabase에 복제하지 않고 그때그때 읽는다.
 *
 * 정직성 규약:
 *  - 이 캘린더에는 데모만 있는 게 아니라 MKT 팀 반복 회의·연락 리마인더도 섞여 있다
 *    (2026-08-28 실측 157행 중 "MKT Meeting" 83행). 그래서 라벨은 원본 캘린더 이름
 *    그대로 "MKT 데모일정"이고, 어떤 행도 "데모"라고 재분류하지 않는다.
 *  - 쇼룸 예약·팀원 행사와 같은 데모가 겹쳐 보일 수 있다. 제목·시각 근사 중복으로
 *    한쪽을 지우지 않는다 — 실측 근거 없는 dedup은 하지 않고 소스 라벨로 구분한다.
 *  - 브리지가 끊기면(down) 이 소스만 조용히 비고 다른 소스는 그대로 뜬다.
 *    연결 상태는 /api/admin/calendar/health 가 배지로 강등해 말한다.
 */
import "server-only"

import { normalizeAssigneeNames } from "@/lib/admin-calendar/people"
import { getCompassCalEvents, type CompassCalEventRow } from "@/lib/compass/bridge"
import { compassLeadUrl } from "@/lib/compass/normalize"
import type { CalendarEvent } from "@/lib/calendar-data"

/** 소스 라벨 = 원본 구글 캘린더 이름. 화면 범례(event-style.ts)와 같은 문자열이어야 한다. */
export const COMPASS_CALENDAR_SOURCE_LABEL = "MKT 데모일정"

const CACHE_TTL_MS = 5 * 60_000
/** 월 지정 없는 호출(getAllEvents)의 조회 창 */
const ALL_LOOKBACK_DAYS = 90
const ALL_LOOKAHEAD_DAYS = 180

interface CacheEntry {
  at: number
  data: CalendarEvent[]
  down: boolean
}
const cache = new Map<string, CacheEntry>()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function toDayString(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/** "11:00" · "11:00:00" · null → "HH:mm" 또는 undefined(종일) */
function normalizeTime(value: string | null): string | undefined {
  if (!value) return undefined
  const match = value.match(/^(\d{2}):(\d{2})/)
  return match ? `${match[1]}:${match[2]}` : undefined
}

/**
 * 뷰 한 행 → CalendarEvent. 날짜가 없는 행은 캘린더에 찍을 자리가 없으므로 버린다
 * (그 외에는 어떤 행도 걸러내지 않는다 — 이 소스의 성격 판단은 화면 몫).
 */
export function mapCompassCalEvent(row: CompassCalEventRow): CalendarEvent | null {
  const day = row.day?.slice(0, 10)
  if (!day || !DATE_RE.test(day)) return null

  const time = normalizeTime(row.time)
  const owners = normalizeAssigneeNames(row.owners ?? [])
  const syncedAt = row.synced_at ?? new Date().toISOString()

  return {
    id: `compass_${row.key.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    title: row.title?.trim() || "(제목 없음)",
    date: day,
    time,
    type: "meeting",
    // 리드가 붙은 행만 Compass 리드로 이어진다 — 붙지 않은 행은 그 사실을 감추지 않는다.
    description: row.lead_id != null ? `Compass 리드 #${row.lead_id}` : undefined,
    assignees: owners.length > 0 ? owners : undefined,
    allDay: !time,
    source: "compass_demo",
    sourceLabel: COMPASS_CALENDAR_SOURCE_LABEL,
    readonly: true,
    // 리드 딥링크가 있으면 Compass 상세로, 없으면 구글 캘린더 원본으로.
    href: row.lead_id != null ? compassLeadUrl(row.lead_id) : (row.link ?? undefined),
    createdAt: syncedAt,
    updatedAt: syncedAt,
  }
}

export interface CompassCalendarQueryOptions {
  year?: number
  month?: number
}

function resolveRange(opts: CompassCalendarQueryOptions, nowMs: number) {
  if (opts.year && opts.month) {
    const lastDay = new Date(opts.year, opts.month, 0).getDate()
    return {
      key: `${opts.year}-${pad(opts.month)}`,
      from: `${opts.year}-${pad(opts.month)}-01`,
      to: `${opts.year}-${pad(opts.month)}-${pad(lastDay)}`,
    }
  }
  return {
    key: "all",
    from: toDayString(new Date(nowMs - ALL_LOOKBACK_DAYS * 86_400_000)),
    to: toDayString(new Date(nowMs + ALL_LOOKAHEAD_DAYS * 86_400_000)),
  }
}

/** 이벤트 + 연결 상태. 캘린더 화면은 이벤트만, 연결 상태 라우트는 down 도 읽는다. */
export async function getCompassCalendarEventsWithHealth(
  opts: CompassCalendarQueryOptions = {}
): Promise<{ events: CalendarEvent[]; down: boolean }> {
  const nowMs = Date.now()
  const { key, from, to } = resolveRange(opts, nowMs)

  const cached = cache.get(key)
  if (cached && nowMs - cached.at < CACHE_TTL_MS) {
    return { events: cached.data, down: cached.down }
  }

  const result = await getCompassCalEvents(from, to)
  if (result.down) {
    // 브리지가 끊긴 상태를 5분 캐시로 굳히지 않는다 — 다음 요청이 즉시 재시도한다.
    // 이전에 받아 둔 값이 있으면 그대로 보여주되 down 은 정직하게 올린다.
    return { events: cached?.data ?? [], down: true }
  }

  const events = result.rows
    .map(mapCompassCalEvent)
    .filter((event): event is CalendarEvent => event !== null)

  cache.set(key, { at: nowMs, data: events, down: false })
  return { events, down: false }
}

/** 캘린더 소스 어댑터 — 다른 소스와 같은 시그니처. 실패는 빈 배열(다른 소스를 깨지 않는다). */
export async function getCompassDemoCalendarEvents(
  opts: CompassCalendarQueryOptions = {}
): Promise<CalendarEvent[]> {
  try {
    return (await getCompassCalendarEventsWithHealth(opts)).events
  } catch {
    return []
  }
}

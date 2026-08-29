/**
 * showroom/calendar-source.ts — 우리 DB 의 쇼룸 예약 접수(showroom_bookings)를
 * 어드민 운영 캘린더의 9번째 소스(`showroom_booking`)로 얹는 어댑터.
 *
 * 기존 `showroom` 소스(lib/showroom-ics-calendar.ts)와 **다른 원천이다**:
 *   - `showroom`         = 구글 캘린더 ICS. 이미 확정돼 캘린더에 잡힌 일정(읽기 전용).
 *   - `showroom_booking` = 우리 접수 테이블. 담당자 확정을 기다리는(또는 방금 확정된) 요청.
 * 둘을 한 소스로 합치면 "확정된 일정"과 "아직 아무도 안 본 요청"이 같은 점으로 보인다 —
 * 이 화면이 존재하는 이유가 바로 그 구분이라 절대 합치지 않는다.
 *
 * 접수 자체는 공개 화면이 만들고(lib/showroom/bookings.ts), 상태 전이는 전용 어드민
 * API(/api/admin/showroom-bookings/[id])로만 한다. 그래서 캘린더에서는 readonly 다.
 *
 * 조회는 우리 Supabase 직조회다 — ICS·노션·Compass 처럼 외부 왕복이 아니라서 SWR 캐시를
 * 두지 않는다(공개 행사 소스와 같은 규약). 실패는 빈 배열로 눕힌다: 이 소스 하나가
 * 캘린더 전체를 비우면 안 된다.
 */
import "server-only"

import { normalizeAssigneeNames } from "@/lib/admin-calendar/people"
import {
  SHOWROOM_BOOKING_CALENDAR_STATUSES,
  listShowroomBookings,
  type ShowroomBookingRecord,
} from "@/lib/repositories/showroom-bookings"
import type { CalendarEvent } from "@/lib/calendar-data"

/** 화면 범례(components/admin/calendar/event-style.ts)와 같은 문자열이어야 한다. */
export const SHOWROOM_BOOKING_SOURCE_LABEL = "쇼룸 예약 요청"

/** 월 지정 없는 호출(getAllEvents)의 조회 창 — Compass 어댑터와 같은 폭. */
const ALL_LOOKBACK_DAYS = 90
const ALL_LOOKAHEAD_DAYS = 180

const VISIBLE_STATUSES = new Set<string>(SHOWROOM_BOOKING_CALENDAR_STATUSES)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([0-2]\d):([0-5]\d)$/

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function toDayString(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/**
 * "HH:mm" + 분 → "HH:mm". 자정을 넘기면 23:59 로 잘라 그날 안에 남긴다 —
 * 슬롯(10:00~16:00, 60분)에서는 일어나지 않지만 duration_minutes 상한이 480 이라
 * 날짜를 조용히 밀어버리는 것보다 그날의 끝으로 두는 편이 덜 거짓말이다.
 */
export function addMinutesToClockTime(time: string, minutes: number): string | undefined {
  const match = TIME_RE.exec(time)
  if (!match) return undefined
  if (!Number.isFinite(minutes)) return undefined

  const total = Number(match[1]) * 60 + Number(match[2]) + Math.round(minutes)
  if (total >= 24 * 60) return "23:59"
  if (total < 0) return undefined
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** 상세 패널이 읽는 맥락 — 연락처·상태·관심사는 여기서만 보여준다(제목은 짧게 유지). */
function buildDescription(booking: ShowroomBookingRecord): string | undefined {
  const lines = [
    `상태: ${booking.status}`,
    `담당자: ${booking.name}${booking.role ? ` (${booking.role})` : ""} / ${booking.phone}`,
    booking.academySize ? `학원 규모: ${booking.academySize}` : undefined,
    booking.interests.length > 0 ? `보고 싶은 것: ${booking.interests.join(", ")}` : undefined,
    booking.memo ? `메모: ${booking.memo}` : undefined,
  ].filter((line): line is string => Boolean(line))

  return lines.length > 0 ? lines.join("\n") : undefined
}

/**
 * 접수 1건 → CalendarEvent. 캘린더에 자리를 잡지 못하는 행은 버린다:
 *  - 이탈 상태(no_show·canceled) — 방문이 없었다는 뜻이라 자리를 비운다.
 *  - 날짜·시각이 깨진 행 — 찍을 곳이 없다.
 */
export function mapShowroomBookingEvent(booking: ShowroomBookingRecord): CalendarEvent | null {
  if (!VISIBLE_STATUSES.has(booking.status)) return null
  if (!DATE_RE.test(booking.visitDate) || !TIME_RE.test(booking.visitTime)) return null

  const assignees = normalizeAssigneeNames([booking.assignedTo])

  return {
    // ICS 소스의 id 는 `showroom_<uid>` 다 — 접두사를 갈라 두 원천이 섞이지 않게 한다.
    id: `showroom_booking_${booking.id}`,
    title: `${booking.org} (${booking.visitorCount}명)`,
    date: booking.visitDate,
    time: booking.visitTime,
    endTime: addMinutesToClockTime(booking.visitTime, booking.durationMinutes),
    type: "meeting",
    description: buildDescription(booking),
    assignees: assignees.length > 0 ? assignees : undefined,
    allDay: false,
    source: "showroom_booking",
    sourceLabel: SHOWROOM_BOOKING_SOURCE_LABEL,
    // 상태 변경은 /api/admin/showroom-bookings/[id] 로만 한다 — 캘린더 편집 폼이 아니다.
    readonly: true,
    // 리드로 미러링된 접수는 어드민 리드 큐로 바로 이어진다(알림 routeUrl 과 같은 목적지).
    href: booking.leadId ? `/admin/crm/customers/leads?lead=${booking.leadId}` : undefined,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  }
}

export interface ShowroomBookingCalendarQueryOptions {
  year?: number
  month?: number
}

function resolveRange(opts: ShowroomBookingCalendarQueryOptions, nowMs: number) {
  if (opts.year && opts.month) {
    const lastDay = new Date(opts.year, opts.month, 0).getDate()
    return {
      from: `${opts.year}-${pad(opts.month)}-01`,
      to: `${opts.year}-${pad(opts.month)}-${pad(lastDay)}`,
    }
  }
  return {
    from: toDayString(new Date(nowMs - ALL_LOOKBACK_DAYS * 86_400_000)),
    to: toDayString(new Date(nowMs + ALL_LOOKAHEAD_DAYS * 86_400_000)),
  }
}

/** 캘린더 소스 어댑터 — 다른 소스와 같은 시그니처. */
export async function getShowroomBookingCalendarEvents(
  opts: ShowroomBookingCalendarQueryOptions = {}
): Promise<CalendarEvent[]> {
  const { from, to } = resolveRange(opts, Date.now())

  try {
    const bookings = await listShowroomBookings({ from, to })
    return bookings
      .map(mapShowroomBookingEvent)
      .filter((event): event is CalendarEvent => event !== null)
  } catch (error) {
    // 이 소스만 조용히 비고 나머지 소스는 그대로 뜬다(연결 상태는 health 라우트가 말한다).
    console.error("[showroom-booking-calendar] failed to list bookings", error)
    return []
  }
}

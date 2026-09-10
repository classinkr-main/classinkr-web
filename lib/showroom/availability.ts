/**
 * showroom/availability — 예약 가용성 조회(I/O 조립).
 *
 * 순수 판정은 `lib/showroom/slots.ts` 가 한다. 이 모듈은 그 판정에 넣을 재료를 모은다:
 *   ① 공휴일 — 구글 공개 공휴일 캘린더(`lib/korea-holidays.ts`)
 *   ② 쇼룸 구글 캘린더 일정 — ICS 읽기 전용(`lib/showroom-ics-calendar.ts`)
 *   ③ 우리 DB 의 접수된 예약 — showroom_bookings
 *
 * ①②는 자격이 없거나 원천이 늦으면 조용히 빈 배열로 떨어진다(각 모듈의 규약).
 * 그때는 "덜 막는" 쪽으로 기운다 — 열려 보이는 슬롯에 요청이 들어와도 담당자가
 * 확정 단계에서 거를 수 있다. 반대로 원천 장애 때문에 화면을 통째로 닫으면
 * 멀쩡한 리드를 잃는다.
 *
 * ③은 우리 DB 라 실패하면 던진다 — 우리 예약을 못 읽는 상태로 "비어 있음"을
 * 보여주면 확정된 방문 위에 덧예약을 받게 된다.
 */

import "server-only"

import { getBusinessDateParts } from "@/lib/business-time"
import { getKoreaHolidayEvents } from "@/lib/korea-holidays"
import { getShowroomCalendarEvents } from "@/lib/showroom-ics-calendar"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  addIsoDays,
  buildShowroomAvailability,
  compareIsoDate,
  getShowroomBookingRange,
  isShowroomSlotOpen,
  isValidIsoDate,
  type ShowroomBusyInterval,
  type ShowroomDayAvailability,
} from "@/lib/showroom/slots"

/** 한 번에 돌려주는 최대 일수. 화면은 한 달치면 충분하다. */
const MAX_RANGE_DAYS = 62

/** 슬롯을 잡고 있다고 보는 예약 상태. 취소·노쇼는 자리를 비운다. */
const BLOCKING_STATUSES = ["requested", "confirmed"] as const

export interface ShowroomAvailabilityResult {
  /** KST 오늘. 화면이 '오늘' 표식에 쓴다. */
  todayIso: string
  minIso: string
  maxIso: string
  days: ShowroomDayAvailability[]
}

function monthsInRange(fromIso: string, toIso: string): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = []
  const seen = new Set<string>()

  let cursor = fromIso
  let guard = 0
  while (compareIsoDate(cursor, toIso) <= 0 && guard < MAX_RANGE_DAYS + 2) {
    guard += 1
    const key = cursor.slice(0, 7)
    if (!seen.has(key)) {
      seen.add(key)
      const [year, month] = key.split("-").map(Number)
      months.push({ year, month })
    }
    cursor = addIsoDays(cursor, 1)
  }

  return months
}

/** 공휴일 날짜 집합. 원천이 비면 빈 집합 — 화면을 막지 않는다. */
async function loadHolidayDates(fromIso: string, toIso: string): Promise<Set<string>> {
  const holidays = new Set<string>()

  const results = await Promise.allSettled(
    monthsInRange(fromIso, toIso).map((month) => getKoreaHolidayEvents(month))
  )

  for (const result of results) {
    if (result.status !== "fulfilled") continue
    for (const event of result.value) {
      if (event.date) holidays.add(event.date)
    }
  }

  return holidays
}

/** 쇼룸 구글 캘린더(ICS) 일정 → 점유 구간. 읽기 전용 원천이라 실패해도 넘어간다. */
async function loadIcsBusy(fromIso: string, toIso: string): Promise<ShowroomBusyInterval[]> {
  let events: Awaited<ReturnType<typeof getShowroomCalendarEvents>> = []
  try {
    events = await getShowroomCalendarEvents()
  } catch (error) {
    console.error("[showroom-availability] ICS 조회 실패 — 빈 값으로 진행:", error)
    return []
  }

  const busy: ShowroomBusyInterval[] = []
  for (const event of events) {
    if (!event.date) continue

    // 멀티데이 일정은 걸치는 날짜를 모두 막는다.
    const endDate = event.endDate ?? event.date
    let cursor = event.date
    let guard = 0
    while (compareIsoDate(cursor, endDate) <= 0 && guard < MAX_RANGE_DAYS + 2) {
      guard += 1
      if (compareIsoDate(cursor, fromIso) >= 0 && compareIsoDate(cursor, toIso) <= 0) {
        busy.push({
          date: cursor,
          startTime: event.time,
          endTime: event.endTime,
          // 멀티데이의 중간 날짜는 시각과 무관하게 종일 점유로 본다.
          allDay: event.allDay || cursor !== event.date,
        })
      }
      cursor = addIsoDays(cursor, 1)
    }
  }

  return busy
}

/** 우리 DB 예약 → 점유 구간. 실패하면 던진다(덧예약을 받느니 에러가 낫다). */
async function loadBookingBusy(fromIso: string, toIso: string): Promise<ShowroomBusyInterval[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("showroom_bookings")
    .select("visit_date, visit_time, duration_minutes")
    .gte("visit_date", fromIso)
    .lte("visit_date", toIso)
    .in("status", [...BLOCKING_STATUSES])

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const record = row as { visit_date: string; visit_time: string; duration_minutes: number | null }
    return {
      date: record.visit_date,
      startTime: record.visit_time,
      endTime: addMinutesToClockTime(record.visit_time, record.duration_minutes ?? 60),
    }
  })
}

/** 'HH:mm' + 분. 자정을 넘기면 그날 끝(23:59)으로 자른다. */
function addMinutesToClockTime(time: string, minutes: number): string {
  const [hour, minute] = time.split(":").map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time

  const total = hour * 60 + minute + minutes
  if (total >= 24 * 60) return "23:59"

  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

export interface GetAvailabilityOptions {
  fromIso?: string
  toIso?: string
  now?: Date
}

export async function getShowroomAvailability(
  options: GetAvailabilityOptions = {}
): Promise<ShowroomAvailabilityResult> {
  const todayIso = getBusinessDateParts(options.now ?? new Date()).date

  // 공휴일을 아직 모르는 상태로 예약 창을 잡으면 최소 날짜가 공휴일에 걸릴 수 있다.
  // 넉넉한 창으로 공휴일을 먼저 읽고, 그 값으로 실제 창을 다시 잡는다.
  const probe = getShowroomBookingRange(todayIso)
  const holidayDates = await loadHolidayDates(todayIso, probe.maxIso)
  const range = getShowroomBookingRange(todayIso, holidayDates)

  const requestedFrom = options.fromIso && isValidIsoDate(options.fromIso) ? options.fromIso : range.minIso
  const requestedTo = options.toIso && isValidIsoDate(options.toIso) ? options.toIso : range.maxIso

  // 조회 창을 예약 창 안으로 가둔 뒤 길이 상한을 건다.
  const fromIso = compareIsoDate(requestedFrom, todayIso) < 0 ? todayIso : requestedFrom
  const cappedTo = addIsoDays(fromIso, MAX_RANGE_DAYS - 1)
  const toIso = compareIsoDate(requestedTo, cappedTo) > 0 ? cappedTo : requestedTo

  if (compareIsoDate(fromIso, toIso) > 0) {
    return { todayIso, minIso: range.minIso, maxIso: range.maxIso, days: [] }
  }

  const [icsBusy, bookingBusy] = await Promise.all([
    loadIcsBusy(fromIso, toIso),
    loadBookingBusy(fromIso, toIso),
  ])

  return {
    todayIso,
    minIso: range.minIso,
    maxIso: range.maxIso,
    days: buildShowroomAvailability({
      todayIso,
      fromIso,
      toIso,
      holidayDates,
      busy: [...icsBusy, ...bookingBusy],
    }),
  }
}

/**
 * 저장 직전 최종 확인. 그 날짜 하루만 다시 조회한다 —
 * 화면이 들고 있던 가용성이 몇 분 전 값일 수 있다.
 */
export async function isShowroomSlotAvailable(date: string, time: string): Promise<boolean> {
  if (!isValidIsoDate(date)) return false

  const { days } = await getShowroomAvailability({ fromIso: date, toIso: date })
  return isShowroomSlotOpen(date, time, days)
}

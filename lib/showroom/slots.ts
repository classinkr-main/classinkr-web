/**
 * showroom/slots — 목동 쇼룸 상담 예약의 슬롯·영업일 판정(순수 함수).
 *
 * 저장소에 "예약 슬롯" 개념이 없어 새로 세운다. `lib/business-time.ts` 는 타임존 변환만
 * 하고 주말·공휴일 제외나 영업일 산술은 없었다.
 *
 * 이 모듈은 I/O 를 하지 않는다 — 공휴일과 기존 일정은 호출자가 주입한다. 그래야
 * 서버(가용성 API)와 클라이언트(예약 폼)가 같은 판정을 쓰고, 테스트가 시계·네트워크에
 * 묶이지 않는다.
 *
 * 날짜는 전부 KST 벽시계 `YYYY-MM-DD`, 시각은 `HH:mm` 이다(`admin_calendar_events` 관례).
 * 날짜 산술은 UTC 자정 기준 Date 로만 해서 서버 TZ 에 흔들리지 않게 한다.
 *
 * 날짜 유틸을 `components/checkout/request-date.ts` 에서 가져오지 않고 여기서 다시 세운
 * 이유: `lib/` 가 `components/` 를 import 하는 역방향 의존을 만들지 않기 위해서다.
 * 공용 원시 함수로 뽑는 정리는 별건으로 남긴다.
 */

/** 예약 가능한 시각(KST). 점심 12:00~13:00 은 비운다. */
export const SHOWROOM_SLOT_TIMES = ["10:00", "11:00", "14:00", "15:00", "16:00"] as const

export type ShowroomSlotTime = (typeof SHOWROOM_SLOT_TIMES)[number]

/** 1회 상담 소요(분). 대표 수업 한 편 흐름을 보는 데 필요한 시간. */
export const SHOWROOM_SLOT_DURATION_MINUTES = 60

/** 최소 리드타임(영업일). 담당자 배정과 자료 준비 시간이다. */
export const SHOWROOM_MIN_LEAD_BUSINESS_DAYS = 2

/** 오늘로부터 예약을 받는 최대 일수. */
export const SHOWROOM_MAX_ADVANCE_DAYS = 60

/** 같은 시간대에 동시에 받을 수 있는 팀 수. 쇼룸이 하나라 1이다. */
export const SHOWROOM_SLOT_CAPACITY = 1

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/* ── 날짜 원시 함수 ─────────────────────────────────────────────────────── */

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return false
  const [, y, m, d] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1) return false
  // 월별 실제 일수까지 본다 — 2026-02-30 같은 값을 통과시키지 않는다.
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function toUtcMidnight(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUtcMidnight(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** ISO 날짜에 일수를 더한다. 음수도 된다. */
export function addIsoDays(iso: string, delta: number): string {
  const date = toUtcMidnight(iso)
  date.setUTCDate(date.getUTCDate() + delta)
  return fromUtcMidnight(date)
}

/** 0=일 … 6=토. */
export function getIsoWeekday(iso: string): number {
  return toUtcMidnight(iso).getUTCDay()
}

/** a<b 면 음수, 같으면 0, a>b 면 양수. 사전순 비교로 충분하다(고정 폭 포맷). */
export function compareIsoDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** `"10:00"` → 600. 형식이 잘못되면 null. */
export function timeToMinutes(time: string): number | null {
  const match = TIME_PATTERN.exec(time)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/* ── 영업일 ─────────────────────────────────────────────────────────────── */

export function isWeekendIso(iso: string): boolean {
  const weekday = getIsoWeekday(iso)
  return weekday === 0 || weekday === 6
}

/** 주말도 공휴일도 아닌 날. 공휴일 집합은 호출자가 준다. */
export function isBusinessDay(iso: string, holidayDates: ReadonlySet<string>): boolean {
  return !isWeekendIso(iso) && !holidayDates.has(iso)
}

/**
 * 오늘 이후 N 영업일째 날짜. 오늘은 세지 않는다.
 * 공휴일이 길게 이어져도 최대 400일까지만 찾고 멈춘다(무한 루프 방지).
 */
export function addBusinessDays(
  todayIso: string,
  businessDays: number,
  holidayDates: ReadonlySet<string>
): string {
  let cursor = todayIso
  let remaining = Math.max(0, businessDays)
  let guard = 0

  while (remaining > 0 && guard < 400) {
    cursor = addIsoDays(cursor, 1)
    guard += 1
    if (isBusinessDay(cursor, holidayDates)) remaining -= 1
  }

  return cursor
}

export interface ShowroomBookingRange {
  minIso: string
  maxIso: string
}

/** 예약 창 [최소, 최대]. 최소는 영업일 기준, 최대는 달력일 기준이다. */
export function getShowroomBookingRange(
  todayIso: string,
  holidayDates: ReadonlySet<string> = new Set()
): ShowroomBookingRange {
  return {
    minIso: addBusinessDays(todayIso, SHOWROOM_MIN_LEAD_BUSINESS_DAYS, holidayDates),
    maxIso: addIsoDays(todayIso, SHOWROOM_MAX_ADVANCE_DAYS),
  }
}

/* ── 슬롯 ───────────────────────────────────────────────────────────────── */

/** 그 시간대를 이미 차지하고 있는 일정. 쇼룸 구글 캘린더(ICS)와 우리 DB 예약이 섞인다. */
export interface ShowroomBusyInterval {
  date: string
  /** 종일 일정이면 시각이 없다. 그날 전체를 막는다. */
  startTime?: string
  endTime?: string
  allDay?: boolean
}

export type ShowroomSlotState = "open" | "booked"

export interface ShowroomSlot {
  time: ShowroomSlotTime
  state: ShowroomSlotState
}

/** 날짜가 예약을 못 받는 이유. 화면이 문구를 고르는 데 쓴다. */
export type ShowroomDayBlockedReason = "weekend" | "holiday" | "too_soon" | "too_far" | "full"

export interface ShowroomDayAvailability {
  date: string
  /** 0=일 … 6=토 */
  weekday: number
  /** 슬롯이 하나라도 열려 있는가. */
  bookable: boolean
  blockedReason?: ShowroomDayBlockedReason
  slots: ShowroomSlot[]
}

/** [aStart,aEnd) 와 [bStart,bEnd) 가 겹치는가. 경계가 닿는 것은 겹침이 아니다. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * 한 슬롯을 덮고 있는 일정 수.
 *
 * ICS 일정은 우리 슬롯 격자에 맞춰 들어오지 않는다(10:30~11:30 같은 값이 온다).
 * 그래서 시작 시각 일치가 아니라 **구간 겹침**으로 센다.
 */
export function countBusyOverlaps(
  date: string,
  time: string,
  busy: readonly ShowroomBusyInterval[]
): number {
  const slotStart = timeToMinutes(time)
  if (slotStart === null) return 0
  const slotEnd = slotStart + SHOWROOM_SLOT_DURATION_MINUTES

  let count = 0
  for (const interval of busy) {
    if (interval.date !== date) continue

    // 종일 일정이거나 시작 시각을 못 읽으면 그날 전체를 막는다(안전한 쪽).
    if (interval.allDay || !interval.startTime) {
      count += 1
      continue
    }

    const busyStart = timeToMinutes(interval.startTime)
    if (busyStart === null) {
      count += 1
      continue
    }

    // 종료가 없으면 슬롯 길이만큼 잡힌 것으로 본다.
    const busyEnd = interval.endTime
      ? (timeToMinutes(interval.endTime) ?? busyStart + SHOWROOM_SLOT_DURATION_MINUTES)
      : busyStart + SHOWROOM_SLOT_DURATION_MINUTES

    // 종료가 시작보다 이르면(자정 넘김 등) 그날 전체를 막는다.
    if (busyEnd <= busyStart) {
      count += 1
      continue
    }

    if (overlaps(slotStart, slotEnd, busyStart, busyEnd)) count += 1
  }

  return count
}

export interface BuildAvailabilityInput {
  /** KST 오늘. */
  todayIso: string
  /** 조회 시작·끝(양끝 포함). 생략하면 예약 창 전체. */
  fromIso?: string
  toIso?: string
  holidayDates?: ReadonlySet<string>
  busy?: readonly ShowroomBusyInterval[]
}

/**
 * 조회 구간의 날짜별 슬롯 상태.
 *
 * 예약 창 밖(너무 이르거나 늦은 날)도 `bookable: false` 로 함께 돌려준다 —
 * 화면이 달력에서 그 날짜를 왜 못 고르는지 표시할 수 있어야 한다.
 */
export function buildShowroomAvailability(
  input: BuildAvailabilityInput
): ShowroomDayAvailability[] {
  const holidayDates = input.holidayDates ?? new Set<string>()
  const busy = input.busy ?? []
  const range = getShowroomBookingRange(input.todayIso, holidayDates)

  const fromIso = input.fromIso ?? range.minIso
  const toIso = input.toIso ?? range.maxIso
  if (!isValidIsoDate(fromIso) || !isValidIsoDate(toIso)) return []
  if (compareIsoDate(fromIso, toIso) > 0) return []

  const days: ShowroomDayAvailability[] = []
  let cursor = fromIso
  // 조회 창 상한 — 호출자가 넓은 범위를 줘도 응답이 무한정 커지지 않게 막는다.
  let guard = 0

  while (compareIsoDate(cursor, toIso) <= 0 && guard < 400) {
    guard += 1
    days.push(buildDayAvailability(cursor, range, holidayDates, busy))
    cursor = addIsoDays(cursor, 1)
  }

  return days
}

function buildDayAvailability(
  date: string,
  range: ShowroomBookingRange,
  holidayDates: ReadonlySet<string>,
  busy: readonly ShowroomBusyInterval[]
): ShowroomDayAvailability {
  const weekday = getIsoWeekday(date)

  const closedReason = resolveClosedReason(date, range, holidayDates)
  if (closedReason) {
    return { date, weekday, bookable: false, blockedReason: closedReason, slots: [] }
  }

  const slots: ShowroomSlot[] = SHOWROOM_SLOT_TIMES.map((time) => ({
    time,
    state: countBusyOverlaps(date, time, busy) >= SHOWROOM_SLOT_CAPACITY ? "booked" : "open",
  }))

  const hasOpen = slots.some((slot) => slot.state === "open")

  return {
    date,
    weekday,
    bookable: hasOpen,
    blockedReason: hasOpen ? undefined : "full",
    slots,
  }
}

/** 슬롯을 따질 것도 없이 닫힌 날인지. 순서가 곧 사용자에게 보여줄 이유의 우선순위다. */
function resolveClosedReason(
  date: string,
  range: ShowroomBookingRange,
  holidayDates: ReadonlySet<string>
): ShowroomDayBlockedReason | null {
  if (isWeekendIso(date)) return "weekend"
  if (holidayDates.has(date)) return "holiday"
  if (compareIsoDate(date, range.minIso) < 0) return "too_soon"
  if (compareIsoDate(date, range.maxIso) > 0) return "too_far"
  return null
}

/**
 * 예약 접수를 받아도 되는 (날짜, 시각)인가. 서버가 저장 직전에 최종 확인한다.
 * 화면 판정과 같은 함수를 쓰기 위해 가용성 배열을 입력으로 받는다.
 */
export function isShowroomSlotOpen(
  date: string,
  time: string,
  availability: readonly ShowroomDayAvailability[]
): boolean {
  const day = availability.find((candidate) => candidate.date === date)
  if (!day || !day.bookable) return false
  return day.slots.some((slot) => slot.time === time && slot.state === "open")
}

/** 캘린더가 회색으로 막을 날짜 집합. `DesiredDateCalendar` 의 disabled 입력이다. */
export function toDisabledIsoDates(
  availability: readonly ShowroomDayAvailability[]
): Set<string> {
  const disabled = new Set<string>()
  for (const day of availability) {
    if (!day.bookable) disabled.add(day.date)
  }
  return disabled
}

/** 등록된 슬롯 시각인지. 서버 입력 검증이 쓴다. */
export function isShowroomSlotTime(value: unknown): value is ShowroomSlotTime {
  return typeof value === "string" && (SHOWROOM_SLOT_TIMES as readonly string[]).includes(value)
}

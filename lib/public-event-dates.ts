import type { EventStatus } from "@/lib/types/public-events"

export const PUBLIC_EVENT_TIME_ZONE = "Asia/Seoul"
export const DEFAULT_PUBLIC_EVENT_DURATION_MS = 2 * 60 * 60 * 1000

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getZonedParts(value: string) {
  const date = parseDate(value)
  if (!date) return null

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PUBLIC_EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)

  const get = (type: string) => parts.find((part) => part.type === type)?.value
  const year = get("year")
  const month = get("month")
  const day = get("day")
  const hour = get("hour")
  const minute = get("minute")

  if (!year || !month || !day) return null
  return {
    year,
    month,
    day,
    hour: hour === "24" ? "00" : hour ?? "00",
    minute: minute ?? "00",
  }
}

const SESSION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 실제로 달력에 있는 날짜인지 확인한다.
 * new Date("2026-02-31")은 NaN이 아니라 3월 3일로 조용히 넘어가므로 구성요소를 되짚어 봐야 한다.
 */
function isRealCalendarDate(value: string): boolean {
  if (!SESSION_DATE_PATTERN.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (month < 1 || month > 12 || day < 1) return false

  const probe = new Date(Date.UTC(year, month - 1, day))
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  )
}

/**
 * session_dates 정규화 — "YYYY-MM-DD" 문자열만 남기고 중복 제거 후 오름차순 정렬한다.
 * 빈 배열/비배열/전부 불량이면 null(= 단일 기간 행사)을 돌려준다.
 */
export function normalizeSessionDates(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null

  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== "string") continue
    const trimmed = entry.trim()
    if (!isRealCalendarDate(trimmed)) continue
    seen.add(trimmed)
  }

  if (seen.size === 0) return null
  return Array.from(seen).sort()
}

/** KST 날짜("YYYY-MM-DD") + 시각("HH:mm")을 ISO 문자열로. KST는 DST가 없어 고정 오프셋으로 안전하다. */
export function buildKstIso(date: string, time: string): string | null {
  if (!isRealCalendarDate(date)) return null
  const normalizedTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "00:00"
  const parsed = new Date(`${date}T${normalizedTime}:00+09:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export interface PublicEventSessionRange {
  /** KST 기준 회차 날짜 */
  date: string
  startIso: string
  endIso: string
}

/**
 * 행사를 실제로 열리는 구간들로 펼친다.
 * 단일 기간 행사는 구간 1개, 회차 행사는 회차마다 1개를 돌려준다.
 * 회차의 공용 시각은 봉투(starts_at / ends_at)의 KST 시각부에서 되읽는다.
 */
export function getPublicEventSessionRanges(
  startsAt: string,
  endsAt: string | null | undefined,
  sessionDates: unknown
): PublicEventSessionRange[] {
  const sessions = normalizeSessionDates(sessionDates)

  if (!sessions) {
    const start = parseDate(startsAt)
    const endIso = getEffectivePublicEventEndIso(startsAt, endsAt)
    if (!start || !endIso) return []
    return [{ date: getPublicEventDatePart(startsAt), startIso: start.toISOString(), endIso }]
  }

  const startTime = getPublicEventTimePart(startsAt) || "00:00"
  // 종료 시각은 명시된 ends_at의 시각부를 재사용하고, 없으면 회차마다 시작 +2시간으로 둔다.
  const endTime = endsAt ? getPublicEventTimePart(endsAt) : ""

  const ranges: PublicEventSessionRange[] = []
  for (const date of sessions) {
    const startIso = buildKstIso(date, startTime)
    if (!startIso) continue

    let endIso: string
    if (endTime) {
      const sameDayEnd = buildKstIso(date, endTime)
      if (!sameDayEnd) continue
      // 자정을 넘기는 회차(예: 22:00~01:00)는 종료를 다음 날로 민다
      endIso =
        new Date(sameDayEnd).getTime() > new Date(startIso).getTime()
          ? sameDayEnd
          : new Date(new Date(sameDayEnd).getTime() + DAY_MS).toISOString()
    } else {
      endIso = new Date(new Date(startIso).getTime() + DEFAULT_PUBLIC_EVENT_DURATION_MS).toISOString()
    }

    ranges.push({ date, startIso, endIso })
  }

  return ranges
}

function formatSessionDate(date: string, withYear: boolean): string {
  const [year, month, day] = date.split("-")
  return withYear ? `${year}. ${month}. ${day}` : `${month}. ${day}`
}

/**
 * 목록·상세에 노출할 일정 한 줄.
 * 단일 기간이면 "2026. 08. 03 ~ 2026. 08. 17", 회차면 "2026. 08. 03, 08. 10, 08. 17 · 3회".
 */
export function formatPublicEventSchedule(
  startsAt: string,
  endsAt: string | null | undefined,
  sessionDates?: unknown
): string {
  const sessions = normalizeSessionDates(sessionDates)

  if (!sessions) {
    const start = formatPublicEventDate(startsAt)
    if (!endsAt) return start
    // 같은 날 안에서 끝나는 행사는 날짜를 두 번 적지 않는다
    if (getPublicEventDatePart(startsAt) === getPublicEventDatePart(endsAt)) return start
    return `${start} ~ ${formatPublicEventDate(endsAt)}`
  }

  if (sessions.length === 1) return formatSessionDate(sessions[0], true)

  // 회차가 많으면 전부 나열하는 대신 범위 + 일수로 압축한다
  if (sessions.length > 4) {
    const first = sessions[0]
    const last = sessions[sessions.length - 1]
    const sameYear = first.slice(0, 4) === last.slice(0, 4)
    return `${formatSessionDate(first, true)} ~ ${formatSessionDate(last, !sameYear)} 중 ${sessions.length}일`
  }

  let lastYear = ""
  const parts = sessions.map((date) => {
    const year = date.slice(0, 4)
    const label = formatSessionDate(date, year !== lastYear)
    lastYear = year
    return label
  })
  return `${parts.join(", ")} · ${sessions.length}회`
}

export function getEffectivePublicEventEndIso(
  startsAt: string,
  endsAt: string | null | undefined
) {
  const explicitEnd = parseDate(endsAt)
  if (explicitEnd) return explicitEnd.toISOString()

  const start = parseDate(startsAt)
  if (!start) return null
  return new Date(start.getTime() + DEFAULT_PUBLIC_EVENT_DURATION_MS).toISOString()
}

export function computePublicEventStatus(
  startsAt: string,
  endsAt: string | null | undefined,
  statusOverride: EventStatus | string | null | undefined,
  now = new Date()
): EventStatus {
  if (statusOverride) return statusOverride as EventStatus

  const start = parseDate(startsAt)
  if (!start) return "예정"

  const endIso = getEffectivePublicEventEndIso(startsAt, endsAt)
  const end = parseDate(endIso)

  if (now < start) return "예정"
  if (end && now <= end) return "진행 중"
  return "마감"
}

export function formatPublicEventDate(iso: string): string {
  const parts = getZonedParts(iso)
  if (!parts) return iso.slice(0, 10)
  return `${parts.year}. ${parts.month}. ${parts.day}`
}

export function getPublicEventDatePart(iso: string): string {
  const parts = getZonedParts(iso)
  if (!parts) return iso.slice(0, 10)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function getPublicEventTimePart(iso: string): string {
  const parts = getZonedParts(iso)
  if (!parts) return ""
  return `${parts.hour}:${parts.minute}`
}

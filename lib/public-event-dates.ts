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

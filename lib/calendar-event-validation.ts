import type { EventType } from "@/lib/calendar-data"

const EVENT_TYPES = new Set<EventType>([
  "team",
  "deadline",
  "meeting",
  "launch",
  "holiday",
  "other",
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function isEmptyOptional(value: unknown) {
  return value === undefined || value === null || value === ""
}

function compareDateTime(date: string, time = "00:00") {
  return `${date}T${time}`
}

export function validateCalendarEventPayload(
  payload: unknown,
  { requireRequiredFields = false }: { requireRequiredFields?: boolean } = {}
): string | null {
  if (!isPlainObject(payload)) return "요청 본문이 올바르지 않습니다."

  if (requireRequiredFields && !payload.title) return "title은 필수입니다."
  if (requireRequiredFields && !payload.date) return "date는 필수입니다."
  if (requireRequiredFields && !payload.type) return "type은 필수입니다."

  if (payload.title !== undefined && typeof payload.title !== "string") {
    return "title은 문자열이어야 합니다."
  }

  if (payload.date !== undefined && !isValidDateOnly(payload.date)) {
    return "date는 실제 존재하는 YYYY-MM-DD 형식이어야 합니다."
  }

  if (!isEmptyOptional(payload.endDate) && !isValidDateOnly(payload.endDate)) {
    return "endDate는 실제 존재하는 YYYY-MM-DD 형식이어야 합니다."
  }

  if (!isEmptyOptional(payload.time) && !isValidTime(payload.time)) {
    return "time은 HH:mm 형식이어야 합니다."
  }

  if (!isEmptyOptional(payload.endTime) && !isValidTime(payload.endTime)) {
    return "endTime은 HH:mm 형식이어야 합니다."
  }

  if (payload.type !== undefined && !EVENT_TYPES.has(payload.type as EventType)) {
    return "type 값이 올바르지 않습니다."
  }

  if (typeof payload.date === "string" && isValidDateOnly(payload.date)) {
    const endDate =
      typeof payload.endDate === "string" && payload.endDate
        ? payload.endDate
        : payload.date
    const startTime = typeof payload.time === "string" && payload.time ? payload.time : "00:00"
    const endTime =
      typeof payload.endTime === "string" && payload.endTime
        ? payload.endTime
        : startTime

    if (compareDateTime(endDate, endTime) < compareDateTime(payload.date, startTime)) {
      return "종료일시는 시작일시보다 빠를 수 없습니다."
    }
  }

  return null
}

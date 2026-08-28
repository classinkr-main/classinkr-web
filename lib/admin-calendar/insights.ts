import type { CalendarEvent, EventSource } from "@/lib/calendar-data"
import { enumerateDates, overlapsRange, type CalendarRange } from "@/lib/admin-calendar/range"

export function buildSourceStats(
  events: CalendarEvent[]
): { source: EventSource; count: number }[] {
  const counts = new Map<EventSource, number>()

  for (const event of events) {
    // components/admin/calendar/event-style.ts의 getEventSource와 같은 판정 규칙이다.
    const source = event.source ?? "calendar"
    counts.set(source, (counts.get(source) ?? 0) + 1)
  }

  return Array.from(counts, ([source, count]) => ({ source, count }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count
      if (a.source === b.source) return 0
      return a.source < b.source ? -1 : 1
    })
}

export function buildAssigneeLoad(
  events: CalendarEvent[],
  unassignedLabel = "미지정"
): { name: string; count: number }[] {
  const counts = new Map<string, number>()

  for (const event of events) {
    // AssigneeSwimlane의 SHARED_SOURCES와 동일: 공휴일과 공개 행사는 팀 공통 사실이므로 제외한다.
    // components/admin/calendar/event-style.ts의 getEventSource와 같은 판정 규칙이다.
    const source = event.source ?? "calendar"
    if (source === "holiday" || source === "event") continue

    const assignees = event.assignees?.length ? event.assignees : [unassignedLabel]
    for (const name of assignees) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }

  return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => {
    if (a.name === unassignedLabel && b.name === unassignedLabel) return 0
    if (a.name === unassignedLabel) return 1
    if (b.name === unassignedLabel) return -1
    if (a.count !== b.count) return b.count - a.count
    return a.name.localeCompare(b.name, "ko")
  })
}

export interface WeekStripDay {
  date: string
  events: CalendarEvent[]
  count: number
}

function compareEventsByTime(a: CalendarEvent, b: CalendarEvent): number {
  const aHasTime = Boolean(a.time)
  const bHasTime = Boolean(b.time)

  if (aHasTime && bHasTime) return a.time!.localeCompare(b.time!)
  if (aHasTime) return -1
  if (bHasTime) return 1
  return 0
}

export function buildWeekStripDays(
  events: CalendarEvent[],
  range: CalendarRange
): WeekStripDay[] {
  const overlappingEvents = events.filter((event) => overlapsRange(event, range))

  return enumerateDates(range.from, range.to).map((date) => {
    const dayEvents = overlappingEvents
      .filter((event) => event.date <= date && date <= (event.endDate ?? event.date))
      .sort(compareEventsByTime)

    return { date, events: dayEvents, count: dayEvents.length }
  })
}

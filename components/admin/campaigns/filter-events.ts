import type { EventCategory, EventStatus, PublicEvent } from "@/lib/types/public-events"

export interface EventFilterOptions {
  search: string
  status: EventStatus | "all"
  category: EventCategory | "all"
}

export function filterEvents(events: PublicEvent[], opts: EventFilterOptions): PublicEvent[] {
  const needle = opts.search.trim().toLowerCase()
  return events.filter((event) => {
    if (needle && !event.title.toLowerCase().includes(needle)) return false
    if (opts.status !== "all" && event.status !== opts.status) return false
    if (opts.category !== "all" && event.category !== opts.category) return false
    return true
  })
}

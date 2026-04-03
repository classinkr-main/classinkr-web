/**
 * calendar-data.ts — 팀 캘린더 CRUD (JSON 파일 기반)
 * Supabase 전환 시 함수 시그니처 유지, 내부 구현만 교체.
 */
import fs from "fs"
import path from "path"

const FILE = path.join(process.cwd(), "data", "calendar-events.json")

export type EventType = "team" | "deadline" | "meeting" | "launch" | "holiday" | "other"
export type EventSource = "calendar" | "partner"

export interface CalendarEvent {
  id: string
  title: string
  date: string        // YYYY-MM-DD
  endDate?: string    // YYYY-MM-DD (멀티데이)
  time?: string       // HH:mm
  endTime?: string    // HH:mm
  type: EventType
  description?: string
  assignees?: string[]  // 담당자 목록
  allDay?: boolean
  source?: EventSource
  sourceLabel?: string
  readonly?: boolean
  partnerId?: string
  partnerName?: string
  dealId?: string
  dealTitle?: string
  href?: string
  createdAt: string
  updatedAt: string
}

type StoredCalendarEventInput = Omit<
  CalendarEvent,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "source"
  | "sourceLabel"
  | "readonly"
  | "partnerId"
  | "partnerName"
  | "dealId"
  | "dealTitle"
  | "href"
>

function read(): CalendarEvent[] {
  if (!fs.existsSync(FILE)) return []
  return JSON.parse(fs.readFileSync(FILE, "utf8")) as CalendarEvent[]
}

function write(data: CalendarEvent[]) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}

function uid() {
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function compareEvents(a: CalendarEvent, b: CalendarEvent) {
  return (
    a.date.localeCompare(b.date) ||
    (a.time ?? "").localeCompare(b.time ?? "") ||
    a.title.localeCompare(b.title, "ko")
  )
}

function normalizeStoredEvent(event: CalendarEvent): CalendarEvent {
  return {
    ...event,
    source: "calendar",
    sourceLabel: "팀 일정",
    readonly: false,
  }
}

function getStoredEvents(): CalendarEvent[] {
  return read().map(normalizeStoredEvent)
}

function getMonthPrefix(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`
}

function isEventVisibleInMonth(event: CalendarEvent, year: number, month: number) {
  const prefix = getMonthPrefix(year, month)
  const monthStart = `${prefix}-01`
  const monthEnd = `${prefix}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`
  const eventEnd = event.endDate ?? event.date
  return event.date <= monthEnd && eventEnd >= monthStart
}

function parseDatePart(value?: string) {
  if (!value) return undefined
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1]
}

function parseTimePart(value?: string) {
  if (!value) return undefined
  const normalized = value.replace(" ", "T")
  const match = normalized.match(/T(\d{2}:\d{2})/)
  return match?.[1]
}

function mapPartnerScheduleType(kind: string): EventType {
  switch (kind) {
    case "meeting":
      return "meeting"
    case "deadline":
      return "deadline"
    case "renewal":
      return "launch"
    case "follow_up":
    default:
      return "team"
  }
}

async function getPartnerCalendarEvents(): Promise<CalendarEvent[]> {
  const { listPartnerWorkspacesData } = await import("./partners-data")
  const { workspaces } = await listPartnerWorkspacesData()

  return workspaces.flatMap((workspace) =>
    workspace.schedule
      .filter((item) => item.status === "planned")
      .map((item) => {
      const relatedDeal = workspace.deals.find((deal) => deal.id === item.dealId)
      const startsDate = parseDatePart(item.startsAt)
      const endsDate = parseDatePart(item.endsAt)
      const startsTime = parseTimePart(item.startsAt)
      const endsTime = parseTimePart(item.endsAt)
      const descriptionParts = [
        `파트너 ${workspace.partner.name}`,
        relatedDeal ? `거래 ${relatedDeal.title}` : undefined,
        item.owner ? `담당 ${item.owner}` : undefined,
      ].filter(Boolean)
      const now = new Date().toISOString()

      const event: CalendarEvent = {
        id: `partner_schedule_${item.id}`,
        title: `${workspace.partner.name} · ${item.title}`,
        date: startsDate ?? "",
        endDate: endsDate && endsDate !== startsDate ? endsDate : undefined,
        time: startsTime,
        endTime: endsTime,
        type: mapPartnerScheduleType(item.kind),
        description: descriptionParts.join(" · "),
        assignees: item.owner ? [item.owner] : workspace.partner.accountManager ? [workspace.partner.accountManager] : [],
        allDay: !startsTime && !endsTime,
        source: "partner",
        sourceLabel: "파트너 일정",
        readonly: true,
        partnerId: workspace.partner.id,
        partnerName: workspace.partner.name,
        dealId: relatedDeal?.id,
        dealTitle: relatedDeal?.title,
        href: `/admin/partners/${workspace.partner.id}`,
        createdAt: now,
        updatedAt: now,
      }
      return event
      })
  ).filter((event) => Boolean(event.date))
}

export async function getAllEvents(): Promise<CalendarEvent[]> {
  const [partnerEvents] = await Promise.all([getPartnerCalendarEvents()])
  return [...getStoredEvents(), ...partnerEvents].sort(compareEvents)
}

export async function getEventsByMonth(year: number, month: number): Promise<CalendarEvent[]> {
  const [partnerEvents] = await Promise.all([getPartnerCalendarEvents()])
  const prefix = `${year}-${String(month).padStart(2, "0")}`
  return [...getStoredEvents(), ...partnerEvents]
    .filter((event) => isEventVisibleInMonth(event, year, month) || event.date.startsWith(prefix))
    .sort(compareEvents)
}

export function createEvent(
  data: StoredCalendarEventInput
): CalendarEvent {
  const events = read()
  const now = new Date().toISOString()
  const event: CalendarEvent = {
    ...data,
    id: uid(),
    createdAt: now,
    updatedAt: now,
  }
  events.push(event)
  write(events)
  return normalizeStoredEvent(event)
}

export function updateEvent(
  id: string,
  patch: Partial<StoredCalendarEventInput>
): CalendarEvent | null {
  const events = read()
  const idx = events.findIndex((e) => e.id === id)
  if (idx === -1) return null
  events[idx] = { ...events[idx], ...patch, id, updatedAt: new Date().toISOString() }
  write(events)
  return normalizeStoredEvent(events[idx])
}

export function deleteEvent(id: string): boolean {
  const events = read()
  const next = events.filter((e) => e.id !== id)
  if (next.length === events.length) return false
  write(next)
  return true
}

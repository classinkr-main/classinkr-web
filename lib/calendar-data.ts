/**
 * calendar-data.ts — 팀 캘린더 CRUD (JSON 파일 기반)
 * Supabase 전환 시 함수 시그니처 유지, 내부 구현만 교체.
 */
import fs from "fs"
import path from "path"

const FILE = path.join(process.cwd(), "data", "calendar-events.json")

export type EventType = "team" | "deadline" | "meeting" | "launch" | "holiday" | "other"

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
  createdAt: string
  updatedAt: string
}

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

export function getAllEvents(): CalendarEvent[] {
  return read().sort((a, b) => a.date.localeCompare(b.date))
}

export function getEventsByMonth(year: number, month: number): CalendarEvent[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}`
  return read()
    .filter((e) => e.date.startsWith(prefix) || (e.endDate ?? e.date) >= `${prefix}-01`)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function createEvent(
  data: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">
): CalendarEvent {
  const events = read()
  const now = new Date().toISOString()
  const event: CalendarEvent = { ...data, id: uid(), createdAt: now, updatedAt: now }
  events.push(event)
  write(events)
  return event
}

export function updateEvent(
  id: string,
  patch: Partial<Omit<CalendarEvent, "id" | "createdAt">>
): CalendarEvent | null {
  const events = read()
  const idx = events.findIndex((e) => e.id === id)
  if (idx === -1) return null
  events[idx] = { ...events[idx], ...patch, id, updatedAt: new Date().toISOString() }
  write(events)
  return events[idx]
}

export function deleteEvent(id: string): boolean {
  const events = read()
  const next = events.filter((e) => e.id !== id)
  if (next.length === events.length) return false
  write(next)
  return true
}

/**
 * showroom-ics-calendar.ts — 쇼룸 예약 구글 캘린더(ICS) 읽기 전용 연동
 *
 * 구글 캘린더 비공개 ICS 주소를 서버에서 직접 fetch → VEVENT 파싱 → CalendarEvent 매핑.
 * Supabase 복제 없음(읽기 전용). 5분 TTL 인메모리 캐시.
 * SHOWROOM_CALENDAR_ICS_URL은 절대 클라이언트로 노출되지 않는다.
 */
import type { CalendarEvent } from "@/lib/calendar-data"

const CACHE_TTL_MS = 5 * 60_000
const MAX_EVENTS = 500

interface CacheEntry {
  at: number
  data: CalendarEvent[]
}
const cache = new Map<string, CacheEntry>()

function getIcsUrl(): string | null {
  const url = process.env.SHOWROOM_CALENDAR_ICS_URL?.trim()
  return url && url.length > 0 ? url : null
}

// ─── ICS 파싱 ──────────────────────────────────────────────────────────────────

// ICS 행 접기(folding) 해제: CRLF/LF + 공백·탭(접기 문자 포함)을 모두 제거
function unfoldIcs(text: string): string {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "")
}

interface IcsProp {
  key: string
  params: Map<string, string>
  value: string
}

function parsePropLine(line: string): IcsProp {
  const colonIdx = line.indexOf(":")
  if (colonIdx < 0) return { key: line.trim().toUpperCase(), params: new Map(), value: "" }
  const keyPart = line.slice(0, colonIdx)
  const value = line.slice(colonIdx + 1)
  const segments = keyPart.split(";")
  const key = segments[0].trim().toUpperCase()
  const params = new Map<string, string>()
  for (let i = 1; i < segments.length; i++) {
    const eq = segments[i].indexOf("=")
    if (eq >= 0) {
      const k = segments[i].slice(0, eq).trim().toUpperCase()
      const v = segments[i].slice(eq + 1).trim()
      params.set(k, v)
    }
  }
  return { key, params, value }
}

interface VEvent {
  uid: string
  summary: string
  dtstart: string
  dtstartParams: Map<string, string>
  dtend?: string
  dtendParams: Map<string, string>
  description?: string
  status?: string
  attendees: string[]  // CN 값
  url?: string
  created?: string
  lastModified?: string
}

function extractVEvents(icsText: string): VEvent[] {
  const unfolded = unfoldIcs(icsText)
  const lines = unfolded.split(/\r?\n/)
  const events: VEvent[] = []
  let inEvent = false
  let current: Partial<VEvent> & { attendees: string[] } = { attendees: [] }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line === "BEGIN:VEVENT") {
      inEvent = true
      current = { attendees: [] }
      continue
    }
    if (line === "END:VEVENT") {
      inEvent = false
      if (current.uid && current.summary && current.dtstart) {
        events.push(current as VEvent)
      }
      current = { attendees: [] }
      continue
    }
    if (!inEvent) continue

    const prop = parsePropLine(line)
    switch (prop.key) {
      case "UID":
        current.uid = prop.value
        break
      case "SUMMARY":
        current.summary = decodeIcsText(prop.value)
        break
      case "DTSTART":
        current.dtstart = prop.value
        current.dtstartParams = prop.params
        break
      case "DTEND":
        current.dtend = prop.value
        current.dtendParams = prop.params
        break
      case "DESCRIPTION":
        current.description = decodeIcsText(prop.value) || undefined
        break
      case "STATUS":
        current.status = prop.value.toUpperCase()
        break
      case "ATTENDEE": {
        const cn = prop.params.get("CN")
        if (cn && !cn.includes("@group.calendar.google.com")) current.attendees.push(cn)
        break
      }
      case "URL":
        current.url = prop.value || undefined
        break
      case "CREATED":
        current.created = prop.value
        break
      case "LAST-MODIFIED":
        current.lastModified = prop.value
        break
    }
  }

  return events
}

// ICS 이스케이프 문자 해제: \n → 개행, \, → 쉼표, \; → 세미콜론
function decodeIcsText(value: string): string {
  return value.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\")
}

// ─── 날짜/시간 파싱 ────────────────────────────────────────────────────────────

interface ParsedDt {
  date: string    // YYYY-MM-DD (KST)
  time?: string   // HH:mm (KST), undefined = 종일
}

function parseDt(value: string, params: Map<string, string>): ParsedDt | null {
  if (!value) return null
  // 종일 이벤트: VALUE=DATE or 8자리만
  if (params.get("VALUE") === "DATE" || /^\d{8}$/.test(value)) {
    const year = value.slice(0, 4)
    const month = value.slice(4, 6)
    const day = value.slice(6, 8)
    return { date: `${year}-${month}-${day}` }
  }
  // 기본: YYYYMMDDTHHmmss[Z]
  if (value.length < 15) return null
  const year = parseInt(value.slice(0, 4), 10)
  const month = parseInt(value.slice(4, 6), 10)
  const day = parseInt(value.slice(6, 8), 10)
  const hour = parseInt(value.slice(9, 11), 10)
  const minute = parseInt(value.slice(11, 13), 10)

  if (value.endsWith("Z")) {
    // UTC → KST (UTC+9)
    const utcMs = Date.UTC(year, month - 1, day, hour, minute)
    const kstMs = utcMs + 9 * 3_600_000
    const kst = new Date(kstMs)
    return {
      date: `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`,
      time: `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`,
    }
  }

  // TZID 있음 또는 floating — 입력된 시각 그대로 사용
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  }
}

function parseIcsTimestamp(value?: string): string {
  if (!value) return new Date().toISOString()
  // YYYYMMDDTHHmmssZ → ISO
  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const year = value.slice(0, 4)
    const month = value.slice(4, 6)
    const day = value.slice(6, 8)
    const hour = value.slice(9, 11)
    const min = value.slice(11, 13)
    const sec = value.slice(13, 15)
    return `${year}-${month}-${day}T${hour}:${min}:${sec}Z`
  }
  return new Date().toISOString()
}

// ─── VEvent → CalendarEvent ────────────────────────────────────────────────────

function mapVEvent(ev: VEvent): CalendarEvent | null {
  if (ev.status === "CANCELLED") return null

  const start = parseDt(ev.dtstart, ev.dtstartParams ?? new Map())
  if (!start) return null

  const end = ev.dtend ? parseDt(ev.dtend, ev.dtendParams ?? new Map()) : null
  const endDate = end?.date && end.date !== start.date ? end.date : undefined
  const endTime = end?.time

  const createdAt = parseIcsTimestamp(ev.created)
  const updatedAt = parseIcsTimestamp(ev.lastModified ?? ev.created)

  return {
    id: `showroom_${ev.uid.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    title: ev.summary || "(제목 없음)",
    date: start.date,
    endDate,
    time: start.time,
    endTime,
    type: "meeting",
    description: ev.description,
    assignees: ev.attendees.length > 0 ? ev.attendees : undefined,
    allDay: !start.time && !endTime,
    source: "showroom",
    sourceLabel: "쇼룸 예약",
    readonly: true,
    href: ev.url,
    createdAt,
    updatedAt,
  }
}

// ─── 월 필터 ──────────────────────────────────────────────────────────────────

interface QueryOptions {
  year?: number
  month?: number
}

function isInMonth(event: CalendarEvent, year: number, month: number): boolean {
  const pad = (n: number) => String(n).padStart(2, "0")
  const monthStart = `${year}-${pad(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`
  const eventEnd = event.endDate ?? event.date
  return event.date <= monthEnd && eventEnd >= monthStart
}

// ─── 메인 export ──────────────────────────────────────────────────────────────

export async function getShowroomCalendarEvents(opts: QueryOptions = {}): Promise<CalendarEvent[]> {
  const icsUrl = getIcsUrl()
  if (!icsUrl) return []

  const cacheKey = "all"  // 전체 캐시 후 클라이언트 측 월 필터
  const cached = cache.get(cacheKey)
  const nowMs = Date.now()

  if (cached && nowMs - cached.at < CACHE_TTL_MS) {
    return opts.year && opts.month
      ? cached.data.filter((ev) => isInMonth(ev, opts.year!, opts.month!))
      : cached.data
  }

  try {
    const res = await fetch(icsUrl, { cache: "no-store" })
    if (!res.ok) throw new Error(`showroom ICS fetch failed: ${res.status}`)
    const text = await res.text()
    const vevents = extractVEvents(text)

    if (vevents.length >= MAX_EVENTS) {
      console.warn(`[showroom-ics-calendar] fetched ${vevents.length} VEVENT rows; check for unexpected growth`)
    }

    const events = vevents
      .map(mapVEvent)
      .filter((ev): ev is CalendarEvent => ev !== null)

    cache.set(cacheKey, { at: nowMs, data: events })

    return opts.year && opts.month
      ? events.filter((ev) => isInMonth(ev, opts.year!, opts.month!))
      : events
  } catch {
    // 오류 시 stale 캐시 제공, 없으면 빈 배열 (다른 소스를 깨지 않음)
    if (cached) {
      return opts.year && opts.month
        ? cached.data.filter((ev) => isInMonth(ev, opts.year!, opts.month!))
        : cached.data
    }
    return []
  }
}

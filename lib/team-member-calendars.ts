/**
 * team-member-calendars.ts — 팀원 개인 구글 캘린더 읽기 전용 연동 (서비스 계정 Calendar API)
 *
 * data/team-calendars.json(또는 env TEAM_CALENDAR_MEMBERS)에 정의된 팀원별 구글 캘린더를
 * 서비스 계정으로 events.list 하여, 각 이벤트를 "팀원 행사" 소스의 읽기 전용 CalendarEvent로 매핑한다.
 * 이벤트의 담당자(assignee)는 곧 그 캘린더의 주인 = 팀원 이름이다(= 팀원별 트래킹).
 *
 * 전제(요청 필요): 각 팀원이 자기 구글 캘린더를 서비스 계정 이메일(GOOGLE_SERVICE_ACCOUNT_EMAIL)에
 * "모든 이벤트 세부정보 보기" 권한으로 공유해야 한다. 공유 안 된 캘린더는 조용히 건너뛴다(다른 팀원은 유지).
 * showroom(그룹 캘린더 ICS 공개주소)과 달리 개인 캘린더는 공개가 아니므로 서비스 계정 API로 읽는다.
 *
 * Supabase 복제 없음(읽기 전용). 5분 TTL 인메모리 캐시. 자격/멤버 미설정 시 빈 배열.
 */
import "server-only"

import fs from "fs"
import path from "path"

import type { calendar_v3 } from "googleapis"

import type { CalendarEvent } from "@/lib/calendar-data"
import { calendar as googleCalendar } from "@/lib/google"

interface TeamCalendarMember {
  name: string
  email: string
  role?: string
}

const CONFIG_FILE = path.join(process.cwd(), "data", "team-calendars.json")
const CACHE_TTL_MS = 5 * 60_000
const MAX_PER_CALENDAR = 250

interface CacheEntry {
  at: number
  data: CalendarEvent[]
}
const cache = new Map<string, CacheEntry>()

// ─── 설정 ──────────────────────────────────────────────────────────────────────

function hasServiceAccount(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() && process.env.GOOGLE_PRIVATE_KEY?.trim()
  )
}

function isMember(value: unknown): value is TeamCalendarMember {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { email?: unknown }).email === "string" &&
      typeof (value as { name?: unknown }).name === "string"
  )
}

function readMembers(): TeamCalendarMember[] {
  // 1) env(JSON) 우선 — 배포 환경에서 파일 없이 오버라이드 가능
  const envRaw = process.env.TEAM_CALENDAR_MEMBERS?.trim()
  if (envRaw) {
    try {
      const parsed = JSON.parse(envRaw)
      if (Array.isArray(parsed)) return parsed.filter(isMember)
    } catch {
      /* env 파싱 실패 시 파일로 폴백 */
    }
  }
  // 2) data/team-calendars.json
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))
      if (Array.isArray(parsed)) return parsed.filter(isMember)
    }
  } catch {
    /* 파일 파싱 실패 시 빈 목록 */
  }
  return []
}

// ─── 날짜/시간 (KST) ────────────────────────────────────────────────────────────

interface DateParts {
  date: string // YYYY-MM-DD (KST)
  time?: string // HH:mm (KST)
}

function partsFromDateTime(dateTime: string): DateParts | null {
  const d = new Date(dateTime)
  if (Number.isNaN(d.getTime())) return null
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  let hour = pick("hour")
  if (hour === "24") hour = "00" // Intl가 자정을 24로 주는 케이스 방어
  return { date: `${pick("year")}-${pick("month")}-${pick("day")}`, time: `${hour}:${pick("minute")}` }
}

function subtractOneDay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  const dt = new Date(Date.UTC(year, month - 1, day))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`
}

// ─── Google Event → CalendarEvent ──────────────────────────────────────────────

function mapEvent(ev: calendar_v3.Schema$Event, member: TeamCalendarMember): CalendarEvent | null {
  if (ev.status === "cancelled") return null

  const isAllDay = Boolean(ev.start?.date)
  const start = isAllDay
    ? ev.start?.date
      ? { date: ev.start.date }
      : null
    : ev.start?.dateTime
      ? partsFromDateTime(ev.start.dateTime)
      : null
  if (!start) return null

  let endDate: string | undefined
  let endTime: string | undefined

  if (isAllDay) {
    // Google 종일 이벤트의 end.date는 배타적(exclusive) — 표시용 포함 종료일로 하루 빼기
    if (ev.end?.date) {
      const inclusiveEnd = subtractOneDay(ev.end.date)
      endDate = inclusiveEnd !== start.date ? inclusiveEnd : undefined
    }
  } else {
    const end = ev.end?.dateTime ? partsFromDateTime(ev.end.dateTime) : null
    endDate = end && end.date !== start.date ? end.date : undefined
    endTime = end?.time
  }

  const descriptionParts = [
    ev.location ? `장소: ${ev.location}` : undefined,
    ev.description?.trim() || undefined,
  ].filter(Boolean)

  const memberKey = member.email.replace(/[^a-zA-Z0-9]/g, "_")
  const rawId = (ev.id ?? `${member.email}_${start.date}`).replace(/[^a-zA-Z0-9_-]/g, "_")

  return {
    id: `teamcal_${memberKey}_${rawId}`,
    title: ev.summary?.trim() || "(비공개 일정)",
    date: start.date,
    endDate,
    time: isAllDay ? undefined : start.time,
    endTime,
    type: "meeting",
    description: descriptionParts.length > 0 ? descriptionParts.join(" · ") : undefined,
    assignees: [member.name],
    allDay: isAllDay,
    source: "team_event",
    sourceLabel: "팀원 행사",
    readonly: true,
    href: ev.htmlLink ?? undefined,
    createdAt: ev.created ?? new Date().toISOString(),
    updatedAt: ev.updated ?? ev.created ?? new Date().toISOString(),
  }
}

// ─── 조회 범위 ──────────────────────────────────────────────────────────────────

interface QueryOptions {
  year?: number
  month?: number
}

// KST 월 경계를 UTC ISO로 변환 (KST = UTC+9)
function monthRangeIso(year: number, month: number): { timeMin: string; timeMax: string } {
  const startUtcMs = Date.UTC(year, month - 1, 1, 0, 0, 0) - 9 * 3_600_000
  const endUtcMs = Date.UTC(year, month, 1, 0, 0, 0) - 9 * 3_600_000
  return { timeMin: new Date(startUtcMs).toISOString(), timeMax: new Date(endUtcMs).toISOString() }
}

function readGoogleErrorStatus(error: unknown): number | string {
  if (error && typeof error === "object") {
    if ("code" in error && typeof (error as { code: unknown }).code === "number") {
      return (error as { code: number }).code
    }
    if ("message" in error && typeof (error as { message: unknown }).message === "string") {
      return (error as { message: string }).message
    }
  }
  return "unknown"
}

// ─── 메인 export ──────────────────────────────────────────────────────────────

export async function getTeamEventsCalendarEvents(opts: QueryOptions = {}): Promise<CalendarEvent[]> {
  if (!hasServiceAccount()) return []
  const members = readMembers()
  if (members.length === 0) return []

  const { year, month } = opts
  const cacheKey = year && month ? `${year}-${month}` : "all"
  const cached = cache.get(cacheKey)
  const nowMs = Date.now()
  if (cached && nowMs - cached.at < CACHE_TTL_MS) return cached.data

  // 월 지정이 없으면(getAllEvents) 최근 30일 ~ 향후 180일 창으로 제한
  const range =
    year && month
      ? monthRangeIso(year, month)
      : {
          timeMin: new Date(nowMs - 30 * 86_400_000).toISOString(),
          timeMax: new Date(nowMs + 180 * 86_400_000).toISOString(),
        }

  const perMember = await Promise.all(
    members.map(async (member) => {
      try {
        const res = await googleCalendar.events.list({
          calendarId: member.email,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: MAX_PER_CALENDAR,
          timeMin: range.timeMin,
          timeMax: range.timeMax,
        })
        const items = res.data.items ?? []
        if (items.length >= MAX_PER_CALENDAR) {
          console.warn(
            `[team-member-calendars] ${member.email} hit maxResults(${MAX_PER_CALENDAR}); some events may be omitted`
          )
        }
        return items
          .map((ev) => mapEvent(ev, member))
          .filter((ev): ev is CalendarEvent => ev !== null)
      } catch (error) {
        // 403/404 = 캘린더가 서비스 계정에 공유되지 않음 → 해당 팀원만 건너뜀
        console.warn(
          `[team-member-calendars] skip ${member.email}:`,
          readGoogleErrorStatus(error)
        )
        return []
      }
    })
  )

  const events = perMember.flat()
  cache.set(cacheKey, { at: nowMs, data: events })
  return events
}

// ─── 접근 프로브 (연결 상태용) ─────────────────────────────────────────────────

export interface TeamCalendarAccessSummary {
  /** data/team-calendars.json(또는 env)에 구성된 인원 */
  configured: number
  /** 서비스 계정이 실제로 읽을 수 있는 캘린더 수. null = 프로브 자체 실패(자격 미설정 등) */
  accessible: number | null
}

interface AccessCacheEntry {
  at: number
  data: TeamCalendarAccessSummary
}
let accessCache: AccessCacheEntry | null = null
const ACCESS_CACHE_TTL_MS = 10 * 60_000

/**
 * 팀원 캘린더 접근 가능 여부 요약 — 연결 상태 화면용.
 *
 * 이벤트 조회(getTeamEventsCalendarEvents)는 공유 안 된 캘린더를 조용히 건너뛰므로
 * "0건"과 "공유 안 됨"이 구분되지 않는다. 여기서는 팀원마다 maxResults=1 로 한 번씩
 * 두드려 접근 가능 인원을 센다. 결과는 10분 캐시 — 상태 화면은 실시간일 필요가 없다.
 */
export async function probeTeamCalendarAccess(): Promise<TeamCalendarAccessSummary> {
  const members = readMembers()
  if (!hasServiceAccount()) {
    return { configured: members.length, accessible: null }
  }
  if (members.length === 0) return { configured: 0, accessible: 0 }

  const nowMs = Date.now()
  if (accessCache && nowMs - accessCache.at < ACCESS_CACHE_TTL_MS) return accessCache.data

  const results = await Promise.all(
    members.map(async (member) => {
      try {
        await googleCalendar.events.list({
          calendarId: member.email,
          maxResults: 1,
          timeMin: new Date(nowMs).toISOString(),
        })
        return true
      } catch {
        return false
      }
    })
  )

  const data: TeamCalendarAccessSummary = {
    configured: members.length,
    accessible: results.filter(Boolean).length,
  }
  accessCache = { at: nowMs, data }
  return data
}

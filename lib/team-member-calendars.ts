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
 * 실측(2026-07-29~): 구성된 9명 전원이 서비스 계정에 공유하지 않아 events.list가 전부 404다.
 * 예전엔 실패를 기억하지 않아 TTL이 지날 때마다 9회 왕복을 다시 태웠다. 그래서 두 겹을 둔다:
 *   - 멤버별 네거티브 캐시(60분): 403/404(=미공유)로 실패한 멤버는 그 시간 동안 건너뛴다.
 *   - 소스 억제(60분): 한 번의 시도에서 전원이 실패하면 소스 자체를 잠시 쉬게 한다.
 * 둘 다 시간이 지나면 저절로 풀린다 — 나중에 공유가 열리면 재배포 없이 회복된다(하드 비활성 금지).
 *
 * 캐시 규약은 lib/admin-calendar/source-cache.ts 공용 SWR을 쓴다(스테일 즉시 반환 + 백그라운드 갱신,
 * 콜드 3.5초 마감). 자격증명에 종속된 소스라 next 데이터 캐시로는 승격하지 않는다(인메모리 한정).
 * Supabase 복제 없음(읽기 전용). 자격/멤버 미설정 시 빈 배열.
 */
import "server-only"

import fs from "fs"
import path from "path"

import type { calendar_v3 } from "googleapis"

import type { CalendarEvent } from "@/lib/calendar-data"
import { calendar as googleCalendar } from "@/lib/google"
import {
  EXTERNAL_SOURCE_HARD_TIMEOUT_MS,
  EXTERNAL_SOURCE_STALE_MS,
  EXTERNAL_SOURCE_TIMEOUT_MS,
  EXTERNAL_SOURCE_TTL_MS,
  swrSource,
} from "@/lib/admin-calendar/source-cache"

interface TeamCalendarMember {
  name: string
  email: string
  role?: string
}

const CONFIG_FILE = path.join(process.cwd(), "data", "team-calendars.json")
const CACHE_TTL_MS = EXTERNAL_SOURCE_TTL_MS
const MAX_PER_CALENDAR = 250
/** 미공유(403/404) 멤버 재시도 억제 */
const MEMBER_BLOCK_MS = 60 * 60_000
/** 한 시도에서 전원 실패 시 소스 억제 */
const SOURCE_BLOCK_MS = 60 * 60_000

/** 실패해도 캘린더가 비지 않도록 공유하는 빈 결과(fallback) */
const EMPTY: CalendarEvent[] = []

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

// ─── 네거티브 캐시 ─────────────────────────────────────────────────────────────

/** email → 이 시각까지 재시도 안 함 */
const memberBlockedUntil = new Map<string, number>()
/** 전원 실패 시 소스 전체를 이 시각까지 쉬게 한다 */
let sourceBlockedUntil = 0

/**
 * "이 캘린더는 서비스 계정에 공유되지 않았다"로 읽히는 실패만 기억한다.
 * 일시 장애(5xx·네트워크)는 기억하지 않는다 — 다음 요청이 그대로 다시 시도해야 한다.
 */
function isAccessDenied(error: unknown): boolean {
  const status = readGoogleErrorStatus(error)
  if (typeof status === "number") return status === 403 || status === 404
  return /not\s*found|notfound|forbidden|permission|insufficient/i.test(status)
}

function isMemberBlocked(email: string, nowMs: number): boolean {
  const until = memberBlockedUntil.get(email)
  if (until === undefined) return false
  if (until > nowMs) return true
  memberBlockedUntil.delete(email)
  return false
}

/** 소스 억제 상태 — 억제 중이면 원천 호출 없이 즉시 접는다(마커 에러로 degraded 표시) */
class TeamCalendarSuppressed extends Error {
  constructor(untilMs: number) {
    super(`[team-member-calendars] suppressed until ${new Date(untilMs).toISOString()}`)
    this.name = "TeamCalendarSuppressed"
  }
}

/** 테스트 전용 초기화. 운영 코드에서 부르지 않는다. */
export function resetTeamCalendarBackoff() {
  memberBlockedUntil.clear()
  sourceBlockedUntil = 0
}

// ─── 메인 export ──────────────────────────────────────────────────────────────

interface MemberFetchResult {
  events: CalendarEvent[]
  /** 어떤 이유로든 못 읽었다 */
  failed: boolean
  /** 미공유(403/404)로 못 읽었다 — 이것만 재시도 억제 대상 */
  denied: boolean
}

async function listMemberEvents(
  member: TeamCalendarMember,
  range: { timeMin: string; timeMax: string }
): Promise<MemberFetchResult> {
  try {
    const res = await googleCalendar.events.list(
      {
        calendarId: member.email,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: MAX_PER_CALENDAR,
        timeMin: range.timeMin,
        timeMax: range.timeMax,
      },
      // 원천 하드 마감 — 한 멤버가 늘어져도 다른 멤버·다른 소스를 잡아두지 않는다.
      { timeout: EXTERNAL_SOURCE_HARD_TIMEOUT_MS }
    )
    const items = res.data.items ?? []
    if (items.length >= MAX_PER_CALENDAR) {
      console.warn(
        `[team-member-calendars] ${member.email} hit maxResults(${MAX_PER_CALENDAR}); some events may be omitted`
      )
    }
    // 공유가 열렸다 — 억제를 즉시 푼다(자연 회복).
    memberBlockedUntil.delete(member.email)
    return {
      events: items.map((ev) => mapEvent(ev, member)).filter((ev): ev is CalendarEvent => ev !== null),
      failed: false,
      denied: false,
    }
  } catch (error) {
    // 403/404 = 캘린더가 서비스 계정에 공유되지 않음 → 해당 팀원만 건너뛰고 60분 쉰다
    const denied = isAccessDenied(error)
    if (denied) memberBlockedUntil.set(member.email, Date.now() + MEMBER_BLOCK_MS)
    console.warn(`[team-member-calendars] skip ${member.email}:`, readGoogleErrorStatus(error))
    return { events: EMPTY, failed: true, denied }
  }
}

async function loadTeamEvents(
  members: TeamCalendarMember[],
  range: { timeMin: string; timeMax: string }
): Promise<CalendarEvent[]> {
  const nowMs = Date.now()
  if (sourceBlockedUntil > nowMs) throw new TeamCalendarSuppressed(sourceBlockedUntil)

  const active = members.filter((member) => !isMemberBlocked(member.email, nowMs))
  if (active.length === 0) {
    sourceBlockedUntil = nowMs + SOURCE_BLOCK_MS
    throw new TeamCalendarSuppressed(sourceBlockedUntil)
  }

  const results = await Promise.all(active.map((member) => listMemberEvents(member, range)))

  const skipped = members.length - active.length
  const denied = results.filter((result) => result.denied).length
  const failed = results.filter((result) => result.failed).length

  if (skipped + denied === members.length) {
    // 전원이 미공유로 확인됐다 — 소스를 60분 쉬게 한다. 시간이 지나면 저절로 다시 두드린다.
    sourceBlockedUntil = Date.now() + SOURCE_BLOCK_MS
  }
  if (skipped + failed === members.length) {
    // 이번 시도에서 읽힌 캘린더가 하나도 없다. 일시 장애(5xx)면 억제 없이 다음 요청이 재시도한다.
    throw new TeamCalendarSuppressed(sourceBlockedUntil || Date.now())
  }

  // 알려진 한계(2026-08-28 교차리뷰 #4, 의도적 보류) — partial 결과가 "정상"으로 5분 캐시된다.
  // 9명 중 1명만 구글 5xx면 여기까지 내려와 8명치를 성공으로 반환하고, 공용 SWR은 그걸
  // degraded=false 로 TTL(5분) 동안 들고 있어 실패한 1명을 그 사이 재시도하지 않는다.
  // 지금 위험 창이 작은 이유: 실측상 구성된 9명 전원이 미공유(404)라 위 전원 실패 분기에서
  // 접히고, 여기 도달하는 partial 자체가 아직 발생하지 않는다.
  // 공유가 열리기 시작하면 갚을 것: swrSource에 `cacheable:false`(또는 degraded 전달) 결과
  // 계약을 추가해, transient 실패가 섞인 회차는 콜드 표시용으로만 쓰고 캐시에 굳히지 않는다.
  // (여기서 그냥 throw 하면 읽힌 8명까지 화면에서 사라지므로 그 방향은 택하지 않는다.)
  sourceBlockedUntil = 0
  return results.flatMap((result) => result.events)
}

export async function getTeamEventsCalendarEvents(opts: QueryOptions = {}): Promise<CalendarEvent[]> {
  if (!hasServiceAccount()) return []
  const members = readMembers()
  if (members.length === 0) return []

  const { year, month } = opts
  const nowMs = Date.now()
  const cacheKey = year && month ? `${year}-${month}` : "all"

  // 월 지정이 없으면(getAllEvents) 최근 30일 ~ 향후 180일 창으로 제한
  const range =
    year && month
      ? monthRangeIso(year, month)
      : {
          timeMin: new Date(nowMs - 30 * 86_400_000).toISOString(),
          timeMax: new Date(nowMs + 180 * 86_400_000).toISOString(),
        }

  const result = await swrSource<CalendarEvent[]>({
    key: `team_event:${cacheKey}`,
    label: "team_event",
    ttlMs: CACHE_TTL_MS,
    staleMs: EXTERNAL_SOURCE_STALE_MS,
    timeoutMs: EXTERNAL_SOURCE_TIMEOUT_MS,
    fallback: EMPTY,
    fetcher: () => loadTeamEvents(members, range),
  })
  return result.data
}

// ─── 접근 프로브 (연결 상태용) ─────────────────────────────────────────────────

export interface TeamCalendarAccessSummary {
  /** data/team-calendars.json(또는 env)에 구성된 인원 */
  configured: number
  /** 서비스 계정이 실제로 읽을 수 있는 캘린더 수. null = 프로브 자체 실패(자격 미설정 등) */
  accessible: number | null
}

const ACCESS_CACHE_TTL_MS = 10 * 60_000

/** 프로브 판단 불가 마커 — 일시 장애가 섞인 회차. 공용 SWR이 fallback(accessible:null)로 접는다. */
class TeamCalendarProbeInconclusive extends Error {
  constructor(transientCount: number) {
    super(`[team-member-calendars] access probe inconclusive: ${transientCount} transient failure(s)`)
    this.name = "TeamCalendarProbeInconclusive"
  }
}

/**
 * 팀원 캘린더 접근 가능 여부 요약 — 연결 상태 화면용.
 *
 * 이벤트 조회(getTeamEventsCalendarEvents)는 공유 안 된 캘린더를 조용히 건너뛰므로
 * "0건"과 "공유 안 됨"이 구분되지 않는다. 여기서는 팀원마다 maxResults=1 로 한 번씩
 * 두드려 접근 가능 인원을 센다. 결과는 10분 캐시 — 상태 화면은 실시간일 필요가 없다.
 *
 * 이벤트 조회의 네거티브 캐시를 일부러 참조하지 않는다 — 이 프로브가 "공유가 열렸다"를
 * 알아채는 유일한 경로다. 대신 공용 SWR로 감싸 스테일을 즉시 주고(연결 상태 배지는
 * 실시간일 필요가 없다) 콜드도 3.5초에서 끊는다.
 *
 * 실패는 두 종류로 나눠 센다(2026-08-28 교차리뷰 #5). 403/404만 "공유 안 됨"이고,
 * 5xx·타임아웃은 "판단 불가"다 — 구글이 잠깐 죽었을 뿐인데 accessible:0 을 10분 캐시하면
 * 화면이 "9명 공유 필요"라고 오진한다. 응답 마감(3.5초)을 넘겨 늦게 끝난 시도도 마찬가지라,
 * 판단 불가는 값을 반환하지 않고 던져서 캐시에 아예 앉지 못하게 한다.
 */
export async function probeTeamCalendarAccess(): Promise<TeamCalendarAccessSummary> {
  const members = readMembers()
  if (!hasServiceAccount()) {
    return { configured: members.length, accessible: null }
  }
  if (members.length === 0) return { configured: 0, accessible: 0 }

  const nowMs = Date.now()
  const result = await swrSource<TeamCalendarAccessSummary>({
    key: "team_event_access",
    label: "team_event_access",
    ttlMs: ACCESS_CACHE_TTL_MS,
    staleMs: EXTERNAL_SOURCE_STALE_MS,
    timeoutMs: EXTERNAL_SOURCE_TIMEOUT_MS,
    // 프로브 자체가 실패하면 "모른다"로 말한다 — 죽었다고 단정하지 않는다(health.ts 규약).
    fallback: { configured: members.length, accessible: null },
    fetcher: async () => {
      const results = await Promise.all(
        members.map(async (member) => {
          try {
            await googleCalendar.events.list(
              {
                calendarId: member.email,
                maxResults: 1,
                timeMin: new Date(nowMs).toISOString(),
              },
              { timeout: EXTERNAL_SOURCE_HARD_TIMEOUT_MS }
            )
            return "accessible" as const
          } catch (error) {
            // 403/404만 "공유 안 됨"이다. 5xx·타임아웃까지 미공유로 세면 구글 장애 한 번에
            // 화면이 "N명 공유 필요"라고 오진하고, 그 오진이 10분 캐시로 굳는다.
            return isAccessDenied(error) ? ("denied" as const) : ("transient" as const)
          }
        })
      )

      if (results.some((result) => result === "transient")) {
        // 한 명이라도 판단 불가면 인원 수를 셀 수 없다 — 모른다고 말한다(fallback accessible:null).
        // throw이므로 캐시에도 앉지 않아 다음 요청이 그대로 다시 확인한다.
        throw new TeamCalendarProbeInconclusive(
          results.filter((result) => result === "transient").length
        )
      }

      return {
        configured: members.length,
        accessible: results.filter((result) => result === "accessible").length,
      }
    },
  })
  return result.data
}

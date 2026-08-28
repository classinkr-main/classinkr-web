/**
 * calendar-data.ts — 팀 캘린더 CRUD
 *
 * 저장소는 두 갈래다:
 *   - Supabase 자격이 있으면 admin_calendar_events 테이블(lib/repositories/admin-calendar-events.ts)
 *   - 없으면(자격 없는 로컬 개발) 기존 data/calendar-events.json 파일
 *
 * 원래는 JSON 파일 전용이었는데, assertLocalJsonWriteAllowed() 가 배포 환경에서 throw 하는
 * 탓에 프로덕션에서는 팀 일정 생성·수정·삭제가 전부 실패했다(= source "calendar" 가 영구 0건).
 * 그래서 저장소만 Supabase 로 옮기고 이 모듈의 함수 시그니처는 그대로 뒀다.
 */
import fs from "fs"
import path from "path"

import {
  deleteGoogleCalendarEvent,
  isGoogleCalendarSyncConfigured,
  upsertGoogleCalendarEvent,
} from "@/lib/google-calendar-sync"
import {
  getBusinessMonthRangeIso,
  toBusinessClockDateTime,
} from "@/lib/business-time"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"
import { atomicWriteJsonSync } from "@/lib/atomic-write"
import { assertLocalJsonWriteAllowed } from "@/lib/server/runtime-persistence"
import {
  getEffectivePublicEventEndIso,
  getPublicEventDatePart,
  normalizeSessionDates,
} from "@/lib/public-event-dates"
import { getNotionMarketingCalendarEvents } from "@/lib/notion-marketing-calendar"
import { getShowroomCalendarEvents } from "@/lib/showroom-ics-calendar"
import { getCompassDemoCalendarEvents } from "@/lib/compass/calendar"
import { getTeamEventsCalendarEvents } from "@/lib/team-member-calendars"
import { getKoreaHolidayEvents } from "@/lib/korea-holidays"
import { normalizeAssigneeNames } from "@/lib/admin-calendar/people"
import { enumerateMonths, overlapsRange } from "@/lib/admin-calendar/range"
import {
  deleteStoredCalendarEvent,
  getStoredCalendarEvent,
  insertStoredCalendarEvent,
  listStoredCalendarEvents,
  updateStoredCalendarEvent,
  type StoredCalendarEventRange,
} from "@/lib/repositories/admin-calendar-events"

const FILE = path.join(process.cwd(), "data", "calendar-events.json")

export type EventType = "team" | "deadline" | "meeting" | "launch" | "holiday" | "other"
export type EventSource =
  | "calendar"
  | "partner"
  | "event"
  | "notion"
  | "showroom"
  | "team_event"
  | "holiday"
  // Compass(마케팅팀 앱)가 미러하는 구글 'MKT 데모일정' 캘린더. 읽기 전용 — lib/compass/calendar.ts
  | "compass_demo"

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
  syncToAdminCalendar?: boolean
  googleCalendarEventId?: string
  googleCalendarLastSyncedAt?: string
  googleCalendarSyncError?: string
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
  | "syncToAdminCalendar"
  | "googleCalendarEventId"
  | "googleCalendarLastSyncedAt"
  | "googleCalendarSyncError"
>

interface PartnerScheduleCalendarRow {
  id: string
  partner_id: string
  deal_id: string | null
  kind: string
  status: string
  title: string
  starts_at: string
  ends_at: string | null
  owner_name: string | null
  sync_to_admin_calendar: boolean | null
}

interface PartnerNameRow {
  id: string
  name: string
}

interface DealTitleRow {
  id: string
  title: string
}

interface PartnerCalendarQueryOptions {
  year?: number
  month?: number
}

function readEnv(name: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : null
}

function hasSupabaseServerConfig() {
  return Boolean(
    hasSupabaseBrowserEnv() &&
      (readEnv("SUPABASE_SECRET_KEY") ?? readEnv("SUPABASE_SERVICE_ROLE_KEY"))
  )
}

function readJsonFile(): CalendarEvent[] {
  if (!fs.existsSync(FILE)) return []
  return JSON.parse(fs.readFileSync(FILE, "utf8")) as CalendarEvent[]
}

function writeJsonFile(data: CalendarEvent[]) {
  assertLocalJsonWriteAllowed("admin-calendar")
  atomicWriteJsonSync(FILE, data)
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
    // 담당자는 폼에서 자유 입력이라 표기가 흔들린다 — 외부 소스와 같은 캐논으로 눕힌다.
    assignees: normalizeAssigneeNames(event.assignees),
    source: "calendar",
    sourceLabel: "팀 일정",
    readonly: false,
  }
}

/**
 * 팀 일정 조회. Supabase 자격이 있으면 테이블에서, 없으면 JSON 파일에서 읽는다.
 * range 는 Supabase 경로에서만 질의로 내려가고, JSON 경로는 호출부의 월 필터가 마저 거른다.
 */
async function getStoredEvents(range?: StoredCalendarEventRange): Promise<CalendarEvent[]> {
  if (hasSupabaseServerConfig()) {
    try {
      return (await listStoredCalendarEvents(range)).map(normalizeStoredEvent)
    } catch (error) {
      // 조회 실패가 캘린더 전체를 비우지 않도록 파일로 물러선다(운영에선 대개 빈 배열).
      console.error("[calendar-data] failed to list stored events from Supabase", error)
    }
  }
  return readJsonFile().map(normalizeStoredEvent)
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
  const match = toBusinessClockDateTime(value).match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1]
}

function parseTimePart(value?: string) {
  if (!value) return undefined
  const match = toBusinessClockDateTime(value).match(/T(\d{2}:\d{2})/)
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

function createPartnerCalendarEvent(input: {
  id: string
  partnerId: string
  partnerName: string
  dealId?: string
  dealTitle?: string
  kind: string
  title: string
  startsAt: string
  endsAt?: string
  owner?: string
  fallbackAssignee?: string
  syncToAdminCalendar?: boolean
}): CalendarEvent | null {
  const startsDate = parseDatePart(input.startsAt)
  if (!startsDate) return null

  const endsDate = parseDatePart(input.endsAt)
  const startsTime = parseTimePart(input.startsAt)
  const endsTime = parseTimePart(input.endsAt)
  const descriptionParts = [
    `파트너 ${input.partnerName}`,
    input.dealTitle ? `거래 ${input.dealTitle}` : undefined,
    input.owner ? `담당 ${input.owner}` : undefined,
  ].filter(Boolean)
  const now = new Date().toISOString()

  return {
    id: `partner_schedule_${input.id}`,
    title: `${input.partnerName} · ${input.title}`,
    date: startsDate,
    endDate: endsDate && endsDate !== startsDate ? endsDate : undefined,
    time: startsTime,
    endTime: endsTime,
    type: mapPartnerScheduleType(input.kind),
    description: descriptionParts.join(" · "),
    assignees: normalizeAssigneeNames([input.owner ?? input.fallbackAssignee]),
    allDay: !startsTime && !endsTime,
    source: "partner",
    sourceLabel: "파트너 일정",
    readonly: true,
    partnerId: input.partnerId,
    partnerName: input.partnerName,
    dealId: input.dealId,
    dealTitle: input.dealTitle,
    href: `/admin/crm/deals/kpi/${input.partnerId}`,
    syncToAdminCalendar: input.syncToAdminCalendar ?? true,
    createdAt: now,
    updatedAt: now,
  }
}

function filterPartnerEventByMonth(
  event: CalendarEvent,
  options?: PartnerCalendarQueryOptions
) {
  if (!options?.year || !options?.month) return true
  return isEventVisibleInMonth(event, options.year, options.month)
}

async function getLocalPartnerCalendarEvents(
  options?: PartnerCalendarQueryOptions
): Promise<CalendarEvent[]> {
  const { listPartnerWorkspacesData } = await import("./partners-data")
  const { workspaces } = await listPartnerWorkspacesData()

  return workspaces.flatMap((workspace) =>
    workspace.schedule
      .filter((item) => item.status === "planned")
      .map((item) =>
        createPartnerCalendarEvent({
          id: item.id,
          partnerId: workspace.partner.id,
          partnerName: workspace.partner.name,
          dealId: item.dealId,
          dealTitle: workspace.deals.find((deal) => deal.id === item.dealId)?.title,
          kind: item.kind,
          title: item.title,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          owner: item.owner,
          fallbackAssignee: workspace.partner.accountManager,
          syncToAdminCalendar:
            typeof (item as { syncToAdminCalendar?: boolean }).syncToAdminCalendar === "boolean"
              ? (item as { syncToAdminCalendar?: boolean }).syncToAdminCalendar
              : true,
        })
      )
      .filter((event): event is CalendarEvent => Boolean(event))
      .filter((event) => event.syncToAdminCalendar !== false)
      .filter((event) => filterPartnerEventByMonth(event, options))
  )
}

async function querySupabasePartnerCalendarEventsByMonth(
  year: number,
  month: number
): Promise<CalendarEvent[]> {
  const supabase = createSupabaseAdminClient()
  // KST 자정 기준 월 경계 — 저장된 timestamptz 인스턴트를 같은 기준으로 거른다
  const { startIso, endIso } = getBusinessMonthRangeIso(year, month)

  const createBaseQuery = () =>
    supabase
      .from("partner_schedule_items")
      .select("id, partner_id, deal_id, kind, status, title, starts_at, ends_at, owner_name, sync_to_admin_calendar")
      .eq("status", "planned")
      .eq("sync_to_admin_calendar", true)
      .order("starts_at", { ascending: true })

  const [inMonthResult, spanningResult] = await Promise.all([
    createBaseQuery().gte("starts_at", startIso).lt("starts_at", endIso),
    createBaseQuery().lt("starts_at", startIso).gte("ends_at", startIso),
  ])

  const firstError = inMonthResult.error ?? spanningResult.error
  if (firstError) throw new Error(firstError.message)

  const scheduleRows = [...(inMonthResult.data ?? []), ...(spanningResult.data ?? [])] as PartnerScheduleCalendarRow[]
  const uniqueRows = Array.from(new Map(scheduleRows.map((item) => [item.id, item])).values())

  if (uniqueRows.length === 0) return []

  const partnerIds = Array.from(new Set(uniqueRows.map((item) => item.partner_id).filter(Boolean)))
  const dealIds = Array.from(new Set(uniqueRows.map((item) => item.deal_id).filter(Boolean))) as string[]

  const [partnersResult, dealsResult] = await Promise.all([
    partnerIds.length > 0
      ? supabase.from("partners").select("id, name").in("id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length > 0
      ? supabase.from("partner_deals").select("id, title").in("id", dealIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const relationError = partnersResult.error ?? dealsResult.error
  if (relationError) throw new Error(relationError.message)

  const partnerNameById = new Map(
    ((partnersResult.data ?? []) as PartnerNameRow[]).map((item) => [item.id, item.name])
  )
  const dealTitleById = new Map(
    ((dealsResult.data ?? []) as DealTitleRow[]).map((item) => [item.id, item.title])
  )

  return uniqueRows
    .map((item) =>
      createPartnerCalendarEvent({
        id: item.id,
        partnerId: item.partner_id,
        partnerName: partnerNameById.get(item.partner_id) ?? "파트너",
        dealId: item.deal_id ?? undefined,
        dealTitle: item.deal_id ? dealTitleById.get(item.deal_id) : undefined,
        kind: item.kind,
        title: item.title,
        startsAt: item.starts_at,
        endsAt: item.ends_at ?? undefined,
        owner: item.owner_name ?? undefined,
        syncToAdminCalendar: item.sync_to_admin_calendar ?? true,
      })
    )
    .filter((event): event is CalendarEvent => Boolean(event))
}

async function getPartnerCalendarEvents(
  options?: PartnerCalendarQueryOptions
): Promise<CalendarEvent[]> {
  if (options?.year && options?.month && hasSupabaseServerConfig()) {
    try {
      return await querySupabasePartnerCalendarEventsByMonth(options.year, options.month)
    } catch {
      return getLocalPartnerCalendarEvents(options)
    }
  }

  return getLocalPartnerCalendarEvents(options)
}

interface PublicEventCalendarRow {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  session_dates?: unknown
  created_at: string
  updated_at: string
}

// 연결 상태(/api/admin/calendar/health)가 "미래 회차 존재 여부"를 회차 봉투 해석까지
// 그대로 재사용할 수 있도록 export 한다 — 날짜 컬럼을 다시 해석하는 사본을 만들지 않는다.
export async function getPublicEventsAsCalendarEvents(): Promise<CalendarEvent[]> {
  try {
    const supabase = createSupabaseAdminClient()
    const primary = await supabase
      .from("public_events")
      .select("id, title, starts_at, ends_at, session_dates, created_at, updated_at")
      .order("starts_at")

    // session_dates 마이그레이션 적용 전에도 캘린더가 비지 않도록 한 번 물러선다
    let rows: PublicEventCalendarRow[]
    if (primary.error) {
      const legacy = await supabase
        .from("public_events")
        .select("id, title, starts_at, ends_at, created_at, updated_at")
        .order("starts_at")
      if (legacy.error) return []
      rows = legacy.data as unknown as PublicEventCalendarRow[]
    } else {
      rows = primary.data as unknown as PublicEventCalendarRow[]
    }

    return rows.flatMap((row) => {
      const base = {
        title: row.title,
        type: "launch" as EventType,
        source: "event" as EventSource,
        sourceLabel: "공개 행사",
        readonly: true,
        // 행사별 편집 딥링크 — 목록(/admin/events) 대신 해당 행사의 편집 화면으로 직행.
        // 노션/쇼룸/팀원 행사 등 외부 소스 href(외부 URL)는 각자의 빌더가 따로 관리한다.
        href: `/admin/events/${encodeURIComponent(row.id)}/edit`,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }

      // 띄엄띄엄 열리는 회차 행사는 봉투를 통짜 띠로 그리지 않고 회차 날짜에만 찍는다
      const sessions = normalizeSessionDates(row.session_dates)
      if (sessions) {
        return sessions.map((date, index) => ({
          ...base,
          id: `${row.id}:${date}`,
          title: `${row.title} (${index + 1}/${sessions.length}회차)`,
          date,
          endDate: date,
        }))
      }

      return [{
        ...base,
        id: row.id,
        date: getPublicEventDatePart(row.starts_at),
        endDate: getPublicEventDatePart(getEffectivePublicEventEndIso(row.starts_at, row.ends_at) ?? row.starts_at),
      }]
    })
  } catch {
    return []
  }
}

export async function getAllEvents(): Promise<CalendarEvent[]> {
  const [
    storedEvents,
    partnerEvents,
    publicEvents,
    notionEvents,
    showroomEvents,
    teamEventEvents,
    holidayEvents,
    compassEvents,
  ] = await Promise.all([
    getStoredEvents(),
    getPartnerCalendarEvents(),
    getPublicEventsAsCalendarEvents(),
    getNotionMarketingCalendarEvents(),
    getShowroomCalendarEvents(),
    getTeamEventsCalendarEvents(),
    getKoreaHolidayEvents(),
    getCompassDemoCalendarEvents(),
  ])
  return [
    ...storedEvents,
    ...partnerEvents,
    ...publicEvents,
    ...notionEvents,
    ...showroomEvents,
    ...teamEventEvents,
    ...holidayEvents,
    ...compassEvents,
  ].sort(compareEvents)
}

export async function getEventsByMonth(year: number, month: number): Promise<CalendarEvent[]> {
  const prefix = getMonthPrefix(year, month)
  const [
    storedEvents,
    partnerEvents,
    publicEvents,
    notionEvents,
    showroomEvents,
    teamEventEvents,
    holidayEvents,
    compassEvents,
  ] = await Promise.all([
    getStoredEvents({
      from: `${prefix}-01`,
      to: `${prefix}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`,
    }),
    getPartnerCalendarEvents({ year, month }),
    getPublicEventsAsCalendarEvents(),
    getNotionMarketingCalendarEvents({ year, month }),
    getShowroomCalendarEvents({ year, month }),
    getTeamEventsCalendarEvents({ year, month }),
    getKoreaHolidayEvents({ year, month }),
    getCompassDemoCalendarEvents({ year, month }),
  ])
  return [
    ...storedEvents,
    ...partnerEvents,
    ...publicEvents,
    ...notionEvents,
    ...showroomEvents,
    ...teamEventEvents,
    ...holidayEvents,
    ...compassEvents,
  ]
    .filter((event) => isEventVisibleInMonth(event, year, month) || event.date.startsWith(prefix))
    .sort(compareEvents)
}

/**
 * 임의 기간 조회. 주간(달 경계를 넘음)·타임라인(8주) 뷰가 쓴다.
 *
 * 소스 어댑터(노션·쇼룸·구글·공휴일·파트너)는 전부 월 단위 시그니처라, 새 축을 만드는
 * 대신 걸치는 달들을 각각 조회해 id 로 합친다. 8주여도 최대 3개월이고, 각 어댑터의
 * 인메모리 캐시가 월 키로 잡혀 있어 뷰를 오가도 같은 달은 다시 안 부른다.
 */
export async function getEventsByRange(from: string, to: string): Promise<CalendarEvent[]> {
  const months = enumerateMonths({ from, to })
  if (months.length === 0) return []

  const perMonth = await Promise.all(
    months.map(({ year, month }) => getEventsByMonth(year, month))
  )

  // 멀티데이 일정은 걸치는 달마다 중복해서 나오므로 id 로 한 번 눌러준다.
  const byId = new Map<string, CalendarEvent>()
  for (const events of perMonth) {
    for (const event of events) byId.set(event.id, event)
  }

  return Array.from(byId.values())
    .filter((event) => overlapsRange(event, { from, to }))
    .sort(compareEvents)
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function buildAdminGoogleDescription(event: CalendarEvent) {
  const parts = [
    event.assignees && event.assignees.length > 0
      ? `담당: ${event.assignees.join(", ")}`
      : undefined,
    event.description?.trim() || undefined,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join("\n\n") : null
}

function parseAdminDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00+09:00`)
}

function buildAdminTimedRange(event: CalendarEvent) {
  const start = parseAdminDateTime(event.date, event.time ?? "00:00")
  const endDate = event.endDate ?? event.date
  const explicitEnd =
    event.endDate || event.endTime
      ? parseAdminDateTime(endDate, event.endTime ?? event.time ?? "00:00")
      : new Date(start.getTime() + 60 * 60 * 1000)

  const end =
    explicitEnd.getTime() > start.getTime()
      ? explicitEnd
      : new Date(start.getTime() + 60 * 60 * 1000)

  return {
    kind: "timed" as const,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    timeZone: "Asia/Seoul",
  }
}

async function syncStoredEventWithGoogle(event: CalendarEvent): Promise<CalendarEvent> {
  if (!isGoogleCalendarSyncConfigured()) {
    return {
      ...event,
      googleCalendarSyncError:
        "Google Calendar sync is not configured. Set GOOGLE_CALENDAR_ID and service account credentials.",
    }
  }

  try {
    const googleEvent = await upsertGoogleCalendarEvent({
      googleEventId: event.googleCalendarEventId,
      title: event.title,
      description: buildAdminGoogleDescription(event),
      range:
        event.allDay || (!event.time && !event.endTime)
          ? {
              kind: "all_day",
              startDate: event.date,
              endDate: event.endDate ?? event.date,
            }
          : buildAdminTimedRange(event),
      metadata: {
        classin_source: "admin_calendar",
        classin_local_event_id: event.id,
        classin_event_type: event.type,
      },
    })

    return {
      ...event,
      googleCalendarEventId: googleEvent.id ?? event.googleCalendarEventId,
      googleCalendarLastSyncedAt: new Date().toISOString(),
      googleCalendarSyncError: undefined,
    }
  } catch (error) {
    return {
      ...event,
      googleCalendarSyncError: toErrorMessage(error),
    }
  }
}

export async function createEvent(
  data: StoredCalendarEventInput
): Promise<CalendarEvent> {
  const now = new Date().toISOString()
  const event: CalendarEvent = {
    ...data,
    id: uid(),
    createdAt: now,
    updatedAt: now,
  }
  // 구글 미러를 먼저 시도해 그 결과(이벤트 id·에러)를 저장할 행에 실어 보낸다.
  // 미러가 실패해도 syncStoredEventWithGoogle 은 에러 문자열만 채워 돌려주므로 저장은 계속된다.
  const syncedEvent = await syncStoredEventWithGoogle(event)

  if (hasSupabaseServerConfig()) {
    return normalizeStoredEvent(await insertStoredCalendarEvent(syncedEvent))
  }

  assertLocalJsonWriteAllowed("admin-calendar")
  const events = readJsonFile()
  events.push(syncedEvent)
  writeJsonFile(events)
  return normalizeStoredEvent(syncedEvent)
}

export async function updateEvent(
  id: string,
  patch: Partial<StoredCalendarEventInput>
): Promise<CalendarEvent | null> {
  if (hasSupabaseServerConfig()) {
    const current = await getStoredCalendarEvent(id)
    if (!current) return null
    const merged = await syncStoredEventWithGoogle({
      ...current,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    })
    const saved = await updateStoredCalendarEvent(merged)
    return saved ? normalizeStoredEvent(saved) : null
  }

  assertLocalJsonWriteAllowed("admin-calendar")
  const events = readJsonFile()
  const idx = events.findIndex((e) => e.id === id)
  if (idx === -1) return null
  const updatedEvent = {
    ...events[idx],
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  }
  events[idx] = await syncStoredEventWithGoogle(updatedEvent)
  writeJsonFile(events)
  return normalizeStoredEvent(events[idx])
}

/** 구글 미러 삭제는 실패해도 로컬 삭제를 막지 않는다 — 남은 고아 이벤트가 삭제 불가보다 낫다. */
async function unmirrorFromGoogle(event: CalendarEvent) {
  if (!event.googleCalendarEventId || !isGoogleCalendarSyncConfigured()) return
  try {
    await deleteGoogleCalendarEvent(event.googleCalendarEventId)
  } catch (error) {
    console.error("[calendar-data] failed to delete Google Calendar event", error)
  }
}

export async function deleteEvent(id: string): Promise<boolean> {
  if (hasSupabaseServerConfig()) {
    const current = await getStoredCalendarEvent(id)
    if (!current) return false
    await unmirrorFromGoogle(current)
    return deleteStoredCalendarEvent(id)
  }

  assertLocalJsonWriteAllowed("admin-calendar")
  const events = readJsonFile()
  const current = events.find((event) => event.id === id)
  if (!current) return false

  await unmirrorFromGoogle(current)
  writeJsonFile(events.filter((e) => e.id !== id))
  return true
}

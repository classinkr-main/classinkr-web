/**
 * admin-calendar-events.ts — 어드민 운영 캘린더 "팀 일정" 저장소 (Supabase)
 *
 * 마이그레이션: supabase/migrations/20260805_admin_calendar_events.sql
 *
 * 이 저장소가 생기기 전에는 lib/calendar-data.ts 가 data/calendar-events.json 에 직접
 * 썼는데, 배포 환경에서는 파일 쓰기가 차단돼 팀 일정 등록이 전부 실패했다.
 * calendar-data.ts 는 Supabase 자격이 있으면 이 저장소를, 없으면(로컬 개발) 기존 JSON
 * 경로를 쓴다 — 그래서 여기 함수들은 CalendarEvent 를 그대로 주고받는다.
 */
import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { CalendarEvent, EventType } from "@/lib/calendar-data"

const TABLE = "admin_calendar_events"

const COLUMNS =
  "id, title, date, end_date, time, end_time, type, description, assignees, all_day, " +
  "google_calendar_event_id, google_calendar_last_synced_at, google_calendar_sync_error, " +
  "created_at, updated_at"

interface AdminCalendarEventRow {
  id: string
  title: string
  date: string
  end_date: string | null
  time: string | null
  end_time: string | null
  type: EventType
  description: string | null
  assignees: string[] | null
  all_day: boolean
  google_calendar_event_id: string | null
  google_calendar_last_synced_at: string | null
  google_calendar_sync_error: string | null
  created_at: string
  updated_at: string
}

export interface StoredCalendarEventRange {
  /** YYYY-MM-DD, 포함 */
  from: string
  /** YYYY-MM-DD, 포함 */
  to: string
}

function toCalendarEvent(row: AdminCalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    endDate: row.end_date ?? undefined,
    time: row.time ?? undefined,
    endTime: row.end_time ?? undefined,
    type: row.type,
    description: row.description ?? undefined,
    assignees: row.assignees ?? [],
    allDay: row.all_day,
    googleCalendarEventId: row.google_calendar_event_id ?? undefined,
    googleCalendarLastSyncedAt: row.google_calendar_last_synced_at ?? undefined,
    googleCalendarSyncError: row.google_calendar_sync_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** undefined(미지정)와 null(값 지움)을 모두 NULL 로 눕힌다 — 컬럼은 전부 nullable 이다. */
function toRow(event: CalendarEvent): Record<string, unknown> {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    end_date: event.endDate ?? null,
    time: event.time ?? null,
    end_time: event.endTime ?? null,
    type: event.type,
    description: event.description ?? null,
    assignees: event.assignees ?? [],
    all_day: event.allDay ?? false,
    google_calendar_event_id: event.googleCalendarEventId ?? null,
    google_calendar_last_synced_at: event.googleCalendarLastSyncedAt ?? null,
    google_calendar_sync_error: event.googleCalendarSyncError ?? null,
    created_at: event.createdAt,
    updated_at: event.updatedAt,
  }
}

/**
 * 기간과 겹치는 팀 일정. range 를 주지 않으면 전량.
 *
 * 겹침 판정은 `date <= to AND coalesce(end_date, date) >= from` 인데 PostgREST 로는
 * coalesce 를 표현할 수 없다. 그래서 (a) 종료일이 있는 행은 end_date 로, (b) 없는 행은
 * date 로 각각 거른 뒤 합친다 — 두 질의 모두 인덱스를 탄다.
 */
export async function listStoredCalendarEvents(
  range?: StoredCalendarEventRange
): Promise<CalendarEvent[]> {
  const supabase = createSupabaseAdminClient()

  if (!range) {
    const { data, error } = await supabase.from(TABLE).select(COLUMNS).order("date")
    if (error) throw new Error(error.message)
    return (data as unknown as AdminCalendarEventRow[]).map(toCalendarEvent)
  }

  const [openEnded, spanning] = await Promise.all([
    supabase
      .from(TABLE)
      .select(COLUMNS)
      .is("end_date", null)
      .gte("date", range.from)
      .lte("date", range.to),
    supabase
      .from(TABLE)
      .select(COLUMNS)
      .not("end_date", "is", null)
      .lte("date", range.to)
      .gte("end_date", range.from),
  ])

  const error = openEnded.error ?? spanning.error
  if (error) throw new Error(error.message)

  const rows = [
    ...((openEnded.data ?? []) as unknown as AdminCalendarEventRow[]),
    ...((spanning.data ?? []) as unknown as AdminCalendarEventRow[]),
  ]

  return Array.from(new Map(rows.map((row) => [row.id, row])).values())
    .map(toCalendarEvent)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
}

export async function getStoredCalendarEvent(id: string): Promise<CalendarEvent | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toCalendarEvent(data as unknown as AdminCalendarEventRow) : null
}

export async function insertStoredCalendarEvent(event: CalendarEvent): Promise<CalendarEvent> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(TABLE).insert(toRow(event)).select(COLUMNS).single()
  if (error) throw new Error(error.message)
  return toCalendarEvent(data as unknown as AdminCalendarEventRow)
}

/** 행 전체를 덮어쓴다 — 호출부가 기존 행을 읽어 병합한 뒤 넘긴다(부분 patch 아님). */
export async function updateStoredCalendarEvent(event: CalendarEvent): Promise<CalendarEvent | null> {
  const supabase = createSupabaseAdminClient()
  // id 는 WHERE 절로만 쓰고, created_at 은 최초 생성 시각이라 갱신 대상이 아니다.
  const patch = toRow(event)
  delete patch.id
  delete patch.created_at
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", event.id)
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toCalendarEvent(data as unknown as AdminCalendarEventRow) : null
}

export async function deleteStoredCalendarEvent(id: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(TABLE).delete().eq("id", id).select("id")
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

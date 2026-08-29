/**
 * showroom-bookings.ts — 목동 쇼룸 상담 예약 접수 저장소 (Supabase)
 *
 * 마이그레이션: supabase/migrations/20260829_showroom_bookings.sql
 *
 * 테이블은 RLS deny-all + service_role 전용이라 반드시 createSupabaseAdminClient() 로만
 * 닿는다(anon/authenticated 는 정책이 0개라 어떤 행도 못 본다).
 *
 * 왜 이 파일이 필요한가: 공개 접수(lib/showroom/bookings.ts)는 행을 만들기만 하고
 * status 를 'requested' 로 남긴다. 담당자가 확정으로 올릴 경로가 없으면 접수는 영원히
 * 미확정으로 남는다 — checkout_requests 가 "테이블은 있는데 읽는 화면이 없다"로 빠진
 * 함정과 같은 자리다. 상태 전이는 여기 한 곳에서만 일어난다.
 */
import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const TABLE = "showroom_bookings"

const COLUMNS =
  "id, visit_date, visit_time, duration_minutes, org, name, phone, email, role, " +
  "visitor_count, academy_size, interests, memo, status, assigned_to, confirmed_at, " +
  "google_calendar_event_id, lead_id, source_page, created_at, updated_at"

/**
 * 허용 상태 — 마이그레이션의 CHECK 제약과 같은 목록이어야 한다.
 * 여기서 늘리면 DB 가 거부하고, DB 에서 늘리면 여기서 400 이 난다.
 */
export const SHOWROOM_BOOKING_STATUSES = [
  "requested",
  "confirmed",
  "completed",
  "no_show",
  "canceled",
] as const

export type ShowroomBookingStatus = (typeof SHOWROOM_BOOKING_STATUSES)[number]

/**
 * 캘린더에 띄우는 상태 — 이탈(no_show·canceled)은 방문이 없었다는 뜻이라 자리를 잡지 않는다.
 * 캘린더 어댑터(lib/showroom/calendar-source.ts)와 연결 상태 요약이 같은 목록을 쓴다.
 */
export const SHOWROOM_BOOKING_CALENDAR_STATUSES: readonly ShowroomBookingStatus[] = [
  "requested",
  "confirmed",
  "completed",
]

export function isShowroomBookingStatus(value: unknown): value is ShowroomBookingStatus {
  return (
    typeof value === "string" &&
    (SHOWROOM_BOOKING_STATUSES as readonly string[]).includes(value)
  )
}

interface ShowroomBookingRow {
  id: string
  visit_date: string
  visit_time: string
  duration_minutes: number
  org: string
  name: string
  phone: string
  email: string | null
  role: string | null
  visitor_count: number
  academy_size: string | null
  interests: string[] | null
  memo: string | null
  status: ShowroomBookingStatus
  assigned_to: string | null
  confirmed_at: string | null
  google_calendar_event_id: string | null
  lead_id: string | null
  source_page: string | null
  created_at: string
  updated_at: string
}

/** 도메인 표기(camelCase). 화면·API 는 snake_case 행을 직접 보지 않는다. */
export interface ShowroomBookingRecord {
  id: string
  /** YYYY-MM-DD */
  visitDate: string
  /** KST 벽시계 HH:mm — timestamptz 가 아니다(마이그레이션 주석 참조) */
  visitTime: string
  durationMinutes: number
  org: string
  name: string
  phone: string
  email: string | null
  role: string | null
  visitorCount: number
  academySize: string | null
  interests: string[]
  memo: string | null
  status: ShowroomBookingStatus
  assignedTo: string | null
  confirmedAt: string | null
  googleCalendarEventId: string | null
  leadId: string | null
  sourcePage: string | null
  createdAt: string
  updatedAt: string
}

function toRecord(row: ShowroomBookingRow): ShowroomBookingRecord {
  return {
    id: row.id,
    visitDate: row.visit_date,
    visitTime: row.visit_time,
    durationMinutes: row.duration_minutes,
    org: row.org,
    name: row.name,
    phone: row.phone,
    email: row.email,
    role: row.role,
    visitorCount: row.visitor_count,
    academySize: row.academy_size,
    interests: row.interests ?? [],
    memo: row.memo,
    status: row.status,
    assignedTo: row.assigned_to,
    confirmedAt: row.confirmed_at,
    googleCalendarEventId: row.google_calendar_event_id,
    leadId: row.lead_id,
    sourcePage: row.source_page,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface ListShowroomBookingsOptions {
  /** 방문일 하한(YYYY-MM-DD, 포함) */
  from?: string
  /** 방문일 상한(YYYY-MM-DD, 포함) */
  to?: string
  status?: ShowroomBookingStatus
}

/**
 * 방문일 순 목록. 필터는 전부 선택이며, 주지 않으면 전량이다.
 * 정렬 축은 담당자가 보는 축과 같다 — 방문일·방문시각 오름차순.
 */
export async function listShowroomBookings(
  options: ListShowroomBookingsOptions = {}
): Promise<ShowroomBookingRecord[]> {
  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from(TABLE)
    .select(COLUMNS)
    .order("visit_date", { ascending: true })
    .order("visit_time", { ascending: true })

  if (options.from) query = query.gte("visit_date", options.from)
  if (options.to) query = query.lte("visit_date", options.to)
  if (options.status) query = query.eq("status", options.status)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as ShowroomBookingRow[]).map(toRecord)
}

export async function getShowroomBooking(id: string): Promise<ShowroomBookingRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toRecord(data as unknown as ShowroomBookingRow) : null
}

export interface UpdateShowroomBookingStatusInput {
  status: ShowroomBookingStatus
  /** 미지정이면 기존 담당자를 그대로 둔다. null 을 주면 지운다. */
  assignedTo?: string | null
}

/**
 * 상태 전이. 없는 id 면 null(호출부가 404).
 *
 * confirmed_at 규칙:
 *  - `confirmed` 로 올릴 때 채운다. 이미 confirmed 인 행을 다시 confirmed 로 PATCH 해도
 *    시각이 흔들리지 않게 기존 값을 보존한다(재시도·더블 클릭).
 *  - confirmed 가 아닌 상태로 내릴 때는 손대지 않는다 — "확정된 적이 있다"는 사실을 지우지
 *    않는다. 취소 뒤 다시 확정하면 그때의 시각으로 갱신된다(현재 확정 시각이 맞다).
 */
export async function updateShowroomBookingStatus(
  id: string,
  input: UpdateShowroomBookingStatusInput
): Promise<ShowroomBookingRecord | null> {
  const current = await getShowroomBooking(id)
  if (!current) return null

  const patch: Record<string, unknown> = { status: input.status }
  if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo

  if (input.status === "confirmed") {
    patch.confirmed_at =
      current.status === "confirmed" && current.confirmedAt
        ? current.confirmedAt
        : new Date().toISOString()
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? toRecord(data as unknown as ShowroomBookingRow) : null
}

/**
 * 소스 연결 상태(/api/admin/calendar/health)용 요약 — 캘린더에 띄우는 상태만 센다.
 * 취소·노쇼만 쌓인 테이블을 "정상"이라 말하면 캘린더가 빈 이유를 설명하지 못한다.
 */
export async function summarizeShowroomBookings(): Promise<{
  count: number
  lastDate: string | null
}> {
  const supabase = createSupabaseAdminClient()
  const statuses = SHOWROOM_BOOKING_CALENDAR_STATUSES as readonly string[]

  const [countRes, latestRes] = await Promise.all([
    supabase.from(TABLE).select("id", { count: "exact", head: true }).in("status", statuses),
    supabase
      .from(TABLE)
      .select("visit_date")
      .in("status", statuses)
      .order("visit_date", { ascending: false })
      .limit(1),
  ])

  if (countRes.error) throw new Error(countRes.error.message)
  if (latestRes.error) throw new Error(latestRes.error.message)

  return {
    count: countRes.count ?? 0,
    lastDate: (latestRes.data?.[0] as { visit_date?: string } | undefined)?.visit_date ?? null,
  }
}

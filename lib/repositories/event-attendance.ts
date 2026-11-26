import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages } from "@/lib/supabase/pagination"
import type { AttendeeOrigin } from "@/lib/supabase/database.types"

// 행사 참석자(crm_customer_events.public_event_id) → 출신(origin)별 참석 + 리드 전환 집계.
// 설계: docs/active/event-attendee-tracking-plan-2026-06-29.md §6

export interface AttendanceOriginStat {
  origin: AttendeeOrigin
  attended: number
  /** 리드-출신 중 전환(status=converted)된 수 */
  converted: number
}

export interface EventAttendanceMatrix {
  eventId: string
  total: number
  converted: number
  /** 리드성 출신(ad/site/new) 참석 수 — 전환율 분모 */
  leadAttended: number
  byOrigin: AttendanceOriginStat[]
}

export const ATTENDEE_ORIGINS: AttendeeOrigin[] = [
  "ad_lead",
  "site_lead",
  "kr_team_lead",
  "new_lead",
  "existing_customer",
  "partner_customer",
  "unknown",
]

const LEAD_ORIGINS = new Set<AttendeeOrigin>(["ad_lead", "site_lead", "kr_team_lead", "new_lead"])

interface AttendanceRow {
  id: string
  public_event_id: string | null
  target_type: string | null
  target_id: string | null
  attendee_origin: AttendeeOrigin | null
}

const ATTENDANCE_SCAN_MAX_ROWS = 100_000
const LEAD_ID_CHUNK = 200
const MISSING_SCHEMA_CODES = new Set(["42P01", "PGRST205", "42703", "PGRST204"])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getAllEventAttendanceMatrices(): Promise<Record<string, EventAttendanceMatrix>> {
  const supabase = createSupabaseAdminClient()
  const paged = await fetchSupabasePages<AttendanceRow>({
    maxRows: ATTENDANCE_SCAN_MAX_ROWS,
    fetchPage: (from, to) =>
      supabase
        .from("crm_customer_events")
        .select(
          "id, public_event_id, target_type, target_id, attendee_origin",
          from === 0 ? { count: "exact" } : undefined
        )
        .not("public_event_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
  })

  if (paged.error) {
    // 마이그레이션 전이거나 컬럼 부재일 때만 빈 결과 — 그 밖의 오류는 숨기지 않고 던진다.
    if (paged.error.code && MISSING_SCHEMA_CODES.has(paged.error.code)) return {}
    throw new Error(`행사 참석 조회 실패: ${paged.error.message ?? "unknown"}`)
  }
  if (paged.truncated) throw new Error("행사 참석 스캔이 상한에 닿았습니다.")

  const rows = paged.data
  if (rows.length === 0) return {}

  // 전환 판정용 리드 상태 맵 — 참석 행이 가리키는 리드만 id/status 로 읽는다.
  const leadStatus = new Map<string, string>()
  const leadIds = [
    ...new Set(
      rows
        .filter((row) => row.target_type === "lead" && row.target_id && UUID_PATTERN.test(row.target_id))
        .map((row) => row.target_id as string)
    ),
  ]
  for (let i = 0; i < leadIds.length; i += LEAD_ID_CHUNK) {
    const { data: leads, error: leadError } = await supabase
      .from("leads")
      .select("id, status")
      .in("id", leadIds.slice(i, i + LEAD_ID_CHUNK))
    if (leadError) throw new Error(`리드 상태 조회 실패: ${leadError.message ?? "unknown"}`)
    for (const lead of (leads ?? []) as Array<{ id: string; status: string }>) {
      leadStatus.set(lead.id, lead.status)
    }
  }

  const acc = new Map<string, Map<AttendeeOrigin, { attended: number; converted: number }>>()
  for (const row of rows) {
    if (!row.public_event_id) continue
    const origin = (row.attendee_origin ?? "unknown") as AttendeeOrigin
    const perEvent = acc.get(row.public_event_id) ?? new Map<AttendeeOrigin, { attended: number; converted: number }>()
    const stat = perEvent.get(origin) ?? { attended: 0, converted: 0 }
    stat.attended += 1
    if (row.target_type === "lead" && row.target_id && leadStatus.get(row.target_id) === "converted") {
      stat.converted += 1
    }
    perEvent.set(origin, stat)
    acc.set(row.public_event_id, perEvent)
  }

  const result: Record<string, EventAttendanceMatrix> = {}
  for (const [eventId, perEvent] of acc.entries()) {
    let total = 0
    let converted = 0
    let leadAttended = 0
    const byOrigin: AttendanceOriginStat[] = ATTENDEE_ORIGINS.map((origin) => {
      const stat = perEvent.get(origin) ?? { attended: 0, converted: 0 }
      total += stat.attended
      converted += stat.converted
      if (LEAD_ORIGINS.has(origin)) leadAttended += stat.attended
      return { origin, attended: stat.attended, converted: stat.converted }
    }).filter((s) => s.attended > 0)
    result[eventId] = { eventId, total, converted, leadAttended, byOrigin }
  }
  return result
}

import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getLeads } from "@/lib/repositories/leads"
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
  "new_lead",
  "existing_customer",
  "partner_customer",
  "unknown",
]

const LEAD_ORIGINS = new Set<AttendeeOrigin>(["ad_lead", "site_lead", "new_lead"])

export async function getAllEventAttendanceMatrices(): Promise<Record<string, EventAttendanceMatrix>> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_customer_events")
    .select("public_event_id, target_type, target_id, attendee_origin")
    .not("public_event_id", "is", null)

  // 마이그레이션 전이거나 컬럼 부재 시 조용히 빈 결과
  if (error) return {}

  const rows = (data ?? []) as Array<{
    public_event_id: string | null
    target_type: string | null
    target_id: string | null
    attendee_origin: AttendeeOrigin | null
  }>
  if (rows.length === 0) return {}

  // 전환 판정용 리드 상태 맵
  const leadStatus = new Map<string, string>()
  try {
    const leads = await getLeads()
    for (const lead of leads) leadStatus.set(lead.id, lead.status)
  } catch {
    // 리드 조회 실패 시 전환은 0으로 둔다(참석 집계는 유지)
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

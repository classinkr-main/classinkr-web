import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type LeadAlertScope = "lead" | "aggregate"

export interface LeadAlertStateRecord {
  id: string
  scope: LeadAlertScope
  subjectId: string
  alertKey: string
  lastSentAt: string
  lastCount: number | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface LeadAlertStateRow {
  id: string
  scope: LeadAlertScope
  subject_id: string
  alert_key: string
  last_sent_at: string
  last_count: number | null
  metadata_json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function toRecord(row: LeadAlertStateRow): LeadAlertStateRecord {
  return {
    id: row.id,
    scope: row.scope,
    subjectId: row.subject_id,
    alertKey: row.alert_key,
    lastSentAt: row.last_sent_at,
    lastCount: row.last_count,
    metadata: row.metadata_json ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getLeadAlertState(input: {
  scope: LeadAlertScope
  subjectId: string
  alertKey: string
}) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("lead_alert_states")
    .select("*")
    .eq("scope", input.scope)
    .eq("subject_id", input.subjectId)
    .eq("alert_key", input.alertKey)
    .maybeSingle()

  if (error) {
    throw new Error(`[lead-alert-states] 조회 실패: ${error.message}`)
  }

  return data ? toRecord(data as LeadAlertStateRow) : null
}

export async function listLeadAlertStates(input: {
  scope: LeadAlertScope
  subjectIds: string[]
}) {
  if (input.subjectIds.length === 0) return []

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("lead_alert_states")
    .select("*")
    .eq("scope", input.scope)
    .in("subject_id", input.subjectIds)

  if (error) {
    throw new Error(`[lead-alert-states] 배치 조회 실패: ${error.message}`)
  }

  return ((data ?? []) as LeadAlertStateRow[]).map(toRecord)
}

export async function markLeadAlertSent(input: {
  scope: LeadAlertScope
  subjectId: string
  alertKey: string
  lastCount?: number
  metadata?: Record<string, unknown>
}) {
  const supabase = createSupabaseAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("lead_alert_states")
    .upsert(
      {
        scope: input.scope,
        subject_id: input.subjectId,
        alert_key: input.alertKey,
        last_sent_at: now,
        last_count: input.lastCount ?? null,
        metadata_json: input.metadata ?? {},
      },
      { onConflict: "scope,subject_id,alert_key" }
    )
    .select("*")
    .single()

  if (error || !data) {
    throw new Error(`[lead-alert-states] 저장 실패: ${error?.message}`)
  }

  return toRecord(data as LeadAlertStateRow)
}

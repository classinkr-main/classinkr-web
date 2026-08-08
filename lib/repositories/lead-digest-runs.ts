import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type LeadDigestReportType = "meta" | "homepage"
export type LeadDigestRunStatus = "pending" | "sent" | "failed"

export interface LeadDigestRunRecord {
  id: string
  reportType: LeadDigestReportType
  windowStart: string
  windowEnd: string
  status: LeadDigestRunStatus
  attemptCount: number
  notificationEventId?: string
  lastError?: string
  claimedAt: string
  finishedAt?: string
  createdAt: string
  updatedAt: string
}

interface LeadDigestRunRow {
  id: string
  report_type: LeadDigestReportType
  window_start: string
  window_end: string
  status: LeadDigestRunStatus
  attempt_count: number
  notification_event_id: string | null
  last_error: string | null
  claimed_at: string
  finished_at: string | null
  created_at: string
  updated_at: string
}

const PENDING_STALE_MS = 15 * 60 * 1000

function toRecord(row: LeadDigestRunRow): LeadDigestRunRecord {
  return {
    id: row.id,
    reportType: row.report_type,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    status: row.status,
    attemptCount: row.attempt_count,
    notificationEventId: row.notification_event_id ?? undefined,
    lastError: row.last_error ?? undefined,
    claimedAt: row.claimed_at,
    finishedAt: row.finished_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isUniqueViolation(error: { code?: string }) {
  return error.code === "23505"
}

function isPendingStale(row: LeadDigestRunRow, now: Date) {
  const claimedAt = new Date(row.claimed_at).getTime()
  return !Number.isFinite(claimedAt) || now.getTime() - claimedAt >= PENDING_STALE_MS
}

export async function claimLeadDigestRun(input: {
  reportType: LeadDigestReportType
  windowStart: Date
  windowEnd: Date
  now?: Date
}): Promise<{ claimed: boolean; run: LeadDigestRunRecord }> {
  const supabase = createSupabaseAdminClient()
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  const row = {
    report_type: input.reportType,
    window_start: input.windowStart.toISOString(),
    window_end: input.windowEnd.toISOString(),
    status: "pending" as const,
    attempt_count: 1,
    claimed_at: nowIso,
    finished_at: null,
    last_error: null,
  }

  const inserted = await supabase
    .from("lead_digest_runs")
    .insert(row)
    .select("*")
    .single()

  if (!inserted.error && inserted.data) {
    return { claimed: true, run: toRecord(inserted.data as LeadDigestRunRow) }
  }

  if (!inserted.error || !isUniqueViolation(inserted.error)) {
    throw new Error(`[lead-digest-runs] 실행 선점 실패: ${inserted.error?.message}`)
  }

  const existingResult = await supabase
    .from("lead_digest_runs")
    .select("*")
    .eq("report_type", input.reportType)
    .eq("window_end", input.windowEnd.toISOString())
    .single()

  if (existingResult.error || !existingResult.data) {
    throw new Error(
      `[lead-digest-runs] 기존 실행 조회 실패: ${existingResult.error?.message}`
    )
  }

  const existing = existingResult.data as LeadDigestRunRow
  const retryable =
    existing.status === "failed" ||
    (existing.status === "pending" && isPendingStale(existing, now))

  if (!retryable) {
    return { claimed: false, run: toRecord(existing) }
  }

  // updated_at까지 조건에 넣어 동시에 들어온 재시도 중 하나만 실행권을 얻는다.
  const retried = await supabase
    .from("lead_digest_runs")
    .update({
      status: "pending",
      attempt_count: existing.attempt_count + 1,
      claimed_at: nowIso,
      finished_at: null,
      last_error: null,
    })
    .eq("id", existing.id)
    .eq("updated_at", existing.updated_at)
    .select("*")
    .maybeSingle()

  if (retried.error) {
    throw new Error(`[lead-digest-runs] 재시도 선점 실패: ${retried.error.message}`)
  }

  if (!retried.data) {
    return { claimed: false, run: toRecord(existing) }
  }

  return { claimed: true, run: toRecord(retried.data as LeadDigestRunRow) }
}

export async function markLeadDigestRunSent(input: {
  runId: string
  notificationEventId: string
}) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("lead_digest_runs")
    .update({
      status: "sent",
      notification_event_id: input.notificationEventId,
      last_error: null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.runId)
    .select("*")
    .single()

  if (error || !data) {
    throw new Error(`[lead-digest-runs] 발송 완료 기록 실패: ${error?.message}`)
  }

  return toRecord(data as LeadDigestRunRow)
}

export async function markLeadDigestRunFailed(input: {
  runId: string
  error: string
}) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("lead_digest_runs")
    .update({
      status: "failed",
      last_error: input.error.slice(0, 1_000),
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.runId)
    .select("*")
    .single()

  if (error || !data) {
    throw new Error(`[lead-digest-runs] 발송 실패 기록 실패: ${error?.message}`)
  }

  return toRecord(data as LeadDigestRunRow)
}

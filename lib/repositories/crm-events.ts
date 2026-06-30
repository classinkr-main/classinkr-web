import "server-only"

import { createCrmRecordingSignedUrls } from "@/lib/storage/crm-recordings"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  AttendeeOrigin,
  CrmCustomerEvent,
  CrmCustomerEventInsert,
  CrmCustomerEventSentiment,
  CrmCustomerEventSourceType,
  CrmCustomerEventTargetType,
} from "@/lib/supabase/database.types"

export type {
  AttendeeOrigin,
  CrmCustomerEventSentiment,
  CrmCustomerEventSourceType,
  CrmCustomerEventTargetType,
}

export const CRM_EVENT_TARGET_TYPES = ["lead", "neo_account", "customer", "deal", "unknown"] as const
export const CRM_EVENT_SOURCE_TYPES = [
  "manual_note",
  "meeting_minutes",
  "recording",
  "calendar_event",
  "lead_contact_log",
  "external_crm",
  "sheet",
  "call",
  "sms",
] as const
export const CRM_EVENT_SENTIMENTS = ["positive", "neutral", "risk"] as const

export interface CrmEventNextAction {
  title: string
  ownerName: string | null
  dueAt: string | null
  done: boolean
}

export interface CrmCustomerEventRecording {
  storagePath: string | null
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
  signedUrl: string | null
}

export interface CrmCustomerEventRecord {
  id: string
  targetType: CrmCustomerEventTargetType
  targetId: string | null
  targetLabel: string | null
  sourceType: CrmCustomerEventSourceType
  sourceId: string | null
  occurredAt: string
  title: string
  summary: string | null
  body: string | null
  meetingPurpose: string | null
  ownerName: string | null
  attendees: string[]
  decisions: string[]
  blockers: string[]
  nextActions: CrmEventNextAction[]
  sentiment: CrmCustomerEventSentiment
  stageSignal: string | null
  tags: string[]
  publicEventId: string | null
  attendeeOrigin: AttendeeOrigin | null
  recording: CrmCustomerEventRecording | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface CrmCustomerEventCreateInput {
  targetType?: CrmCustomerEventTargetType
  targetId?: string | null
  targetLabel?: string | null
  sourceType?: CrmCustomerEventSourceType
  sourceId?: string | null
  occurredAt?: string | null
  title?: string | null
  summary?: string | null
  body?: string | null
  meetingPurpose?: string | null
  ownerName?: string | null
  attendees?: string[]
  decisions?: string[]
  blockers?: string[]
  nextActions?: CrmEventNextAction[]
  sentiment?: CrmCustomerEventSentiment
  stageSignal?: string | null
  tags?: string[]
  publicEventId?: string | null
  attendeeOrigin?: AttendeeOrigin | null
  recording?: {
    storagePath: string
    fileName: string
    mimeType: string
    sizeBytes: number
  } | null
  createdBy?: string | null
}

export interface ListCrmCustomerEventsOptions {
  q?: string
  targetType?: CrmCustomerEventTargetType | "all"
  sourceType?: CrmCustomerEventSourceType | "all"
  sentiment?: CrmCustomerEventSentiment | "all"
  targetId?: string
  limit?: number
  offset?: number
}

export interface ListCrmCustomerEventsResult {
  generatedAt: string
  health: {
    ok: boolean
    message: string | null
  }
  summary: {
    total: number
    returned: number
    recordings: number
    risks: number
    openNextActions: number
  }
  pagination: {
    limit: number
    offset: number
    returned: number
    total: number
    hasMore: boolean
    nextOffset: number | null
  }
  rows: CrmCustomerEventRecord[]
}

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function parseLooseList(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean)
  }

  return (value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function stringArrayFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === "string") return item
      if (item && typeof item === "object" && "name" in item) {
        const name = (item as { name?: unknown }).name
        return typeof name === "string" ? name : ""
      }
      if (item && typeof item === "object" && "title" in item) {
        const title = (item as { title?: unknown }).title
        return typeof title === "string" ? title : ""
      }
      return ""
    })
    .map((item) => item.trim())
    .filter(Boolean)
}

function nextActionsFromJson(value: unknown): CrmEventNextAction[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const raw = item as Record<string, unknown>
      const title = typeof raw.title === "string" ? raw.title.trim() : ""
      if (!title) return null
      const ownerName = typeof raw.ownerName === "string" && raw.ownerName.trim() ? raw.ownerName.trim() : null
      const dueAt = typeof raw.dueAt === "string" && raw.dueAt.trim() ? raw.dueAt.trim() : null
      return {
        title,
        ownerName,
        dueAt,
        done: raw.done === true,
      }
    })
    .filter((item): item is CrmEventNextAction => Boolean(item))
}

function toJsonNameRows(values: string[]) {
  return values.map((name) => ({ name }))
}

function toJsonTitleRows(values: string[]) {
  return values.map((title) => ({ title }))
}

function validIsoOrNow(value: string | null | undefined, now: Date) {
  if (!value) return now.toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? now.toISOString() : date.toISOString()
}

function nullableIso(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(Math.floor(numeric), max))
}

function safeSearch(value: string | null | undefined) {
  return value?.trim().replace(/[%,()]/g, " ").replace(/\s+/g, " ") ?? ""
}

function isMissingCrmEventsTableError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42p01") ||
    haystack.includes("crm_customer_events") && (
      haystack.includes("does not exist") ||
      haystack.includes("could not find") ||
      haystack.includes("schema cache")
    )
  )
}

function emptyEventsResult(limit: number, offset: number, message: string | null): ListCrmCustomerEventsResult {
  return {
    generatedAt: new Date().toISOString(),
    health: {
      ok: !message,
      message,
    },
    summary: {
      total: 0,
      returned: 0,
      recordings: 0,
      risks: 0,
      openNextActions: 0,
    },
    pagination: {
      limit,
      offset,
      returned: 0,
      total: 0,
      hasMore: false,
      nextOffset: null,
    },
    rows: [],
  }
}

function toRecord(row: CrmCustomerEvent, signedUrl: string | null): CrmCustomerEventRecord {
  const recording =
    row.recording_storage_path || row.recording_file_name
      ? {
          storagePath: row.recording_storage_path,
          fileName: row.recording_file_name,
          mimeType: row.recording_mime_type,
          sizeBytes: row.recording_size_bytes,
          signedUrl,
        }
      : null

  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    sourceType: row.source_type,
    sourceId: row.source_id,
    occurredAt: row.occurred_at,
    title: row.title,
    summary: row.summary,
    body: row.body,
    meetingPurpose: row.meeting_purpose,
    ownerName: row.owner_name,
    attendees: stringArrayFromJson(row.attendees),
    decisions: stringArrayFromJson(row.decisions),
    blockers: stringArrayFromJson(row.blockers),
    nextActions: nextActionsFromJson(row.next_actions),
    sentiment: row.sentiment,
    stageSignal: row.stage_signal,
    tags: row.tags ?? [],
    publicEventId: row.public_event_id,
    attendeeOrigin: row.attendee_origin,
    recording,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function buildCrmCustomerEventInsert(
  input: CrmCustomerEventCreateInput,
  now = new Date()
): CrmCustomerEventInsert {
  const nextActions = (input.nextActions ?? [])
    .map((action) => ({
      title: action.title.trim(),
      ownerName: trimOrNull(action.ownerName),
      dueAt: nullableIso(action.dueAt),
      done: action.done === true,
    }))
    .filter((action) => action.title)

  return {
    target_type: input.targetType ?? "unknown",
    target_id: trimOrNull(input.targetId),
    target_label: trimOrNull(input.targetLabel),
    source_type: input.sourceType ?? "manual_note",
    source_id: trimOrNull(input.sourceId),
    occurred_at: validIsoOrNow(input.occurredAt, now),
    title: trimOrNull(input.title) ?? "제목 없는 CRM 기록",
    summary: trimOrNull(input.summary),
    body: trimOrNull(input.body),
    meeting_purpose: trimOrNull(input.meetingPurpose),
    owner_name: trimOrNull(input.ownerName),
    attendees: toJsonNameRows(input.attendees ?? []),
    decisions: toJsonTitleRows(input.decisions ?? []),
    blockers: toJsonTitleRows(input.blockers ?? []),
    next_actions: nextActions,
    sentiment: input.sentiment ?? "neutral",
    stage_signal: trimOrNull(input.stageSignal),
    tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
    public_event_id: trimOrNull(input.publicEventId),
    attendee_origin: input.attendeeOrigin ?? null,
    recording_storage_path: input.recording?.storagePath ?? null,
    recording_file_name: input.recording?.fileName ?? null,
    recording_mime_type: input.recording?.mimeType ?? null,
    recording_size_bytes: input.recording?.sizeBytes ?? null,
    created_by: trimOrNull(input.createdBy),
  }
}

async function recordsWithSignedUrls(rows: CrmCustomerEvent[]) {
  // 페이지 내 모든 녹취 경로를 한 번에 일괄 서명(N+1 → 1 라운드트립).
  const paths = rows
    .map((row) => row.recording_storage_path)
    .filter((path): path is string => Boolean(path))
  const signedByPath = paths.length
    ? await createCrmRecordingSignedUrls(paths)
    : new Map<string, string>()
  return rows.map((row) =>
    toRecord(
      row,
      row.recording_storage_path ? signedByPath.get(row.recording_storage_path) ?? null : null
    )
  )
}

export async function listCrmCustomerEvents(
  options: ListCrmCustomerEventsOptions = {}
): Promise<ListCrmCustomerEventsResult> {
  const limit = clampInteger(options.limit, 50, 1, 100)
  const offset = clampInteger(options.offset, 0, 0, 100_000)
  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from("crm_customer_events")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (options.targetType && options.targetType !== "all") {
    query = query.eq("target_type", options.targetType)
  }
  if (options.sourceType && options.sourceType !== "all") {
    query = query.eq("source_type", options.sourceType)
  }
  if (options.sentiment && options.sentiment !== "all") {
    query = query.eq("sentiment", options.sentiment)
  }
  if (options.targetId) {
    query = query.eq("target_id", options.targetId)
  }

  const search = safeSearch(options.q)
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,summary.ilike.%${search}%,body.ilike.%${search}%,target_label.ilike.%${search}%,owner_name.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query
  if (error) {
    if (isMissingCrmEventsTableError(error)) {
      return emptyEventsResult(limit, offset, "CRM 기록 DB 마이그레이션이 아직 적용되지 않았습니다.")
    }
    throw new Error(`[crm-events] 조회 실패: ${error.message}`)
  }

  const rows = await recordsWithSignedUrls((data ?? []) as CrmCustomerEvent[])
  const returned = rows.length
  const total = count ?? returned
  const nextOffset = offset + returned

  return {
    generatedAt: new Date().toISOString(),
    health: {
      ok: true,
      message: null,
    },
    summary: {
      total,
      returned,
      recordings: rows.filter((row) => Boolean(row.recording)).length,
      risks: rows.filter((row) => row.sentiment === "risk").length,
      openNextActions: rows.reduce(
        (sum, row) => sum + row.nextActions.filter((action) => !action.done).length,
        0
      ),
    },
    pagination: {
      limit,
      offset,
      returned,
      total,
      hasMore: nextOffset < total,
      nextOffset: nextOffset < total ? nextOffset : null,
    },
    rows,
  }
}

export async function createCrmCustomerEvent(input: CrmCustomerEventCreateInput) {
  const supabase = createSupabaseAdminClient()
  const insert = buildCrmCustomerEventInsert(input)
  const { data, error } = await supabase
    .from("crm_customer_events")
    .insert(insert)
    .select("*")
    .single()

  if (error) {
    if (isMissingCrmEventsTableError(error)) {
      throw new Error("CRM 기록 DB 마이그레이션이 아직 적용되지 않았습니다.")
    }
    throw new Error(`[crm-events] 저장 실패: ${error.message}`)
  }
  const [record] = await recordsWithSignedUrls([data as CrmCustomerEvent])
  return record
}

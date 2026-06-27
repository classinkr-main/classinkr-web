import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  CrmTask,
  CrmTaskInsert,
  CrmTaskPriority,
  CrmTaskStatus,
  CrmTaskTargetType,
  CrmTaskType,
  CrmTaskUpdate,
} from "@/lib/supabase/database.types"

export type { CrmTaskPriority, CrmTaskStatus, CrmTaskTargetType, CrmTaskType }

export const CRM_TASK_TARGET_TYPES = ["lead", "neo_account", "customer", "deal", "unknown"] as const
export const CRM_TASK_TYPES = [
  "call",
  "kakao",
  "email",
  "meeting",
  "quote",
  "demo",
  "install",
  "renewal",
  "cs_checkin",
  "data_fix",
  "other",
] as const
export const CRM_TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const
export const CRM_TASK_STATUSES = ["open", "done", "snoozed", "canceled"] as const

const NOT_READY_MESSAGE = "CRM task DB 마이그레이션이 아직 적용되지 않았습니다."

export interface CrmTaskRecord {
  id: string
  targetType: CrmTaskTargetType
  targetId: string | null
  targetLabel: string | null
  ownerKey: string | null
  ownerNameSnapshot: string | null
  taskType: CrmTaskType
  title: string
  detail: string | null
  dueAt: string | null
  snoozedUntil: string | null
  priority: CrmTaskPriority
  status: CrmTaskStatus
  sourceEventId: string | null
  createdBy: string | null
  assignedBy: string | null
  completedAt: string | null
  completedBy: string | null
  outcome: string | null
  createdAt: string
  updatedAt: string
}

export interface CrmTaskCreateInput {
  targetType?: CrmTaskTargetType
  targetId?: string | null
  targetLabel?: string | null
  ownerKey?: string | null
  ownerNameSnapshot?: string | null
  taskType?: CrmTaskType
  title?: string | null
  detail?: string | null
  dueAt?: string | null
  priority?: CrmTaskPriority
  status?: CrmTaskStatus
  sourceEventId?: string | null
  createdBy?: string | null
  assignedBy?: string | null
}

export interface ListCrmTasksOptions {
  q?: string
  status?: CrmTaskStatus | "active" | "all"
  ownerKeys?: string[]
  taskType?: CrmTaskType | "all"
  targetType?: CrmTaskTargetType | "all"
  targetId?: string
  dueBefore?: string
  limit?: number
  offset?: number
  now?: Date
}

export interface ListCrmTasksResult {
  generatedAt: string
  health: {
    ok: boolean
    message: string | null
  }
  summary: {
    total: number
    returned: number
    open: number
    overdue: number
    dueToday: number
    snoozed: number
    done: number
  }
  pagination: {
    limit: number
    offset: number
    returned: number
    total: number
    hasMore: boolean
    nextOffset: number | null
  }
  rows: CrmTaskRecord[]
}

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(Math.floor(numeric), max))
}

function nullableIso(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function safeSearch(value: string | null | undefined) {
  return value?.trim().replace(/[%,()]/g, " ").replace(/\s+/g, " ") ?? ""
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

// 미루기 기본값: 내일 오전 9시(KST). 09:00 KST == 00:00 UTC 다음 날.
export function defaultSnoozeUntil(now = new Date()): string {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS)
  const utc = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + 1, 0, 0, 0)
  return new Date(utc).toISOString()
}

// 같은 KST 날짜인지 비교(오늘 마감 판정용).
function isSameKstDay(a: string | null, now: Date): boolean {
  if (!a) return false
  const date = new Date(a)
  if (Number.isNaN(date.getTime())) return false
  const left = new Date(date.getTime() + KST_OFFSET_MS)
  const right = new Date(now.getTime() + KST_OFFSET_MS)
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  )
}

function isMissingCrmTasksTableError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42p01") ||
    (haystack.includes("crm_tasks") &&
      (haystack.includes("does not exist") ||
        haystack.includes("could not find") ||
        haystack.includes("schema cache")))
  )
}

export function isCrmTasksNotReadyError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes("CRM task DB 마이그레이션")
}

function emptyTasksResult(limit: number, offset: number, message: string | null): ListCrmTasksResult {
  return {
    generatedAt: new Date().toISOString(),
    health: { ok: !message, message },
    summary: { total: 0, returned: 0, open: 0, overdue: 0, dueToday: 0, snoozed: 0, done: 0 },
    pagination: { limit, offset, returned: 0, total: 0, hasMore: false, nextOffset: null },
    rows: [],
  }
}

export function toCrmTaskRecord(row: CrmTask): CrmTaskRecord {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    ownerKey: row.owner_key,
    ownerNameSnapshot: row.owner_name_snapshot,
    taskType: row.task_type,
    title: row.title,
    detail: row.detail,
    dueAt: row.due_at,
    snoozedUntil: row.snoozed_until,
    priority: row.priority,
    status: row.status,
    sourceEventId: row.source_event_id,
    createdBy: row.created_by,
    assignedBy: row.assigned_by,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    outcome: row.outcome,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function buildCrmTaskInsert(input: CrmTaskCreateInput): CrmTaskInsert {
  return {
    target_type: oneOf(input.targetType, CRM_TASK_TARGET_TYPES, "unknown"),
    target_id: trimOrNull(input.targetId),
    target_label: trimOrNull(input.targetLabel),
    owner_key: trimOrNull(input.ownerKey),
    owner_name_snapshot: trimOrNull(input.ownerNameSnapshot),
    task_type: oneOf(input.taskType, CRM_TASK_TYPES, "call"),
    title: trimOrNull(input.title) ?? "제목 없는 CRM 할 일",
    detail: trimOrNull(input.detail),
    due_at: nullableIso(input.dueAt),
    snoozed_until: null,
    priority: oneOf(input.priority, CRM_TASK_PRIORITIES, "normal"),
    status: oneOf(input.status, CRM_TASK_STATUSES, "open"),
    source_event_id: trimOrNull(input.sourceEventId),
    created_by: trimOrNull(input.createdBy),
    assigned_by: trimOrNull(input.assignedBy),
    completed_at: null,
    completed_by: null,
    outcome: null,
  }
}

function summarize(rows: CrmTaskRecord[], total: number, now: Date) {
  const nowIso = now.toISOString()
  return {
    total,
    returned: rows.length,
    open: rows.filter((row) => row.status === "open").length,
    overdue: rows.filter((row) => row.status === "open" && row.dueAt != null && row.dueAt < nowIso).length,
    dueToday: rows.filter((row) => row.status === "open" && isSameKstDay(row.dueAt, now)).length,
    snoozed: rows.filter((row) => row.status === "snoozed").length,
    done: rows.filter((row) => row.status === "done").length,
  }
}

export async function listCrmTasks(options: ListCrmTasksOptions = {}): Promise<ListCrmTasksResult> {
  const limit = clampInteger(options.limit, 50, 1, 200)
  const offset = clampInteger(options.offset, 0, 0, 100_000)
  const now = options.now ?? new Date()
  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from("crm_tasks")
    .select("*", { count: "exact" })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (options.status === "active") {
    query = query.in("status", ["open", "snoozed"])
  } else if (options.status && options.status !== "all") {
    query = query.eq("status", options.status)
  }
  if (options.ownerKeys && options.ownerKeys.length > 0) {
    query = query.in("owner_key", options.ownerKeys)
  }
  if (options.taskType && options.taskType !== "all") {
    query = query.eq("task_type", options.taskType)
  }
  if (options.targetType && options.targetType !== "all") {
    query = query.eq("target_type", options.targetType)
  }
  if (options.targetId) {
    query = query.eq("target_id", options.targetId)
  }
  if (options.dueBefore) {
    const dueBefore = nullableIso(options.dueBefore)
    if (dueBefore) query = query.lte("due_at", dueBefore)
  }

  const search = safeSearch(options.q)
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,detail.ilike.%${search}%,target_label.ilike.%${search}%,owner_name_snapshot.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query
  if (error) {
    if (isMissingCrmTasksTableError(error)) {
      return emptyTasksResult(limit, offset, NOT_READY_MESSAGE)
    }
    throw new Error(`[crm-tasks] 조회 실패: ${error.message}`)
  }

  const rows = ((data ?? []) as CrmTask[]).map(toCrmTaskRecord)
  const returned = rows.length
  const total = count ?? returned
  const nextOffset = offset + returned

  return {
    generatedAt: new Date().toISOString(),
    health: { ok: true, message: null },
    summary: summarize(rows, total, now),
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

export async function getCrmTaskById(id: string): Promise<CrmTaskRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("crm_tasks").select("*").eq("id", id).maybeSingle()
  if (error) {
    if (isMissingCrmTasksTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[crm-tasks] 조회 실패: ${error.message}`)
  }
  return data ? toCrmTaskRecord(data as CrmTask) : null
}

export async function createCrmTask(input: CrmTaskCreateInput): Promise<CrmTaskRecord> {
  const supabase = createSupabaseAdminClient()
  const insert = buildCrmTaskInsert(input)
  const { data, error } = await supabase.from("crm_tasks").insert(insert).select("*").single()
  if (error) {
    if (isMissingCrmTasksTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[crm-tasks] 저장 실패: ${error.message}`)
  }
  return toCrmTaskRecord(data as CrmTask)
}

async function applyTaskUpdate(id: string, patch: CrmTaskUpdate): Promise<CrmTaskRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("crm_tasks").update(patch).eq("id", id).select("*").maybeSingle()
  if (error) {
    if (isMissingCrmTasksTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[crm-tasks] 수정 실패: ${error.message}`)
  }
  return data ? toCrmTaskRecord(data as CrmTask) : null
}

export interface CrmTaskEditInput {
  title?: string | null
  detail?: string | null
  dueAt?: string | null
  priority?: CrmTaskPriority
  taskType?: CrmTaskType
  targetLabel?: string | null
}

export function buildCrmTaskEditPatch(input: CrmTaskEditInput): CrmTaskUpdate {
  const patch: CrmTaskUpdate = {}
  if (input.title !== undefined) patch.title = trimOrNull(input.title) ?? "제목 없는 CRM 할 일"
  if (input.detail !== undefined) patch.detail = trimOrNull(input.detail)
  if (input.dueAt !== undefined) patch.due_at = nullableIso(input.dueAt)
  if (input.priority !== undefined) patch.priority = oneOf(input.priority, CRM_TASK_PRIORITIES, "normal")
  if (input.taskType !== undefined) patch.task_type = oneOf(input.taskType, CRM_TASK_TYPES, "call")
  if (input.targetLabel !== undefined) patch.target_label = trimOrNull(input.targetLabel)
  return patch
}

export function updateCrmTask(id: string, input: CrmTaskEditInput) {
  return applyTaskUpdate(id, buildCrmTaskEditPatch(input))
}

export function completeCrmTask(
  id: string,
  options: { outcome?: string | null; completedBy?: string | null; now?: Date } = {}
) {
  const now = options.now ?? new Date()
  return applyTaskUpdate(id, {
    status: "done",
    completed_at: now.toISOString(),
    completed_by: trimOrNull(options.completedBy),
    outcome: trimOrNull(options.outcome),
    snoozed_until: null,
  })
}

export function snoozeCrmTask(
  id: string,
  options: { snoozedUntil?: string | null; assignedBy?: string | null; now?: Date } = {}
) {
  const now = options.now ?? new Date()
  const snoozedUntil = nullableIso(options.snoozedUntil) ?? defaultSnoozeUntil(now)
  return applyTaskUpdate(id, {
    status: "snoozed",
    snoozed_until: snoozedUntil,
    due_at: snoozedUntil,
    assigned_by: trimOrNull(options.assignedBy) ?? undefined,
  })
}

export function reassignCrmTask(
  id: string,
  options: { ownerKey: string | null; ownerNameSnapshot?: string | null; assignedBy?: string | null }
) {
  return applyTaskUpdate(id, {
    owner_key: trimOrNull(options.ownerKey),
    owner_name_snapshot: trimOrNull(options.ownerNameSnapshot),
    assigned_by: trimOrNull(options.assignedBy),
  })
}

export function cancelCrmTask(
  id: string,
  options: { outcome?: string | null; completedBy?: string | null; now?: Date } = {}
) {
  const now = options.now ?? new Date()
  return applyTaskUpdate(id, {
    status: "canceled",
    completed_at: now.toISOString(),
    completed_by: trimOrNull(options.completedBy),
    outcome: trimOrNull(options.outcome),
    snoozed_until: null,
  })
}

export function reopenCrmTask(id: string) {
  return applyTaskUpdate(id, {
    status: "open",
    snoozed_until: null,
    completed_at: null,
    completed_by: null,
  })
}

export async function deleteCrmTask(id: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("crm_tasks").delete().eq("id", id).select("id").maybeSingle()
  if (error) {
    if (isMissingCrmTasksTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[crm-tasks] 삭제 실패: ${error.message}`)
  }
  return Boolean(data)
}

// 다음 액션 자유 입력 텍스트에서 task 유형을 추정한다(가장 구체적인 것부터).
const TASK_TYPE_KEYWORDS: Array<[CrmTaskType, RegExp]> = [
  ["quote", /견적/],
  ["demo", /데모|시연/],
  ["install", /설치/],
  ["renewal", /갱신|연장|재계약/],
  ["meeting", /미팅|회의|방문|상담/],
  ["kakao", /카톡|카카오/],
  ["email", /메일|이메일/],
  ["call", /전화|통화|콜백|콜/],
  ["cs_checkin", /온보딩|점검|활성화|cs/i],
  ["data_fix", /데이터|정합성|보정/],
]

export function inferTaskTypeFromTitle(title: string | null | undefined): CrmTaskType {
  const text = title?.trim() ?? ""
  if (!text) return "other"
  for (const [type, pattern] of TASK_TYPE_KEYWORDS) {
    if (pattern.test(text)) return type
  }
  return "other"
}

export interface EventNextActionLike {
  title: string
  ownerName?: string | null
  dueAt?: string | null
  done?: boolean
}

export interface EventForTaskLike {
  id: string
  targetType: CrmTaskTargetType
  targetId: string | null
  targetLabel: string | null
  ownerName?: string | null
  nextActions: EventNextActionLike[]
}

// 기록(crm_customer_events)의 열린 다음 액션을 1급 task 입력으로 승격한다(§7.2).
export function buildTaskInputsFromEvent(
  event: EventForTaskLike,
  options: { createdBy?: string | null } = {}
): CrmTaskCreateInput[] {
  return (event.nextActions ?? [])
    .filter((action) => action && action.done !== true && Boolean(action.title?.trim()))
    .map((action) => ({
      targetType: event.targetType,
      targetId: event.targetId,
      targetLabel: event.targetLabel,
      ownerNameSnapshot: trimOrNull(action.ownerName) ?? trimOrNull(event.ownerName),
      taskType: inferTaskTypeFromTitle(action.title),
      title: action.title,
      dueAt: action.dueAt ?? null,
      sourceEventId: event.id,
      createdBy: options.createdBy,
      assignedBy: options.createdBy,
    }))
}

export async function createTasksFromEventNextActions(
  event: EventForTaskLike,
  options: { createdBy?: string | null } = {}
): Promise<CrmTaskRecord[]> {
  const inputs = buildTaskInputsFromEvent(event, options)
  if (inputs.length === 0) return []
  const created: CrmTaskRecord[] = []
  for (const input of inputs) {
    created.push(await createCrmTask(input))
  }
  return created
}

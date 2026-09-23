import "server-only"

import { unstable_cache, revalidateTag } from "next/cache"

import { ADMIN_CRM_TASKS_CACHE_TAG } from "@/lib/admin/crm/cache-tags"
import { findAdminCrmOwner, listAdminUserDirectory } from "@/lib/repositories/admin-users"
import { assertJsonSafeInDev } from "@/lib/server/json-safe"
import { shareInFlightByArgs } from "@/lib/server/share-in-flight"
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

/**
 * 할 일 사본을 들고 캐시하는 소비자(CRM 홈 우선순위 큐 등)가 구독한다.
 * 리스너는 자기 모듈 캐시를 비우기만 한다 — I/O·await 금지(여기서 던지면 쓰기가 깨진다).
 * 구독 방향이 반대면(소비자를 여기서 import) 소비자가 이미 이 모듈을 읽고 있어 순환이 된다.
 */
type CrmTaskMutationListener = () => void

const crmTaskMutationListeners = new Set<CrmTaskMutationListener>()

export function onCrmTasksMutated(listener: CrmTaskMutationListener) {
  crmTaskMutationListeners.add(listener)
}

function notifyCrmTasksMutated() {
  for (const listener of crmTaskMutationListeners) listener()
}

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
  return value?.trim().replace(/[%,()\\]/g, " ").replace(/\s+/g, " ") ?? ""
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
    // New tasks always enter through the open state. Every later state change
    // must use an explicit command (complete/snooze/cancel/reopen).
    status: "open",
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

// listCrmTasks의 캐시 키가 되는 정규화된 필터 — options.now는 제외한다(아래 설명).
// 반드시 매번 같은 키 순서로 리터럴을 만든다 — shareInFlightByArgs/unstable_cache 둘 다
// JSON.stringify로 인자를 직렬화해 키를 만들므로, 키 순서가 흔들리면 같은 필터가 다른
// 캐시 엔트리로 갈라진다.
interface CrmTasksCacheParams {
  q: string
  status: CrmTaskStatus | "active" | "all"
  ownerKeys: string[] | null
  taskType: CrmTaskType | "all"
  targetType: CrmTaskTargetType | "all"
  targetId: string | null
  dueBefore: string | null
  limit: number
  offset: number
}

function normalizeListCrmTasksParams(options: ListCrmTasksOptions): CrmTasksCacheParams {
  return {
    q: safeSearch(options.q),
    status: options.status ?? "active",
    // 정렬해서 담아야 담당자 배열 순서만 다른 같은 요청이 별도 캐시 엔트리로 갈라지지 않는다.
    ownerKeys: options.ownerKeys && options.ownerKeys.length > 0 ? [...options.ownerKeys].sort() : null,
    taskType: options.taskType ?? "all",
    targetType: options.targetType ?? "all",
    targetId: options.targetId ?? null,
    dueBefore: nullableIso(options.dueBefore) ?? null,
    limit: clampInteger(options.limit, 50, 1, 200),
    offset: clampInteger(options.offset, 0, 0, 100_000),
  }
}

interface CrmTasksPage {
  rows: CrmTaskRecord[]
  total: number
  health: { ok: boolean; message: string | null }
}

// DB 조회만 담당 — now에 의존하지 않는다(now는 summarize에서만 쓰인다, 아래 listCrmTasks 참고).
// 그래서 이 결과는 캐시 가능하고, 캐시된 rows를 호출자의 now로 다시 요약해도 정확하다.
async function fetchCrmTasksPage(params: CrmTasksCacheParams): Promise<CrmTasksPage> {
  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from("crm_tasks")
    .select("*", { count: "exact" })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(params.offset, params.offset + params.limit - 1)

  if (params.status === "active") {
    query = query.in("status", ["open", "snoozed"])
  } else if (params.status !== "all") {
    query = query.eq("status", params.status)
  }
  if (params.ownerKeys && params.ownerKeys.length > 0) {
    query = query.in("owner_key", params.ownerKeys)
  }
  if (params.taskType !== "all") {
    query = query.eq("task_type", params.taskType)
  }
  if (params.targetType !== "all") {
    query = query.eq("target_type", params.targetType)
  }
  if (params.targetId) {
    query = query.eq("target_id", params.targetId)
  }
  if (params.dueBefore) {
    query = query.lte("due_at", params.dueBefore)
  }
  if (params.q) {
    query = query.or(
      `title.ilike.%${params.q}%,detail.ilike.%${params.q}%,target_label.ilike.%${params.q}%,owner_name_snapshot.ilike.%${params.q}%`
    )
  }

  const { data, error, count } = await query
  if (error) {
    if (isMissingCrmTasksTableError(error)) {
      return { rows: [], total: 0, health: { ok: false, message: NOT_READY_MESSAGE } }
    }
    throw new Error(`[crm-tasks] 조회 실패: ${error.message}`)
  }

  const rows = ((data ?? []) as CrmTask[]).map(toCrmTaskRecord)
  return { rows, total: count ?? rows.length, health: { ok: true, message: null } }
}

// 2026-09-10 3라운드(§3.3) — 이전엔 캐시가 아예 없어(2라운드 실측 3.3초) 매 조회가 항상
// crm_tasks를 다시 읽었다. 같은 인스턴스 안 동시 미스는 shareInFlightByArgs로 합치고
// (필터별로 별도 in-flight 키), Data Cache 결과는 assertJsonSafeInDev로 JSON 안전성을
// dev·test에서 검사한다.
const sharedFetchCrmTasksPage = shareInFlightByArgs("admin-crm-tasks", fetchCrmTasksPage)

const getCachedCrmTasksPage = unstable_cache(
  async (params: CrmTasksCacheParams) =>
    assertJsonSafeInDev("admin-crm-tasks", await sharedFetchCrmTasksPage(params)),
  ["admin-crm-tasks-v1"],
  // 이 테이블의 유일한 쓰기 경로(createCrmTask·applyTaskUpdate, 아래)가 둘 다 이 태그를
  // revalidateTag(tag, "max")로 건다 — 무효화가 전량 커버되므로 TTL을 5분으로 올린다
  // (Phase 4 규칙: 무효화가 확실한 엔트리부터 TTL을 5~10분으로).
  { revalidate: 300, tags: [ADMIN_CRM_TASKS_CACHE_TAG] }
)

export async function listCrmTasks(options: ListCrmTasksOptions = {}): Promise<ListCrmTasksResult> {
  const now = options.now ?? new Date()
  const params = normalizeListCrmTasksParams(options)
  const page = await getCachedCrmTasksPage(params)
  const { rows, total, health } = page
  const returned = rows.length
  const nextOffset = params.offset + returned

  return {
    generatedAt: new Date().toISOString(),
    health,
    // now는 캐시 키에서 제외했으므로(위 CrmTasksCacheParams) 캐시된 rows를 호출자의 now로
    // 매번 다시 요약한다 — overdue/dueToday 같은 now-민감 파생값이 캐시 TTL을 넘어 굳지 않는다.
    // crm-customer-360.ts처럼 자기 now를 넘기는 호출부도 이 경로로 정확한 값을 받는다.
    summary: summarize(rows, total, now),
    pagination: {
      limit: params.limit,
      offset: params.offset,
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

export async function getCrmTaskBySourceEventId(sourceEventId: string): Promise<CrmTaskRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("source_event_id", sourceEventId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isMissingCrmTasksTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[crm-tasks] source event 조회 실패: ${error.message}`)
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
  notifyCrmTasksMutated()
  // listCrmTasks의 Data Cache(§3.3, ADMIN_CRM_TASKS_CACHE_TAG)도 여기서 함께 무효화한다.
  revalidateTag(ADMIN_CRM_TASKS_CACHE_TAG, "max")
  return toCrmTaskRecord(data as CrmTask)
}

// 같은 deal + task_type 조합의 아직 살아있는(open/snoozed) task 목록을 반환한다.
// 견적 수락 → task materialize 시 중복 생성 방지, 계약 전환 시 카드 자동 소거에 쓴다.
export async function listActiveTasksForDealByType(
  dealId: string,
  taskType: CrmTaskType
): Promise<CrmTaskRecord[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("target_type", "deal")
    .eq("target_id", dealId)
    .eq("task_type", taskType)
    .in("status", ["open", "snoozed"])
  if (error) {
    if (isMissingCrmTasksTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[crm-tasks] 조회 실패: ${error.message}`)
  }
  return ((data ?? []) as CrmTask[]).map(toCrmTaskRecord)
}

// 완료·미루기·취소·재개·재배정·편집이 전부 이 한 곳을 지난다 — 무효화도 여기 한 번만 건다
// (인스턴스 내 구독자용 notifyCrmTasksMutated + Data Cache용 revalidateTag 둘 다).
async function applyTaskUpdate(id: string, patch: CrmTaskUpdate): Promise<CrmTaskRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("crm_tasks").update(patch).eq("id", id).select("*").maybeSingle()
  if (error) {
    if (isMissingCrmTasksTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[crm-tasks] 수정 실패: ${error.message}`)
  }
  if (data) {
    notifyCrmTasksMutated()
    revalidateTag(ADMIN_CRM_TASKS_CACHE_TAG, "max")
  }
  return data ? toCrmTaskRecord(data as CrmTask) : null
}

export interface CrmTaskEditInput {
  title?: string | null
  detail?: string | null
  /** undefined = 기한 그대로, null = 기한 지움(due_at = null), 문자열 = 그 시각으로 설정. 날짜 검증은 라우트가 먼저 한다. */
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

  // 다음 액션의 소유자 이름을 안정적 owner_key로 해석해 "내 담당" 필터가 동작하게 한다.
  // 디렉터리 조회 실패는 fail-soft(ownerKey만 비워지고 이름 스냅샷은 유지).
  const directory = await listAdminUserDirectory().catch(() => null)
  const resolveOwnerKey = (ownerName: string | null | undefined): string | null => {
    if (!directory || !ownerName?.trim()) return null
    return findAdminCrmOwner(directory, { name: ownerName }).owner?.ownerKey ?? null
  }

  const created: CrmTaskRecord[] = []
  for (const input of inputs) {
    const ownerKey = input.ownerKey ?? resolveOwnerKey(input.ownerNameSnapshot)
    created.push(await createCrmTask({ ...input, ownerKey }))
  }
  return created
}

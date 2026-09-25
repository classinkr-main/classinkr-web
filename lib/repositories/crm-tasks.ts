import "server-only"

import { unstable_cache, revalidateTag } from "next/cache"

import {
  ADMIN_CRM_PRIORITY_QUEUE_SNAPSHOT_CACHE_TAG,
  ADMIN_CRM_TASKS_CACHE_TAG,
  ADMIN_CRM_TODAY_CONTACTS_CACHE_TAG,
} from "@/lib/admin/crm/cache-tags"
import { findAdminCrmOwner, listAdminUserDirectory } from "@/lib/repositories/admin-users"
import { assertJsonSafeInDev } from "@/lib/server/json-safe"
import { shareInFlightByArgs } from "@/lib/server/share-in-flight"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages } from "@/lib/supabase/pagination"
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
  // 우선순위 큐 소스 스냅샷은 인스턴스 간 공유 Data Cache다 — 구독(onCrmTasksMutated)은 그 모듈을
  // 로드한 인스턴스에만 걸려 있어, 쓰기가 다른 인스턴스에서 일어나면 리스너가 0개다. 태그를 직접
  // SWR 무효화한다(cache-tags 모듈만 import — 큐 모듈을 import하면 순환이 된다).
  // 쓰기는 이미 커밋됐다 — 이 무효화 실패가 구독 리스너 호출과 저장 응답을 깨뜨리지 않게 감싼다.
  try {
    revalidateTag(ADMIN_CRM_PRIORITY_QUEUE_SNAPSHOT_CACHE_TAG, "max")
  } catch (error) {
    console.warn("[crm-tasks] priority queue snapshot invalidation failed:", error)
  }
  // 현황 "오늘 연락" 보조 원천(오늘 대상 할 일·오늘 닫힌 할 일 — lib/repositories/crm-today-contacts.ts)은 **즉시 만료**
  // 한다(2026-09-26 교차 리뷰 [Q2-15]). 위 큐 태그의 SWR("max")만 타면 다음 읽기가 옛 값을 돌려주고 뒤에서 갱신해,
  // 할 일 화면·세그먼트 "오늘 연락에 넣기"·주간 패널에서 방금 만들고/미루고/닫은 할 일이 오늘 연락에 늦게 반영된다.
  // 오늘 수정된 할 일은 전부 그 보조 원천에 실려(활성 = updated_at ≥ 오늘, 닫힘 = completed_at ≥ 오늘) 후보 풀의 묵은
  // 사본을 덮으므로 무거운 큐 스냅샷까지 하드 만료할 필요는 없다. 오늘 연락 모듈을 import 하지 않는다(그쪽이 여기를
  // 읽어 순환) — 태그 문자열만 cache-tags 에서 가져온다.
  try {
    revalidateTag(ADMIN_CRM_TODAY_CONTACTS_CACHE_TAG, { expire: 0 })
  } catch (error) {
    console.warn("[crm-tasks] today contacts invalidation failed:", error)
  }
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
  /**
   * Data Cache(admin-crm-tasks, 5분 · 쓰기 뒤 SWR)를 읽지도 쓰지도 않고 DB 를 바로 읽는다 — 새로고침(force) 경로 전용
   * (lib/repositories/crm-priority-queue.ts). 캐시 키에 들어가지 않는다(normalizeListCrmTasksParams 는 이 값을 싣지 않는다).
   */
  bypassCache?: boolean
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
  // bypassCache — 새로고침은 방금 바뀐 할 일을 봐야 한다. 캐시 엔트리는 쓰기 뒤 SWR("max")로만 무효화돼 캐시를 거치면
  // 다음 한 번은 옛 값이 나온다(2026-09-26 교차 리뷰 [Q2-15]). 같은 인스턴스 동시 조회 합치기(shareInFlightByArgs)도
  // 건너뛴다 — 쓰기 전에 시작된 조회를 물려받으면 같은 문제가 된다.
  const page = options.bypassCache ? await fetchCrmTasksPage(params) : await getCachedCrmTasksPage(params)
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

export interface ListCrmTasksClosedSinceResult {
  rows: CrmTaskRecord[]
  health: { ok: boolean; message: string | null }
  /** 상한(maxRows)에서 잘렸다 — 받은 만큼만 반영했으니 "전체"라 부르지 않는다. */
  truncated: boolean
}

/**
 * sinceIso 이후 닫힌(완료·취소) 할 일 — 현황 "오늘 연락" 진행률(오늘 처리한 할 일)의 원천(2026-09-25).
 * listCrmTasks 는 active/done 단위만 보고 completed_at 창 필터가 없어 따로 둔다. 캐시하지 않는다 —
 * 호출부(lib/repositories/crm-today-contacts.ts)가 자기 Data Cache 안에서 부른다.
 * 정렬은 completed_at·id 전순서, range 는 실제로 받은 행 수만큼 전진한다(lib/supabase/pagination).
 * 테이블 미적용이면 health.ok=false·빈 행(던지지 않는다), 그 밖의 조회 실패는 던진다.
 */
export async function listCrmTasksClosedSince(
  sinceIso: string,
  options: { maxRows?: number } = {}
): Promise<ListCrmTasksClosedSinceResult> {
  const since = nullableIso(sinceIso)
  if (!since) throw new Error("[crm-tasks] sinceIso가 올바른 시각이 아닙니다.")
  const maxRows = clampInteger(options.maxRows, 2_000, 1, 20_000)
  const supabase = createSupabaseAdminClient()
  const paged = await fetchSupabasePages<CrmTask>({
    maxRows,
    fetchPage: (from, to) =>
      supabase
        .from("crm_tasks")
        .select("*", from === 0 ? { count: "exact" } : undefined)
        .in("status", ["done", "canceled"])
        .gte("completed_at", since)
        .order("completed_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  })
  if (paged.error) {
    if (isMissingCrmTasksTableError(paged.error)) {
      return { rows: [], health: { ok: false, message: NOT_READY_MESSAGE }, truncated: false }
    }
    throw new Error(`[crm-tasks] 닫힌 할 일 조회 실패: ${paged.error.message ?? "unknown"}`)
  }
  return { rows: paged.data.map(toCrmTaskRecord), health: { ok: true, message: null }, truncated: paged.truncated }
}

/**
 * 현황 "오늘 연락"의 할 일 원천(2026-09-25 교차 리뷰 [13]) — 활성(open·snoozed) 할 일 중 오늘 대상이 될 수 있는 것 전량:
 * 기한(due_at)·미룬 기한(snoozed_until)이 오늘 끝 전, 기한 없는 긴급·높음, 오늘 수정(오늘 미룸·오늘 만든 다음 일정 흔적).
 * 우선순위 큐 후보 풀의 listCrmTasks(active, 상한 200 · due_at 오름차순 · NULL 마지막)만 쓰면 세그먼트 "오늘 연락에 넣기"
 * 한 번(200건)으로 지난·오늘 할 일과 기한 없는 긴급 할 일이 절단 표시 없이 빠진다. 캐시하지 않는다 — 호출부
 * (lib/repositories/crm-today-contacts.ts)가 자기 Data Cache 안에서 부른다.
 * 정렬은 created_at·id 전순서, range 는 실제로 받은 행 수만큼 전진한다(lib/supabase/pagination). 상한에 닿으면 truncated.
 * 테이블 미적용이면 health.ok=false·빈 행(던지지 않는다), 그 밖의 조회 실패는 던진다.
 */
export async function listCrmTasksDueForToday(
  todayStartIso: string,
  todayEndIso: string,
  options: { maxRows?: number } = {}
): Promise<ListCrmTasksClosedSinceResult> {
  const todayStart = nullableIso(todayStartIso)
  const todayEnd = nullableIso(todayEndIso)
  if (!todayStart || !todayEnd) throw new Error("[crm-tasks] 오늘 범위가 올바른 시각이 아닙니다.")
  const maxRows = clampInteger(options.maxRows, 2_000, 1, 20_000)
  // or 트리 안 값은 PostgREST 예약 문자(`:`·`.`)를 품어 큰따옴표로 감싼다.
  const filter = [
    `due_at.lt."${todayEnd}"`,
    `snoozed_until.lt."${todayEnd}"`,
    "and(due_at.is.null,priority.in.(urgent,high))",
    `updated_at.gte."${todayStart}"`,
  ].join(",")
  const supabase = createSupabaseAdminClient()
  const paged = await fetchSupabasePages<CrmTask>({
    maxRows,
    fetchPage: (from, to) =>
      supabase
        .from("crm_tasks")
        .select("*", from === 0 ? { count: "exact" } : undefined)
        .in("status", ["open", "snoozed"])
        .or(filter)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  })
  if (paged.error) {
    if (isMissingCrmTasksTableError(paged.error)) {
      return { rows: [], health: { ok: false, message: NOT_READY_MESSAGE }, truncated: false }
    }
    throw new Error(`[crm-tasks] 오늘 할 일 조회 실패: ${paged.error.message ?? "unknown"}`)
  }
  return { rows: paged.data.map(toCrmTaskRecord), health: { ok: true, message: null }, truncated: paged.truncated }
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

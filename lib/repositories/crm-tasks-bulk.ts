import "server-only"

// 세그먼트 일괄 할 일(SG7 — "선택 고객 콜 큐 투입"). 통합 고객 목록에서 고른 대상마다 같은 제목의
// 할 일을 하나씩 만든다.
//
// 쓰기는 lib/repositories/crm-tasks.ts 의 createCrmTask 를 건별로 부른다(읽기 전용 import). crm_tasks 의
// 쓰기 경로는 그 파일 두 곳(createCrmTask·applyTaskUpdate)뿐이라는 캐시 계약(ADMIN_CRM_TASKS_CACHE_TAG
// 무효화 + onCrmTasksMutated 구독자 알림 — lib/admin/crm/cache-tags.ts 주석)을 깨지 않기 위해서다.
// 여기서 직접 insert 하면 할 일 목록 Data Cache(TTL 5분)와 홈 우선순위 큐 스냅샷이 낡은 채로 남는다.
// 이 모듈이 crm_tasks 에 직접 하는 일은 "중복 방지 사전 조회(읽기)"뿐이다.
//
// 중복 방지: 같은 대상에 같은 제목(앞뒤·연속 공백, 대소문자 무시)의 열린 할 일(open·snoozed —
// 목록의 "진행 중" 기준과 같다)이 이미 있으면 새로 만들지 않고 skipped 로 센다. DB 유니크 제약이 없어
// 같은 순간에 들어온 두 일괄 요청은 둘 다 통과할 수 있다(운영 사용량상 감수 — 최종 보고 참고).
//
// 부분 실패: 대상별 생성은 서로 독립이다. 실패한 대상은 failed(행 키)로 모으고 나머지는 계속 만든다.

import type { UnifiedCustomerTarget } from "@/lib/crm/unified-customer-key"
import {
  createCrmTask,
  inferTaskTypeFromTitle,
  isCrmTasksNotReadyError,
  type CrmTaskType,
} from "@/lib/repositories/crm-tasks"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/** 한 요청에서 할 일을 만들 수 있는 대상 수 상한(중복 제거 후). */
export const CRM_TASK_BULK_MAX_TARGETS = 200
/** 할 일 제목 길이 상한(앞뒤 공백 제거 후). */
export const CRM_TASK_BULK_TITLE_MAX = 120
/** 메모(할 일 detail) 길이 상한. */
export const CRM_TASK_BULK_NOTE_MAX = 2000

// crm-tasks.ts 의 NOT_READY_MESSAGE 와 같은 문구 — isCrmTasksNotReadyError 가 이 접두로 판정한다.
const NOT_READY_MESSAGE = "CRM task DB 마이그레이션이 아직 적용되지 않았습니다."
const ACTIVE_TASK_STATUSES = ["open", "snoozed"] as const
// target_id·id in(...) 필터는 URL 에 실린다 — UUID 100개 ≈ 3.7KB.
const ID_CHUNK = 100
const RANGE_PAGE_SIZE = 1000
const RANGE_MAX_PAGES = 1000
// 생성 동시성 — 수백 개 동시 쿼리는 REST 504 폭주 조건이었다(crm-unified-customers.ts 주석). 200건 × 4
// 병렬이면 수 초 안에 끝나고 어드민 클라이언트 타임아웃(45초) 아래에 머문다.
const CREATE_CONCURRENCY = 4

export type CrmBulkTaskTarget = Pick<UnifiedCustomerTarget, "key" | "targetType" | "targetId">

export interface CreateCrmTasksForTargetsInput {
  targets: readonly CrmBulkTaskTarget[]
  title: string
  /** 이미 정규화된 ISO 문자열 또는 null(기한 없음). 요청 값 해석은 라우트가 parseTaskDueAt 으로 먼저 한다. */
  dueAt?: string | null
  note?: string | null
  createdBy?: string | null
}

export interface CreateCrmTasksForTargetsResult {
  /** 새로 만든 할 일 수(= 대상 수, 대상당 하나). */
  created: number
  /** 같은 제목의 열린 할 일이 이미 있어 건너뛴 대상 수. */
  skipped: number
  /** 생성이 실패한 대상의 행 키. */
  failed: string[]
}

function storageKey(targetType: string, targetId: string) {
  return `${targetType}:${targetId}`
}

/** 중복 판정용 제목 키 — 앞뒤·연속 공백과 대소문자 차이를 무시한다. */
export function bulkTaskTitleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * 일괄 할 일의 유형 — 제목 키워드로 추정하되(예: "갱신 안내" → renewal, 기록 다음 액션 승격과 같은 규칙),
 * 키워드가 없으면 단건 POST 의 기본값과 같은 call 로 둔다(일괄 할 일의 주 용도가 콜 큐 투입이다).
 */
export function bulkTaskTypeForTitle(title: string): CrmTaskType {
  const inferred = inferTaskTypeFromTitle(title)
  return inferred === "other" ? "call" : inferred
}

function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function isMissingCrmTasksTableError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42p01") ||
    (haystack.includes("crm_tasks") &&
      (haystack.includes("does not exist") || haystack.includes("could not find") || haystack.includes("schema cache")))
  )
}

interface ActiveTaskRow {
  id: string
  target_type: string
  target_id: string | null
  title: string | null
}

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>

// 대상들의 열린 할 일(open·snoozed) — 타입별·청크별 range 페이지네이션 전량(첫 페이지 count,
// 실제 받은 행 수만큼 전진, id 타이브레이커). 읽기 실패는 던진다 — 사전 조회 없이 만들면 중복 방지가
// 깨지므로 "모르면 만들지 않는다".
async function loadActiveTasksForTargets(
  supabase: SupabaseAdmin,
  targets: readonly CrmBulkTaskTarget[]
): Promise<ActiveTaskRow[]> {
  const idsByType = new Map<string, string[]>()
  for (const target of targets) {
    const list = idsByType.get(target.targetType) ?? []
    list.push(target.targetId)
    idsByType.set(target.targetType, list)
  }

  const loadChunk = async (targetType: string, ids: string[]) => {
    const rows: ActiveTaskRow[] = []
    let total: number | null = null
    for (let page = 0; page < RANGE_MAX_PAGES; page += 1) {
      const { data, error, count } = await supabase
        .from("crm_tasks")
        .select("id, target_type, target_id, title", page === 0 ? { count: "exact" } : undefined)
        .eq("target_type", targetType)
        .in("target_id", ids)
        .in("status", [...ACTIVE_TASK_STATUSES])
        .order("id", { ascending: true })
        .range(rows.length, rows.length + RANGE_PAGE_SIZE - 1)
      if (error) {
        if (isMissingCrmTasksTableError(error)) throw new Error(NOT_READY_MESSAGE)
        throw new Error(`[crm-tasks-bulk] 기존 할 일 조회 실패: ${error.message ?? "unknown"}`)
      }
      if (page === 0 && typeof count === "number") total = count
      const batch = (data ?? []) as ActiveTaskRow[]
      if (batch.length === 0) break
      rows.push(...batch)
      if (total !== null && rows.length >= total) break
    }
    return rows
  }

  const jobs: Array<Promise<ActiveTaskRow[]>> = []
  for (const [targetType, ids] of idsByType) {
    for (const idChunk of chunkItems(ids, ID_CHUNK)) jobs.push(loadChunk(targetType, idChunk))
  }
  return (await Promise.all(jobs)).flat()
}

// 할 일 목록·액션 레일이 대상 이름을 보여줄 수 있게 target_label 을 채운다(없으면 화면이 id 를 그린다).
// fail-soft — 이름 조회 실패는 라벨만 비우고 생성은 막지 않는다. 각 조회는 기본키(또는 source_system+
// account_id) in(≤100개)라 결과가 100행을 넘지 않아 range 페이지네이션이 필요 없다.
// 리드 라벨은 기관명·이름만 쓴다 — 이메일·전화번호를 할 일 테이블에 복제하지 않는다.
async function resolveTargetLabels(
  supabase: SupabaseAdmin,
  targets: readonly CrmBulkTaskTarget[]
): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const idsOf = (type: CrmBulkTaskTarget["targetType"]) =>
    targets.filter((target) => target.targetType === type).map((target) => target.targetId)

  const jobs: Array<Promise<void>> = []
  for (const ids of chunkItems(idsOf("lead"), ID_CHUNK)) {
    jobs.push(
      (async () => {
        const { data, error } = await supabase.from("leads").select("id, org, name").in("id", ids)
        if (error) throw new Error(error.message ?? "unknown")
        for (const row of (data ?? []) as Array<{ id: string; org: string | null; name: string | null }>) {
          const label = row.org?.trim() || row.name?.trim()
          if (label) labels.set(storageKey("lead", row.id), label)
        }
      })()
    )
  }
  for (const ids of chunkItems(idsOf("customer"), ID_CHUNK)) {
    jobs.push(
      (async () => {
        const { data, error } = await supabase.from("customers").select("id, name, campus_name").in("id", ids)
        if (error) throw new Error(error.message ?? "unknown")
        for (const row of (data ?? []) as Array<{ id: string; name: string | null; campus_name: string | null }>) {
          const label = [row.name?.trim(), row.campus_name?.trim()].filter(Boolean).join(" · ")
          if (label) labels.set(storageKey("customer", row.id), label)
        }
      })()
    )
  }
  for (const ids of chunkItems(idsOf("neo_account"), ID_CHUNK)) {
    jobs.push(
      (async () => {
        const { data, error } = await supabase
          .from("crm_neo_customer_snapshots")
          .select("account_id, account_name")
          .eq("source_system", "xiaoshouyi")
          .in("account_id", ids)
        if (error) throw new Error(error.message ?? "unknown")
        for (const row of (data ?? []) as Array<{ account_id: string; account_name: string | null }>) {
          const label = row.account_name?.trim()
          if (label) labels.set(storageKey("neo_account", row.account_id), label)
        }
      })()
    )
  }

  const results = await Promise.allSettled(jobs)
  const failures = results.filter((result) => result.status === "rejected").length
  if (failures > 0) console.warn(`[crm-tasks-bulk] 대상 이름 조회 ${failures}건 실패 — 라벨 없이 만든다`)
  return labels
}

async function runWithConcurrency<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      await worker(item)
    }
  })
  await Promise.all(runners)
}

/** 선택 대상마다 같은 제목의 할 일을 하나씩 만든다(중복 제외·부분 실패 집계). */
export async function createCrmTasksForTargets(
  input: CreateCrmTasksForTargetsInput
): Promise<CreateCrmTasksForTargetsResult> {
  const title = input.title.trim()
  if (!title) throw new Error("할 일 제목이 필요합니다.")

  const seen = new Set<string>()
  const targets = input.targets.filter((target) => {
    if (!target.targetId) return false
    const key = storageKey(target.targetType, target.targetId)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (targets.length === 0) return { created: 0, skipped: 0, failed: [] }

  const supabase = createSupabaseAdminClient()
  const titleKey = bulkTaskTitleKey(title)
  const active = await loadActiveTasksForTargets(supabase, targets)
  const duplicateTargets = new Set(
    active
      .filter((row) => row.target_id && bulkTaskTitleKey(row.title ?? "") === titleKey)
      .map((row) => storageKey(row.target_type, row.target_id as string))
  )
  const pending = targets.filter((target) => !duplicateTargets.has(storageKey(target.targetType, target.targetId)))
  const skipped = targets.length - pending.length
  if (pending.length === 0) return { created: 0, skipped, failed: [] }

  const labels = await resolveTargetLabels(supabase, pending)
  const taskType = bulkTaskTypeForTitle(title)
  const actor = input.createdBy?.trim() || null
  const note = input.note?.trim() || null
  const dueAt = input.dueAt ?? null

  const outcome = { created: 0, failedKeys: new Set<string>(), notReadyError: null as Error | null }
  await runWithConcurrency(pending, CREATE_CONCURRENCY, async (target) => {
    try {
      await createCrmTask({
        targetType: target.targetType,
        targetId: target.targetId,
        targetLabel: labels.get(storageKey(target.targetType, target.targetId)) ?? null,
        taskType,
        title,
        detail: note,
        dueAt,
        priority: "normal",
        createdBy: actor,
        assignedBy: actor,
      })
      outcome.created += 1
    } catch (error) {
      if (isCrmTasksNotReadyError(error)) outcome.notReadyError = error
      console.error("[crm-tasks-bulk] 할 일 생성 실패", target.key, error instanceof Error ? error.message : error)
      outcome.failedKeys.add(target.key)
    }
  })

  // 전부 실패했고 원인이 마이그레이션 미적용이면 그대로 던져 라우트가 503 으로 알리게 한다.
  if (outcome.created === 0 && outcome.notReadyError) throw outcome.notReadyError
  // 실패 키는 동시 실행 완료 순서가 아니라 요청 순서로 돌려준다.
  const failed = pending.filter((target) => outcome.failedKeys.has(target.key)).map((target) => target.key)
  return { created: outcome.created, skipped, failed }
}

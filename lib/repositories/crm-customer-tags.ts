import "server-only"

import type { UnifiedCustomerTarget } from "@/lib/crm/unified-customer-key"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type CrmTagTargetType = "lead" | "neo_account" | "customer" | "unknown"

const TABLE = "crm_customer_tags"

// 전체 태그 맵 캐시 — 통합 리스트가 매 로드마다 전체 스캔하지 않도록 30초 유지. 추가/삭제 시 무효화.
// 세대(generation) 가드: 전량 읽기가 도는 사이에 쓰기가 끼면 그 읽기 결과(쓰기 이전 상태일 수 있다)를
// 캐시에 넣지 않는다 — 무효화 직후 낡은 맵이 다시 30초 고정되는 경합을 막는다.
let tagsMapCache: { at: number; value: Record<string, string[]> } | null = null
let tagsMapGeneration = 0
const TAGS_MAP_CACHE_TTL_MS = 30_000

function invalidateTagsMapCache() {
  tagsMapCache = null
  tagsMapGeneration += 1
}

// 태그 정규화 — 공백 정리 + 길이 제한. 빈 문자열은 호출부에서 거른다.
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 40)
}

function targetKey(targetType: string, targetId: string): string {
  return `${targetType}:${targetId}`
}

export async function getCustomerTags(targetType: CrmTagTargetType, targetId: string): Promise<string[]> {
  if (!targetId) return []
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select("tag")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: true })
  if (error) throw new Error(`[crm-tags] 조회 실패: ${error.message ?? "unknown"}`)
  return (data ?? []).map((row) => row.tag as string)
}

export async function addCustomerTag(
  targetType: CrmTagTargetType,
  targetId: string,
  tag: string,
  createdBy?: string | null
): Promise<string[]> {
  const clean = normalizeTag(tag)
  if (!clean || !targetId) throw new Error("태그와 대상이 필요합니다.")
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from(TABLE).upsert(
    { target_type: targetType, target_id: targetId, tag: clean, created_by: createdBy ?? null },
    { onConflict: "target_type,target_id,tag", ignoreDuplicates: true }
  )
  if (error) throw new Error(`[crm-tags] 추가 실패: ${error.message ?? "unknown"}`)
  invalidateTagsMapCache()
  return getCustomerTags(targetType, targetId)
}

export async function removeCustomerTag(
  targetType: CrmTagTargetType,
  targetId: string,
  tag: string
): Promise<string[]> {
  const clean = normalizeTag(tag)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("tag", clean)
  if (error) throw new Error(`[crm-tags] 삭제 실패: ${error.message ?? "unknown"}`)
  invalidateTagsMapCache()
  return getCustomerTags(targetType, targetId)
}

// ── range 페이지네이션 공통 ────────────────────────────────────────────────
// crm_customer_tags 를 끝까지 읽는 모든 경로(전체 맵·태그 관리 집계·일괄 태그 사전 조회)가 같은
// 규칙을 쓴다(플레이북 04 — leads.ts 와 같은 원칙):
//  - 첫 페이지에서 count: "exact" 로 총 행 수를 받고, 그만큼 모이면 멈춘다.
//  - 다음 페이지 시작은 "실제로 받은 행 수"만큼 전진한다. PostgREST max-rows 가 요청 크기보다 작게
//    잘라도 중간 행을 건너뛰지 않는다(예전 loadAllTagRows 는 요청 크기만큼 전진 + 짧은 페이지에서
//    멈춰, 서버 상한이 1,000 미만이면 두 번째 페이지 이후를 조용히 잘랐다).
//  - 빈 페이지를 받으면 멈춘다(총 행 수를 못 받은 경우의 종료 조건).
//  - 정렬은 호출부가 타이브레이커(id)까지 걸어 페이지 경계에서 행이 겹치거나 빠지지 않게 한다.

const TAG_RANGE_PAGE_SIZE = 1000
// 안전 상한 — 정상 운영(소규모 테이블)에서는 닿지 않는다. 무한 루프 방지용.
const TAG_RANGE_MAX_PAGES = 1000

interface RangePageResult<T> {
  data: T[] | null
  error: { message?: string } | null
  count?: number | null
}

async function collectAllTagPages<T>(
  fetchPage: (from: number, to: number, withCount: boolean) => PromiseLike<RangePageResult<T>>,
  label: string
): Promise<T[]> {
  const rows: T[] = []
  let total: number | null = null
  for (let page = 0; page < TAG_RANGE_MAX_PAGES; page += 1) {
    const { data, error, count } = await fetchPage(rows.length, rows.length + TAG_RANGE_PAGE_SIZE - 1, page === 0)
    if (error) throw new Error(`[crm-tags] ${label} 실패: ${error.message ?? "unknown"}`)
    if (page === 0 && typeof count === "number") total = count
    const batch = data ?? []
    if (batch.length === 0) break
    rows.push(...batch)
    if (total !== null && rows.length >= total) break
  }
  return rows
}

interface CrmCustomerTagRow {
  target_type: string
  target_id: string
  tag: string
  created_at: string
}

async function loadAllTagRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>
): Promise<CrmCustomerTagRow[]> {
  return collectAllTagPages<CrmCustomerTagRow>(
    (from, to, withCount) =>
      supabase
        .from(TABLE)
        .select("target_type, target_id, tag, created_at", withCount ? { count: "exact" } : undefined)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    "전량 조회"
  )
}

// 통합 리스트용 — 전체 태그 맵(키 `${targetType}:${targetId}`). range 페이지네이션 전량 + 30초 캐시.
// (예전엔 range 없는 단일 select 라 PostgREST max-rows(1,000)에서 조용히 잘렸다 — F5.)
// 읽기 실패는 던진다 — 빈 맵을 정상 캐시에 넣지 않는다(호출부 통합 목록이 graceful 처리).
export async function getAllCustomerTagsMap(): Promise<Record<string, string[]>> {
  const cached = tagsMapCache
  if (cached && Date.now() - cached.at < TAGS_MAP_CACHE_TTL_MS) return cached.value
  const generation = tagsMapGeneration
  const supabase = createSupabaseAdminClient()
  const rows = await loadAllTagRows(supabase)
  const map: Record<string, string[]> = {}
  for (const row of rows) {
    const key = targetKey(row.target_type, row.target_id)
    ;(map[key] ??= []).push(row.tag)
  }
  if (generation === tagsMapGeneration) tagsMapCache = { at: Date.now(), value: map }
  return map
}

// ── T4 태그 관리 패널 — 집계·이름 변경·병합 ────────────────────────────────
// 아래 함수들은 crm_customer_tags 전체(또는 그 부분집합)를 위 range 페이지네이션으로 끝까지 읽는다.
// 실제 운영 규모는 "소규모 테이블"이라 페이지 1~2장 안에서 끝난다.

/** 대소문자·공백 차이를 무시하는 묶음 키. normalizeTag만으로는 대소문자가 남아 "VIP"/"vip"가 갈린다. */
function tagGroupKey(tag: string): string {
  return normalizeTag(tag).toLowerCase()
}

export interface CustomerTagTargetTypeCounts {
  lead: number
  neo_account: number
  customer: number
}

export interface CustomerTagStat {
  /** 표시명 — 같은 묶음 안에서 가장 많이 쓰인 원본 표기(대소문자·공백 포함). */
  tag: string
  count: number
  byTargetType: CustomerTagTargetTypeCounts
  lastUsedAt: string | null
}

// 대소문자·공백을 무시해 태그를 묶되, 화면에 보일 표시명은 그 묶음 안에서 가장 많이 쓰인
// 원본 표기를 고른다(동률이면 먼저 만난 표기). target_type이 lead/neo_account/customer가
// 아닌 행("unknown" 등 드문 값)은 총 건수(count)에는 잡히지만 byTargetType 3종 분해에서는
// 빠진다 — 스키마상 있을 수 있는 값이라 던지지 않고 조용히 넘긴다.
export async function listCustomerTagStats(): Promise<CustomerTagStat[]> {
  const supabase = createSupabaseAdminClient()
  const rows = await loadAllTagRows(supabase)

  interface TagGroup {
    displayCounts: Map<string, number>
    byTargetType: CustomerTagTargetTypeCounts
    lastUsedAt: string | null
    count: number
  }
  const groups = new Map<string, TagGroup>()

  for (const row of rows) {
    const clean = normalizeTag(row.tag)
    if (!clean) continue
    const key = tagGroupKey(clean)
    let group = groups.get(key)
    if (!group) {
      group = {
        displayCounts: new Map(),
        byTargetType: { lead: 0, neo_account: 0, customer: 0 },
        lastUsedAt: null,
        count: 0,
      }
      groups.set(key, group)
    }
    group.count += 1
    group.displayCounts.set(clean, (group.displayCounts.get(clean) ?? 0) + 1)
    if (row.target_type === "lead" || row.target_type === "neo_account" || row.target_type === "customer") {
      group.byTargetType[row.target_type] += 1
    }
    if (!group.lastUsedAt || row.created_at > group.lastUsedAt) group.lastUsedAt = row.created_at
  }

  return Array.from(groups.values())
    .map((group) => {
      let display = ""
      let best = -1
      for (const [name, n] of group.displayCounts) {
        if (n > best) {
          best = n
          display = name
        }
      }
      return { tag: display, count: group.count, byTargetType: group.byTargetType, lastUsedAt: group.lastUsedAt }
    })
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ko"))
}

export interface TagBulkResult {
  updated: number
  removedDuplicates: number
}

export interface TagConsolidateOptions {
  /** true면 실제 update/delete 없이 결과 건수만 계산한다 — 커밋 전 미리보기용. */
  dryRun?: boolean
}

// 이름 변경(from 1개)·병합(from 여러 개)의 공유 코어.
// 대상(target_type+target_id)별로:
//  - 이미 `to` 태그가 있으면 매칭된 from 행을 전부 중복으로 삭제(removedDuplicates)
//  - 없으면 매칭된 첫 행 하나만 `to`로 바꾸고(updated), 같은 대상의 나머지 매칭 행은 중복 삭제
// `to`와 정규화·대소문자 무시로 같은 from 값은 대상에서 걸러 손대지 않는다(이미 목표 상태).
async function consolidateCustomerTags(
  fromTags: readonly string[],
  to: string,
  { dryRun = false }: TagConsolidateOptions
): Promise<TagBulkResult> {
  const toKey = tagGroupKey(to)
  const fromKeys = new Set(fromTags.map(tagGroupKey).filter((key) => key && key !== toKey))
  if (fromKeys.size === 0) return { updated: 0, removedDuplicates: 0 }

  const supabase = createSupabaseAdminClient()
  const rows = await loadAllTagRows(supabase)

  const targetHasTo = new Set<string>()
  const matchingByTarget = new Map<string, CrmCustomerTagRow[]>()
  for (const row of rows) {
    const tk = targetKey(row.target_type, row.target_id)
    const key = tagGroupKey(row.tag)
    if (key === toKey) {
      targetHasTo.add(tk)
      continue
    }
    if (!fromKeys.has(key)) continue
    const list = matchingByTarget.get(tk) ?? []
    list.push(row)
    matchingByTarget.set(tk, list)
  }

  const renames: CrmCustomerTagRow[] = []
  const deletes: CrmCustomerTagRow[] = []
  for (const [tk, list] of matchingByTarget) {
    if (targetHasTo.has(tk)) {
      deletes.push(...list)
      continue
    }
    const [first, ...rest] = list
    renames.push(first)
    deletes.push(...rest)
  }

  const result: TagBulkResult = { updated: renames.length, removedDuplicates: deletes.length }
  if (dryRun) return result

  // 중간에 실패해도 앞서 반영된 행이 있을 수 있으므로 무효화는 finally 에서 건다.
  try {
    for (const row of renames) {
      const { error } = await supabase
        .from(TABLE)
        .update({ tag: to })
        .eq("target_type", row.target_type)
        .eq("target_id", row.target_id)
        .eq("tag", row.tag)
      if (error) throw new Error(`[crm-tags] 이름 변경 실패: ${error.message ?? "unknown"}`)
    }
    for (const row of deletes) {
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("target_type", row.target_type)
        .eq("target_id", row.target_id)
        .eq("tag", row.tag)
      if (error) throw new Error(`[crm-tags] 중복 정리 실패: ${error.message ?? "unknown"}`)
    }
  } finally {
    invalidateTagsMapCache()
  }

  return result
}

/** 태그 하나를 다른 이름으로 일괄 변경한다. 대상에 이미 `to`가 있으면 `from` 행은 중복 삭제된다. */
export async function renameCustomerTag(
  from: string,
  to: string,
  options: TagConsolidateOptions = {}
): Promise<TagBulkResult> {
  return consolidateCustomerTags([from], to, options)
}

/** 여러 태그를 하나(`to`)로 합친다. 이름 변경과 같은 중복 정리 규칙을 대상별로 적용한다. */
export async function mergeCustomerTags(
  fromList: readonly string[],
  to: string,
  options: TagConsolidateOptions = {}
): Promise<TagBulkResult> {
  return consolidateCustomerTags(fromList, to, options)
}

// ── 세그먼트 일괄 태그(SG6) ─────────────────────────────────────────────────
// 통합 고객 목록에서 고른 대상(최대 500 — 상한은 라우트가 강제)에 같은 라벨을 한 번에 붙이거나 뗀다.
// 라벨 비교는 태그 관리 패널·통합 목록 ?tag= 필터와 같은 규칙(tagGroupKey — 대소문자·공백 무시):
//  - 추가: 대상에 이미 같은 묶음의 태그("VIP" 가 있는데 "vip" 추가)가 있으면 새 행을 만들지 않고 skipped.
//  - 제거: 대상의 같은 묶음 태그 행을 전부 지운다("vip" 제거가 "VIP" 행도 지운다). 없으면 skipped.
// 쓰기는 대상 타입별 매핑을 그대로 쓴다 — target_type 은 CHECK 가 허용하는 lead·neo_account·customer 만
// 들어온다(행 키 해석: lib/crm/unified-customer-key.ts). 쓰기 뒤에는 단건 경로와 같게 전체 태그 맵
// 캐시만 무효화한다(태그는 통합 스냅샷 Data Cache 에 들어있지 않다 — app/api/admin/crm/tags/route.ts 주석).

export type CrmBulkTagTarget = Pick<UnifiedCustomerTarget, "key" | "targetType" | "targetId">

export interface CrmBulkTagResult {
  /** 실제로 태그가 붙은(추가) / 떨어진(제거) 대상 수. */
  applied: number
  /** 이미 같은 태그가 있어서(추가) / 그 태그가 없어서(제거) 손대지 않은 대상 수. */
  skipped: number
  /** 쓰기가 실패한 대상의 행 키. */
  failed: string[]
}

// target_id·id in(...) 필터는 URL 에 실린다 — UUID 100개 ≈ 3.7KB 로 게이트웨이 URL 상한 아래에 둔다.
const BULK_TAG_READ_CHUNK = 100
const BULK_TAG_DELETE_ID_CHUNK = 100
// upsert 는 JSON 본문이라 URL 제약이 없다 — 라우트 상한(500)을 한 번에 넣어 부분 반영을 피한다.
const BULK_TAG_INSERT_CHUNK = 500

interface TargetTagRow {
  id: string
  target_type: string
  target_id: string
  tag: string
}

function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function dedupeBulkTargets(targets: readonly CrmBulkTagTarget[]): CrmBulkTagTarget[] {
  const seen = new Set<string>()
  const unique: CrmBulkTagTarget[] = []
  for (const target of targets) {
    if (!target.targetId) continue
    const key = targetKey(target.targetType, target.targetId)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(target)
  }
  return unique
}

// 대상들의 현재 태그 행 — 타입별·청크별로 range 페이지네이션 전량. 읽기 실패는 던진다
// (사전 조회 없이 쓰면 대소문자 중복·skipped 집계가 틀어진다).
async function loadTagRowsForTargets(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  targets: readonly CrmBulkTagTarget[]
): Promise<TargetTagRow[]> {
  const idsByType = new Map<string, string[]>()
  for (const target of targets) {
    const list = idsByType.get(target.targetType) ?? []
    list.push(target.targetId)
    idsByType.set(target.targetType, list)
  }

  const jobs: Array<Promise<TargetTagRow[]>> = []
  for (const [targetType, ids] of idsByType) {
    for (const idChunk of chunkItems(ids, BULK_TAG_READ_CHUNK)) {
      jobs.push(
        collectAllTagPages<TargetTagRow>(
          (from, to, withCount) =>
            supabase
              .from(TABLE)
              .select("id, target_type, target_id, tag", withCount ? { count: "exact" } : undefined)
              .eq("target_type", targetType)
              .in("target_id", idChunk)
              .order("id", { ascending: true })
              .range(from, to),
          "대상 태그 조회"
        )
      )
    }
  }
  return (await Promise.all(jobs)).flat()
}

/** 선택 대상 전부에 태그 하나를 붙인다. 같은 묶음 태그가 이미 있는 대상은 skipped. */
export async function addCustomerTagToTargets(
  targets: readonly CrmBulkTagTarget[],
  tag: string,
  createdBy?: string | null
): Promise<CrmBulkTagResult> {
  const clean = normalizeTag(tag)
  if (!clean) throw new Error("태그가 필요합니다.")
  const unique = dedupeBulkTargets(targets)
  if (unique.length === 0) return { applied: 0, skipped: 0, failed: [] }

  const supabase = createSupabaseAdminClient()
  const groupKey = tagGroupKey(clean)
  const existing = await loadTagRowsForTargets(supabase, unique)
  const alreadyTagged = new Set(
    existing.filter((row) => tagGroupKey(row.tag) === groupKey).map((row) => targetKey(row.target_type, row.target_id))
  )
  const pending = unique.filter((target) => !alreadyTagged.has(targetKey(target.targetType, target.targetId)))
  const actor = createdBy?.trim() || null

  let applied = 0
  const failed: string[] = []
  try {
    for (const batch of chunkItems(pending, BULK_TAG_INSERT_CHUNK)) {
      // ignoreDuplicates(ON CONFLICT DO NOTHING) + select → 실제로 들어간 행만 돌아온다. 사전 조회와
      // 이 쓰기 사이에 다른 요청이 같은 태그를 붙였으면 그 대상은 applied 가 아니라 skipped 로 셈된다.
      const { data, error } = await supabase
        .from(TABLE)
        .upsert(
          batch.map((target) => ({
            target_type: target.targetType,
            target_id: target.targetId,
            tag: clean,
            created_by: actor,
          })),
          { onConflict: "target_type,target_id,tag", ignoreDuplicates: true }
        )
        .select("target_type, target_id")
      if (error) {
        console.error("[crm-tags] 일괄 추가 실패", error.message ?? "unknown")
        failed.push(...batch.map((target) => target.key))
        continue
      }
      applied += new Set(
        ((data ?? []) as Array<{ target_type: string; target_id: string }>).map((row) =>
          targetKey(row.target_type, row.target_id)
        )
      ).size
    }
  } finally {
    if (pending.length > 0) invalidateTagsMapCache()
  }

  return { applied, skipped: unique.length - applied - failed.length, failed }
}

/** 선택 대상 전부에서 태그 하나(대소문자·공백 무시 같은 묶음)를 뗀다. 그 태그가 없는 대상은 skipped. */
export async function removeCustomerTagFromTargets(
  targets: readonly CrmBulkTagTarget[],
  tag: string
): Promise<CrmBulkTagResult> {
  const clean = normalizeTag(tag)
  if (!clean) throw new Error("태그가 필요합니다.")
  const unique = dedupeBulkTargets(targets)
  if (unique.length === 0) return { applied: 0, skipped: 0, failed: [] }

  const supabase = createSupabaseAdminClient()
  const groupKey = tagGroupKey(clean)
  const existing = await loadTagRowsForTargets(supabase, unique)
  const rowIdsByTarget = new Map<string, string[]>()
  for (const row of existing) {
    if (tagGroupKey(row.tag) !== groupKey) continue
    const key = targetKey(row.target_type, row.target_id)
    const list = rowIdsByTarget.get(key) ?? []
    list.push(row.id)
    rowIdsByTarget.set(key, list)
  }
  const matched = unique.filter((target) => rowIdsByTarget.has(targetKey(target.targetType, target.targetId)))

  // 한 대상의 행(대소문자 변형 여러 개일 수 있다)은 같은 삭제 요청에 묶는다 — 대상 단위로 성공/실패를 센다.
  const batches: CrmBulkTagTarget[][] = []
  let current: CrmBulkTagTarget[] = []
  let currentIds = 0
  for (const target of matched) {
    const count = rowIdsByTarget.get(targetKey(target.targetType, target.targetId))?.length ?? 0
    if (current.length > 0 && currentIds + count > BULK_TAG_DELETE_ID_CHUNK) {
      batches.push(current)
      current = []
      currentIds = 0
    }
    current.push(target)
    currentIds += count
  }
  if (current.length > 0) batches.push(current)

  let applied = 0
  const failed: string[] = []
  try {
    for (const batch of batches) {
      const ids = batch.flatMap((target) => rowIdsByTarget.get(targetKey(target.targetType, target.targetId)) ?? [])
      const { data, error } = await supabase.from(TABLE).delete().in("id", ids).select("target_type, target_id")
      if (error) {
        console.error("[crm-tags] 일괄 삭제 실패", error.message ?? "unknown")
        failed.push(...batch.map((target) => target.key))
        continue
      }
      // 사전 조회 뒤 다른 요청이 먼저 지웠다면 돌아온 행이 없다 — 그 대상은 skipped 로 셈된다.
      applied += new Set(
        ((data ?? []) as Array<{ target_type: string; target_id: string }>).map((row) =>
          targetKey(row.target_type, row.target_id)
        )
      ).size
    }
  } finally {
    if (matched.length > 0) invalidateTagsMapCache()
  }

  return { applied, skipped: unique.length - applied - failed.length, failed }
}

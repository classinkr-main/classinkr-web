import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type CrmTagTargetType = "lead" | "neo_account" | "customer" | "unknown"

const TABLE = "crm_customer_tags"

// 전체 태그 맵 캐시 — 통합 리스트가 매 로드마다 전체 스캔하지 않도록 30초 유지. 추가/삭제 시 무효화.
let tagsMapCache: { at: number; value: Record<string, string[]> } | null = null
const TAGS_MAP_CACHE_TTL_MS = 30_000

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
  tagsMapCache = null
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
  tagsMapCache = null
  return getCustomerTags(targetType, targetId)
}

// 통합 리스트용 — 전체 태그 맵(키 `${targetType}:${targetId}`). 소규모 테이블 단일 조회 + 30초 캐시.
export async function getAllCustomerTagsMap(): Promise<Record<string, string[]>> {
  const cached = tagsMapCache
  if (cached && Date.now() - cached.at < TAGS_MAP_CACHE_TTL_MS) return cached.value
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(TABLE).select("target_type, target_id, tag")
  if (error) throw new Error(`[crm-tags] 전체 맵 실패: ${error.message ?? "unknown"}`)
  const map: Record<string, string[]> = {}
  for (const row of data ?? []) {
    const key = targetKey(row.target_type as string, row.target_id as string)
    ;(map[key] ??= []).push(row.tag as string)
  }
  tagsMapCache = { at: Date.now(), value: map }
  return map
}

// ── T4 태그 관리 패널 — 집계·이름 변경·병합 ────────────────────────────────
// 아래 함수들은 crm_customer_tags 전체(또는 그 부분집합)를 range 페이지네이션으로 끝까지 읽는다
// (leads.ts와 같은 원칙 — PostgREST 기본/설정 상한이 있어도 절단 없이 전량을 모은다). 실제 운영
// 규모는 위 getAllCustomerTagsMap 주석대로 "소규모 테이블"이라 페이지 1~2장 안에서 끝난다.

const TAG_RANGE_PAGE_SIZE = 1000

interface CrmCustomerTagRow {
  target_type: string
  target_id: string
  tag: string
  created_at: string
}

async function loadAllTagRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>
): Promise<CrmCustomerTagRow[]> {
  const rows: CrmCustomerTagRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("target_type, target_id, tag, created_at")
      .order("created_at", { ascending: true })
      .range(from, from + TAG_RANGE_PAGE_SIZE - 1)
    if (error) throw new Error(`[crm-tags] 전량 조회 실패: ${error.message ?? "unknown"}`)
    const batch = (data ?? []) as CrmCustomerTagRow[]
    rows.push(...batch)
    if (batch.length < TAG_RANGE_PAGE_SIZE) break
    from += TAG_RANGE_PAGE_SIZE
  }
  return rows
}

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

  tagsMapCache = null
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

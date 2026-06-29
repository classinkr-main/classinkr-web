import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type CrmTagTargetType = "lead" | "neo_account" | "customer" | "unknown"

export interface CrmCustomerTagStat {
  tag: string
  count: number
}

const TABLE = "crm_customer_tags"

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
  return getCustomerTags(targetType, targetId)
}

// 리스트용 일괄 조회 — 반환 맵 키는 `${targetType}:${targetId}`.
export async function getTagsForTargets(
  targets: Array<{ targetType: CrmTagTargetType; targetId: string }>
): Promise<Record<string, string[]>> {
  const ids = Array.from(new Set(targets.map((target) => target.targetId).filter(Boolean)))
  if (ids.length === 0) return {}
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(TABLE).select("target_type, target_id, tag").in("target_id", ids)
  if (error) throw new Error(`[crm-tags] 일괄 조회 실패: ${error.message ?? "unknown"}`)
  const map: Record<string, string[]> = {}
  for (const row of data ?? []) {
    const key = targetKey(row.target_type as string, row.target_id as string)
    ;(map[key] ??= []).push(row.tag as string)
  }
  return map
}

// 통합 리스트용 — 전체 태그 맵(키 `${targetType}:${targetId}`). 태그 테이블은 소규모라 단일 조회.
export async function getAllCustomerTagsMap(): Promise<Record<string, string[]>> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(TABLE).select("target_type, target_id, tag")
  if (error) throw new Error(`[crm-tags] 전체 맵 실패: ${error.message ?? "unknown"}`)
  const map: Record<string, string[]> = {}
  for (const row of data ?? []) {
    const key = targetKey(row.target_type as string, row.target_id as string)
    ;(map[key] ??= []).push(row.tag as string)
  }
  return map
}

// 필터 옵션 — 사용 중인 태그와 건수(많이 쓰인 순).
export async function listAllCustomerTags(): Promise<CrmCustomerTagStat[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from(TABLE).select("tag")
  if (error) throw new Error(`[crm-tags] 태그 목록 실패: ${error.message ?? "unknown"}`)
  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const tag = row.tag as string
    counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ko"))
}

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

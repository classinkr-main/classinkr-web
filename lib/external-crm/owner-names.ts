import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

// Xiaoshouyi records store owner as a numeric ownerId, not a name. The synced
// `User` object provides id -> name; this builds that lookup. Falls back to an
// empty map (callers keep the raw id) until the User object is synced.
const XIAOSHOUYI_USER_OBJECT = "User"
// HQ staff directory exceeds 2,000 users; keep headroom for a full sync.
const USER_MAP_SCAN_LIMIT = 20000

// 팀 리포트·매칭 인박스·계정 페이지가 같은 이름 맵을 반복 조회한다.
// 이름은 거의 안 바뀌므로 인스턴스 단위 60s 메모로 중복 조회를 합친다.
const OWNER_MAP_MEMO_TTL_MS = 60_000
let ownerMapMemo: { expiresAt: number; promise: Promise<Map<string, string>> } | null = null

export function getXiaoshouyiOwnerNameMap(sb: SupabaseAdminClient): Promise<Map<string, string>> {
  if (ownerMapMemo && ownerMapMemo.expiresAt > Date.now()) return ownerMapMemo.promise

  const promise = computeXiaoshouyiOwnerNameMap(sb).catch((error) => {
    ownerMapMemo = null
    throw error
  })
  ownerMapMemo = { expiresAt: Date.now() + OWNER_MAP_MEMO_TTL_MS, promise }
  return promise
}

async function computeXiaoshouyiOwnerNameMap(sb: SupabaseAdminClient): Promise<Map<string, string>> {
  const map = new Map<string, string>()

  const [userResult, overrideResult] = await Promise.all([
    // 1) Auto: synced User directory (present after the User object syncs).
    sb
      .from("external_crm_records")
      .select("external_id, display_name")
      .eq("source_system", "xiaoshouyi")
      .eq("object_api_key", XIAOSHOUYI_USER_OBJECT)
      .limit(USER_MAP_SCAN_LIMIT),
    // 2) Curated overrides — win over the User directory; work without a sync.
    sb
      .from("crm_xiaoshouyi_owner_names")
      .select("external_id, display_name, korean_name")
      .limit(USER_MAP_SCAN_LIMIT),
  ])

  if (!userResult.error && userResult.data) {
    for (const row of userResult.data as Array<{ external_id: string; display_name: string | null }>) {
      if (row.external_id && row.display_name) map.set(String(row.external_id), row.display_name)
    }
  }
  if (!overrideResult.error && overrideResult.data) {
    // 담당자 표기는 한국 이름 우선(korean_name), 없으면 display_name으로 폴백.
    for (const row of overrideResult.data as Array<{
      external_id: string
      display_name: string | null
      korean_name: string | null
    }>) {
      const name = row.korean_name?.trim() || row.display_name
      if (row.external_id && name) map.set(String(row.external_id), name)
    }
  }

  return map
}

export function resolveOwnerName(ownerId: string | null | undefined, ownerNames: Map<string, string>) {
  const id = ownerId?.trim() || ""
  if (!id) return "담당 미지정"
  return ownerNames.get(id) ?? id
}

// ownerIds flagged is_excluded (e.g. China team) — dropped from Korea team
// revenue. Empty set until the owner-names table is applied/curated.
export async function getExcludedXiaoshouyiOwnerIds(sb: SupabaseAdminClient): Promise<Set<string>> {
  const set = new Set<string>()
  const { data, error } = await sb
    .from("crm_xiaoshouyi_owner_names")
    .select("external_id")
    .eq("is_excluded", true)
    .limit(USER_MAP_SCAN_LIMIT)
  if (error || !data) return set
  for (const row of data as Array<{ external_id: string }>) {
    if (row.external_id) set.add(String(row.external_id))
  }
  return set
}

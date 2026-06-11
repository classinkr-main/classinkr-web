import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

// Xiaoshouyi records store owner as a numeric ownerId, not a name. The synced
// `User` object provides id -> name; this builds that lookup. Falls back to an
// empty map (callers keep the raw id) until the User object is synced.
const XIAOSHOUYI_USER_OBJECT = "User"
const USER_MAP_SCAN_LIMIT = 5000

export async function getXiaoshouyiOwnerNameMap(sb: SupabaseAdminClient): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const { data, error } = await sb
    .from("external_crm_records")
    .select("external_id, display_name")
    .eq("source_system", "xiaoshouyi")
    .eq("object_api_key", XIAOSHOUYI_USER_OBJECT)
    .limit(USER_MAP_SCAN_LIMIT)
  if (error || !data) return map
  for (const row of data as Array<{ external_id: string; display_name: string | null }>) {
    if (row.external_id && row.display_name) map.set(String(row.external_id), row.display_name)
  }
  return map
}

export function resolveOwnerName(ownerId: string | null | undefined, ownerNames: Map<string, string>) {
  const id = ownerId?.trim() || ""
  if (!id) return "담당 미지정"
  return ownerNames.get(id) ?? id
}

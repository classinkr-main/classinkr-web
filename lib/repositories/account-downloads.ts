import "server-only"

import type { MaterialDownload } from "@/lib/supabase/database.types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface AccountMaterialDownload {
  slug: string
  gateType: MaterialDownload["gate_type"]
  lastDownloadedAt: string
}

/**
 * Returns the premium/login materials a user has downloaded, one row per
 * material slug (most recent first). Service-role only — RLS blocks anon/server
 * reads of material_downloads. Signed URLs are never returned here; /account
 * re-hits /api/materials/<slug>/download to mint a fresh signed URL.
 */
export async function getMaterialDownloadsByUser(
  userId: string
): Promise<AccountMaterialDownload[]> {
  if (!userId) return []

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("material_downloads")
    .select("material_slug, gate_type, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error || !data) {
    if (error) {
      console.warn("[account-downloads] select failed:", error.message)
    }
    return []
  }

  const seen = new Set<string>()
  const result: AccountMaterialDownload[] = []
  for (const row of data) {
    const slug = row.material_slug as string
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    result.push({
      slug,
      gateType: row.gate_type as MaterialDownload["gate_type"],
      lastDownloadedAt: row.created_at as string,
    })
  }

  return result
}

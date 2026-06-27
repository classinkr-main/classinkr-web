import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { PremiumContentItem } from "@/lib/premium/types"

export async function getPremiumContentBySlug(slug: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("premium_content_items")
    .select("*")
    .eq("slug", slug)
    .maybeSingle()

  if (error || !data) return null
  return data as PremiumContentItem
}

export async function listPublishedPremiumContent() {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("premium_content_items")
    .select(
      "id, slug, title, summary, content_type, status, required_tier, storage_bucket, storage_path, external_url, published_at, created_at, updated_at"
    )
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })

  if (error || !data) return []
  return data as PremiumContentItem[]
}

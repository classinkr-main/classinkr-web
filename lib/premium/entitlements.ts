import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { PremiumEntitlement } from "@/lib/premium/types"

function timeValue(value: string | null) {
  return value ? new Date(value).getTime() : null
}

export function isPremiumEntitlementActive(
  entitlement: PremiumEntitlement | null,
  requiredTier: string,
  now = new Date()
) {
  if (!entitlement) return false
  if (entitlement.status !== "active") return false
  if (entitlement.tier !== requiredTier) return false

  const nowMs = now.getTime()
  const startsAt = timeValue(entitlement.starts_at)
  const endsAt = timeValue(entitlement.ends_at)

  if (startsAt !== null && startsAt > nowMs) return false
  if (endsAt !== null && endsAt <= nowMs) return false
  return true
}

export async function getActivePremiumEntitlement(userId: string, requiredTier: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("premium_entitlements")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("tier", requiredTier)
    .order("starts_at", { ascending: false })
    .limit(5)

  if (error || !data) return null

  return (
    (data as PremiumEntitlement[]).find((item) =>
      isPremiumEntitlementActive(item, requiredTier)
    ) ?? null
  )
}

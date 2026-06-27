import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { PremiumAccessEventInsert } from "@/lib/premium/types"

const PII_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\b\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g,
]

function cleanText(value: string | null | undefined, max: number) {
  const text = value?.trim()
  return text ? text.slice(0, max) : null
}

function redactPii(value: string | null | undefined, max: number) {
  const text = cleanText(value, max)
  if (!text) return null
  return PII_PATTERNS.reduce((result, pattern) => result.replace(pattern, "[redacted]"), text)
}

export function buildPremiumAccessEventPayload(input: PremiumAccessEventInsert) {
  return {
    content_id: cleanText(input.content_id, 80),
    content_slug: cleanText(input.content_slug, 160),
    user_id: cleanText(input.user_id, 80),
    lead_id: cleanText(input.lead_id, 80),
    anonymous_id: cleanText(input.anonymous_id, 100),
    action: input.action,
    reason: cleanText(input.reason, 120),
    provider: cleanText(input.provider, 40),
    page: redactPii(input.page, 300),
    referrer: redactPii(input.referrer, 500),
    user_agent: redactPii(input.user_agent, 500),
  }
}

export async function recordPremiumAccessEvent(input: PremiumAccessEventInsert) {
  const payload = buildPremiumAccessEventPayload(input)
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from("premium_access_events").insert(payload)
    if (error) {
      console.warn("[premium] premium_access_events insert failed:", error.message)
      return false
    }
    return true
  } catch {
    return false
  }
}

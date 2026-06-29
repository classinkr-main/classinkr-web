import "server-only"

import { getPublicUserContext } from "@/lib/auth/public-user"
import { recordPremiumAccessEvent } from "@/lib/premium/access-log"
import { getPremiumContentBySlug } from "@/lib/premium/content"
import { getActivePremiumEntitlement } from "@/lib/premium/entitlements"
import type {
  PremiumAccessEventInsert,
  PremiumContentItem,
  PremiumEntitlement,
} from "@/lib/premium/types"

export type PremiumAccessStatus =
  | "not_found"
  | "unpublished"
  | "login_required"
  | "forbidden"
  | "allowed"

interface ResolvePremiumAccessInput {
  slug: string
  userId: string | null
  anonymousId?: string | null
  leadId?: string | null
  provider?: string | null
  page?: string | null
  referrer?: string | null
  userAgent?: string | null
  loadContent: (slug: string) => Promise<PremiumContentItem | null>
  loadEntitlement: (userId: string, tier: string) => Promise<PremiumEntitlement | null>
  recordEvent: (event: PremiumAccessEventInsert) => Promise<unknown> | unknown
}

export async function resolvePremiumAccess(input: ResolvePremiumAccessInput) {
  const content = await input.loadContent(input.slug)
  if (!content) return { status: "not_found" as const, content: null, entitlement: null }

  const baseEvent = {
    content_id: content.id,
    content_slug: content.slug,
    user_id: input.userId,
    lead_id: input.leadId,
    anonymous_id: input.anonymousId,
    provider: input.provider,
    page: input.page,
    referrer: input.referrer,
    user_agent: input.userAgent,
  }

  if (content.status !== "published") {
    await input.recordEvent({
      ...baseEvent,
      action: "view_denied",
      reason: "content_unpublished",
    })
    return { status: "unpublished" as const, content, entitlement: null }
  }

  if (!input.userId) {
    await input.recordEvent({
      ...baseEvent,
      action: "login_prompt",
      reason: "anonymous_user",
    })
    return { status: "login_required" as const, content, entitlement: null }
  }

  const entitlement = await input.loadEntitlement(input.userId, content.required_tier)
  if (!entitlement) {
    await input.recordEvent({
      ...baseEvent,
      action: "view_denied",
      reason: "missing_entitlement",
    })
    return { status: "forbidden" as const, content, entitlement: null }
  }

  await input.recordEvent({
    ...baseEvent,
    action: "view_allowed",
    reason: "active_entitlement",
  })
  return { status: "allowed" as const, content, entitlement }
}

export async function authorizePremiumContentAccess(
  slug: string,
  metadata: Omit<PremiumAccessEventInsert, "action" | "content_slug"> = {}
) {
  const context = await getPublicUserContext()
  return resolvePremiumAccess({
    slug,
    userId: context?.user.id ?? null,
    leadId: context?.profile.lead_id ?? null,
    provider: context?.profile.provider ?? null,
    ...metadata,
    loadContent: getPremiumContentBySlug,
    loadEntitlement: getActivePremiumEntitlement,
    recordEvent: recordPremiumAccessEvent,
  })
}

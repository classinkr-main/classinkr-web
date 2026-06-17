import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

interface StitchIdentityInput {
  anonymousId?: string | null
  userId?: string | null
  leadId?: string | null
  email?: string | null
}

interface StitchIdentityResult {
  ok: boolean
  leadId: string | null
  warnings: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeShortText(value: string | null | undefined, max = 160) {
  const text = value?.trim()
  return text ? text.slice(0, max) : null
}

function normalizeUuid(value: string | null | undefined) {
  const text = normalizeShortText(value, 80)
  return text && UUID_RE.test(text) ? text : null
}

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase()
  return email && EMAIL_RE.test(email) ? email : null
}

async function findLatestLeadIdByEmail(email: string | null) {
  if (!email) return null

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) return null
  return data.id as string
}

async function captureWarning(label: string, task: PromiseLike<unknown>, warnings: string[]) {
  try {
    await task
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`${label}: ${message}`)
  }
}

export async function stitchIdentity(input: StitchIdentityInput): Promise<StitchIdentityResult> {
  const anonymousId = normalizeShortText(input.anonymousId, 100)
  const userId = normalizeUuid(input.userId)
  const email = normalizeEmail(input.email)
  const leadId = normalizeUuid(input.leadId) ?? (await findLatestLeadIdByEmail(email))
  const warnings: string[] = []

  if (!anonymousId && !userId) {
    return { ok: true, leadId, warnings }
  }

  const supabase = createSupabaseAdminClient()
  const eventPatch: Record<string, string> = {}
  if (userId) eventPatch.user_id = userId
  if (leadId) eventPatch.lead_id = leadId

  if (Object.keys(eventPatch).length > 0 && anonymousId) {
    const query = supabase
      .from("client_events")
      .update(eventPatch)
      .eq("anonymous_id", anonymousId)
      .or("lead_id.is.null,user_id.is.null")
    await captureWarning("client_events anonymous backfill", query, warnings)
  }

  if (leadId && userId) {
    const eventsByUser = supabase
      .from("client_events")
      .update({ lead_id: leadId })
      .eq("user_id", userId)
      .is("lead_id", null)
    await captureWarning("client_events user backfill", eventsByUser, warnings)

    const profile = supabase
      .from("user_profiles")
      .update({ lead_id: leadId })
      .eq("id", userId)
      .is("lead_id", null)
    await captureWarning("user_profiles lead link", profile, warnings)
  }

  return { ok: warnings.length === 0, leadId, warnings }
}

import "server-only"

import type { User } from "@supabase/supabase-js"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface PublicUserProfile {
  id: string
  email: string | null
  name: string | null
  provider: string | null
  provider_id: string | null
  lead_id: string | null
}

export interface PublicUserContext {
  user: User
  profile: PublicUserProfile
}

function getProvider(user: User) {
  const identity = user.identities?.[0]
  return (
    identity?.provider ??
    (typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : null)
  )
}

function getProviderId(user: User) {
  const identity = user.identities?.[0]
  if (typeof identity?.id === "string") return identity.id
  const sub = user.user_metadata?.sub
  return typeof sub === "string" ? sub : null
}

function getDisplayName(user: User) {
  const metadata = user.user_metadata ?? {}
  const name = metadata.name ?? metadata.full_name ?? metadata.preferred_username
  return typeof name === "string" && name.trim() ? name.trim() : null
}

async function findLatestLeadIdByEmail(email: string | null | undefined) {
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

export async function upsertPublicUserProfile(user: User): Promise<PublicUserProfile> {
  const supabase = createSupabaseAdminClient()
  const email = user.email?.trim().toLowerCase() || null
  const provider = getProvider(user)
  const providerId = getProviderId(user)
  const name = getDisplayName(user)
  const leadId = await findLatestLeadIdByEmail(email)

  const payload = {
    id: user.id,
    email,
    name,
    provider,
    provider_id: providerId,
    lead_id: leadId,
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "id" })
    .select("id, email, name, provider, provider_id, lead_id")
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to upsert public user profile.")
  }

  return {
    id: data.id as string,
    email: (data.email as string | null) ?? null,
    name: (data.name as string | null) ?? null,
    provider: (data.provider as string | null) ?? null,
    provider_id: (data.provider_id as string | null) ?? null,
    lead_id: (data.lead_id as string | null) ?? null,
  }
}

export async function getPublicUserContext(): Promise<PublicUserContext | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  const profile = await upsertPublicUserProfile(user)
  return { user, profile }
}

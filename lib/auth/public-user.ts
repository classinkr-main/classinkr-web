import "server-only"

import type { User } from "@supabase/supabase-js"

import { associateLeadsForVerifiedEmail, shouldAutoLinkEmail } from "@/lib/identity/stitch"
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

export async function upsertPublicUserProfile(user: User): Promise<PublicUserProfile> {
  const supabase = createSupabaseAdminClient()
  const email = user.email?.trim().toLowerCase() || null
  const provider = getProvider(user)
  const providerId = getProviderId(user)
  const name = getDisplayName(user)
  const emailVerified = Boolean(user.email_confirmed_at)

  const payload = {
    id: user.id,
    email,
    name,
    provider,
    provider_id: providerId,
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "id" })
    .select("id, email, name, provider, provider_id, lead_id")
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to upsert public user profile.")
  }

  let leadId = (data.lead_id as string | null) ?? null

  // 검증된 이메일일 때만 결정적으로 lead를 연결한다(latest-1 추측 제거).
  // 매 로그인마다 타는 경로이므로 연결 실패(예: 마이그레이션 미적용)는 조용히 묻지 않고 로깅한다.
  if (email && shouldAutoLinkEmail(emailVerified)) {
    const associateWarnings: string[] = []
    const { canonicalLeadId } = await associateLeadsForVerifiedEmail(
      user.id,
      email,
      associateWarnings
    )
    if (canonicalLeadId) leadId = canonicalLeadId
    if (associateWarnings.length > 0) {
      console.warn("[upsertPublicUserProfile] lead stitch warnings:", associateWarnings)
    }
  }

  return {
    id: data.id as string,
    email: (data.email as string | null) ?? null,
    name: (data.name as string | null) ?? null,
    provider: (data.provider as string | null) ?? null,
    provider_id: (data.provider_id as string | null) ?? null,
    lead_id: leadId,
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

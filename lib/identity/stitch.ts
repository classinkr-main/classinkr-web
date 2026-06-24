import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

interface StitchIdentityInput {
  anonymousId?: string | null
  userId?: string | null
  leadId?: string | null
  email?: string | null
  emailVerified?: boolean
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

/**
 * 검증된 이메일일 때만 이메일 문자열로 lead 자동 연결을 허용한다.
 * 미검증 이메일을 신뢰하면 타인의 lead/다운로드 이력에 무단 연결될 수 있으므로
 * email_confirmed_at(Google) / is_email_verified(Kakao) 등으로만 true가 된다.
 */
export function shouldAutoLinkEmail(emailVerified: boolean): boolean {
  return emailVerified
}

async function captureWarning(label: string, task: PromiseLike<unknown>, warnings: string[]) {
  try {
    // PostgREST 쿼리는 throw하지 않고 { data, error }로 resolve된다.
    // 마이그레이션 미적용(컬럼/테이블 없음)이나 일시적 DB 오류가 조용히 묻히지 않도록
    // resolve된 error도 경고로 수집한다.
    const result = await task
    const error = (result as { error?: { message?: string } | null } | null)?.error
    if (error) {
      warnings.push(`${label}: ${error.message ?? "unknown error"}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`${label}: ${message}`)
  }
}

interface AssociateResult {
  leadIds: string[]
  canonicalLeadId: string | null
}

/**
 * 검증된 이메일 → user_id 결정적 연결.
 * latest-1 추측을 버리고, 같은 이메일의 모든 미연결 lead를 user_id로 묶는다.
 * (a) UPDATE leads SET user_id WHERE email = $normalized_lower AND user_id IS NULL
 * (b) 해당 user_id의 모든 lead id 조회
 * (c) user_profiles.lead_id 는 가장 최근(canonical) lead로 백필
 * (d) client_events.lead_id 는 user_id로 스코프해서만 백필(무제한 금지)
 * 반드시 service_role(admin) 클라이언트 — server/anon 클라이언트는 RLS로 0행.
 */
export async function associateLeadsForVerifiedEmail(
  userId: string,
  email: string,
  warnings: string[] = []
): Promise<AssociateResult> {
  const normalizedUserId = normalizeUuid(userId)
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedUserId || !normalizedEmail) {
    return { leadIds: [], canonicalLeadId: null }
  }

  const supabase = createSupabaseAdminClient()

  // (a) 같은 이메일의 미연결 lead 전부 묶기
  const associate = supabase
    .from("leads")
    .update({ user_id: normalizedUserId })
    .eq("email", normalizedEmail)
    .is("user_id", null)
  await captureWarning("leads associate by verified email", associate, warnings)

  // (b) 이 user_id에 묶인 모든 lead id
  let leadIds: string[] = []
  try {
    const { data, error } = await supabase
      .from("leads")
      .select("id")
      .eq("user_id", normalizedUserId)
      .order("created_at", { ascending: false })
    if (error) throw new Error(error.message)
    leadIds = (data ?? [])
      .map((row) => (typeof row.id === "string" ? row.id : null))
      .filter((id): id is string => Boolean(id))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`leads select by user_id: ${message}`)
  }

  // (c) canonical = 가장 최근 lead(위에서 created_at desc 정렬)
  const canonicalLeadId = leadIds[0] ?? null

  if (canonicalLeadId) {
    const profile = supabase
      .from("user_profiles")
      .update({ lead_id: canonicalLeadId })
      .eq("id", normalizedUserId)
      .is("lead_id", null)
    await captureWarning("user_profiles canonical lead link", profile, warnings)

    // (d) client_events 백필은 user_id로 스코프(무제한 금지)
    const events = supabase
      .from("client_events")
      .update({ lead_id: canonicalLeadId })
      .eq("user_id", normalizedUserId)
      .is("lead_id", null)
    await captureWarning("client_events user-scoped lead backfill", events, warnings)
  }

  return { leadIds, canonicalLeadId }
}

export async function stitchIdentity(input: StitchIdentityInput): Promise<StitchIdentityResult> {
  const anonymousId = normalizeShortText(input.anonymousId, 100)
  const userId = normalizeUuid(input.userId)
  const email = normalizeEmail(input.email)
  const emailVerified = Boolean(input.emailVerified)
  const explicitLeadId = normalizeUuid(input.leadId)
  const warnings: string[] = []

  // 검증된 이메일 + userId 가 있을 때만 결정적 연결을 수행한다.
  // explicit leadId(이미 알고 있는 just-created lead)는 이메일 추측 없이 그대로 신뢰한다.
  let associatedLeadIds: string[] = []
  let canonicalLeadId: string | null = null
  if (userId && email && shouldAutoLinkEmail(emailVerified)) {
    const result = await associateLeadsForVerifiedEmail(userId, email, warnings)
    associatedLeadIds = result.leadIds
    canonicalLeadId = result.canonicalLeadId
  }

  const leadId = explicitLeadId ?? canonicalLeadId

  if (!anonymousId && !userId) {
    await writeStitchLog({ userId, email, anonymousId, leadIds: leadIdsFor(leadId, associatedLeadIds), emailVerified, action: "noop" }, warnings)
    return { ok: warnings.length === 0, leadId, warnings }
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

  // explicit leadId 경로: 이미 알고 있는 lead를 user_id/profile에 연결(이메일 추측 없음).
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

  await writeStitchLog(
    {
      userId,
      email,
      anonymousId,
      leadIds: leadIdsFor(leadId, associatedLeadIds),
      emailVerified,
      action: explicitLeadId ? "explicit_lead" : canonicalLeadId ? "verified_email" : "anonymous_only",
    },
    warnings
  )

  return { ok: warnings.length === 0, leadId, warnings }
}

function leadIdsFor(leadId: string | null, associated: string[]) {
  const set = new Set<string>(associated)
  if (leadId) set.add(leadId)
  return Array.from(set)
}

/**
 * identity_stitch_logs 감사 행 1건 best-effort 기록.
 * consent_logs 패턴(app/api/consent/route.ts)을 미러링 — 실패는 throw하지 않고 경고만 남긴다.
 */
async function writeStitchLog(
  entry: {
    userId: string | null
    email: string | null
    anonymousId: string | null
    leadIds: string[]
    emailVerified: boolean
    action: string
  },
  warnings: string[]
) {
  const supabase = createSupabaseAdminClient()
  const insert = supabase.from("identity_stitch_logs").insert({
    user_id: entry.userId,
    email: entry.email,
    anonymous_id: entry.anonymousId,
    lead_ids: entry.leadIds,
    action: entry.action,
    email_verified: entry.emailVerified,
  })
  await captureWarning("identity_stitch_logs insert", insert, warnings)
}

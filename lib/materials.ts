import "server-only"

import type { LeadMagnet, LeadMagnetGate } from "@/lib/lead-magnets"
import { stitchIdentity } from "@/lib/identity/stitch"
import { getLeadMagnetBySlugFromStore } from "@/lib/repositories/lead-magnets"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface MaterialDownloadRequest {
  slug: string
  email?: string | null
  anonymousId?: string | null
  source?: string | null
  postSlug?: string | null
  userId?: string | null
  leadId?: string | null
}

export interface MaterialDownloadResult {
  magnet: LeadMagnet
  destinationUrl: string
  signed: boolean
  stored: boolean
}

const MATERIALS_BUCKET = process.env.MATERIALS_STORAGE_BUCKET?.trim() || "materials"

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase()
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function normalizeShortText(value: string | null | undefined, max = 160) {
  const text = value?.trim()
  return text ? text.slice(0, max) : null
}

function getStoragePath(magnet: LeadMagnet) {
  return magnet.storagePath?.trim() || null
}

function getFallbackResourceUrl(magnet: LeadMagnet) {
  return magnet.resourceUrl?.trim() || `/resources/${magnet.slug}`
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

async function resolveDestinationUrl(magnet: LeadMagnet) {
  const storagePath = getStoragePath(magnet)
  if (!storagePath) {
    return { url: getFallbackResourceUrl(magnet), signed: false }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage
    .from(MATERIALS_BUCKET)
    .createSignedUrl(storagePath, 60, { download: true })

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "자료 서명 URL을 만들지 못했습니다.")
  }

  return { url: data.signedUrl, signed: true }
}

async function recordDownload({
  magnet,
  gate,
  destinationUrl,
  userId,
  leadId,
  anonymousId,
  source,
  postSlug,
}: {
  magnet: LeadMagnet
  gate: LeadMagnetGate
  destinationUrl: string
  userId: string | null
  leadId: string | null
  anonymousId: string | null
  source: string | null
  postSlug: string | null
}) {
  const supabase = createSupabaseAdminClient()
  const payload = {
    material_slug: magnet.slug,
    user_id: userId,
    lead_id: leadId,
    anonymous_id: anonymousId,
    gate_type: gate,
    source,
    post_slug: postSlug,
    destination_url: destinationUrl.slice(0, 1000),
  }

  const { error: downloadError } = await supabase.from("material_downloads").insert(payload)
  if (downloadError) {
    console.warn("[materials] material_downloads insert failed:", downloadError.message)
    return false
  }

  const { error: eventError } = await supabase.from("client_events").insert({
    event_name: "download_materials",
    page: source,
    params: {
      asset_id: magnet.slug,
      source,
      lead_magnet: magnet.slug,
      gate,
      post_slug: postSlug,
    },
    anonymous_id: anonymousId,
    lead_id: leadId,
    user_id: userId,
  })

  if (eventError) {
    console.warn("[materials] client_events insert failed:", eventError.message)
  }

  return true
}

export async function prepareMaterialDownload(
  request: MaterialDownloadRequest
): Promise<MaterialDownloadResult | null> {
  const magnet = await getLeadMagnetBySlugFromStore(request.slug)
  if (!magnet || !magnet.published) return null

  const email = normalizeEmail(request.email)
  const leadId = request.leadId ?? await findLatestLeadIdByEmail(email)
  const { url, signed } = await resolveDestinationUrl(magnet)
  await stitchIdentity({
    anonymousId: request.anonymousId,
    userId: request.userId,
    leadId,
    email,
  })
  const stored = await recordDownload({
    magnet,
    gate: magnet.gate,
    destinationUrl: url,
    userId: request.userId ?? null,
    leadId,
    anonymousId: normalizeShortText(request.anonymousId, 100),
    source: normalizeShortText(request.source),
    postSlug: normalizeShortText(request.postSlug, 120),
  })

  return {
    magnet,
    destinationUrl: url,
    signed,
    stored,
  }
}

"server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  EventCategory,
  EventStatus,
  PublicEvent,
  PublicEventInsert,
  PublicEventUpdate,
} from "@/lib/types/public-events"

interface PublicEventRow {
  id: string
  title: string
  description: string | null
  category: string
  tag: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
  cta_label: string
  cta_href: string | null
  image_path: string | null
  highlight: boolean
  status_override: string | null
  created_at: string
  updated_at: string
}

function computeStatus(row: PublicEventRow): EventStatus {
  if (row.status_override) return row.status_override as EventStatus
  const now = new Date()
  if (now < new Date(row.starts_at)) return "예정"
  if (!row.ends_at || now <= new Date(row.ends_at)) return "진행 중"
  return "마감"
}

function getImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null
  const supabase = createSupabaseAdminClient()
  const { data } = supabase.storage.from("event-images").getPublicUrl(imagePath)
  return data.publicUrl
}

function rowToEvent(row: PublicEventRow): PublicEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as EventCategory,
    tag: row.tag,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    imagePath: row.image_path,
    imageUrl: getImageUrl(row.image_path),
    highlight: row.highlight,
    statusOverride: row.status_override as EventStatus | null,
    status: computeStatus(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listPublicEvents(): Promise<PublicEvent[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("public_events")
    .select("*")
    .order("starts_at", { ascending: false })
  if (error) throw error
  return (data as PublicEventRow[]).map(rowToEvent)
}

export async function getAllEventsForAdmin(): Promise<PublicEvent[]> {
  return listPublicEvents()
}

export async function createPublicEvent(input: PublicEventInsert): Promise<PublicEvent> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("public_events")
    .insert({
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      tag: input.tag ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      location: input.location ?? null,
      cta_label: input.ctaLabel ?? "자세히 보기",
      cta_href: input.ctaHref ?? null,
      image_path: input.imagePath ?? null,
      highlight: input.highlight ?? false,
      status_override: input.statusOverride ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return rowToEvent(data as PublicEventRow)
}

export async function updatePublicEvent(
  id: string,
  patch: PublicEventUpdate
): Promise<PublicEvent | null> {
  const supabase = createSupabaseAdminClient()
  const dbPatch: Record<string, unknown> = {}
  if (patch.title !== undefined) dbPatch.title = patch.title
  if (patch.description !== undefined) dbPatch.description = patch.description
  if (patch.category !== undefined) dbPatch.category = patch.category
  if (patch.tag !== undefined) dbPatch.tag = patch.tag
  if (patch.startsAt !== undefined) dbPatch.starts_at = patch.startsAt
  if (patch.endsAt !== undefined) dbPatch.ends_at = patch.endsAt
  if (patch.location !== undefined) dbPatch.location = patch.location
  if (patch.ctaLabel !== undefined) dbPatch.cta_label = patch.ctaLabel
  if (patch.ctaHref !== undefined) dbPatch.cta_href = patch.ctaHref
  if (patch.imagePath !== undefined) dbPatch.image_path = patch.imagePath
  if (patch.highlight !== undefined) dbPatch.highlight = patch.highlight
  if (patch.statusOverride !== undefined) dbPatch.status_override = patch.statusOverride

  if (Object.keys(dbPatch).length === 0) return null

  const { data, error } = await supabase
    .from("public_events")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single()
  if (error) {
    if (error.code === "PGRST116") return null
    throw error
  }
  return rowToEvent(data as PublicEventRow)
}

export async function deletePublicEvent(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from("public_events").delete().eq("id", id)
  if (error) throw error
}

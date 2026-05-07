"server-only"

import { unstable_cache } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { sanitizePublicUrl } from "@/lib/safe-public-url"
import type {
  EventCategory,
  EventPublicationStatus,
  EventStatus,
  PublicEvent,
  PublicEventInsert,
  PublicEventUpdate,
} from "@/lib/types/public-events"

export const PUBLIC_EVENTS_REVALIDATE_SECONDS = 3600
export const PUBLIC_EVENTS_CACHE_TAG = "public-events"

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
  publication_status: string | null
  slug: string | null
  content_markdown: string | null
  created_at: string
  updated_at: string
}

interface PublicEventSlugRow {
  slug: string | null
}

const PUBLICATION_STATUSES = new Set<EventPublicationStatus>(["draft", "published"])

function logPublicEventReadFailure(context: string, error: unknown): void {
  console.error(`[public-events] ${context}`, error)
}

function computeStatus(row: PublicEventRow): EventStatus {
  if (row.status_override) return row.status_override as EventStatus
  const now = new Date()
  if (now < new Date(row.starts_at)) return "예정"
  if (!row.ends_at || now <= new Date(row.ends_at)) return "진행 중"
  return "마감"
}

function normalizePublicationStatus(value: string | null | undefined): EventPublicationStatus {
  return PUBLICATION_STATUSES.has(value as EventPublicationStatus)
    ? (value as EventPublicationStatus)
    : "published"
}

function normalizeNullablePublicHref(value: string | null | undefined): string | null {
  const safe = sanitizePublicUrl(value, "")
  return safe || null
}

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505"
}

function isMissingPublicationStatusColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "42703" && /publication_status/.test(error.message ?? "")
}

function getImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null
  const supabase = createSupabaseAdminClient()
  const { data } = supabase.storage.from("event-images").getPublicUrl(imagePath)
  return data.publicUrl
}

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-가-힣]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

function generateSlug(title: string): string {
  const base = normalizeSlug(title)
  const suffix = Math.random().toString(36).slice(2, 7)
  return base ? `${base}-${suffix}` : suffix
}

function resolveSlug(provided: string | null | undefined, title: string): string {
  if (provided) {
    const cleaned = normalizeSlug(provided)
    if (cleaned) return cleaned
  }
  return generateSlug(title)
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
    publicationStatus: normalizePublicationStatus(row.publication_status),
    slug: row.slug,
    contentMarkdown: row.content_markdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listPublicEvents(): Promise<PublicEvent[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("public_events")
    .select("*")
    .eq("publication_status", "published")
    .order("starts_at", { ascending: false })
  if (isMissingPublicationStatusColumn(error)) {
    const legacy = await supabase
      .from("public_events")
      .select("*")
      .order("starts_at", { ascending: false })
    if (legacy.error) throw legacy.error
    return (legacy.data as PublicEventRow[]).map(rowToEvent)
  }
  if (error) throw error
  return (data as PublicEventRow[]).map(rowToEvent)
}

export async function listPublicEventSlugs(): Promise<string[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("public_events")
    .select("slug")
    .eq("publication_status", "published")
    .not("slug", "is", null)
    .order("starts_at", { ascending: false })
  if (isMissingPublicationStatusColumn(error)) {
    const legacy = await supabase
      .from("public_events")
      .select("slug")
      .not("slug", "is", null)
      .order("starts_at", { ascending: false })
    if (legacy.error) throw legacy.error
    return (legacy.data as PublicEventSlugRow[])
      .map((row) => row.slug)
      .filter((slug): slug is string => Boolean(slug))
  }
  if (error) throw error
  return (data as PublicEventSlugRow[])
    .map((row) => row.slug)
    .filter((slug): slug is string => Boolean(slug))
}

export const listCachedPublicEvents = unstable_cache(
  async (): Promise<PublicEvent[]> => {
    try {
      return await listPublicEvents()
    } catch (error) {
      logPublicEventReadFailure("Failed to list public events", error)
      return []
    }
  },
  ["public-events"],
  {
    revalidate: PUBLIC_EVENTS_REVALIDATE_SECONDS,
    tags: [PUBLIC_EVENTS_CACHE_TAG],
  }
)

export const listCachedPublicEventSlugs = unstable_cache(
  async (): Promise<string[]> => {
    try {
      return await listPublicEventSlugs()
    } catch (error) {
      logPublicEventReadFailure("Failed to list public event slugs", error)
      return []
    }
  },
  ["public-event-slugs"],
  {
    revalidate: PUBLIC_EVENTS_REVALIDATE_SECONDS,
    tags: [PUBLIC_EVENTS_CACHE_TAG],
  }
)

export async function getAllEventsForAdmin(): Promise<PublicEvent[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("public_events")
    .select("*")
    .order("starts_at", { ascending: false })
  if (error) throw error
  return (data as PublicEventRow[]).map(rowToEvent)
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
      cta_href: normalizeNullablePublicHref(input.ctaHref),
      image_path: input.imagePath ?? null,
      highlight: input.highlight ?? false,
      status_override: input.statusOverride ?? null,
      publication_status: input.publicationStatus ?? "draft",
      slug: resolveSlug(input.slug, input.title),
      content_markdown: input.contentMarkdown ?? null,
    })
    .select()
    .single()
  if (error && isUniqueViolation(error)) throw new Error("이미 사용 중인 행사 URL 슬러그입니다.")
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
  if (patch.ctaHref !== undefined) dbPatch.cta_href = normalizeNullablePublicHref(patch.ctaHref)
  if (patch.imagePath !== undefined) dbPatch.image_path = patch.imagePath
  if (patch.highlight !== undefined) dbPatch.highlight = patch.highlight
  if (patch.statusOverride !== undefined) dbPatch.status_override = patch.statusOverride
  if (patch.publicationStatus !== undefined) dbPatch.publication_status = patch.publicationStatus
  if (patch.contentMarkdown !== undefined) dbPatch.content_markdown = patch.contentMarkdown
  if (patch.slug !== undefined) {
    dbPatch.slug = resolveSlug(patch.slug, patch.title ?? "event")
  }

  if (Object.keys(dbPatch).length === 0) return null

  // Backfill: if title changed but slug not provided, ensure existing row has a slug
  if (patch.title !== undefined && patch.slug === undefined) {
    const { data: current } = await supabase
      .from("public_events")
      .select("slug")
      .eq("id", id)
      .single()
    if (current && !current.slug) {
      dbPatch.slug = generateSlug(patch.title)
    }
  }

  const { data, error } = await supabase
    .from("public_events")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single()
  if (error) {
    if (error.code === "PGRST116") return null
    if (isUniqueViolation(error)) throw new Error("이미 사용 중인 행사 URL 슬러그입니다.")
    throw error
  }
  return rowToEvent(data as PublicEventRow)
}

export async function getPublicEventBySlug(slug: string): Promise<PublicEvent | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("public_events")
    .select("*")
    .eq("slug", slug)
    .eq("publication_status", "published")
    .single()
  if (isMissingPublicationStatusColumn(error)) {
    const legacy = await supabase
      .from("public_events")
      .select("*")
      .eq("slug", slug)
      .single()
    if (legacy.error) {
      if (legacy.error.code === "PGRST116") return null
      throw legacy.error
    }
    return rowToEvent(legacy.data as PublicEventRow)
  }
  if (error) {
    if (error.code === "PGRST116") return null
    throw error
  }
  return rowToEvent(data as PublicEventRow)
}

export const getCachedPublicEventBySlug = unstable_cache(
  async (slug: string): Promise<PublicEvent | null> => {
    try {
      return await getPublicEventBySlug(slug)
    } catch (error) {
      logPublicEventReadFailure(`Failed to read public event by slug: ${slug}`, error)
      return null
    }
  },
  ["public-event-by-slug"],
  {
    revalidate: PUBLIC_EVENTS_REVALIDATE_SECONDS,
    tags: [PUBLIC_EVENTS_CACHE_TAG],
  }
)

export async function getPublicEventById(id: string): Promise<PublicEvent | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("public_events")
    .select("*")
    .eq("id", id)
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

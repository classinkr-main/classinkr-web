"server-only"

import { unstable_cache } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { computePublicEventStatus, normalizeSessionDates } from "@/lib/public-event-dates"
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
  session_dates: unknown
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
const PUBLISHED_PUBLICATION_STATUS_VALUES = ["published", "PUBLISHED"]
const PUBLIC_EVENT_QUERY_TIMEOUT_MS = 6_000

function logPublicEventReadFailure(context: string, error: unknown): void {
  console.error(`[public-events] ${context}`, error)
}

function createPublicEventQueryTimeout() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PUBLIC_EVENT_QUERY_TIMEOUT_MS)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  }
}

function isAbortError(error: { code?: string; message?: string } | null | undefined) {
  return /AbortError|aborted|timeout/i.test(error?.message ?? "") || error?.code === "ABORT_ERR"
}

function computeStatus(row: PublicEventRow): EventStatus {
  return computePublicEventStatus(row.starts_at, row.ends_at, row.status_override)
}

function normalizePublicationStatus(value: string | null | undefined): EventPublicationStatus {
  const normalized = typeof value === "string" ? value.toLowerCase() : value
  return PUBLICATION_STATUSES.has(normalized as EventPublicationStatus)
    ? (normalized as EventPublicationStatus)
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
  if (!error) return false
  const message = error.message ?? ""
  return (
    /publication_status/.test(message) &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      /schema cache|column .*does not exist|could not find/i.test(message))
  )
}

// 마이그레이션이 배포보다 늦게 적용돼도 행사 등록·수정이 죽지 않도록, 아직 없는 컬럼은
// 페이로드에서 떨궈내고 한 번 더 시도한다.
const OPTIONAL_WRITE_COLUMNS = ["publication_status", "session_dates"] as const

function findMissingOptionalColumn(
  error: { code?: string; message?: string } | null | undefined
): string | null {
  if (!error) return null
  const message = error.message ?? ""
  const looksMissing =
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /schema cache|column .*does not exist|could not find/i.test(message)
  if (!looksMissing) return null
  return OPTIONAL_WRITE_COLUMNS.find((column) => message.includes(column)) ?? null
}

function omitColumns(payload: Record<string, unknown>, columns: string[]): Record<string, unknown> {
  const next = { ...payload }
  for (const column of columns) delete next[column]
  return next
}

interface WriteResult {
  data: unknown
  error: { code?: string; message?: string } | null
}

/**
 * 아직 없는 선택 컬럼을 하나씩 떨궈가며 최대 OPTIONAL_WRITE_COLUMNS 수만큼 재시도한다.
 * 이미 떨군 컬럼이 또 걸리면 무한 루프 대신 그대로 반환해 상위에서 에러를 던지게 한다.
 */
async function writeWithOptionalColumnFallback(
  payload: Record<string, unknown>,
  run: (payload: Record<string, unknown>) => PromiseLike<WriteResult>
): Promise<WriteResult> {
  let result = await run(payload)
  const dropped: string[] = []

  for (;;) {
    const missing = findMissingOptionalColumn(result.error)
    if (!missing || dropped.includes(missing)) return result
    dropped.push(missing)
    result = await run(omitColumns(payload, dropped))
  }
}

function getPublicEventInsertPayload(input: PublicEventInsert): Record<string, unknown> {
  return {
    title: input.title,
    description: input.description ?? null,
    category: input.category,
    tag: input.tag ?? null,
    starts_at: input.startsAt,
    ends_at: input.endsAt ?? null,
    session_dates: normalizeSessionDates(input.sessionDates),
    location: input.location ?? null,
    cta_label: input.ctaLabel ?? "자세히 보기",
    cta_href: normalizeNullablePublicHref(input.ctaHref),
    image_path: input.imagePath ?? null,
    highlight: input.highlight ?? false,
    status_override: input.statusOverride ?? null,
    publication_status: input.publicationStatus ?? "draft",
    slug: resolveSlug(input.slug, input.title),
    content_markdown: input.contentMarkdown ?? null,
  }
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
    sessionDates: normalizeSessionDates(row.session_dates),
    location: row.location,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    imagePath: row.image_path,
    imageUrl: getImageUrl(row.image_path),
    highlight: row.highlight,
    statusOverride: row.status_override as EventStatus | null,
    status: computeStatus(row),
    publicationStatus: normalizePublicationStatus(row.publication_status),
    slug: row.slug ?? null,
    contentMarkdown: row.content_markdown ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listPublicEvents(): Promise<PublicEvent[]> {
  const supabase = createSupabaseAdminClient()
  const timeout = createPublicEventQueryTimeout()
  try {
    const { data, error } = await supabase
      .from("public_events")
      .select("*")
      .in("publication_status", PUBLISHED_PUBLICATION_STATUS_VALUES)
      .order("starts_at", { ascending: false })
      .abortSignal(timeout.signal)
    if (error && isAbortError(error)) {
      console.warn(
        `[public-events] 공개 행사 목록 조회 timeout after ${PUBLIC_EVENT_QUERY_TIMEOUT_MS}ms`
      )
      return []
    }
    if (isMissingPublicationStatusColumn(error)) {
      const legacy = await supabase
        .from("public_events")
        .select("*")
        .order("starts_at", { ascending: false })
        .abortSignal(timeout.signal)
      if (legacy.error && isAbortError(legacy.error)) {
        console.warn(
          `[public-events] legacy 행사 목록 조회 timeout after ${PUBLIC_EVENT_QUERY_TIMEOUT_MS}ms`
        )
        return []
      }
      if (legacy.error) throw legacy.error
      return (legacy.data as PublicEventRow[]).map(rowToEvent)
    }
    if (error) throw error
    return (data as PublicEventRow[]).map(rowToEvent)
  } finally {
    timeout.clear()
  }
}

export async function listPublicEventSlugs(): Promise<string[]> {
  const supabase = createSupabaseAdminClient()
  const timeout = createPublicEventQueryTimeout()
  try {
    const { data, error } = await supabase
      .from("public_events")
      .select("slug")
      .in("publication_status", PUBLISHED_PUBLICATION_STATUS_VALUES)
      .not("slug", "is", null)
      .order("starts_at", { ascending: false })
      .abortSignal(timeout.signal)
    if (error && isAbortError(error)) {
      console.warn(
        `[public-events] 공개 행사 slug 조회 timeout after ${PUBLIC_EVENT_QUERY_TIMEOUT_MS}ms`
      )
      return []
    }
    if (isMissingPublicationStatusColumn(error)) {
      const legacy = await supabase
        .from("public_events")
        .select("slug")
        .not("slug", "is", null)
        .order("starts_at", { ascending: false })
        .abortSignal(timeout.signal)
      if (legacy.error && isAbortError(legacy.error)) {
        console.warn(
          `[public-events] legacy 행사 slug 조회 timeout after ${PUBLIC_EVENT_QUERY_TIMEOUT_MS}ms`
        )
        return []
      }
      if (legacy.error) throw legacy.error
      return (legacy.data as PublicEventSlugRow[])
        .map((row) => row.slug)
        .filter((slug): slug is string => Boolean(slug))
    }
    if (error) throw error
    return (data as PublicEventSlugRow[])
      .map((row) => row.slug)
      .filter((slug): slug is string => Boolean(slug))
  } finally {
    timeout.clear()
  }
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

// 목록 조회 시 필요한 컬럼만 (content_markdown 본문 제외 — 리스트는 본문을 렌더하지 않음)
const ADMIN_LIST_BASE_COLUMNS = [
  "id", "title", "description", "category", "tag",
  "starts_at", "ends_at", "location", "cta_label", "cta_href",
  "image_path", "highlight", "status_override", "publication_status",
  "slug", "created_at", "updated_at",
]
const ADMIN_LIST_COLUMNS = [...ADMIN_LIST_BASE_COLUMNS, "session_dates"].join(", ")

export async function getAllEventsForAdmin(): Promise<PublicEvent[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("public_events")
    .select(ADMIN_LIST_COLUMNS)
    .order("starts_at", { ascending: false })

  // session_dates 마이그레이션 적용 전에도 목록이 뜨도록 한 번 물러선다
  if (findMissingOptionalColumn(error) === "session_dates") {
    const legacy = await supabase
      .from("public_events")
      .select(ADMIN_LIST_BASE_COLUMNS.join(", "))
      .order("starts_at", { ascending: false })
    if (legacy.error) throw legacy.error
    return (legacy.data as unknown as PublicEventRow[]).map(rowToEvent)
  }

  if (error) throw error
  return (data as unknown as PublicEventRow[]).map(rowToEvent)
}

export async function createPublicEvent(input: PublicEventInsert): Promise<PublicEvent> {
  const supabase = createSupabaseAdminClient()
  const payload = getPublicEventInsertPayload(input)
  const { data, error } = await writeWithOptionalColumnFallback(payload, (body) =>
    supabase.from("public_events").insert(body).select().single()
  )

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
  if (patch.sessionDates !== undefined) dbPatch.session_dates = normalizeSessionDates(patch.sessionDates)
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

  // 아직 없는 컬럼만 남은 패치라면 실제로 바꿀 값이 없으므로 현재 행을 그대로 돌려준다
  let patchBecameEmpty = false
  const { data, error } = await writeWithOptionalColumnFallback(dbPatch, (body) => {
    if (Object.keys(body).length === 0) {
      patchBecameEmpty = true
      return Promise.resolve({ data: null, error: null })
    }
    return supabase.from("public_events").update(body).eq("id", id).select().single()
  })

  if (patchBecameEmpty) return getPublicEventById(id)

  if (error) {
    if (error.code === "PGRST116") return null
    if (isUniqueViolation(error)) throw new Error("이미 사용 중인 행사 URL 슬러그입니다.")
    throw error
  }
  return rowToEvent(data as PublicEventRow)
}

export async function getPublicEventBySlug(slug: string): Promise<PublicEvent | null> {
  const supabase = createSupabaseAdminClient()
  const timeout = createPublicEventQueryTimeout()
  try {
    const { data, error } = await supabase
      .from("public_events")
      .select("*")
      .eq("slug", slug)
      .in("publication_status", PUBLISHED_PUBLICATION_STATUS_VALUES)
      .abortSignal(timeout.signal)
      .single()
    if (error && isAbortError(error)) {
      console.warn(
        `[public-events] 공개 행사 상세 조회 timeout after ${PUBLIC_EVENT_QUERY_TIMEOUT_MS}ms`
      )
      return null
    }
    if (isMissingPublicationStatusColumn(error)) {
      const legacy = await supabase
        .from("public_events")
        .select("*")
        .eq("slug", slug)
        .abortSignal(timeout.signal)
        .single()
      if (legacy.error && isAbortError(legacy.error)) {
        console.warn(
          `[public-events] legacy 행사 상세 조회 timeout after ${PUBLIC_EVENT_QUERY_TIMEOUT_MS}ms`
        )
        return null
      }
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
  } finally {
    timeout.clear()
  }
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

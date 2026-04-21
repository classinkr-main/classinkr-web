import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

const MAX_QUERY_LENGTH = 300
const MAX_COMMENT_LENGTH = 1000
const MAX_TRACKING_ID_LENGTH = 128
const MAX_HEADER_LENGTH = 500
const MAX_RESULT_COUNT = 10000
const MAX_PATH_LENGTH = 240
const MAX_SLUG_LENGTH = 120

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TRACKING_ID_RE = /^[A-Za-z0-9._:-]+$/

type AnalyticsFallback = "missing_supabase_env" | "storage_unavailable"

interface DocsRequestMeta {
  userAgent?: string | null
  referrer?: string | null
}

interface AnalyticsResult {
  ok: true
  stored: boolean
  piiRedacted: boolean
  fallback?: AnalyticsFallback
  warning?: string
}

interface NormalizedSearchEvent {
  query: string
  normalizedQuery: string
  resultCount: number | null
  clickedArticleId: string | null
  clickedPath: string | null
  visitorId: string | null
  sessionId: string | null
  piiRedacted: boolean
}

interface NormalizedFeedback {
  articleId: string | null
  articlePath: string | null
  articleSlug: string | null
  category: string | null
  helpful: boolean
  reason: string | null
  visitorId: string | null
  sessionId: string | null
  piiRedacted: boolean
}

export class DocsAnalyticsInputError extends Error {
  status = 400
}

function hasSupabaseServerEnv() {
  return Boolean(
    hasSupabaseBrowserEnv() &&
      (process.env.SUPABASE_SECRET_KEY?.trim() ||
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
}

function getObject(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DocsAnalyticsInputError("Request body must be a JSON object.")
  }

  return raw as Record<string, unknown>
}

function compactText(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeRequiredText(
  value: unknown,
  field: string,
  maxLength: number
) {
  if (typeof value !== "string") {
    throw new DocsAnalyticsInputError(`${field} is required.`)
  }

  const normalized = compactText(value)
  if (!normalized) {
    throw new DocsAnalyticsInputError(`${field} is required.`)
  }

  if (normalized.length > maxLength) {
    throw new DocsAnalyticsInputError(
      `${field} must be ${maxLength} characters or fewer.`
    )
  }

  return normalized
}

function normalizeOptionalText(
  value: unknown,
  field: string,
  maxLength: number
) {
  if (value == null) return null
  if (typeof value !== "string") {
    throw new DocsAnalyticsInputError(`${field} must be a string.`)
  }

  const normalized = compactText(value)
  if (!normalized) return null

  if (normalized.length > maxLength) {
    throw new DocsAnalyticsInputError(
      `${field} must be ${maxLength} characters or fewer.`
    )
  }

  return normalized
}

function normalizeHeader(value: string | null | undefined) {
  if (!value) return null
  const normalized = compactText(value)
  return normalized ? normalized.slice(0, MAX_HEADER_LENGTH) : null
}

function normalizeOptionalUuid(value: unknown, field: string) {
  if (value == null) return null
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
    throw new DocsAnalyticsInputError(`${field} must be a valid UUID.`)
  }

  return value.trim()
}

function normalizeTrackingId(value: unknown, field: string) {
  if (value == null) return null
  if (typeof value !== "string") {
    throw new DocsAnalyticsInputError(`${field} must be a string.`)
  }

  const normalized = compactText(value)
  if (!normalized) return null

  if (
    normalized.length > MAX_TRACKING_ID_LENGTH ||
    !TRACKING_ID_RE.test(normalized)
  ) {
    throw new DocsAnalyticsInputError(
      `${field} must be an opaque tracking id.`
    )
  }

  return normalized
}

function normalizePath(value: unknown, field: string) {
  const normalized = normalizeOptionalText(value, field, MAX_PATH_LENGTH)
  if (!normalized) return null

  if (!normalized.startsWith("/") || normalized.includes("://")) {
    throw new DocsAnalyticsInputError(`${field} must be an internal path.`)
  }

  return normalized
}

function normalizeSlug(value: unknown, field: string) {
  const normalized = normalizeOptionalText(value, field, MAX_SLUG_LENGTH)
  if (!normalized) return null

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new DocsAnalyticsInputError(`${field} must be a slug.`)
  }

  return normalized
}

function normalizeResultCount(value: unknown) {
  if (value == null) return null
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_RESULT_COUNT
  ) {
    throw new DocsAnalyticsInputError(
      `resultCount must be an integer from 0 to ${MAX_RESULT_COUNT}.`
    )
  }

  return value
}

function redactBasicPii(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{6}[-.\s]?[1-4]\d{6}\b/g, "[resident_id]")
    .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{5}\b/g, "[business_number]")
    .replace(/\b(?:\+?82[-.\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/g, "[phone]")
    .replace(/\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{12,19}\b/g, "[number]")
}

function normalizeSearchEvent(raw: unknown): NormalizedSearchEvent {
  const body = getObject(raw)
  const query = normalizeRequiredText(body.query, "query", MAX_QUERY_LENGTH)
  const redactedQuery = redactBasicPii(query)
  const normalizedQuery = redactedQuery.toLowerCase()

  return {
    query: redactedQuery,
    normalizedQuery,
    resultCount: normalizeResultCount(body.resultCount),
    clickedArticleId: normalizeOptionalUuid(
      body.clickedArticleId,
      "clickedArticleId"
    ),
    clickedPath: normalizePath(body.clickedPath ?? body.clickedArticlePath, "clickedPath"),
    visitorId: normalizeTrackingId(body.visitorId, "visitorId"),
    sessionId: normalizeTrackingId(body.sessionId, "sessionId"),
    piiRedacted: redactedQuery !== query,
  }
}

function normalizeFeedback(raw: unknown): NormalizedFeedback {
  const body = getObject(raw)
  const articleId = normalizeOptionalUuid(body.articleId, "articleId")

  const articlePath = normalizePath(body.articlePath, "articlePath")
  const articleSlug = normalizeSlug(body.articleSlug ?? body.slug, "articleSlug")
  const category = normalizeSlug(body.category, "category")

  if (!articleId && !articlePath && !articleSlug) {
    throw new DocsAnalyticsInputError("articleId, articlePath, or articleSlug is required.")
  }

  let helpful: boolean
  if (typeof body.helpful === "boolean") {
    helpful = body.helpful
  } else if (body.rating === "helpful") {
    helpful = true
  } else if (body.rating === "not_helpful") {
    helpful = false
  } else {
    throw new DocsAnalyticsInputError("helpful must be a boolean or rating must be helpful/not_helpful.")
  }

  const rawReason = body.comment ?? body.reason
  const reason = normalizeOptionalText(rawReason, "comment", MAX_COMMENT_LENGTH)
  const redactedReason = reason ? redactBasicPii(reason) : null

  return {
    articleId,
    articlePath,
    articleSlug,
    category,
    helpful,
    reason: redactedReason,
    visitorId: normalizeTrackingId(body.visitorId, "visitorId"),
    sessionId: normalizeTrackingId(body.sessionId, "sessionId"),
    piiRedacted: Boolean(reason && redactedReason !== reason),
  }
}

async function resolveArticleId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    articleId?: string | null
    articlePath?: string | null
    articleSlug?: string | null
    category?: string | null
  }
) {
  if (input.articleId) return input.articleId

  if (input.articlePath) {
    const { data, error } = await supabase
      .from("docs_articles")
      .select("id")
      .eq("canonical_path", input.articlePath)
      .maybeSingle()

    if (error) throw error
    if (data?.id) return data.id as string
  }

  if (input.articleSlug) {
    let query = supabase.from("docs_articles").select("id").eq("slug", input.articleSlug)
    if (input.category) {
      query = query.eq("category_id", input.category)
    }

    const { data, error } = await query.maybeSingle()
    if (error) throw error
    if (data?.id) return data.id as string
  }

  return null
}

function missingEnvResult(piiRedacted: boolean): AnalyticsResult {
  return {
    ok: true,
    stored: false,
    piiRedacted,
    fallback: "missing_supabase_env",
    warning: "Supabase env is missing; analytics event was accepted but not stored.",
  }
}

function storageUnavailableResult(piiRedacted: boolean): AnalyticsResult {
  return {
    ok: true,
    stored: false,
    piiRedacted,
    fallback: "storage_unavailable",
    warning: "Analytics event was accepted but not stored.",
  }
}

export async function saveDocsSearchEvent(raw: unknown): Promise<AnalyticsResult> {
  const event = normalizeSearchEvent(raw)

  if (!hasSupabaseServerEnv()) {
    return missingEnvResult(event.piiRedacted)
  }

  try {
    const supabase = createSupabaseAdminClient()
    const clickedArticleId = await resolveArticleId(supabase, {
      articleId: event.clickedArticleId,
      articlePath: event.clickedPath,
    })

    const { error } = await supabase.from("docs_search_events").insert({
      query: event.query,
      normalized_query: event.normalizedQuery,
      result_count: event.resultCount,
      clicked_article_id: clickedArticleId,
      visitor_id: event.visitorId,
      session_id: event.sessionId,
      source: "docs",
    })

    if (error) throw error
  } catch (error) {
    console.warn(
      "[docs-analytics] failed to store docs search event:",
      error instanceof Error ? error.message : error
    )
    return storageUnavailableResult(event.piiRedacted)
  }

  return { ok: true, stored: true, piiRedacted: event.piiRedacted }
}

export async function saveDocsFeedback(
  raw: unknown,
  meta: DocsRequestMeta = {}
): Promise<AnalyticsResult> {
  const feedback = normalizeFeedback(raw)

  if (!hasSupabaseServerEnv()) {
    return missingEnvResult(feedback.piiRedacted)
  }

  try {
    const supabase = createSupabaseAdminClient()
    const articleId = await resolveArticleId(supabase, feedback)
    if (!articleId) {
      throw new Error("Unable to resolve docs article for feedback.")
    }

    const { error } = await supabase.from("docs_feedback").insert({
      article_id: articleId,
      helpful: feedback.helpful,
      reason: feedback.reason,
      visitor_id: feedback.visitorId,
      session_id: feedback.sessionId,
      user_agent: normalizeHeader(meta.userAgent),
      referrer: normalizeHeader(meta.referrer),
    })

    if (error) throw error
  } catch (error) {
    console.warn(
      "[docs-analytics] failed to store docs feedback:",
      error instanceof Error ? error.message : error
    )
    return storageUnavailableResult(feedback.piiRedacted)
  }

  return { ok: true, stored: true, piiRedacted: feedback.piiRedacted }
}

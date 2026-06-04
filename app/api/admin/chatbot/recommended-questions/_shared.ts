import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const RECOMMENDED_QUESTION_STATUSES = ["draft", "published", "archived"] as const
export const RECOMMENDED_QUESTION_PLACEMENTS = ["starter"] as const

export type RecommendedQuestionStatus = (typeof RECOMMENDED_QUESTION_STATUSES)[number]
export type RecommendedQuestionPlacement = (typeof RECOMMENDED_QUESTION_PLACEMENTS)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface RecommendedQuestionRow {
  id: string
  label: string
  prompt: string
  placement: string
  status: string
  order_index: number
  category: string | null
  mapped_article_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export function hasSupabaseServerEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
      (process.env.SUPABASE_SECRET_KEY?.trim() ||
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
}

export function createRecommendedQuestionsClient() {
  return createSupabaseAdminClient()
}

export function rowToRecommendedQuestion(row: RecommendedQuestionRow) {
  return {
    id: row.id,
    label: row.label,
    prompt: row.prompt,
    placement: row.placement as RecommendedQuestionPlacement,
    status: row.status as RecommendedQuestionStatus,
    orderIndex: row.order_index,
    category: row.category,
    mappedArticleId: row.mapped_article_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function normalizeString(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function normalizeOrderIndex(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(9999, Math.floor(value)))
}

export function normalizeJsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function normalizeUuid(value: unknown) {
  const candidate = normalizeString(value)
  return candidate && UUID_RE.test(candidate) ? candidate : undefined
}

export function isRecommendedQuestionStatus(value: unknown): value is RecommendedQuestionStatus {
  return typeof value === "string" && RECOMMENDED_QUESTION_STATUSES.includes(value as RecommendedQuestionStatus)
}

export function isRecommendedQuestionPlacement(value: unknown): value is RecommendedQuestionPlacement {
  return typeof value === "string" && RECOMMENDED_QUESTION_PLACEMENTS.includes(value as RecommendedQuestionPlacement)
}

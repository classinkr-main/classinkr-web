import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const INTERNAL_CS_STATUSES = ["queue", "active", "waiting_review", "resolved", "archived"] as const
export const INTERNAL_CS_PRIORITIES = ["low", "normal", "high", "urgent"] as const
export const INTERNAL_CS_MESSAGE_ROLES = ["user", "assistant", "internal_note", "system"] as const
export const INTERNAL_CS_REVIEW_STATES = [
  "not_required",
  "pending",
  "approved",
  "changes_requested",
  "rejected",
] as const
export const INTERNAL_CS_REGRESSION_OUTCOMES = [
  "not_evaluated",
  "pass",
  "needs_fix",
  "promoted",
  "excluded",
] as const

export type InternalCsStatus = (typeof INTERNAL_CS_STATUSES)[number]
export type InternalCsPriority = (typeof INTERNAL_CS_PRIORITIES)[number]
export type InternalCsMessageRole = (typeof INTERNAL_CS_MESSAGE_ROLES)[number]
export type InternalCsReviewState = (typeof INTERNAL_CS_REVIEW_STATES)[number]
export type InternalCsRegressionOutcome = (typeof INTERNAL_CS_REGRESSION_OUTCOMES)[number]

export interface InternalCsConversationRow {
  id: string
  title: string
  status: InternalCsStatus
  priority: InternalCsPriority
  assignee_user_id: string | null
  assignee_name: string | null
  tags: string[]
  customer_context: Record<string, unknown>
  created_by: string
  updated_by: string | null
  resolved_at: string | null
  resolved_by: string | null
  archived_at: string | null
  archived_by: string | null
  archive_reason: string | null
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface InternalCsMessageRow {
  id: string
  conversation_id: string
  role: InternalCsMessageRole
  content: string
  visibility: "internal"
  model_provider: string | null
  model_name: string | null
  model_mode: "fast" | "deep" | "backup" | null
  source_refs: unknown[]
  metadata: Record<string, unknown>
  review_state: InternalCsReviewState
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  corrected_content: string | null
  feedback_labels: string[]
  regression_candidate: boolean
  regression_outcome: InternalCsRegressionOutcome
  created_by: string
  created_at: string
  updated_at: string
}

export interface CreateInternalCsConversationInput {
  title?: string | null
  priority?: InternalCsPriority
  assigneeUserId?: string | null
  assigneeName?: string | null
  tags?: string[]
  customerContext?: Record<string, unknown>
  actor: string
}

export interface CreateInternalCsMessageInput {
  conversationId: string
  role: InternalCsMessageRole
  content: string
  modelProvider?: string | null
  modelName?: string | null
  modelMode?: "fast" | "deep" | "backup" | null
  sourceRefs?: unknown[]
  metadata?: Record<string, unknown>
  actor: string
}

export interface ReviewInternalCsMessageInput {
  conversationId: string
  messageId: string
  decision: Extract<InternalCsReviewState, "approved" | "changes_requested" | "rejected">
  reviewNote?: string | null
  correctedContent?: string | null
  feedbackLabels?: string[]
  regressionCandidate?: boolean
  regressionOutcome?: InternalCsRegressionOutcome
  conversationAction?: "keep_open" | "resolve" | "archive"
  actor: string
  now?: Date
}

const NOT_READY_MESSAGE = "Internal CS chat DB migration is not applied."

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function cleanStringList(values: string[] | undefined, limit = 20) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, limit)
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const number = Number(value ?? fallback)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(Math.floor(number), max))
}

function safeSearch(value: string | null | undefined) {
  return value?.trim().replace(/[%,()\\]/g, " ").replace(/\s+/g, " ") ?? ""
}

function isMissingTableError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const text = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    text.includes("42p01") ||
    ((text.includes("internal_cs_conversations") || text.includes("internal_cs_messages")) &&
      (text.includes("does not exist") || text.includes("could not find") || text.includes("schema cache")))
  )
}

function databaseError(scope: string, error: { code?: string; message: string }) {
  if (isMissingTableError(error)) return new Error(NOT_READY_MESSAGE)
  return new Error(`[internal-cs-chat] ${scope}: ${error.message}`)
}

export function isInternalCsChatNotReadyError(error: unknown): error is Error {
  return error instanceof Error && error.message === NOT_READY_MESSAGE
}

export function buildInternalCsConversationInsert(input: CreateInternalCsConversationInput) {
  return {
    title: trimOrNull(input.title) ?? "새 내부 CS 상담",
    status: "queue" as const,
    priority: input.priority ?? ("normal" as const),
    assignee_user_id: trimOrNull(input.assigneeUserId),
    assignee_name: trimOrNull(input.assigneeName),
    tags: cleanStringList(input.tags),
    customer_context: input.customerContext ?? {},
    created_by: input.actor,
    updated_by: input.actor,
  }
}

export function buildInternalCsMessageInsert(input: CreateInternalCsMessageInput) {
  const isAssistant = input.role === "assistant"
  return {
    conversation_id: input.conversationId,
    role: input.role,
    content: input.content.trim(),
    visibility: "internal" as const,
    model_provider: isAssistant ? trimOrNull(input.modelProvider) : null,
    model_name: isAssistant ? trimOrNull(input.modelName) : null,
    model_mode: isAssistant ? input.modelMode ?? null : null,
    source_refs: input.sourceRefs ?? [],
    metadata: input.metadata ?? {},
    review_state: isAssistant ? ("pending" as const) : ("not_required" as const),
    feedback_labels: [],
    regression_candidate: false,
    regression_outcome: "not_evaluated" as const,
    created_by: input.actor,
  }
}

export function buildInternalCsReviewPatch(input: ReviewInternalCsMessageInput) {
  const reviewedAt = (input.now ?? new Date()).toISOString()
  return {
    review_state: input.decision,
    reviewed_by: input.actor,
    reviewed_at: reviewedAt,
    review_note: trimOrNull(input.reviewNote),
    corrected_content: trimOrNull(input.correctedContent),
    feedback_labels: cleanStringList(input.feedbackLabels),
    regression_candidate: input.regressionCandidate === true,
    regression_outcome: input.regressionOutcome ?? ("not_evaluated" as const),
  }
}

export async function listInternalCsConversations(options: {
  status?: InternalCsStatus | "all"
  assigneeUserId?: string
  q?: string
  limit?: number
  offset?: number
} = {}) {
  const limit = clampInteger(options.limit, 50, 1, 200)
  const offset = clampInteger(options.offset, 0, 0, 100_000)
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from("internal_cs_conversations")
    .select("*", { count: "exact" })
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (options.status && options.status !== "all") query = query.eq("status", options.status)
  if (options.assigneeUserId) query = query.eq("assignee_user_id", options.assigneeUserId)
  const search = safeSearch(options.q)
  if (search) query = query.or(`title.ilike.%${search}%,assignee_name.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) throw databaseError("failed to list conversations", error)
  const rows = (data ?? []) as InternalCsConversationRow[]
  return {
    conversations: rows,
    pagination: {
      limit,
      offset,
      returned: rows.length,
      total: count ?? rows.length,
      hasMore: offset + rows.length < (count ?? rows.length),
    },
  }
}

export async function getInternalCsConversation(id: string) {
  const supabase = createSupabaseAdminClient()
  const [{ data: conversation, error }, { data: messages, error: messagesError }] = await Promise.all([
    supabase.from("internal_cs_conversations").select("*").eq("id", id).maybeSingle(),
    supabase.from("internal_cs_messages").select("*").eq("conversation_id", id).order("created_at"),
  ])
  if (error) throw databaseError("failed to load conversation", error)
  if (messagesError) throw databaseError("failed to load messages", messagesError)
  if (!conversation) return null
  return {
    conversation: conversation as InternalCsConversationRow,
    messages: (messages ?? []) as InternalCsMessageRow[],
  }
}

export async function createInternalCsConversation(input: CreateInternalCsConversationInput) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_conversations")
    .insert(buildInternalCsConversationInsert(input))
    .select("*")
    .single()
  if (error) throw databaseError("failed to create conversation", error)
  return data as InternalCsConversationRow
}

export async function createInternalCsMessage(input: CreateInternalCsMessageInput) {
  const insert = buildInternalCsMessageInsert(input)
  if (!insert.content) throw new Error("Message content is required.")
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("internal_cs_messages").insert(insert).select("*").single()
  if (error) throw databaseError("failed to create message", error)

  const now = (data as InternalCsMessageRow).created_at
  const conversationPatch = {
    last_message_at: now,
    updated_by: input.actor,
    ...(input.role === "assistant" ? { status: "waiting_review" } : {}),
  }
  const { error: updateError } = await supabase
    .from("internal_cs_conversations")
    .update(conversationPatch)
    .eq("id", input.conversationId)
  if (updateError) throw databaseError("message saved but conversation state update failed", updateError)
  return data as InternalCsMessageRow
}

export async function updateInternalCsConversation(
  id: string,
  patch: Partial<Pick<InternalCsConversationRow, "title" | "status" | "priority" | "assignee_user_id" | "assignee_name" | "tags" | "customer_context" | "archive_reason">> &
    Record<string, unknown>
) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_conversations")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle()
  if (error) throw databaseError("failed to update conversation", error)
  return (data as InternalCsConversationRow | null) ?? null
}

export async function reviewInternalCsMessage(input: ReviewInternalCsMessageInput) {
  const supabase = createSupabaseAdminClient()
  const patch = buildInternalCsReviewPatch(input)
  const { data, error } = await supabase
    .from("internal_cs_messages")
    .update(patch)
    .eq("id", input.messageId)
    .eq("conversation_id", input.conversationId)
    .eq("role", "assistant")
    .select("*")
    .maybeSingle()
  if (error) throw databaseError("failed to review message", error)
  if (!data) return null

  const now = patch.reviewed_at
  const action = input.conversationAction ?? "keep_open"
  const conversationPatch = action === "resolve"
    ? { status: "resolved", resolved_at: now, resolved_by: input.actor, updated_by: input.actor }
    : action === "archive"
      ? { status: "archived", archived_at: now, archived_by: input.actor, updated_by: input.actor }
      : { status: "active", updated_by: input.actor }
  const { error: conversationError } = await supabase
    .from("internal_cs_conversations")
    .update(conversationPatch)
    .eq("id", input.conversationId)
  if (conversationError) throw databaseError("message reviewed but conversation state update failed", conversationError)
  return data as InternalCsMessageRow
}

export function cleanInternalCsTags(values: string[] | undefined) {
  return cleanStringList(values)
}

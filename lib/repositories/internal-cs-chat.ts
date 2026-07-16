import "server-only"

import {
  createInternalCsAssetSignedUrls,
  INTERNAL_CS_ASSETS_BUCKET,
  type InternalCsAssetMimeType,
} from "@/lib/storage/internal-cs-assets"
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
export const INTERNAL_CS_ASSET_KINDS = ["screenshot", "photo", "image"] as const
export const INTERNAL_CS_ASSET_SOURCES = ["admin_upload", "webhook", "mcp"] as const
export const INTERNAL_CS_ASSET_STATUSES = ["uploaded", "analyzing", "ready", "failed"] as const
export const INTERNAL_CS_ASSET_REVIEW_STATES = [
  "pending",
  "approved",
  "changes_requested",
  "rejected",
] as const
export const INTERNAL_CS_INTEGRATION_DIRECTIONS = ["inbound", "outbound"] as const
export const INTERNAL_CS_INTEGRATION_TRANSPORTS = ["webhook", "mcp", "admin"] as const
export const INTERNAL_CS_INTEGRATION_STATUSES = [
  "accepted",
  "processing",
  "completed",
  "failed",
] as const

export type InternalCsStatus = (typeof INTERNAL_CS_STATUSES)[number]
export type InternalCsPriority = (typeof INTERNAL_CS_PRIORITIES)[number]
export type InternalCsMessageRole = (typeof INTERNAL_CS_MESSAGE_ROLES)[number]
export type InternalCsReviewState = (typeof INTERNAL_CS_REVIEW_STATES)[number]
export type InternalCsRegressionOutcome = (typeof INTERNAL_CS_REGRESSION_OUTCOMES)[number]
export type InternalCsAssetKind = (typeof INTERNAL_CS_ASSET_KINDS)[number]
export type InternalCsAssetSource = (typeof INTERNAL_CS_ASSET_SOURCES)[number]
export type InternalCsAssetStatus = (typeof INTERNAL_CS_ASSET_STATUSES)[number]
export type InternalCsAssetReviewState = (typeof INTERNAL_CS_ASSET_REVIEW_STATES)[number]
export type InternalCsIntegrationDirection = (typeof INTERNAL_CS_INTEGRATION_DIRECTIONS)[number]
export type InternalCsIntegrationTransport = (typeof INTERNAL_CS_INTEGRATION_TRANSPORTS)[number]
export type InternalCsIntegrationStatus = (typeof INTERNAL_CS_INTEGRATION_STATUSES)[number]

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

export interface InternalCsAssetRow {
  id: string
  conversation_id: string
  message_id: string | null
  kind: InternalCsAssetKind
  source: InternalCsAssetSource
  storage_bucket: typeof INTERNAL_CS_ASSETS_BUCKET
  storage_path: string
  original_file_name: string
  mime_type: InternalCsAssetMimeType
  size_bytes: number
  sha256: string
  status: InternalCsAssetStatus
  analysis_summary: string | null
  analysis_payload: Record<string, unknown>
  model_provider: string | null
  model_name: string | null
  error_message: string | null
  analyzed_at: string | null
  review_state: InternalCsAssetReviewState
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  corrected_analysis: string | null
  external_ref: string | null
  metadata: Record<string, unknown>
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
  signed_url?: string | null
}

export interface InternalCsIntegrationEventRow {
  id: string
  conversation_id: string
  asset_id: string | null
  direction: InternalCsIntegrationDirection
  transport: InternalCsIntegrationTransport
  event_type: string
  source_system: string
  idempotency_key: string | null
  correlation_id: string | null
  status: InternalCsIntegrationStatus
  payload: Record<string, unknown>
  result: Record<string, unknown>
  error_message: string | null
  processed_at: string | null
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

export interface CreateInternalCsAssetInput {
  conversationId: string
  messageId?: string | null
  kind?: InternalCsAssetKind
  source: InternalCsAssetSource
  storagePath: string
  originalFileName: string
  mimeType: InternalCsAssetMimeType
  sizeBytes: number
  sha256: string
  externalRef?: string | null
  metadata?: Record<string, unknown>
  actor: string
}

export interface UpdateInternalCsAssetAnalysisInput {
  conversationId: string
  assetId: string
  status: InternalCsAssetStatus
  analysisSummary?: string | null
  analysisPayload?: Record<string, unknown>
  modelProvider?: string | null
  modelName?: string | null
  errorMessage?: string | null
  actor: string
  analyzedAt?: Date
}

export interface ReviewInternalCsAssetInput {
  conversationId: string
  assetId: string
  decision: Extract<InternalCsAssetReviewState, "approved" | "changes_requested" | "rejected">
  reviewNote?: string | null
  correctedAnalysis?: string | null
  actor: string
  now?: Date
}

export interface CreateInternalCsIntegrationEventInput {
  conversationId: string
  assetId?: string | null
  direction: InternalCsIntegrationDirection
  transport: InternalCsIntegrationTransport
  eventType: string
  sourceSystem: string
  idempotencyKey?: string | null
  correlationId?: string | null
  status?: InternalCsIntegrationStatus
  payload?: Record<string, unknown>
  actor: string
}

export interface UpdateInternalCsIntegrationEventInput {
  eventId: string
  status: InternalCsIntegrationStatus
  result?: Record<string, unknown>
  errorMessage?: string | null
  processedAt?: Date | null
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
  const hasInternalCsTableName = [
    "internal_cs_conversations",
    "internal_cs_messages",
    "internal_cs_assets",
    "internal_cs_integration_events",
  ].some((tableName) => text.includes(tableName))
  return (
    text.includes("42p01") ||
    (hasInternalCsTableName &&
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

export function buildInternalCsAssetInsert(input: CreateInternalCsAssetInput) {
  return {
    conversation_id: input.conversationId,
    message_id: trimOrNull(input.messageId),
    kind: input.kind ?? ("image" as const),
    source: input.source,
    storage_bucket: INTERNAL_CS_ASSETS_BUCKET,
    storage_path: input.storagePath.trim(),
    original_file_name: input.originalFileName.trim().slice(0, 255),
    mime_type: input.mimeType,
    size_bytes: Math.floor(input.sizeBytes),
    sha256: input.sha256.trim().toLowerCase(),
    status: "uploaded" as const,
    analysis_payload: {},
    review_state: "pending" as const,
    external_ref: trimOrNull(input.externalRef),
    metadata: input.metadata ?? {},
    created_by: input.actor,
    updated_by: input.actor,
  }
}

export function buildInternalCsAssetAnalysisPatch(input: UpdateInternalCsAssetAnalysisInput) {
  const finished = input.status === "ready" || input.status === "failed"
  return {
    status: input.status,
    analysis_summary: trimOrNull(input.analysisSummary),
    analysis_payload: input.analysisPayload ?? {},
    model_provider: trimOrNull(input.modelProvider),
    model_name: trimOrNull(input.modelName),
    error_message: trimOrNull(input.errorMessage),
    analyzed_at: finished ? (input.analyzedAt ?? new Date()).toISOString() : null,
    review_state: "pending" as const,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    corrected_analysis: null,
    updated_by: input.actor,
  }
}

export function buildInternalCsAssetReviewPatch(input: ReviewInternalCsAssetInput) {
  return {
    review_state: input.decision,
    reviewed_by: input.actor,
    reviewed_at: (input.now ?? new Date()).toISOString(),
    review_note: trimOrNull(input.reviewNote),
    corrected_analysis: trimOrNull(input.correctedAnalysis),
    updated_by: input.actor,
  }
}

export function buildInternalCsIntegrationEventInsert(
  input: CreateInternalCsIntegrationEventInput
) {
  return {
    conversation_id: input.conversationId,
    asset_id: trimOrNull(input.assetId),
    direction: input.direction,
    transport: input.transport,
    event_type: input.eventType.trim().slice(0, 120),
    source_system: input.sourceSystem.trim().slice(0, 80),
    idempotency_key: trimOrNull(input.idempotencyKey)?.slice(0, 200) ?? null,
    correlation_id: trimOrNull(input.correlationId)?.slice(0, 200) ?? null,
    status: input.status ?? ("accepted" as const),
    payload: input.payload ?? {},
    result: {},
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

async function assetsWithSignedUrls(rows: InternalCsAssetRow[]) {
  const signedByPath = await createInternalCsAssetSignedUrls(
    rows.map((row) => row.storage_path)
  )
  return rows.map((row) => ({
    ...row,
    signed_url: signedByPath.get(row.storage_path) ?? null,
  }))
}

export async function getInternalCsConversation(id: string) {
  const supabase = createSupabaseAdminClient()
  const [
    { data: conversation, error },
    { data: messages, error: messagesError },
    { data: assets, error: assetsError },
    { data: integrationEvents, error: integrationEventsError },
  ] = await Promise.all([
    supabase.from("internal_cs_conversations").select("*").eq("id", id).maybeSingle(),
    supabase.from("internal_cs_messages").select("*").eq("conversation_id", id).order("created_at"),
    supabase.from("internal_cs_assets").select("*").eq("conversation_id", id).order("created_at"),
    supabase
      .from("internal_cs_integration_events")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ])
  if (error) throw databaseError("failed to load conversation", error)
  if (messagesError) throw databaseError("failed to load messages", messagesError)
  if (assetsError) throw databaseError("failed to load assets", assetsError)
  if (integrationEventsError) throw databaseError("failed to load integration events", integrationEventsError)
  if (!conversation) return null
  const signedAssets = await assetsWithSignedUrls((assets ?? []) as InternalCsAssetRow[])
  return {
    conversation: conversation as InternalCsConversationRow,
    messages: (messages ?? []) as InternalCsMessageRow[],
    assets: signedAssets,
    integrationEvents: (integrationEvents ?? []) as InternalCsIntegrationEventRow[],
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

export async function listInternalCsAssets(conversationId: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_assets")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at")
  if (error) throw databaseError("failed to list assets", error)
  return assetsWithSignedUrls((data ?? []) as InternalCsAssetRow[])
}

export async function findInternalCsAssetByHash(conversationId: string, sha256: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_assets")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("sha256", sha256.trim().toLowerCase())
    .maybeSingle()
  if (error) throw databaseError("failed to find asset by hash", error)
  if (!data) return null
  const [asset] = await assetsWithSignedUrls([data as InternalCsAssetRow])
  return asset ?? null
}

export async function getInternalCsAsset(assetId: string, conversationId?: string) {
  const supabase = createSupabaseAdminClient()
  let query = supabase.from("internal_cs_assets").select("*").eq("id", assetId)
  if (conversationId) query = query.eq("conversation_id", conversationId)
  const { data, error } = await query.maybeSingle()
  if (error) throw databaseError("failed to load asset", error)
  if (!data) return null
  const [asset] = await assetsWithSignedUrls([data as InternalCsAssetRow])
  return asset ?? null
}

export async function createInternalCsAsset(input: CreateInternalCsAssetInput) {
  const insert = buildInternalCsAssetInsert(input)
  if (!insert.storage_path) throw new Error("Asset storage path is required.")
  if (!insert.original_file_name) throw new Error("Asset file name is required.")
  if (!/^[0-9a-f]{64}$/.test(insert.sha256)) throw new Error("Asset SHA-256 is invalid.")

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("internal_cs_assets").insert(insert).select("*").single()
  if (error) {
    if (error.code === "23505") {
      const existing = await findInternalCsAssetByHash(input.conversationId, input.sha256)
      if (existing) return existing
    }
    throw databaseError("failed to create asset", error)
  }
  const [asset] = await assetsWithSignedUrls([data as InternalCsAssetRow])
  return asset
}

export async function updateInternalCsAssetAnalysis(input: UpdateInternalCsAssetAnalysisInput) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_assets")
    .update(buildInternalCsAssetAnalysisPatch(input))
    .eq("id", input.assetId)
    .eq("conversation_id", input.conversationId)
    .select("*")
    .maybeSingle()
  if (error) throw databaseError("failed to update asset analysis", error)
  if (!data) return null
  const [asset] = await assetsWithSignedUrls([data as InternalCsAssetRow])
  return asset ?? null
}

export async function reviewInternalCsAsset(input: ReviewInternalCsAssetInput) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_assets")
    .update(buildInternalCsAssetReviewPatch(input))
    .eq("id", input.assetId)
    .eq("conversation_id", input.conversationId)
    .in("status", ["ready", "failed"])
    .select("*")
    .maybeSingle()
  if (error) throw databaseError("failed to review asset analysis", error)
  if (!data) return null
  const [asset] = await assetsWithSignedUrls([data as InternalCsAssetRow])
  return asset ?? null
}

export async function listInternalCsIntegrationEvents(conversationId: string, limit = 100) {
  const safeLimit = clampInteger(limit, 100, 1, 500)
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_integration_events")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(safeLimit)
  if (error) throw databaseError("failed to list integration events", error)
  return (data ?? []) as InternalCsIntegrationEventRow[]
}

export async function getInternalCsIntegrationEventByIdempotency(input: {
  direction: InternalCsIntegrationDirection
  sourceSystem: string
  idempotencyKey: string
}) {
  const key = input.idempotencyKey.trim()
  if (!key) return null
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_integration_events")
    .select("*")
    .eq("direction", input.direction)
    .eq("source_system", input.sourceSystem.trim().slice(0, 80))
    .eq("idempotency_key", key.slice(0, 200))
    .maybeSingle()
  if (error) throw databaseError("failed to find integration event", error)
  return (data as InternalCsIntegrationEventRow | null) ?? null
}

export async function createInternalCsIntegrationEvent(
  input: CreateInternalCsIntegrationEventInput
) {
  const insert = buildInternalCsIntegrationEventInsert(input)
  if (!insert.event_type) throw new Error("Integration event type is required.")
  if (!insert.source_system) throw new Error("Integration source system is required.")

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_integration_events")
    .insert(insert)
    .select("*")
    .single()
  if (error) {
    if (error.code === "23505" && insert.idempotency_key) {
      const existing = await getInternalCsIntegrationEventByIdempotency({
        direction: input.direction,
        sourceSystem: insert.source_system,
        idempotencyKey: insert.idempotency_key,
      })
      if (existing) return existing
    }
    throw databaseError("failed to create integration event", error)
  }
  return data as InternalCsIntegrationEventRow
}

/**
 * Atomically claims an idempotent integration event. Unlike createInternalCsIntegrationEvent,
 * this preserves whether this caller inserted the unique row so webhook/dispatch routes can stop
 * before repeating model calls, messages, assets, or outbound HTTP requests.
 */
export async function claimInternalCsIntegrationEvent(
  input: CreateInternalCsIntegrationEventInput & { idempotencyKey: string }
): Promise<{ event: InternalCsIntegrationEventRow; created: boolean }> {
  const insert = buildInternalCsIntegrationEventInsert(input)
  if (!insert.event_type) throw new Error("Integration event type is required.")
  if (!insert.source_system) throw new Error("Integration source system is required.")
  if (!insert.idempotency_key) throw new Error("Integration idempotency key is required.")

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_integration_events")
    .insert(insert)
    .select("*")
    .single()
  if (!error) return { event: data as InternalCsIntegrationEventRow, created: true }

  if (error.code === "23505") {
    const existing = await getInternalCsIntegrationEventByIdempotency({
      direction: input.direction,
      sourceSystem: insert.source_system,
      idempotencyKey: insert.idempotency_key,
    })
    if (existing) return { event: existing, created: false }
  }
  throw databaseError("failed to claim integration event", error)
}

export async function updateInternalCsIntegrationEvent(
  input: UpdateInternalCsIntegrationEventInput
) {
  const finished = input.status === "completed" || input.status === "failed"
  const patch: Record<string, unknown> = {
    status: input.status,
    error_message: trimOrNull(input.errorMessage),
    processed_at: input.processedAt === undefined
      ? (finished ? new Date().toISOString() : null)
      : input.processedAt?.toISOString() ?? null,
  }
  if (input.result !== undefined) patch.result = input.result

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_integration_events")
    .update(patch)
    .eq("id", input.eventId)
    .select("*")
    .maybeSingle()
  if (error) throw databaseError("failed to update integration event", error)
  return (data as InternalCsIntegrationEventRow | null) ?? null
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

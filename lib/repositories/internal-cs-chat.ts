import "server-only"

import { isInternalCsBridgeEventReclaimable } from "@/lib/internal-cs-chat/bridge-claim"
import {
  createInternalCsAssetSignedUrls,
  deleteInternalCsAsset,
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
  // 대화를 만들기 전에 이벤트를 먼저 선점하므로(마이그레이션 적용 후) 잠깐 null 일 수 있다.
  conversation_id: string | null
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
  /** 선점 뒤에 대화를 만든 경우 이벤트에 연결한다. */
  conversationId?: string
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

// 목록 화면이 쓰는 칸만. customer_context(상담 원문 맥락)는 목록으로 내려보내지 않고 상세 조회에서만 준다.
export const INTERNAL_CS_CONVERSATION_LIST_COLUMNS = [
  "id",
  "title",
  "status",
  "priority",
  "assignee_user_id",
  "assignee_name",
  "tags",
  "created_by",
  "updated_by",
  "resolved_at",
  "resolved_by",
  "archived_at",
  "archived_by",
  "archive_reason",
  "last_message_at",
  "created_at",
  "updated_at",
].join(", ")

export type InternalCsConversationListRow = Omit<InternalCsConversationRow, "customer_context">

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
    .select(INTERNAL_CS_CONVERSATION_LIST_COLUMNS, { count: "exact" })
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (options.status && options.status !== "all") query = query.eq("status", options.status)
  if (options.assigneeUserId) query = query.eq("assignee_user_id", options.assigneeUserId)
  const search = safeSearch(options.q)
  if (search) query = query.or(`title.ilike.%${search}%,assignee_name.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) throw databaseError("failed to list conversations", error)
  const rows = (data ?? []) as unknown as InternalCsConversationListRow[]
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

/** 보관 기간 정리·관리자 삭제로 원본 객체가 지워진 첨부인지(metadata.storageDeletedAt). 마이그레이션 없이 표시한다. */
export function isInternalCsAssetStorageDeleted(row: Pick<InternalCsAssetRow, "metadata">) {
  return typeof row.metadata?.storageDeletedAt === "string"
}

async function assetsWithSignedUrls(rows: InternalCsAssetRow[]) {
  const signedByPath = await createInternalCsAssetSignedUrls(
    rows.filter((row) => !isInternalCsAssetStorageDeleted(row)).map((row) => row.storage_path)
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

/** 선점에 졌을 때 방금 만든(메시지·자산이 아직 없는) 고아 대화만 지운다. */
export async function deleteEmptyInternalCsConversation(id: string) {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from("internal_cs_conversations").delete().eq("id", id)
  if (error) throw databaseError("failed to delete empty conversation", error)
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
      if (existing && isInternalCsAssetStorageDeleted(existing)) {
        // 지운 첨부와 같은 이미지를 다시 올렸다. 방금 올린 원본 객체가 고아가 되지 않도록 지운 행을 되살린다.
        const revived = await reviveInternalCsAsset(existing.id, insert)
        if (revived) return revived
        throw databaseError("failed to revive deleted asset", error)
      }
      if (existing) return existing
    }
    throw databaseError("failed to create asset", error)
  }
  const [asset] = await assetsWithSignedUrls([data as InternalCsAssetRow])
  return asset
}

/** 객체가 지워진 행을 새 업로드로 되살린다: 파일명·메타데이터·분석 칸을 처음 상태로 돌리고 보관 기간도 새로 센다. */
async function reviveInternalCsAsset(assetId: string, insert: ReturnType<typeof buildInternalCsAssetInsert>) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_assets")
    .update({
      storage_path: insert.storage_path,
      original_file_name: insert.original_file_name,
      mime_type: insert.mime_type,
      size_bytes: insert.size_bytes,
      status: "uploaded",
      analysis_summary: null,
      analysis_payload: {},
      model_provider: null,
      model_name: null,
      error_message: null,
      analyzed_at: null,
      review_state: "pending",
      metadata: insert.metadata,
      created_at: new Date().toISOString(),
      updated_by: insert.updated_by,
    })
    .eq("id", assetId)
    .select("*")
    .maybeSingle()
  if (error) throw databaseError("failed to revive deleted asset", error)
  if (!data) return null
  const [asset] = await assetsWithSignedUrls([data as InternalCsAssetRow])
  return asset ?? null
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

/**
 * 첨부 원본 객체를 지우고 행에는 지운 시각만 남긴다. 파일 이름·OCR 추출문(식별정보가 섞이기 쉬운 칸)도 비운다.
 * 분석 요약·검토 이력은 남겨 둔다. 이미 지운 첨부는 건너뛴다(null).
 */
export async function purgeInternalCsAssetObject(input: {
  assetId: string
  conversationId?: string
  actor: string
  reason: "retention" | "admin_delete"
  now?: Date
}) {
  const asset = await getInternalCsAsset(input.assetId, input.conversationId)
  if (!asset || isInternalCsAssetStorageDeleted(asset)) return null
  const removed = await deleteInternalCsAsset(asset.storage_path)
  if (!removed) throw new Error("Failed to delete the asset object from storage.")

  const { extractedText: _extractedText, ...payloadWithoutText } = (asset.analysis_payload ?? {}) as Record<string, unknown>
  void _extractedText
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_assets")
    .update({
      original_file_name: "deleted",
      analysis_payload: payloadWithoutText,
      metadata: {
        ...(asset.metadata ?? {}),
        storageDeletedAt: (input.now ?? new Date()).toISOString(),
        storageDeletedReason: input.reason,
        storageDeletedBy: input.actor,
      },
      updated_by: input.actor,
    })
    .eq("id", asset.id)
    .select("*")
    .maybeSingle()
  if (error) throw databaseError("asset object deleted but row update failed", error)
  return (data as InternalCsAssetRow | null) ?? null
}

/** 보관 기간이 지난(cutoff 이전 생성) 첨부 중 원본이 아직 남은 것. */
export async function listInternalCsAssetsPastRetention(input: { cutoff: Date; limit?: number }) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_assets")
    .select("*")
    .lt("created_at", input.cutoff.toISOString())
    .is("metadata->storageDeletedAt", null)
    .order("created_at")
    .limit(clampInteger(input.limit, 100, 1, 500))
  if (error) throw databaseError("failed to list assets past retention", error)
  return ((data ?? []) as InternalCsAssetRow[]).filter((row) => !isInternalCsAssetStorageDeleted(row))
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

/** conversation_id NOT NULL 마이그레이션 전 DB 에서 대화 없이 선점하려 할 때. 호출자가 옛 순서로 물러난다. */
export class InternalCsEventConversationRequiredError extends Error {
  constructor() {
    super("[internal-cs-chat] integration event requires a conversation (conversation_id NOT NULL)")
    this.name = "InternalCsEventConversationRequiredError"
  }
}

/**
 * Atomically claims an idempotent integration event. Unlike createInternalCsIntegrationEvent,
 * this preserves whether this caller inserted the unique row so webhook/dispatch routes can stop
 * before repeating model calls, messages, assets, or outbound HTTP requests.
 *
 * 같은 멱등 키의 기존 행이 failed 이거나 오래 처리 중(accepted/processing 이 N분 넘음)이면
 * 조건부 갱신(상태·updated_at 이 읽은 값 그대로일 때만)으로 다시 선점한다 — 동시에 여럿이 와도 한 요청만 created=true.
 * conversationId 가 null 이면 대화 없이 선점한다(대화는 선점한 쪽이 만들고 updateInternalCsIntegrationEvent 로 연결).
 */
export async function claimInternalCsIntegrationEvent(
  input: Omit<CreateInternalCsIntegrationEventInput, "conversationId"> & {
    idempotencyKey: string
    conversationId: string | null
  },
  now: Date = new Date()
): Promise<{ event: InternalCsIntegrationEventRow; created: boolean; reclaimed?: boolean }> {
  const insert = buildInternalCsIntegrationEventInsert(input as CreateInternalCsIntegrationEventInput)
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

  if (error.code === "23502" && !input.conversationId) throw new InternalCsEventConversationRequiredError()
  if (error.code === "23505") {
    const existing = await getInternalCsIntegrationEventByIdempotency({
      direction: input.direction,
      sourceSystem: insert.source_system,
      idempotencyKey: insert.idempotency_key,
    })
    if (existing) {
      if (!isInternalCsBridgeEventReclaimable(existing, now)) return { event: existing, created: false }
      let reclaim = supabase
        .from("internal_cs_integration_events")
        .update({
          status: "accepted",
          payload: insert.payload,
          result: {},
          error_message: null,
          processed_at: null,
          ...(input.conversationId && !existing.conversation_id ? { conversation_id: input.conversationId } : {}),
        })
        .eq("id", existing.id)
        .eq("status", existing.status)
      reclaim = existing.updated_at ? reclaim.eq("updated_at", existing.updated_at) : reclaim
      const { data: reclaimed, error: reclaimError } = await reclaim.select("*").maybeSingle()
      if (reclaimError) throw databaseError("failed to reclaim integration event", reclaimError)
      if (reclaimed) return { event: reclaimed as InternalCsIntegrationEventRow, created: true, reclaimed: true }
      // 다른 요청이 먼저 다시 선점했다: 지금 상태를 읽어 중복으로 돌려준다.
      const latest = await getInternalCsIntegrationEventByIdempotency({
        direction: input.direction,
        sourceSystem: insert.source_system,
        idempotencyKey: insert.idempotency_key,
      })
      return { event: latest ?? existing, created: false }
    }
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
  if (input.conversationId) patch.conversation_id = input.conversationId

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

// 회귀 후보 목록(계약 5) 한 항목. excerpt 는 검토자가 고친 최종본(corrected_content)을 우선한다.
export interface InternalCsRegressionCandidateItem {
  id: string
  conversationId: string
  excerpt: string
  capturedAt: string
  outcome: InternalCsRegressionOutcome
  reviewState: InternalCsReviewState
  // 지식 승격 자격의 정확한 판단용(계약 5 additive). UI 가 reviewState=approved 휴리스틱 대신 쓴다.
  hasCorrectedContent: boolean
}

const REGRESSION_CANDIDATE_SELECT =
  "id, conversation_id, content, corrected_content, review_state, regression_outcome, reviewed_at, updated_at"
const REGRESSION_EXCERPT_LENGTH = 240

interface RegressionCandidateRow {
  id: string
  conversation_id: string
  content: string
  corrected_content: string | null
  review_state: InternalCsReviewState
  regression_outcome: InternalCsRegressionOutcome
  reviewed_at: string | null
  updated_at: string
}

function toRegressionCandidateItem(row: RegressionCandidateRow): InternalCsRegressionCandidateItem {
  const corrected = trimOrNull(row.corrected_content)
  const excerptSource = (corrected ?? row.content).replace(/\s+/g, " ").trim()
  return {
    id: row.id,
    conversationId: row.conversation_id,
    excerpt: excerptSource.slice(0, REGRESSION_EXCERPT_LENGTH),
    // 후보 캡처 시점 = 검토 시점(regression_candidate 는 검토에서만 켜진다). 방어적으로 updated_at 폴백.
    capturedAt: row.reviewed_at ?? row.updated_at,
    outcome: row.regression_outcome,
    reviewState: row.review_state,
    // corrected_content IS NOT NULL AND != '' — 승격 자격 판단용(빈/공백 문자열은 없는 것으로 본다).
    hasCorrectedContent: Boolean(corrected),
  }
}

/**
 * 회귀 검수 후보 목록 — 미판정(not_evaluated) 우선, 남은 자리만 판정 완료분으로 채운다.
 * regression_candidate=true 부분 인덱스(internal_cs_messages_regression_idx)를 그대로 탄다.
 */
export async function listInternalCsRegressionCandidates(limit = 50) {
  const capped = clampInteger(limit, 50, 1, 50)
  const supabase = createSupabaseAdminClient()

  const { data: pending, error: pendingError } = await supabase
    .from("internal_cs_messages")
    .select(REGRESSION_CANDIDATE_SELECT)
    .eq("regression_candidate", true)
    .eq("regression_outcome", "not_evaluated")
    .order("updated_at", { ascending: false })
    .limit(capped)
  if (pendingError) throw databaseError("failed to list regression candidates", pendingError)

  const rows = [...((pending ?? []) as RegressionCandidateRow[])]
  const remaining = capped - rows.length
  if (remaining > 0) {
    const { data: judged, error: judgedError } = await supabase
      .from("internal_cs_messages")
      .select(REGRESSION_CANDIDATE_SELECT)
      .eq("regression_candidate", true)
      .neq("regression_outcome", "not_evaluated")
      .order("updated_at", { ascending: false })
      .limit(remaining)
    if (judgedError) throw databaseError("failed to list regression candidates", judgedError)
    rows.push(...((judged ?? []) as RegressionCandidateRow[]))
  }

  return rows.map(toRegressionCandidateItem)
}

/**
 * 문서 매핑(계약 7) 시 참조 메시지의 회귀 판정을 promoted 로 전파한다.
 * not_evaluated/needs_fix 만 갱신한다 — pass/excluded 는 담당자 판정이므로 불변.
 * 갱신된 행 수를 반환한다.
 */
export async function promoteRegressionOutcomes(refs: { messageId: string }[]) {
  const messageIds = [...new Set(refs.map((ref) => ref.messageId?.trim()).filter(Boolean))]
  if (messageIds.length === 0) return 0

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_messages")
    .update({ regression_outcome: "promoted" })
    .in("id", messageIds)
    .in("regression_outcome", ["not_evaluated", "needs_fix"])
    .select("id")
  if (error) throw databaseError("failed to promote regression outcomes", error)
  return (data ?? []).length
}

export type InternalCsRegressionOutcomeUpdateResult =
  | { status: "updated"; message: InternalCsMessageRow }
  | { status: "promoted_conflict" }
  | { status: "not_found" }

/**
 * 회귀 판정 전용 경량 갱신 — regression_outcome 만 바꾼다.
 * 검토 필드(review_state, reviewed_by, reviewed_at, review_note, corrected_content,
 * feedback_labels)와 대화 상태는 절대 건드리지 않는다 (buildInternalCsReviewPatch 재사용 금지 이유).
 * 문서 매핑이 전파한 promoted 는 수동 판정으로 덮을 수 없다 (stale 패널 가드) —
 * 그 외 상태(not_evaluated/pass/needs_fix/excluded) 간 재판정은 허용한다.
 */
export async function updateInternalCsRegressionOutcome(input: {
  conversationId: string
  messageId: string
  outcome: InternalCsRegressionOutcome
}): Promise<InternalCsRegressionOutcomeUpdateResult> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_messages")
    .update({ regression_outcome: input.outcome })
    .eq("id", input.messageId)
    .eq("conversation_id", input.conversationId)
    .eq("role", "assistant")
    .neq("regression_outcome", "promoted")
    .select("*")
    .maybeSingle()
  if (error) throw databaseError("failed to update regression outcome", error)
  if (data) return { status: "updated", message: data as InternalCsMessageRow }

  // 갱신 0건 = 메시지 없음 또는 promoted 가드에 걸림 — 라우트가 404/409 를 구분하도록 조회한다.
  const { data: current, error: currentError } = await supabase
    .from("internal_cs_messages")
    .select("id, regression_outcome")
    .eq("id", input.messageId)
    .eq("conversation_id", input.conversationId)
    .eq("role", "assistant")
    .maybeSingle()
  if (currentError) throw databaseError("failed to update regression outcome", currentError)

  const currentOutcome = (current as { regression_outcome?: string } | null)?.regression_outcome
  return currentOutcome === "promoted" ? { status: "promoted_conflict" } : { status: "not_found" }
}

/** 새 초안이 나와 대체된 옛 대기 초안에 붙는 라벨(검토 상태는 rejected). 승인율 분모에서 빠진다. */
export const INTERNAL_CS_SUPERSEDED_LABEL = "superseded"

/**
 * 재검토(rerun)로 새 초안이 나왔을 때 같은 질문의 옛 '검토 대기' 초안을 사용 안 함(rejected + superseded 라벨)으로 바꾼다.
 * 대기(pending) 상태인 행만 바꾸고, 이미 사람이 검토한 행은 건드리지 않는다. 대화 상태는 바꾸지 않는다.
 * 바뀐 행의 id 를 돌려준다.
 */
export async function supersedeInternalCsPendingMessages(input: {
  conversationId: string
  messageIds: string[]
  actor: string
  supersededBy: string
  now?: Date
}): Promise<string[]> {
  const ids = [...new Set(input.messageIds.map((id) => id.trim()).filter(Boolean))].slice(0, 20)
  if (ids.length === 0) return []
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_messages")
    .update({
      review_state: "rejected",
      reviewed_by: input.actor,
      reviewed_at: (input.now ?? new Date()).toISOString(),
      review_note: `새 초안(${input.supersededBy})으로 대체됨`,
      feedback_labels: [INTERNAL_CS_SUPERSEDED_LABEL],
    })
    .eq("conversation_id", input.conversationId)
    .eq("role", "assistant")
    .eq("review_state", "pending")
    .in("id", ids)
    .select("id")
  if (error) throw databaseError("failed to supersede pending drafts", error)
  return ((data ?? []) as { id: string }[]).map((row) => row.id)
}

export interface InternalCsContextResetStats {
  /** 기간 안에 저장된 맥락 비우기 경계 행의 수. */
  resets: number
  /** 기간 안에 새 초안으로 대체돼 사용 안 함 처리된 초안 수. */
  superseded: number
}

/**
 * 기간 안의 맥락 비우기·대체 건수(IC-25·IC-13). 계기판 RPC(internal_cs_metrics)를 바꾸지 않고 따로 센다.
 * 테이블이 없으면(마이그레이션 미적용) 0 이다.
 */
export async function getInternalCsContextResetStats(days: number): Promise<InternalCsContextResetStats> {
  const safeDays = clampInteger(days, 7, 1, 366)
  const since = new Date(Date.now() - safeDays * 86_400_000).toISOString()
  const supabase = createSupabaseAdminClient()
  const [resets, superseded] = await Promise.all([
    supabase
      .from("internal_cs_messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "system")
      .eq("metadata->>kind", "copilot_context_reset")
      .gte("created_at", since),
    supabase
      .from("internal_cs_messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "assistant")
      .contains("feedback_labels", [INTERNAL_CS_SUPERSEDED_LABEL])
      .gte("created_at", since),
  ])
  for (const result of [resets, superseded]) {
    if (result.error) {
      if (isMissingTableError(result.error)) return { resets: 0, superseded: 0 }
      throw databaseError("failed to count context resets", result.error)
    }
  }
  return { resets: resets.count ?? 0, superseded: superseded.count ?? 0 }
}

// ─── 운영 계기판 집계 (계약 1) ──────────────────────────────
// DB 안에서 단일 RPC(internal_cs_metrics)로 집계한다. 대량 행을 앱으로 끌어와 접지 않는다.
export interface InternalCsMetricsAggregate {
  days: number
  questions: number
  conversations: number
  assistantTotal: number
  assistantDeterministic: number
  evidenceKnowledge: number
  evidenceDocs: number
  evidenceChannel: number
  evidenceNone: number
  reviewApproved: number
  reviewChangesRequested: number
  reviewPending: number
  regressionNotEvaluated: number
  regressionPass: number
  regressionNeedsFix: number
  regressionPromoted: number
  regressionExcluded: number
  leadTimeMedianHours: number | null
  leadTimeP90Hours: number | null
}

export function emptyInternalCsMetricsAggregate(days: number): InternalCsMetricsAggregate {
  return {
    days,
    questions: 0,
    conversations: 0,
    assistantTotal: 0,
    assistantDeterministic: 0,
    evidenceKnowledge: 0,
    evidenceDocs: 0,
    evidenceChannel: 0,
    evidenceNone: 0,
    reviewApproved: 0,
    reviewChangesRequested: 0,
    reviewPending: 0,
    regressionNotEvaluated: 0,
    regressionPass: 0,
    regressionNeedsFix: 0,
    regressionPromoted: 0,
    regressionExcluded: 0,
    leadTimeMedianHours: null,
    leadTimeP90Hours: null,
  }
}

function toFiniteCount(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// 마이그레이션 미적용(라이브) 시 internal_cs_metrics 함수 자체가 없다 — not-ready 로 잡아 빈 집계로 안전 렌더.
function isInternalCsFunctionMissing(error: { code?: string; message?: string; details?: string; hint?: string }) {
  // 권한 오류(42501)는 함수-부재가 아니다 — 빈 계기판으로 마스킹하지 않고 라우트가 500으로 표면화한다.
  // 텍스트 휴리스틱보다 우선한다("permission denied for function internal_cs_metrics" 류가 여기에 걸린다).
  if (error.code === "42501") return false

  const text = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  const matched =
    text.includes("pgrst202") ||
    text.includes("42883") ||
    (text.includes("internal_cs_metrics") &&
      (text.includes("does not exist") ||
        text.includes("could not find") ||
        text.includes("schema cache") ||
        text.includes("function")))

  // 정확한 함수-부재 코드(PGRST202/42883) 없이 텍스트 휴리스틱으로만 잡힌 경우는 다른 오류가
  // 빈 계기판으로 무음 마스킹될 수 있어 원문을 남긴다. 판정 결과 자체는 바꾸지 않는다.
  const exactCode = /^(pgrst202|42883)$/i.test(error.code ?? "")
  if (matched && !exactCode) {
    console.warn(
      `[internal-cs-chat] metrics 오류를 not-ready로 흡수: ${[error.code, error.message, error.details, error.hint].filter(Boolean).join(" ")}`
    )
  }
  return matched
}

/**
 * 운영 계기판 집계(계약 1). 서버측 단일 RPC. 테이블/함수가 없으면(라이브 미적용) 빈 집계를 반환한다.
 */
export async function getInternalCsMetricsAggregate(days: number): Promise<InternalCsMetricsAggregate> {
  const safeDays = clampInteger(days, 7, 1, 366)
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc("internal_cs_metrics", { range_days: safeDays })
  if (error) {
    if (isMissingTableError(error) || isInternalCsFunctionMissing(error)) {
      return emptyInternalCsMetricsAggregate(safeDays)
    }
    throw databaseError("failed to aggregate metrics", error)
  }

  const row = (data ?? {}) as Record<string, unknown>
  return {
    days: toFiniteCount(row.days) || safeDays,
    questions: toFiniteCount(row.questions),
    conversations: toFiniteCount(row.conversations),
    assistantTotal: toFiniteCount(row.assistantTotal),
    assistantDeterministic: toFiniteCount(row.assistantDeterministic),
    evidenceKnowledge: toFiniteCount(row.evidenceKnowledge),
    evidenceDocs: toFiniteCount(row.evidenceDocs),
    evidenceChannel: toFiniteCount(row.evidenceChannel),
    evidenceNone: toFiniteCount(row.evidenceNone),
    reviewApproved: toFiniteCount(row.reviewApproved),
    reviewChangesRequested: toFiniteCount(row.reviewChangesRequested),
    reviewPending: toFiniteCount(row.reviewPending),
    regressionNotEvaluated: toFiniteCount(row.regressionNotEvaluated),
    regressionPass: toFiniteCount(row.regressionPass),
    regressionNeedsFix: toFiniteCount(row.regressionNeedsFix),
    regressionPromoted: toFiniteCount(row.regressionPromoted),
    regressionExcluded: toFiniteCount(row.regressionExcluded),
    leadTimeMedianHours: toNullableNumber(row.leadTimeMedianHours),
    leadTimeP90Hours: toNullableNumber(row.leadTimeP90Hours),
  }
}

// ─── 회귀 자동 평가 후보 (계약 2) ───────────────────────────
// 러너가 각 후보를 재생성·심판하려면 full content + corrected_content + 원 질문 링크(metadata)가 필요하다.
// listInternalCsRegressionCandidates(계약 5, 240자 발췌)와 달리 원문을 그대로 실어 나른다.
export interface InternalCsRegressionEvalCandidate {
  messageId: string
  conversationId: string
  content: string
  correctedContent: string | null
  reviewState: InternalCsReviewState
  /** quick_approved 처럼 기준 정답에서 뺄 행을 가려내는 검토 라벨. */
  feedbackLabels?: string[]
  metadata: Record<string, unknown>
}

const REGRESSION_EVAL_CANDIDATE_SELECT =
  "id, conversation_id, content, corrected_content, review_state, feedback_labels, metadata"

interface RegressionEvalCandidateRow {
  id: string
  conversation_id: string
  content: string
  corrected_content: string | null
  review_state: InternalCsReviewState
  feedback_labels?: string[] | null
  metadata: Record<string, unknown> | null
}

function toRegressionEvalCandidate(row: RegressionEvalCandidateRow): InternalCsRegressionEvalCandidate {
  return {
    messageId: row.id,
    conversationId: row.conversation_id,
    content: row.content,
    correctedContent: trimOrNull(row.corrected_content),
    reviewState: row.review_state,
    feedbackLabels: Array.isArray(row.feedback_labels) ? row.feedback_labels : [],
    metadata: row.metadata ?? {},
  }
}

/**
 * 자동 평가 후보 조회(계약 2). messageIds 명시 시 그 assistant 메시지들을, 아니면 미판정(not_evaluated)
 * 회귀 후보 최신순으로 반환한다. 어느 경로든 최대 REGRESSION_EVAL_MAX(=10)으로 캡한다.
 */
export async function listInternalCsRegressionEvalCandidates(input: {
  messageIds?: string[]
  limit: number
}): Promise<InternalCsRegressionEvalCandidate[]> {
  const capped = clampInteger(input.limit, 5, 1, 10)
  const explicitIds = [...new Set((input.messageIds ?? []).map((id) => id.trim()).filter(Boolean))].slice(0, 10)
  const supabase = createSupabaseAdminClient()

  if (explicitIds.length > 0) {
    const { data, error } = await supabase
      .from("internal_cs_messages")
      .select(REGRESSION_EVAL_CANDIDATE_SELECT)
      .eq("role", "assistant")
      .in("id", explicitIds)
      .order("updated_at", { ascending: false })
    if (error) throw databaseError("failed to list regression eval candidates", error)
    return ((data ?? []) as RegressionEvalCandidateRow[]).map(toRegressionEvalCandidate)
  }

  const { data, error } = await supabase
    .from("internal_cs_messages")
    .select(REGRESSION_EVAL_CANDIDATE_SELECT)
    .eq("role", "assistant")
    .eq("regression_candidate", true)
    .eq("regression_outcome", "not_evaluated")
    .order("updated_at", { ascending: false })
    .limit(capped)
  if (error) throw databaseError("failed to list regression eval candidates", error)
  return ((data ?? []) as RegressionEvalCandidateRow[]).map(toRegressionEvalCandidate)
}

/** 단건 메시지 조회 — 지식 승격 라우트가 자격(approved+corrected_content)을 검증할 때 쓴다. */
export async function getInternalCsMessageById(messageId: string): Promise<InternalCsMessageRow | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("internal_cs_messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle()
  if (error) throw databaseError("failed to load message", error)
  return (data as InternalCsMessageRow | null) ?? null
}

export function cleanInternalCsTags(values: string[] | undefined) {
  return cleanStringList(values)
}

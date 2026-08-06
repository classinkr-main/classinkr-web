import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const CHANNEL_CASE_REVIEW_STATES = ["pending", "approved", "rejected"] as const
export const CHANNEL_CASE_CAUSE_STATES = ["unresolved", "suspected", "confirmed"] as const
export const CHANNEL_CASE_OUTCOME_STATUSES = [
  "unknown",
  "solution_provided",
  "customer_confirmed_resolved",
  "still_unresolved",
] as const

export type ChannelCaseReviewState = (typeof CHANNEL_CASE_REVIEW_STATES)[number]
export type ChannelCaseCauseState = (typeof CHANNEL_CASE_CAUSE_STATES)[number]
export type ChannelCaseOutcomeStatus = (typeof CHANNEL_CASE_OUTCOME_STATUSES)[number]

export interface ChannelConversationCaseRow {
  id: string
  conversation_id: string
  candidate_key: string
  review_state: ChannelCaseReviewState
  cause_state: ChannelCaseCauseState
  outcome_status: ChannelCaseOutcomeStatus
  surface_symptom: string
  actual_cause: string | null
  diagnostic_questions: string[]
  resolution: string | null
  evidence_message_ids: string[]
  linked_guide_slug: string | null
  source_last_message_at: string | null
  reviewed_by: string
  reviewed_at: string
  created_at: string
  updated_at: string
}

export interface UpsertChannelConversationCaseInput {
  conversationId: string
  candidateKey: string
  reviewState: ChannelCaseReviewState
  causeState: ChannelCaseCauseState
  outcomeStatus: ChannelCaseOutcomeStatus
  surfaceSymptom: string
  actualCause?: string | null
  diagnosticQuestions?: string[]
  resolution?: string | null
  evidenceMessageIds?: string[]
  linkedGuideSlug?: string | null
  sourceLastMessageAt?: string | null
  actor: string
  now?: Date
}

export class ChannelConversationCaseValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ChannelConversationCaseValidationError"
  }
}

const CHANNEL_CASES_NOT_READY_MESSAGE =
  "채널톡 원인 검토 저장소가 준비되지 않았습니다. 20260807_channel_conversation_cases.sql 마이그레이션을 적용해 주세요."

function isMissingRelationError(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase()
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("channel_conversation_cases") &&
      (message.includes("does not exist") || message.includes("schema cache")))
  )
}

export function isChannelConversationCasesNotReadyError(error: unknown): error is Error {
  return error instanceof Error && error.message === CHANNEL_CASES_NOT_READY_MESSAGE
}

const CANDIDATE_KEY_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,119}$/
const GUIDE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/

function requiredText(value: string, label: string, maxLength: number) {
  const cleaned = value.replace(/\s+/g, " ").trim()
  if (!cleaned) throw new ChannelConversationCaseValidationError(`${label}을 입력해 주세요.`)
  if (cleaned.length > maxLength) {
    throw new ChannelConversationCaseValidationError(`${label}은 ${maxLength}자 이내로 입력해 주세요.`)
  }
  return cleaned
}

function optionalText(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") return null
  const cleaned = value.replace(/\s+/g, " ").trim()
  if (!cleaned) return null
  if (cleaned.length > maxLength) {
    throw new ChannelConversationCaseValidationError(`${maxLength}자를 초과한 입력이 있습니다.`)
  }
  return cleaned
}

function cleanList(values: string[] | undefined, options: { maxItems: number; maxLength: number }) {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const value of values) {
    if (typeof value !== "string") continue
    const item = value.replace(/\s+/g, " ").trim()
    if (!item || seen.has(item)) continue
    if (item.length > options.maxLength) {
      throw new ChannelConversationCaseValidationError(
        `목록 항목은 ${options.maxLength}자 이내로 입력해 주세요.`
      )
    }
    seen.add(item)
    cleaned.push(item)
    if (cleaned.length >= options.maxItems) break
  }
  return cleaned
}

export function buildChannelConversationCaseUpsert(input: UpsertChannelConversationCaseInput) {
  const conversationId = requiredText(input.conversationId, "상담 ID", 200)
  const candidateKey = input.candidateKey.trim().toLowerCase()
  if (!CANDIDATE_KEY_PATTERN.test(candidateKey)) {
    throw new ChannelConversationCaseValidationError("원인 후보 키 형식이 올바르지 않습니다.")
  }

  const surfaceSymptom = requiredText(input.surfaceSymptom, "표면 증상", 1_000)
  const actualCause = optionalText(input.actualCause, 1_500)
  const diagnosticQuestions = cleanList(input.diagnosticQuestions, {
    maxItems: 8,
    maxLength: 300,
  })
  const resolution = optionalText(input.resolution, 2_000)
  const evidenceMessageIds = cleanList(input.evidenceMessageIds, {
    maxItems: 20,
    maxLength: 200,
  })
  const linkedGuideSlug = optionalText(input.linkedGuideSlug, 120)
  if (linkedGuideSlug && !GUIDE_SLUG_PATTERN.test(linkedGuideSlug)) {
    throw new ChannelConversationCaseValidationError("연결 가이드 slug 형식이 올바르지 않습니다.")
  }

  if (input.reviewState === "approved" && input.causeState === "confirmed") {
    if (!actualCause) {
      throw new ChannelConversationCaseValidationError(
        "확정 원인을 승인하려면 실제 원인을 입력해 주세요."
      )
    }
    if (evidenceMessageIds.length === 0) {
      throw new ChannelConversationCaseValidationError(
        "확정 원인을 승인하려면 근거 메시지를 한 개 이상 선택해 주세요."
      )
    }
  }

  const reviewedAt = (input.now ?? new Date()).toISOString()
  return {
    conversation_id: conversationId,
    candidate_key: candidateKey,
    review_state: input.reviewState,
    cause_state: input.causeState,
    outcome_status: input.outcomeStatus,
    surface_symptom: surfaceSymptom,
    actual_cause: actualCause,
    diagnostic_questions: diagnosticQuestions,
    resolution,
    evidence_message_ids: evidenceMessageIds,
    linked_guide_slug: linkedGuideSlug,
    source_last_message_at: input.sourceLastMessageAt ?? null,
    reviewed_by: requiredText(input.actor, "검토자", 200),
    reviewed_at: reviewedAt,
  }
}

function repositoryError(scope: string, error: { code?: string; message: string }) {
  if (isMissingRelationError(error)) return new Error(CHANNEL_CASES_NOT_READY_MESSAGE)
  return new Error(`[channel-conversation-cases] ${scope}: ${error.message}`)
}

export async function listChannelConversationCases(conversationId: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("channel_conversation_cases")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("reviewed_at", { ascending: false })
  if (error) throw repositoryError("failed to list cases", error)
  return (data ?? []) as ChannelConversationCaseRow[]
}

export async function listChannelConversationCasesByConversationIds(conversationIds: string[]) {
  if (conversationIds.length === 0) return new Map<string, ChannelConversationCaseRow[]>()

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("channel_conversation_cases")
    .select("*")
    .in("conversation_id", conversationIds)
    .order("reviewed_at", { ascending: false })
  if (error) throw repositoryError("failed to list case summaries", error)

  const grouped = new Map<string, ChannelConversationCaseRow[]>()
  for (const row of (data ?? []) as ChannelConversationCaseRow[]) {
    const current = grouped.get(row.conversation_id) ?? []
    current.push(row)
    grouped.set(row.conversation_id, current)
  }
  return grouped
}

export async function upsertChannelConversationCase(input: UpsertChannelConversationCaseInput) {
  const row = buildChannelConversationCaseUpsert(input)
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("channel_conversation_cases")
    .upsert(row, { onConflict: "conversation_id,candidate_key" })
    .select("*")
    .single()
  if (error) throw repositoryError("failed to save case", error)
  return data as ChannelConversationCaseRow
}

export async function listApprovedConfirmedChannelConversationCases(limit = 100) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 500))
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("channel_conversation_cases")
    .select("*")
    .eq("review_state", "approved")
    .eq("cause_state", "confirmed")
    .order("reviewed_at", { ascending: false })
    .limit(safeLimit)
  if (error) throw repositoryError("failed to list approved cases", error)
  return (data ?? []) as ChannelConversationCaseRow[]
}

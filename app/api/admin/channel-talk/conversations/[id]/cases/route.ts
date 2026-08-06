import { NextRequest, NextResponse } from "next/server"

import {
  CRM_STAFF_ADMIN_API_ROLES,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import {
  deriveChannelRootCauseCandidatesForConversation,
  redactChannelTalkCaseText,
} from "@/lib/channel-talk-root-causes"
import {
  CHANNEL_CASE_CAUSE_STATES,
  CHANNEL_CASE_OUTCOME_STATUSES,
  CHANNEL_CASE_REVIEW_STATES,
  ChannelConversationCaseValidationError,
  isChannelConversationCasesNotReadyError,
  listChannelConversationCases,
  upsertChannelConversationCase,
  type ChannelConversationCaseRow,
} from "@/lib/repositories/channel-conversation-cases"
import { getDurableConversationsByIds } from "@/lib/repositories/channel-conversations"

interface RouteContext {
  params: Promise<{ id: string }>
}

const REVIEW_STATE_SET = new Set<string>(CHANNEL_CASE_REVIEW_STATES)
const CAUSE_STATE_SET = new Set<string>(CHANNEL_CASE_CAUSE_STATES)
const OUTCOME_STATUS_SET = new Set<string>(CHANNEL_CASE_OUTCOME_STATUSES)

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function serializeCase(row: ChannelConversationCaseRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    candidateKey: row.candidate_key,
    reviewState: row.review_state,
    causeState: row.cause_state,
    outcomeStatus: row.outcome_status,
    surfaceSymptom: row.surface_symptom,
    actualCause: row.actual_cause ?? "",
    diagnosticQuestions: row.diagnostic_questions ?? [],
    resolution: row.resolution ?? "",
    evidenceMessageIds: row.evidence_message_ids ?? [],
    linkedGuideSlug: row.linked_guide_slug,
    sourceLastMessageAt: row.source_last_message_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null
}

function stringList(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null
  return value as string[]
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

async function loadConversation(id: string) {
  const conversations = await getDurableConversationsByIds([id])
  return conversations.get(id) ?? null
}

export async function GET(req: NextRequest, context: RouteContext) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { id } = await context.params
  const conversation = await loadConversation(id)
  if (!conversation) {
    return NextResponse.json({ error: "상담을 찾을 수 없습니다." }, { status: 404 })
  }

  let cases: ChannelConversationCaseRow[] = []
  let storageReady = true
  let warning: string | null = null
  try {
    cases = await listChannelConversationCases(id)
  } catch (error) {
    if (!isChannelConversationCasesNotReadyError(error)) {
      console.error(`[GET /api/admin/channel-talk/conversations/${id}/cases]`, error)
      return NextResponse.json({ error: "원인 검토 내역을 불러오지 못했습니다." }, { status: 500 })
    }
    storageReady = false
    warning = error.message
  }

  const transcript = (conversation.transcript ?? []).map((message) => ({
    id: message.id,
    author: message.author,
    text: redactChannelTalkCaseText(message.text),
    at: message.at,
  }))
  const suggestions = deriveChannelRootCauseCandidatesForConversation(conversation).map(
    (candidate) => ({
      ...candidate,
      actualCause: candidate.actualCause ?? "",
      resolution: candidate.resolution ?? "",
    })
  )

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      state: conversation.state,
      tags: conversation.tags,
      firstQuestion: conversation.firstQuestion
        ? redactChannelTalkCaseText(conversation.firstQuestion)
        : null,
      lastMessageAt: conversation.lastMessageAt ?? null,
    },
    transcript,
    suggestions,
    cases: cases.map(serializeCase),
    storageReady,
    warning,
  })
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body: unknown = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return validationError("요청 형식이 올바르지 않습니다.")
  }
  const input = body as Record<string, unknown>
  const reviewState = stringValue(input.reviewState)
  const causeState = stringValue(input.causeState)
  const outcomeStatus = stringValue(input.outcomeStatus)
  const candidateKey = stringValue(input.candidateKey)
  const surfaceSymptom = stringValue(input.surfaceSymptom)
  const actualCause = input.actualCause === null ? null : stringValue(input.actualCause)
  const resolution = input.resolution === null ? null : stringValue(input.resolution)
  const linkedGuideSlug = input.linkedGuideSlug === null ? null : stringValue(input.linkedGuideSlug)
  const diagnosticQuestions = stringList(input.diagnosticQuestions)
  const evidenceMessageIds = stringList(input.evidenceMessageIds)

  if (!reviewState || !REVIEW_STATE_SET.has(reviewState)) {
    return validationError("검토 상태가 올바르지 않습니다.")
  }
  if (!causeState || !CAUSE_STATE_SET.has(causeState)) {
    return validationError("원인 확정도가 올바르지 않습니다.")
  }
  if (!outcomeStatus || !OUTCOME_STATUS_SET.has(outcomeStatus)) {
    return validationError("해결 결과가 올바르지 않습니다.")
  }
  if (!candidateKey || !surfaceSymptom || !diagnosticQuestions || !evidenceMessageIds) {
    return validationError("원인 검토 입력값을 확인해 주세요.")
  }

  const { id } = await context.params
  const conversation = await loadConversation(id)
  if (!conversation) {
    return NextResponse.json({ error: "상담을 찾을 수 없습니다." }, { status: 404 })
  }

  const messageById = new Map(
    (conversation.transcript ?? []).map((message) => [message.id, message] as const)
  )
  const unknownEvidenceId = evidenceMessageIds.find((messageId) => !messageById.has(messageId))
  if (unknownEvidenceId) {
    return validationError("원본 상담에 존재하지 않는 근거 메시지가 포함되어 있습니다.")
  }
  if (
    reviewState === "approved" &&
    causeState === "confirmed" &&
    !evidenceMessageIds.some((messageId) => messageById.get(messageId)?.author === "agent")
  ) {
    return validationError("확정 원인을 승인하려면 상담원 확인 메시지를 근거로 선택해 주세요.")
  }

  try {
    const saved = await upsertChannelConversationCase({
      conversationId: id,
      candidateKey,
      reviewState: reviewState as (typeof CHANNEL_CASE_REVIEW_STATES)[number],
      causeState: causeState as (typeof CHANNEL_CASE_CAUSE_STATES)[number],
      outcomeStatus: outcomeStatus as (typeof CHANNEL_CASE_OUTCOME_STATUSES)[number],
      surfaceSymptom: redactChannelTalkCaseText(surfaceSymptom),
      actualCause: actualCause ? redactChannelTalkCaseText(actualCause) : null,
      diagnosticQuestions: diagnosticQuestions.map(redactChannelTalkCaseText),
      resolution: resolution ? redactChannelTalkCaseText(resolution) : null,
      evidenceMessageIds,
      linkedGuideSlug,
      sourceLastMessageAt: conversation.lastMessageAt ?? null,
      actor: actorName(admin),
    })
    return NextResponse.json({ case: serializeCase(saved) })
  } catch (error) {
    if (error instanceof ChannelConversationCaseValidationError) {
      return validationError(error.message)
    }
    if (isChannelConversationCasesNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error(`[PATCH /api/admin/channel-talk/conversations/${id}/cases]`, error)
    return NextResponse.json({ error: "원인 검토 결과를 저장하지 못했습니다." }, { status: 500 })
  }
}

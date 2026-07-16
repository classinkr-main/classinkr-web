import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { ingestInternalCsGap } from "@/lib/internal-cs-chat/gap-ingest"
import {
  getInternalCsConversation,
  INTERNAL_CS_REGRESSION_OUTCOMES,
  isInternalCsChatNotReadyError,
  reviewInternalCsMessage,
  type InternalCsMessageRow,
  type InternalCsRegressionOutcome,
} from "@/lib/repositories/internal-cs-chat"

type Context = { params: Promise<{ id: string; messageId: string }> }
const DECISIONS = new Set(["approved", "changes_requested", "rejected"])
const CONVERSATION_ACTIONS = new Set(["keep_open", "resolve", "archive"])
const REGRESSION_OUTCOMES = new Set<string>(INTERNAL_CS_REGRESSION_OUTCOMES)

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null
}

// 수정 요청된 답변의 원 질문을 찾는다: generate 라우트가 남긴 metadata.userMessageId 링크를
// 우선 쓰고, 없으면 해당 assistant 메시지에 선행하는 가장 가까운 user 메시지로 폴백한다.
async function findReviewedQuestion(conversationId: string, message: InternalCsMessageRow) {
  const loaded = await getInternalCsConversation(conversationId)
  if (!loaded) return null

  const linkedUserMessageId =
    typeof message.metadata?.userMessageId === "string" ? message.metadata.userMessageId : null
  const linked = linkedUserMessageId
    ? loaded.messages.find((entry) => entry.id === linkedUserMessageId && entry.role === "user")
    : undefined
  if (linked?.content.trim()) return linked.content

  const messageIndex = loaded.messages.findIndex((entry) => entry.id === message.id)
  const preceding = messageIndex >= 0 ? loaded.messages.slice(0, messageIndex) : loaded.messages
  for (let index = preceding.length - 1; index >= 0; index -= 1) {
    const entry = preceding[index]
    if (entry.role === "user" && entry.content.trim()) return entry.content
  }
  return null
}

// 수정 요청(changes_requested)은 미해결 신호다 — 원 질문을 보강 큐로 유입한다.
// 유입은 side-effect: 실패해도 검토 응답 자체는 성공으로 유지하고 console.error 로만 관측한다.
async function queueReviewGap(conversationId: string, message: InternalCsMessageRow) {
  try {
    const question = await findReviewedQuestion(conversationId, message)
    if (!question) return
    await ingestInternalCsGap({
      question,
      conversationId,
      messageId: message.id,
      source: "internal_cs_review",
    })
  } catch (error) {
    console.error(
      `[internal-cs] failed to queue review gap for message ${message.id}:`,
      error instanceof Error ? error.message : error
    )
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id, messageId } = await context.params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  if (typeof raw.decision !== "string" || !DECISIONS.has(raw.decision)) {
    return NextResponse.json({ error: "Invalid human review decision" }, { status: 400 })
  }
  if (raw.feedbackLabels !== undefined && (!Array.isArray(raw.feedbackLabels) || raw.feedbackLabels.some((value) => typeof value !== "string"))) {
    return NextResponse.json({ error: "feedbackLabels must be a string array" }, { status: 400 })
  }
  if (raw.regressionOutcome !== undefined && (typeof raw.regressionOutcome !== "string" || !REGRESSION_OUTCOMES.has(raw.regressionOutcome))) {
    return NextResponse.json({ error: "Invalid regressionOutcome" }, { status: 400 })
  }
  if (raw.conversationAction !== undefined && (typeof raw.conversationAction !== "string" || !CONVERSATION_ACTIONS.has(raw.conversationAction))) {
    return NextResponse.json({ error: "Invalid conversationAction" }, { status: 400 })
  }
  if (raw.excludeFromGapQueue !== undefined && typeof raw.excludeFromGapQueue !== "boolean") {
    return NextResponse.json({ error: "excludeFromGapQueue must be a boolean" }, { status: 400 })
  }

  try {
    const message = await reviewInternalCsMessage({
      conversationId: id,
      messageId,
      decision: raw.decision as "approved" | "changes_requested" | "rejected",
      reviewNote: optionalString(raw.reviewNote),
      correctedContent: optionalString(raw.correctedContent),
      feedbackLabels: raw.feedbackLabels as string[] | undefined,
      regressionCandidate: raw.regressionCandidate === true,
      regressionOutcome: raw.regressionOutcome as InternalCsRegressionOutcome | undefined,
      conversationAction: raw.conversationAction as "keep_open" | "resolve" | "archive" | undefined,
      actor: actorName(admin),
    })
    if (!message) return NextResponse.json({ error: "Assistant message not found" }, { status: 404 })

    // 계약 3: excludeFromGapQueue !== true 인 수정 요청만 보강 큐로 자동 유입한다.
    if (message.review_state === "changes_requested" && raw.excludeFromGapQueue !== true) {
      await queueReviewGap(id, message)
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error(`[PATCH /api/admin/cs-chat/conversations/${id}/messages/${messageId}]`, error)
    if (isInternalCsChatNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to review internal CS message" }, { status: 500 })
  }
}

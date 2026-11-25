import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { CS_COPILOT_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { ingestInternalCsGap } from "@/lib/internal-cs-chat/gap-ingest"
import { INTERNAL_CS_METRICS_CACHE_TAG } from "@/lib/internal-cs-chat/metrics"
import { checkFinalAnswer, WARNINGS_ACKNOWLEDGED_LABEL } from "@/lib/internal-cs-chat/answer-checks"
import { hasQuickApprovedLabel, isSameAsOriginal } from "@/lib/internal-cs-chat/review-guard"
import {
  getInternalCsConversation,
  getInternalCsMessageById,
  INTERNAL_CS_REGRESSION_OUTCOMES,
  isInternalCsChatNotReadyError,
  reviewInternalCsMessage,
  updateInternalCsRegressionOutcome,
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

// 지표 카드(lib/internal-cs-chat/metrics.ts unstable_cache)가 판정 직후에도 옛 값을 보이지 않게 한다.
// 무효화 실패는 응답을 막지 않는다(TTL 60초가 남은 안전망).
function invalidateInternalCsMetrics() {
  try {
    revalidateTag(INTERNAL_CS_METRICS_CACHE_TAG, "max")
  } catch (error) {
    console.error("[internal-cs] failed to revalidate metrics cache:", error instanceof Error ? error.message : error)
  }
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
  const admin = await requireVerifiedAdminContext(req, CS_COPILOT_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id, messageId } = await context.params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  // 회귀 판정 전용 경량 경로: decision 없이 regressionOutcome 만 온 경우 (판정 패널).
  const isRegressionOnly = raw.decision === undefined && raw.regressionOutcome !== undefined
  if (!isRegressionOnly && (typeof raw.decision !== "string" || !DECISIONS.has(raw.decision))) {
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
  if (raw.warningsAcknowledged !== undefined && typeof raw.warningsAcknowledged !== "boolean") {
    return NextResponse.json({ error: "warningsAcknowledged must be a boolean" }, { status: 400 })
  }
  const correctedContent = optionalString(raw.correctedContent)
  if (!isRegressionOnly && raw.decision === "approved" && !correctedContent) {
    return NextResponse.json(
      { error: "Approved messages require a customer-ready correctedContent" },
      { status: 400 }
    )
  }
  let feedbackLabels = raw.feedbackLabels as string[] | undefined
  if (!isRegressionOnly && raw.decision === "approved" && hasQuickApprovedLabel(feedbackLabels)) {
    return NextResponse.json(
      { error: "즉시 승인은 받지 않습니다. 검토 드로어에서 확인 3종을 거쳐 고객용 최종 답을 따로 써 주세요." },
      { status: 400 }
    )
  }

  try {
    // 승인 경계(IC-01): 고객용 최종본이 AI 원문과 같으면(공백 차이만) 검토 없이 원문을 내보내는 것이다.
    if (!isRegressionOnly && raw.decision === "approved") {
      const original = await getInternalCsMessageById(messageId)
      if (!original || original.conversation_id !== id || original.role !== "assistant") {
        return NextResponse.json({ error: "Assistant message not found" }, { status: 404 })
      }
      if (isSameAsOriginal(correctedContent, original.content)) {
        return NextResponse.json(
          { error: "고객용 최종 답이 AI 초안 원문과 같습니다. 검토한 내용을 반영해 따로 써 주세요." },
          { status: 400 }
        )
      }
      // 최종본 재검사(검토 안전-3): 생성 때 원문에만 돌던 후검사를 사람이 고친 최종본에도 돌린다.
      // 내부 표시는 확인으로 넘길 수 없고, high 경고(약속·원가·식별자)는 검토 화면의 경고 확인을 받아야 한다.
      const finalCheck = checkFinalAnswer(correctedContent)
      if (finalCheck.internalMarkers.length > 0) {
        return NextResponse.json(
          { error: `고객용 최종 답에 내부 표시가 남아 있습니다(${finalCheck.internalMarkers.join(", ")}). 지우고 다시 승인해 주세요.` },
          { status: 400 }
        )
      }
      if (finalCheck.warnings.length > 0) {
        if (raw.warningsAcknowledged !== true) {
          return NextResponse.json(
            {
              error: "고객용 최종 답에 확인이 필요한 표현(약속·원가·식별자)이 있습니다. 검토 경고를 확인한 뒤 승인해 주세요.",
              warningCodes: [...new Set(finalCheck.warnings.map((warning) => warning.code))],
            },
            { status: 400 }
          )
        }
        feedbackLabels = [...new Set([...(feedbackLabels ?? []), WARNINGS_ACKNOWLEDGED_LABEL])]
      }
    }

    // 경량 경로는 regression_outcome 만 갱신한다 — 검토 필드(review_state/reviewed_*/
    // review_note/corrected_content/feedback_labels)와 대화 상태는 불변.
    if (isRegressionOnly) {
      const result = await updateInternalCsRegressionOutcome({
        conversationId: id,
        messageId,
        outcome: raw.regressionOutcome as InternalCsRegressionOutcome,
      })
      // stale 패널 가드: 문서 매핑이 이미 promoted 로 전파한 항목은 수동 판정으로 덮지 않는다.
      if (result.status === "promoted_conflict") {
        return NextResponse.json({ error: "이미 문서 반영(promoted)된 항목입니다" }, { status: 409 })
      }
      if (result.status === "not_found") {
        return NextResponse.json({ error: "Assistant message not found" }, { status: 404 })
      }
      invalidateInternalCsMetrics()
      return NextResponse.json({ message: result.message })
    }

    const message = await reviewInternalCsMessage({
      conversationId: id,
      messageId,
      decision: raw.decision as "approved" | "changes_requested" | "rejected",
      reviewNote: optionalString(raw.reviewNote),
      correctedContent,
      feedbackLabels,
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

    invalidateInternalCsMetrics()
    return NextResponse.json({ message })
  } catch (error) {
    console.error(`[PATCH /api/admin/cs-chat/conversations/${id}/messages/${messageId}]`, error)
    if (isInternalCsChatNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to review internal CS message" }, { status: 500 })
  }
}

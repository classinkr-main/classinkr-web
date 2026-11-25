import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { normalizeTopicTags } from "@/lib/chatbot/topic-crosswalk"
import {
  checkInternalCsAnswer,
  extractInstitutionNames,
  warningCodes,
} from "@/lib/internal-cs-chat/answer-checks"
import { buildInternalCsAssetEvidence } from "@/lib/internal-cs-chat/asset-evidence"
import { buildInternalCsCopilotContext } from "@/lib/internal-cs-chat/context"
import {
  extractCustomerContextFields,
  formatCustomerContextBlock,
} from "@/lib/internal-cs-chat/customer-context"
import { ingestInternalCsGap, shouldIngestInternalCsGap } from "@/lib/internal-cs-chat/gap-ingest"
import {
  generateInternalCsAnswer,
  type InternalCsRequestedMode,
} from "@/lib/internal-cs-chat/gemini"
import {
  buildApprovedHistory,
  CONTEXT_RESET_KIND,
  messagesAfterLastContextReset,
} from "@/lib/internal-cs-chat/history"
import {
  createInternalCsMessage,
  getInternalCsConversation,
  isInternalCsChatNotReadyError,
  supersedeInternalCsPendingMessages,
  type InternalCsMessageRow,
} from "@/lib/repositories/internal-cs-chat"
import { checkRateLimitDistributed } from "@/lib/server/rate-limit"

// 이전에는 maxDuration 이 없어 deep(Pro) 시간 예산을 늘려도 함수 제한에 걸렸다(IC-09).
// deep 전체 30초(gemini.ts) + 문맥 조립(공개 근거·상담 검색 각 3.5초, 병렬)을 덮는다.
export const maxDuration = 60

// 라우트 파일이 첨부 이미지 근거 조립기를 내보내던 자리다. 구현은 asset-evidence.ts 로 옮겼고(회귀 평가도 같은 블록을 쓴다),
// 기존 import 경로를 깨지 않도록 다시 내보낸다.
export { buildInternalCsAssetEvidence }

type Context = { params: Promise<{ id: string }> }

const REQUESTED_MODES = new Set<InternalCsRequestedMode>(["auto", "fast", "deep"])
const MAX_QUESTION_LENGTH = 1_000
const GENERATE_RATE_LIMIT = { windowMs: 60_000, max: 30 }
const RESET_SOURCES = new Set(["manual", "new_chat", "mode_change"])
const DEFAULT_POLISH_QUESTION = "위 초안을 고객에게 보낼 수 있는 문안으로 다듬어 줘."
const RESET_MESSAGE = "코파일럿 맥락을 비웠습니다. 이후 질문은 이 줄 앞의 대화를 이력으로 쓰지 않습니다."

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function errorStatus(error: unknown) {
  return isInternalCsChatNotReadyError(error) ? 503 : 500
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function optionalId(value: unknown, name: string): { value: string | null } | { error: string } {
  if (value === undefined || value === null) return { value: null }
  if (typeof value !== "string" || !value.trim() || value.length > 80) return { error: `${name} must be a message id` }
  return { value: value.trim() }
}

function latestHqReply(messages: InternalCsMessageRow[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === "internal_note" && message.metadata?.kind === "hq_reply" && message.content.trim()) {
      return message.content.trim()
    }
  }
  return ""
}

export async function POST(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  // 모델 호출은 비용이 든다 — 사용자별 분당 30회(IC-16). 인스턴스별 메모리 제한이며 Upstash 설정 시 분산 제한이다.
  const { allowed } = await checkRateLimitDistributed(
    admin.userId || actorName(admin),
    "admin-internal-cs-generate",
    GENERATE_RATE_LIMIT
  )
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const body = await req.json().catch(() => null)
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const raw = body
  const rerun = optionalId(raw.rerunOfUserMessageId, "rerunOfUserMessageId")
  if ("error" in rerun) return NextResponse.json({ error: rerun.error }, { status: 400 })
  const polish = optionalId(raw.draftToPolish, "draftToPolish")
  if ("error" in polish) return NextResponse.json({ error: polish.error }, { status: 400 })
  if (raw.resetContext !== undefined && typeof raw.resetContext !== "boolean") {
    return NextResponse.json({ error: "resetContext must be a boolean" }, { status: 400 })
  }
  const resetContext = raw.resetContext === true
  const resetSource = typeof raw.resetSource === "string" && RESET_SOURCES.has(raw.resetSource)
    ? raw.resetSource
    : "manual"
  if (rerun.value && polish.value) {
    return NextResponse.json({ error: "rerunOfUserMessageId and draftToPolish cannot be combined" }, { status: 400 })
  }
  if (rerun.value && resetContext) {
    return NextResponse.json({ error: "rerunOfUserMessageId and resetContext cannot be combined" }, { status: 400 })
  }

  let question = typeof raw.question === "string" ? raw.question.trim() : ""
  if (raw.question !== undefined && typeof raw.question !== "string") {
    return NextResponse.json({ error: "question must be a string" }, { status: 400 })
  }
  // 재검토는 원 질문을 그대로 쓴다. 맥락 비우기는 질문 없이 경계만 저장할 수 있다. 다듬기는 기본 요청문이 있다.
  if (!question && !rerun.value && !resetContext && !polish.value) {
    return NextResponse.json({ error: "question is required" }, { status: 400 })
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `question must be ${MAX_QUESTION_LENGTH} characters or fewer` },
      { status: 400 }
    )
  }

  const requestedMode = raw.requestedMode === undefined ? "auto" : raw.requestedMode
  if (typeof requestedMode !== "string" || !REQUESTED_MODES.has(requestedMode as InternalCsRequestedMode)) {
    return NextResponse.json({ error: "requestedMode must be auto, fast, or deep" }, { status: 400 })
  }
  if (
    raw.requiresEvidenceReview !== undefined &&
    typeof raw.requiresEvidenceReview !== "boolean"
  ) {
    return NextResponse.json({ error: "requiresEvidenceReview must be a boolean" }, { status: 400 })
  }

  const { id } = await context.params
  const actor = actorName(admin)
  let userMessage: InternalCsMessageRow | null = null

  try {
    const loaded = await getInternalCsConversation(id)
    if (!loaded) {
      return NextResponse.json(
        {
          error: "Conversation not found",
          result: {
            userMessageSaved: false,
            userMessageId: null,
            assistantMessageSaved: false,
          },
        },
        { status: 404 }
      )
    }

    const messages = loaded.messages
    let originalUserMessage: InternalCsMessageRow | null = null
    let originalUserIndex = -1
    if (rerun.value) {
      originalUserIndex = messages.findIndex((message) => message.id === rerun.value)
      originalUserMessage = originalUserIndex >= 0 ? messages[originalUserIndex] : null
      if (!originalUserMessage || originalUserMessage.role !== "user" || !originalUserMessage.content.trim()) {
        return NextResponse.json({ error: "rerunOfUserMessageId is not a user message of this conversation" }, { status: 404 })
      }
      question = originalUserMessage.content.trim()
    }

    let draftToPolishText = ""
    if (polish.value) {
      const draft = messages.find((message) => message.id === polish.value)
      if (!draft || draft.role !== "assistant" || !(draft.corrected_content?.trim() || draft.content.trim())) {
        return NextResponse.json({ error: "draftToPolish is not an assistant draft of this conversation" }, { status: 404 })
      }
      draftToPolishText = (draft.corrected_content?.trim() || draft.content).trim()
      if (!question) question = DEFAULT_POLISH_QUESTION
    }

    // 맥락 비우기(IC-25): 경계 system 행만 저장한다. 질문 글은 담지 않고, 이후 이력은 마지막 경계 뒤만 쓴다.
    let resetMessage: InternalCsMessageRow | null = null
    if (resetContext) {
      const segment = messagesAfterLastContextReset(messages)
      resetMessage = await createInternalCsMessage({
        conversationId: id,
        role: "system",
        content: RESET_MESSAGE,
        metadata: {
          kind: CONTEXT_RESET_KIND,
          source: resetSource,
          turnsBefore: {
            userTurns: segment.filter((message) => message.role === "user").length,
            assistantTurns: segment.filter((message) => message.role === "assistant").length,
            fromMessageId: segment[0]?.id ?? null,
            toMessageId: segment[segment.length - 1]?.id ?? null,
          },
          hadPendingDraft: segment.some(
            (message) => message.role === "assistant" && message.review_state === "pending"
          ),
        },
        actor,
      })
      if (!question) {
        return NextResponse.json(
          {
            message: resetMessage,
            result: {
              contextReset: true,
              resetMessageId: resetMessage.id,
              userMessageSaved: false,
              userMessageId: null,
              assistantMessageSaved: false,
            },
          },
          { status: 201 }
        )
      }
    }

    // The generate endpoint owns user-message persistence. Clients must not pre-save the same
    // question through /messages before calling this route. 재검토·다듬기는 질문을 다시 저장하지 않는다.
    if (!rerun.value && !polish.value) {
      userMessage = await createInternalCsMessage({
        conversationId: id,
        role: "user",
        content: question,
        actor,
      })
    } else if (originalUserMessage) {
      userMessage = originalUserMessage
    }

    // 이력: 마지막 경계 뒤만. 이번 요청이 경계를 만들었으면 이력은 비어 있다. 재검토는 원 질문 앞까지만 쓴다.
    const historySource = resetContext
      ? []
      : rerun.value
        ? messages.slice(0, originalUserIndex)
        : messages
    const history = buildApprovedHistory(historySource)
    const hqReply = resetContext ? "" : latestHqReply(messagesAfterLastContextReset(messages))

    const copilotContext = await buildInternalCsCopilotContext(question, {
      queueTags: loaded.conversation.tags,
      // 내부 CS 경로만 internal 가시성 문서(brand-canon 원문 등)를 검색에 포함한다(계약 6).
      includeInternalDocs: true,
    })
    const assetEvidence = buildInternalCsAssetEvidence(loaded.assets ?? [])
    const curatedEvidence = copilotContext.curatedEvidence
    const effectiveRequiresEvidenceReview =
      raw.requiresEvidenceReview === true || curatedEvidence?.reviewRequired === true
    const normalizedTopic = normalizeTopicTags([...loaded.conversation.tags])
    const customerContextBlock = formatCustomerContextBlock(loaded.conversation.customer_context)
    const queueContext = [
      "[현재 상담 큐]",
      `우선순위: ${loaded.conversation.priority}`,
      `태그: ${loaded.conversation.tags.join(", ") || "없음"}`,
      normalizedTopic ? `정규화 주제: ${normalizedTopic}` : "",
      curatedEvidence?.recommendedTags.length
        ? `권장 분류 태그(담당자 확인 전 미적용): ${curatedEvidence.recommendedTags.join(", ")}`
        : "",
      customerContextBlock,
    ].filter(Boolean).join("\n")
    const generation = await generateInternalCsAnswer({
      question,
      requestedMode: requestedMode as InternalCsRequestedMode,
      riskLevel:
        loaded.conversation.priority === "urgent" || loaded.conversation.priority === "high"
          ? "high"
          : "low",
      requiresEvidenceReview: effectiveRequiresEvidenceReview,
      internalContext: [copilotContext.internalContext, queueContext, assetEvidence.text]
        .filter(Boolean)
        .join("\n\n"),
      sourceRefs: [...copilotContext.sourceRefs, ...assetEvidence.sourceRefs],
      history,
      deterministicFallback: copilotContext.deterministicFallback,
      draftToPolish: draftToPolishText || undefined,
      hqReply: hqReply || undefined,
    })

    // 답 후검사(IC-04): 금액·약속·원가·다른 고객·식별자. 차단이 아니라 검토 경고다.
    const currentInstitution = extractCustomerContextFields(loaded.conversation.customer_context).institution
    const reviewWarnings = checkInternalCsAnswer(generation.answer, {
      allowedNames: currentInstitution ? [currentInstitution] : [],
      otherCustomerNames: extractInstitutionNames(copilotContext.internalContext),
    })
    const modelStatus = {
      failureKinds: generation.failureKinds,
      attempts: generation.attempts,
      latencyMs: generation.latencyMs,
      timeBudget: generation.timeBudget,
    }

    // 다듬기: 결과는 저장하지 않고 응답으로만 돌려준다(검토 드로어의 최종 칸에만 들어간다). 모델이 실패해 대체 글이면 문안을 주지 않는다.
    if (polish.value) {
      return NextResponse.json(
        {
          polish: {
            polishOf: polish.value,
            answer: generation.origin === "model" ? generation.answer : null,
            origin: generation.origin,
            model: generation.model,
            reviewWarnings: generation.origin === "model" ? reviewWarnings : [],
            ...modelStatus,
          },
          result: {
            ...generation,
            reviewWarnings,
            userMessageSaved: false,
            userMessageId: null,
            assistantMessageSaved: false,
          },
        },
        { status: 200 }
      )
    }

    const message = await createInternalCsMessage({
      conversationId: id,
      role: "assistant",
      content: generation.answer,
      modelProvider: "google",
      modelName: generation.model,
      modelMode: generation.mode,
      sourceRefs: generation.citations,
      metadata: {
        origin: generation.origin,
        fallbackUsed: generation.fallbackUsed,
        attemptedModels: generation.attemptedModels,
        ...modelStatus,
        citations: generation.citations,
        guardrails: generation.guardrails,
        requestedMode,
        requiresEvidenceReview: effectiveRequiresEvidenceReview,
        requestedEvidenceReview: raw.requiresEvidenceReview === true,
        curatedKnowledgeIds: curatedEvidence?.entries.map((entry) => entry.id) ?? [],
        curatedKnowledgeStatuses: curatedEvidence?.entries.map((entry) => ({
          id: entry.id,
          status: entry.status,
          externalUse: entry.externalUse,
        })) ?? [],
        curatedEvidenceReviewReasons: curatedEvidence?.reviewReasons ?? [],
        recommendedTags: curatedEvidence?.recommendedTags ?? [],
        publicEvidenceSourceCount: copilotContext.publicEvidence.sources.length,
        internalAssetEvidenceCount: assetEvidence.count,
        hqReplyIncluded: Boolean(hqReply),
        reviewWarnings,
        reviewWarningCodes: warningCodes(reviewWarnings),
        userMessageId: userMessage?.id ?? null,
        ...(rerun.value ? { rerunOf: rerun.value } : {}),
      },
      actor,
    })

    // 재검토(Pro)로 새 모델 초안이 나왔으면 같은 질문의 옛 검토 대기 초안을 '사용 안 함'(superseded)으로 바꾼다(결정 9).
    // 새 초안이 모델 장애로 대체 글이면 옛 초안을 치우지 않는다.
    let supersededMessageIds: string[] = []
    if (rerun.value && generation.origin === "model") {
      const olderPending = messages
        .filter((candidate) => (
          candidate.role === "assistant" &&
          candidate.review_state === "pending" &&
          (candidate.metadata?.userMessageId === rerun.value || candidate.metadata?.rerunOf === rerun.value)
        ))
        .map((candidate) => candidate.id)
      try {
        supersededMessageIds = await supersedeInternalCsPendingMessages({
          conversationId: id,
          messageIds: olderPending,
          actor,
          supersededBy: message.id,
        })
      } catch (error) {
        console.error(`[POST /api/admin/cs-chat/conversations/${id}/generate] supersede failed`, error instanceof Error ? error.message : error)
      }
    }

    // 지식 공백 신호(IC-03 model-6): 검색된 근거가 하나도 없고 모델 호출은 실패하지 않은 질문만 보강 큐로 보낸다.
    // 모델 장애(키·한도·시간 초과)로 만들어진 대체 글은 공백이 아니므로 넣지 않는다.
    // ingestInternalCsGap 은 절대 throw 하지 않으므로 본 응답 흐름을 막지 않는다.
    const evidenceNone =
      copilotContext.publicEvidence.sources.length === 0 &&
      !copilotContext.sourceRefs.some((source) => source.id.startsWith("channel:")) &&
      (copilotContext.incidentEvidence?.length ?? 0) === 0 &&
      assetEvidence.count === 0
    if (shouldIngestInternalCsGap({ failureKinds: generation.failureKinds, evidenceNone, isRerun: Boolean(rerun.value) })) {
      await ingestInternalCsGap({
        question,
        conversationId: id,
        messageId: message.id,
        source: "internal_cs_fallback",
      })
    }

    return NextResponse.json(
      {
        message,
        result: {
          ...generation,
          reviewWarnings,
          userMessageSaved: Boolean(userMessage) && !rerun.value,
          userMessageId: userMessage?.id ?? null,
          assistantMessageSaved: true,
          assistantMessageId: message.id,
          ...(resetMessage ? { contextReset: true, resetMessageId: resetMessage.id } : {}),
          ...(rerun.value ? { rerunOf: rerun.value } : {}),
          supersededMessageIds,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error(`[POST /api/admin/cs-chat/conversations/${id}/generate]`, error)
    return NextResponse.json(
      {
        error: isInternalCsChatNotReadyError(error)
          ? error.message
          : "Failed to generate internal CS draft",
        result: {
          userMessageSaved: Boolean(userMessage) && !rerun.value && !polish.value,
          userMessageId: userMessage?.id ?? null,
          assistantMessageSaved: false,
        },
      },
      { status: errorStatus(error) }
    )
  }
}

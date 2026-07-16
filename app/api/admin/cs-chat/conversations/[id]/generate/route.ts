import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { normalizeTopicTags } from "@/lib/chatbot/topic-crosswalk"
import { buildInternalCsCopilotContext } from "@/lib/internal-cs-chat/context"
import { ingestInternalCsGap } from "@/lib/internal-cs-chat/gap-ingest"
import {
  generateInternalCsAnswer,
  type InternalCsChatTurn,
  type InternalCsRequestedMode,
} from "@/lib/internal-cs-chat/gemini"
import {
  createInternalCsMessage,
  getInternalCsConversation,
  isInternalCsChatNotReadyError,
  type InternalCsAssetRow,
  type InternalCsMessageRow,
} from "@/lib/repositories/internal-cs-chat"

type Context = { params: Promise<{ id: string }> }

const REQUESTED_MODES = new Set<InternalCsRequestedMode>(["auto", "fast", "deep"])
const MAX_QUESTION_LENGTH = 1_000

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function buildApprovedHistory(messages: InternalCsMessageRow[]): InternalCsChatTurn[] {
  return messages
    .filter((message) => {
      if (message.role === "user") return true
      return message.role === "assistant" && message.review_state === "approved"
    })
    .slice(-8)
    .map((message) => ({
      role: message.role === "assistant" ? "model" as const : "user" as const,
      text: message.role === "assistant" && message.corrected_content
        ? message.corrected_content
        : message.content,
    }))
}

function compactAssetList(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim().slice(0, 500))
    .slice(0, limit)
}

export function buildInternalCsAssetEvidence(assets: InternalCsAssetRow[]) {
  const usable = assets
    .filter((asset) => Boolean(asset.analysis_summary?.trim()))
    .slice(-5)

  return {
    text: usable.map((asset, index) => {
      const extractedText = compactAssetList(asset.analysis_payload?.extractedText)
      const observations = compactAssetList(asset.analysis_payload?.observations)
      const sensitiveWarnings = compactAssetList(asset.analysis_payload?.sensitiveDataWarnings, 6)
      return [
        `[Attached image ${index + 1}: ${asset.original_file_name}]`,
        `Review state: ${asset.review_state} (treat as unverified unless approved)`,
        `Analysis summary: ${asset.corrected_analysis || asset.analysis_summary}`,
        extractedText.length ? `Visible text: ${extractedText.join(" | ")}` : "",
        observations.length ? `Visible observations: ${observations.join(" | ")}` : "",
        sensitiveWarnings.length ? `Sensitive-data warnings: ${sensitiveWarnings.join(" | ")}` : "",
      ].filter(Boolean).join("\n")
    }).join("\n\n"),
    sourceRefs: usable.map((asset) => ({
      id: `internal-cs-asset:${asset.id}`,
      label: `Attached image: ${asset.original_file_name}`,
      kind: "internal_asset" as const,
      reviewState: asset.review_state,
    })),
    count: usable.length,
  }
}

function errorStatus(error: unknown) {
  return isInternalCsChatNotReadyError(error) ? 503 : 500
}

export async function POST(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const raw = body as Record<string, unknown>
  const question = typeof raw.question === "string" ? raw.question.trim() : ""
  if (!question) {
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

    // The generate endpoint owns user-message persistence. Clients must not pre-save the same
    // question through /messages before calling this route.
    userMessage = await createInternalCsMessage({
      conversationId: id,
      role: "user",
      content: question,
      actor,
    })

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
    const queueContext = [
      "[현재 상담 큐]",
      `우선순위: ${loaded.conversation.priority}`,
      `태그: ${loaded.conversation.tags.join(", ") || "없음"}`,
      normalizedTopic ? `정규화 주제: ${normalizedTopic}` : "",
      curatedEvidence?.recommendedTags.length
        ? `권장 분류 태그(담당자 확인 전 미적용): ${curatedEvidence.recommendedTags.join(", ")}`
        : "",
    ].join("\n")
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
      history: buildApprovedHistory(loaded.messages),
      deterministicFallback: copilotContext.deterministicFallback,
    })

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
        userMessageId: userMessage.id,
      },
      actor,
    })

    // 모델이 전부 실패해 deterministic 폴백이 저장됐다 = 지식 공백 신호.
    // 공개 챗봇과 같은 보강 큐로 유입한다. ingestInternalCsGap 은 절대 throw 하지 않으므로
    // 본 응답 흐름을 막지 않는다.
    if (generation.origin === "deterministic") {
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
          userMessageSaved: true,
          userMessageId: userMessage.id,
          assistantMessageSaved: true,
          assistantMessageId: message.id,
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
          userMessageSaved: Boolean(userMessage),
          userMessageId: userMessage?.id ?? null,
          assistantMessageSaved: false,
        },
      },
      { status: errorStatus(error) }
    )
  }
}

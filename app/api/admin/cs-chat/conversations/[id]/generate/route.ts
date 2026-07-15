import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { buildInternalCsCopilotContext } from "@/lib/internal-cs-chat/context"
import {
  generateInternalCsAnswer,
  type InternalCsChatTurn,
  type InternalCsRequestedMode,
} from "@/lib/internal-cs-chat/gemini"
import {
  createInternalCsMessage,
  getInternalCsConversation,
  isInternalCsChatNotReadyError,
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

    const copilotContext = await buildInternalCsCopilotContext(question)
    const queueContext = [
      "[현재 상담 큐]",
      `우선순위: ${loaded.conversation.priority}`,
      `태그: ${loaded.conversation.tags.join(", ") || "없음"}`,
    ].join("\n")
    const generation = await generateInternalCsAnswer({
      question,
      requestedMode: requestedMode as InternalCsRequestedMode,
      riskLevel:
        loaded.conversation.priority === "urgent" || loaded.conversation.priority === "high"
          ? "high"
          : "low",
      requiresEvidenceReview: raw.requiresEvidenceReview === true,
      internalContext: `${copilotContext.internalContext}\n\n${queueContext}`,
      sourceRefs: copilotContext.sourceRefs,
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
        requiresEvidenceReview: raw.requiresEvidenceReview === true,
        publicEvidenceSourceCount: copilotContext.publicEvidence.sources.length,
        userMessageId: userMessage.id,
      },
      actor,
    })

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

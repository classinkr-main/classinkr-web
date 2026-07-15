import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  INTERNAL_CS_REGRESSION_OUTCOMES,
  isInternalCsChatNotReadyError,
  reviewInternalCsMessage,
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
    return NextResponse.json({ message })
  } catch (error) {
    console.error(`[PATCH /api/admin/cs-chat/conversations/${id}/messages/${messageId}]`, error)
    if (isInternalCsChatNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to review internal CS message" }, { status: 500 })
  }
}

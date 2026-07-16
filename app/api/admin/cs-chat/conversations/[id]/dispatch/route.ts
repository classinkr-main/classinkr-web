import { randomUUID } from "crypto"

import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { INTERNAL_CS_BRIDGE_VERSION, signInternalCsBridgeBody } from "@/lib/internal-cs-chat/bridge"
import {
  claimInternalCsIntegrationEvent,
  getInternalCsConversation,
  getInternalCsIntegrationEventByIdempotency,
  isInternalCsChatNotReadyError,
  updateInternalCsIntegrationEvent,
} from "@/lib/repositories/internal-cs-chat"
import { postJson } from "@/lib/server/post-json"

type Context = { params: Promise<{ id: string }> }

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return null
}

export async function POST(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const webhookUrl = firstNonEmpty(process.env.INTERNAL_CS_OUTBOUND_WEBHOOK_URL)
  const webhookSecret = firstNonEmpty(process.env.INTERNAL_CS_OUTBOUND_WEBHOOK_SECRET)
  if (!webhookUrl || !webhookSecret || webhookSecret.length < 32) {
    return NextResponse.json({ error: "Internal CS outbound bridge is not configured" }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  if (raw.includeOriginalAssets !== undefined && typeof raw.includeOriginalAssets !== "boolean") {
    return NextResponse.json({ error: "includeOriginalAssets must be a boolean" }, { status: 400 })
  }
  if (raw.acknowledgeSensitiveData !== undefined && typeof raw.acknowledgeSensitiveData !== "boolean") {
    return NextResponse.json({ error: "acknowledgeSensitiveData must be a boolean" }, { status: 400 })
  }
  const includeOriginalAssets = raw.includeOriginalAssets === true
  if (includeOriginalAssets && raw.acknowledgeSensitiveData !== true) {
    return NextResponse.json(
      { error: "acknowledgeSensitiveData must be true to include original assets" },
      { status: 400 }
    )
  }

  const { id } = await context.params
  const actor = actorName(admin)
  const idempotencyKey = typeof raw.idempotencyKey === "string" && raw.idempotencyKey.trim()
    ? raw.idempotencyKey.trim().slice(0, 160)
    : randomUUID()
  const correlationId = typeof raw.correlationId === "string" && raw.correlationId.trim()
    ? raw.correlationId.trim().slice(0, 160)
    : null
  let eventId: string | null = null

  try {
    const existing = await getInternalCsIntegrationEventByIdempotency({
      direction: "outbound",
      sourceSystem: "classin-admin",
      idempotencyKey,
    })
    if (existing) {
      return NextResponse.json({
        ok: existing.status === "completed",
        duplicate: true,
        eventId: existing.id,
        status: existing.status,
        result: existing.result,
      })
    }

    const loaded = await getInternalCsConversation(id)
    if (!loaded) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })

    const envelope = {
      version: INTERNAL_CS_BRIDGE_VERSION,
      eventType: "cs.context.available",
      sourceSystem: "classin-admin",
      transport: "webhook",
      idempotencyKey,
      correlationId,
      context: {
        conversation: {
          id: loaded.conversation.id,
          title: loaded.conversation.title,
          status: loaded.conversation.status,
          priority: loaded.conversation.priority,
          tags: loaded.conversation.tags,
          lastMessageAt: loaded.conversation.last_message_at,
        },
        messages: loaded.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          reviewState: message.review_state,
          correctedContent: message.corrected_content,
          modelProvider: message.model_provider,
          modelName: message.model_name,
          createdAt: message.created_at,
        })),
        assets: loaded.assets.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          fileName: asset.original_file_name,
          mimeType: asset.mime_type,
          status: asset.status,
          analysisSummary: asset.analysis_summary,
          analysisPayload: asset.analysis_payload,
          reviewState: asset.review_state,
          ...(includeOriginalAssets && asset.signed_url ? { signedUrl: asset.signed_url } : {}),
        })),
      },
      policy: {
        purpose: "internal_ai_analysis",
        customerDeliveryAllowed: false,
        csOwnerReviewRequired: true,
        originalAssetsIncluded: includeOriginalAssets,
      },
    }
    const serialized = JSON.stringify(envelope)
    const signature = signInternalCsBridgeBody(serialized, webhookSecret)

    const claim = await claimInternalCsIntegrationEvent({
      conversationId: id,
      direction: "outbound",
      transport: "admin",
      eventType: "cs.context.available",
      sourceSystem: "classin-admin",
      idempotencyKey,
      correlationId,
      status: "processing",
      payload: {
        version: INTERNAL_CS_BRIDGE_VERSION,
        messageCount: loaded.messages.length,
        assetCount: loaded.assets.length,
        includeOriginalAssets,
        target: "configured_internal_ai_webhook",
      },
      actor,
    })
    const event = claim.event
    eventId = event.id
    if (!claim.created) {
      return NextResponse.json({
        ok: event.status === "completed",
        duplicate: true,
        eventId,
        status: event.status,
        result: event.result,
      })
    }

    const response = await postJson(webhookUrl, envelope, {
      timeoutMs: 8_000,
      headers: {
        "x-internal-cs-signature": `sha256=${signature}`,
        "x-internal-cs-version": INTERNAL_CS_BRIDGE_VERSION,
        "idempotency-key": idempotencyKey,
      },
    })
    if (!response.ok) {
      await updateInternalCsIntegrationEvent({
        eventId,
        status: "failed",
        result: { httpStatus: response.status },
        errorMessage: "Configured internal AI webhook rejected the request",
        processedAt: new Date(),
      })
      return NextResponse.json(
        { error: "Configured internal AI webhook rejected the request", eventId },
        { status: 502 }
      )
    }

    const result = {
      httpStatus: response.status,
      messageCount: loaded.messages.length,
      assetCount: loaded.assets.length,
      originalAssetsIncluded: includeOriginalAssets,
    }
    await updateInternalCsIntegrationEvent({
      eventId,
      status: "completed",
      result,
      processedAt: new Date(),
    })
    return NextResponse.json({ ok: true, duplicate: false, eventId, result }, { status: 202 })
  } catch (error) {
    console.error(`[POST /api/admin/cs-chat/conversations/${id}/dispatch]`, error)
    if (eventId) {
      await updateInternalCsIntegrationEvent({
        eventId,
        status: "failed",
        errorMessage: "Internal CS outbound dispatch failed",
        processedAt: new Date(),
      }).catch(() => undefined)
    }
    return NextResponse.json(
      {
        error: isInternalCsChatNotReadyError(error)
          ? error.message
          : "Internal CS outbound dispatch failed",
      },
      { status: isInternalCsChatNotReadyError(error) ? 503 : 502 }
    )
  }
}

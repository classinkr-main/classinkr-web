import { NextRequest, NextResponse } from "next/server"

import {
  buildInternalCsRedactedEventPayload,
  decodeInternalCsInboundImage,
  parseInternalCsInboundPayload,
  verifyInternalCsBridgeSignature,
} from "@/lib/internal-cs-chat/bridge"
import { analyzeInternalCsImage } from "@/lib/internal-cs-chat/vision"
import {
  createInternalCsAsset,
  createInternalCsConversation,
  claimInternalCsIntegrationEvent,
  createInternalCsMessage,
  findInternalCsAssetByHash,
  getInternalCsAsset,
  getInternalCsConversation,
  getInternalCsIntegrationEventByIdempotency,
  isInternalCsChatNotReadyError,
  updateInternalCsAssetAnalysis,
  updateInternalCsIntegrationEvent,
} from "@/lib/repositories/internal-cs-chat"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { uploadInternalCsAssetBuffer } from "@/lib/storage/internal-cs-assets"

const MAX_WEBHOOK_BODY_BYTES = 12 * 1024 * 1024

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return null
}

function compactContext(loaded: NonNullable<Awaited<ReturnType<typeof getInternalCsConversation>>>, includeOriginalAssets: boolean) {
  return {
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
    policy: {
      purpose: "internal_ai_analysis",
      customerDeliveryAllowed: false,
      csOwnerReviewRequired: true,
      originalAssetsIncluded: includeOriginalAssets,
    },
  }
}

function responseForUploadError(error: { kind: string }) {
  const status = error.kind === "too_large" ? 413 : error.kind === "storage_error" ? 502 : 400
  return NextResponse.json({ error: `Image upload failed: ${error.kind}` }, { status })
}

export async function POST(req: NextRequest) {
  const secret = firstNonEmpty(process.env.INTERNAL_CS_INGEST_SECRET)
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "Internal CS bridge authentication is not configured" }, { status: 503 })
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Webhook body is too large" }, { status: 413 })
  }

  const rawBody = await req.text()
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Webhook body is too large" }, { status: 413 })
  }
  if (!verifyInternalCsBridgeSignature(
    rawBody,
    req.headers.get("x-internal-cs-signature"),
    secret
  )) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 })
  }

  const { allowed } = await checkRateLimitDistributed(
    getClientIp(req),
    "internal-cs-bridge-ingest",
    { windowMs: 60_000, max: 60 }
  )
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  let rawPayload: unknown
  try {
    rawPayload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = parseInternalCsInboundPayload(rawPayload)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const payload = parsed.value
  const actor = `integration:${payload.sourceSystem}`

  const decodedImage = payload.image ? decodeInternalCsInboundImage(payload.image) : null
  if (decodedImage && !decodedImage.ok) {
    return NextResponse.json({ error: decodedImage.error }, { status: 400 })
  }

  let eventId: string | null = null
  try {
    const duplicate = await getInternalCsIntegrationEventByIdempotency({
      direction: "inbound",
      sourceSystem: payload.sourceSystem,
      idempotencyKey: payload.idempotencyKey,
    })
    if (duplicate) {
      if (payload.eventType === "cs.context.request") {
        const loaded = await getInternalCsConversation(duplicate.conversation_id)
        if (!loaded) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
        return NextResponse.json({
          ok: true,
          duplicate: true,
          eventId: duplicate.id,
          context: compactContext(loaded, payload.includeOriginalAssets),
        })
      }
      return NextResponse.json({
        ok: true,
        duplicate: true,
        eventId: duplicate.id,
        conversationId: duplicate.conversation_id,
        result: duplicate.result,
      })
    }

    let conversationId = payload.conversationId
    if (conversationId) {
      const loaded = await getInternalCsConversation(conversationId)
      if (!loaded) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    } else {
      const conversation = await createInternalCsConversation({
        title: payload.conversation?.title ?? `AI bridge: ${payload.sourceSystem}`,
        priority: payload.conversation?.priority ?? "normal",
        tags: [...(payload.conversation?.tags ?? []), `bridge:${payload.sourceSystem}`],
        customerContext: payload.conversation?.customerContext ?? {},
        actor,
      })
      conversationId = conversation.id
    }

    const claim = await claimInternalCsIntegrationEvent({
      conversationId,
      direction: "inbound",
      transport: payload.transport,
      eventType: payload.eventType,
      sourceSystem: payload.sourceSystem,
      idempotencyKey: payload.idempotencyKey,
      correlationId: payload.correlationId,
      status: "accepted",
      payload: buildInternalCsRedactedEventPayload(payload),
      actor,
    })
    const event = claim.event
    eventId = event.id
    if (!claim.created) {
      if (payload.eventType === "cs.context.request") {
        const loaded = await getInternalCsConversation(event.conversation_id)
        if (!loaded) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
        return NextResponse.json({
          ok: true,
          duplicate: true,
          eventId,
          context: compactContext(loaded, payload.includeOriginalAssets),
        })
      }
      return NextResponse.json({
        ok: event.status === "completed",
        duplicate: true,
        eventId,
        conversationId: event.conversation_id,
        status: event.status,
        result: event.result,
      })
    }
    await updateInternalCsIntegrationEvent({ eventId, status: "processing" })

    let assetId: string | null = null
    let assetResult: Record<string, unknown> | null = null
    if (decodedImage?.ok) {
      const upload = await uploadInternalCsAssetBuffer({
        buffer: decodedImage.buffer,
        conversationId,
        fileName: decodedImage.fileName,
        mimeType: decodedImage.mimeType,
      })
      if (!upload.ok) {
        await updateInternalCsIntegrationEvent({
          eventId,
          status: "failed",
          errorMessage: "Image upload failed",
          processedAt: new Date(),
        })
        return responseForUploadError(upload.error)
      }

      const existingAsset = await findInternalCsAssetByHash(conversationId, upload.sha256)
      if (existingAsset) {
        assetId = existingAsset.id
        assetResult = { id: existingAsset.id, duplicate: true, status: existingAsset.status }
      } else {
        const asset = await createInternalCsAsset({
          conversationId,
          kind: "screenshot",
          source: payload.transport === "mcp" ? "mcp" : "webhook",
          storagePath: upload.path,
          originalFileName: upload.fileName,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          sha256: upload.sha256,
          externalRef: payload.correlationId,
          metadata: { sourceSystem: payload.sourceSystem, uploadReused: upload.reused },
          actor,
        })
        assetId = asset.id

        if (payload.image?.analyze) {
          await updateInternalCsAssetAnalysis({
            conversationId,
            assetId,
            status: "analyzing",
            actor,
          })
          const analysis = await analyzeInternalCsImage({
            bytes: decodedImage.buffer,
            mimeType: decodedImage.mimeType,
            fileName: decodedImage.fileName,
            instruction: payload.image.instruction ?? undefined,
          })
          await updateInternalCsAssetAnalysis({
            conversationId,
            assetId,
            status: analysis.origin === "model" ? "ready" : "failed",
            analysisSummary: analysis.summary,
            analysisPayload: {
              extractedText: analysis.extractedText,
              observations: analysis.observations,
              sensitiveDataWarnings: analysis.sensitiveDataWarnings,
              suggestedTags: analysis.suggestedTags,
              followUpQuestions: analysis.followUpQuestions,
              origin: analysis.origin,
              fallbackUsed: analysis.fallbackUsed,
              attemptedModels: analysis.attemptedModels,
              guardrails: analysis.guardrails,
            },
            modelProvider: analysis.model ? "google" : null,
            modelName: analysis.model,
            errorMessage: analysis.origin === "deterministic" ? "Automatic image analysis unavailable" : null,
            actor,
          })
        }
        const stored = await getInternalCsAsset(assetId, conversationId)
        assetResult = {
          id: assetId,
          duplicate: false,
          status: stored?.status ?? asset.status,
          reviewState: stored?.review_state ?? asset.review_state,
        }
      }
    }

    if (payload.eventType === "cs.context.request") {
      const loaded = await getInternalCsConversation(conversationId)
      if (!loaded) throw new Error("Conversation disappeared during context request")
      await updateInternalCsIntegrationEvent({
        eventId,
        status: "completed",
        result: {
          conversationId,
          messageCount: loaded.messages.length,
          assetCount: loaded.assets.length,
          originalAssetsIncluded: payload.includeOriginalAssets,
        },
        processedAt: new Date(),
      })
      return NextResponse.json({
        ok: true,
        duplicate: false,
        eventId,
        context: compactContext(loaded, payload.includeOriginalAssets),
      })
    }

    let messageId: string | null = null
    if (payload.content) {
      const role = payload.eventType === "cs.analysis.created"
        ? "assistant"
        : payload.eventType === "cs.observation.created"
          ? "internal_note"
          : "user"
      const message = await createInternalCsMessage({
        conversationId,
        role,
        content: payload.content,
        modelProvider: role === "assistant" ? payload.model?.provider ?? "external-ai" : null,
        modelName: role === "assistant" ? payload.model?.name ?? payload.sourceSystem : null,
        modelMode: role === "assistant" ? payload.model?.mode ?? null : null,
        metadata: {
          bridgeEventId: eventId,
          bridgeSourceSystem: payload.sourceSystem,
          bridgeTransport: payload.transport,
          customerDeliveryAllowed: false,
          csOwnerReviewRequired: role === "assistant",
        },
        actor,
      })
      messageId = message.id
    }

    const result = {
      conversationId,
      messageId,
      asset: assetResult,
      customerDeliveryAllowed: false,
      reviewRequired: payload.eventType === "cs.analysis.created" || Boolean(assetId),
    }
    await updateInternalCsIntegrationEvent({
      eventId,
      status: "completed",
      result,
      processedAt: new Date(),
    })

    return NextResponse.json({ ok: true, duplicate: false, eventId, ...result }, { status: 202 })
  } catch (error) {
    console.error("[POST /api/webhook/internal-cs]", error)
    if (eventId) {
      await updateInternalCsIntegrationEvent({
        eventId,
        status: "failed",
        errorMessage: "Internal CS bridge processing failed",
        processedAt: new Date(),
      }).catch(() => undefined)
    }
    return NextResponse.json(
      {
        error: isInternalCsChatNotReadyError(error)
          ? error.message
          : "Internal CS bridge processing failed",
      },
      { status: isInternalCsChatNotReadyError(error) ? 503 : 500 }
    )
  }
}

import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  analyzeInternalCsImage,
  type InternalCsVisionMimeType,
} from "@/lib/internal-cs-chat/vision"
import {
  createInternalCsAsset,
  findInternalCsAssetByHash,
  getInternalCsAsset,
  getInternalCsConversation,
  isInternalCsChatNotReadyError,
  updateInternalCsAssetAnalysis,
} from "@/lib/repositories/internal-cs-chat"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import {
  INTERNAL_CS_ASSET_MAX_BYTES,
  uploadInternalCsAsset,
} from "@/lib/storage/internal-cs-assets"

type Context = { params: Promise<{ id: string }> }

const MAX_MULTIPART_BYTES = INTERNAL_CS_ASSET_MAX_BYTES + 512 * 1024
const REQUESTED_MODES = new Set(["auto", "fast", "deep"])

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function uploadErrorResponse(error: { kind: string; maxBytes?: number; message?: string }) {
  if (error.kind === "too_large") {
    return NextResponse.json(
      { error: `image must be ${error.maxBytes ?? INTERNAL_CS_ASSET_MAX_BYTES} bytes or fewer` },
      { status: 413 }
    )
  }
  if (error.kind === "storage_error") {
    console.error("[internal-cs asset upload]", error.message)
    return NextResponse.json({ error: "Failed to store image" }, { status: 502 })
  }
  if (error.kind === "bad_conversation_id") {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 })
  }
  return NextResponse.json(
    { error: "file must be a valid JPEG, PNG, or WebP image" },
    { status: 400 }
  )
}

function errorStatus(error: unknown) {
  return isInternalCsChatNotReadyError(error) ? 503 : 500
}

export async function POST(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { allowed } = await checkRateLimitDistributed(
    getClientIp(req),
    "admin-internal-cs-asset-upload",
    { windowMs: 60_000, max: 20 }
  )
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const contentLength = Number(req.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    return NextResponse.json({ error: "Upload is too large" }, { status: 413 })
  }

  const { id } = await context.params
  const actor = actorName(admin)

  try {
    const loaded = await getInternalCsConversation(id)
    if (!loaded) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })

    const formData = await req.formData().catch(() => null)
    if (!formData) return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 })
    const fileValue = formData.get("file")
    const file = fileValue instanceof File ? fileValue : null
    if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 })

    const instructionValue = formData.get("instruction")
    const instruction = typeof instructionValue === "string" ? instructionValue.trim().slice(0, 2_000) : ""
    const requestedModeValue = formData.get("requestedMode")
    const requestedMode = typeof requestedModeValue === "string" && requestedModeValue
      ? requestedModeValue
      : "auto"
    if (!REQUESTED_MODES.has(requestedMode)) {
      return NextResponse.json(
        { error: "requestedMode must be auto, fast, or deep" },
        { status: 400 }
      )
    }

    const upload = await uploadInternalCsAsset(file, { conversationId: id })
    if (!upload.ok) return uploadErrorResponse(upload.error)

    const duplicate = await findInternalCsAssetByHash(id, upload.sha256)
    if (duplicate) {
      const asset = await getInternalCsAsset(duplicate.id, id)
      return NextResponse.json({ asset: asset ?? duplicate, duplicate: true }, { status: 200 })
    }

    const asset = await createInternalCsAsset({
      conversationId: id,
      kind: "screenshot",
      source: "admin_upload",
      storagePath: upload.path,
      originalFileName: upload.fileName,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      sha256: upload.sha256,
      metadata: { uploadReused: upload.reused },
      actor,
    })
    await updateInternalCsAssetAnalysis({
      conversationId: id,
      assetId: asset.id,
      status: "analyzing",
      actor,
    })

    const bytes = new Uint8Array(await file.arrayBuffer())
    const analysis = await analyzeInternalCsImage({
      bytes,
      mimeType: upload.mimeType as InternalCsVisionMimeType,
      fileName: upload.fileName,
      instruction,
      requestedMode: requestedMode as "auto" | "fast" | "deep",
    })
    const updated = await updateInternalCsAssetAnalysis({
      conversationId: id,
      assetId: asset.id,
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
    const responseAsset = await getInternalCsAsset(updated?.id ?? asset.id, id)

    return NextResponse.json(
      {
        asset: responseAsset ?? updated ?? asset,
        analysis,
        duplicate: false,
        customerDeliveryAllowed: false,
        reviewRequired: true,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error(`[POST /api/admin/cs-chat/conversations/${id}/assets]`, error)
    return NextResponse.json(
      {
        error: isInternalCsChatNotReadyError(error)
          ? error.message
          : "Failed to store and analyze image",
      },
      { status: errorStatus(error) }
    )
  }
}

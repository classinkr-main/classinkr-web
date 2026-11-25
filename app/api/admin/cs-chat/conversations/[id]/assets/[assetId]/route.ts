import { NextRequest, NextResponse } from "next/server"

import {
  CS_ASSET_DELETE_CAPABILITY,
  CS_COPILOT_API_ROLES,
  requireCsCopilotCapability,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import {
  isInternalCsChatNotReadyError,
  purgeInternalCsAssetObject,
  reviewInternalCsAsset,
} from "@/lib/repositories/internal-cs-chat"

type Context = { params: Promise<{ id: string; assetId: string }> }

const DECISIONS = new Set(["approved", "changes_requested", "rejected"])

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

export async function PATCH(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CS_COPILOT_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  if (typeof raw.decision !== "string" || !DECISIONS.has(raw.decision)) {
    return NextResponse.json(
      { error: "decision must be approved, changes_requested, or rejected" },
      { status: 400 }
    )
  }
  if (raw.reviewNote !== undefined && raw.reviewNote !== null && typeof raw.reviewNote !== "string") {
    return NextResponse.json({ error: "reviewNote must be a string" }, { status: 400 })
  }
  if (
    raw.correctedAnalysis !== undefined &&
    raw.correctedAnalysis !== null &&
    typeof raw.correctedAnalysis !== "string"
  ) {
    return NextResponse.json({ error: "correctedAnalysis must be a string" }, { status: 400 })
  }
  const reviewNote = typeof raw.reviewNote === "string" ? raw.reviewNote.trim() : ""
  const correctedAnalysis = typeof raw.correctedAnalysis === "string"
    ? raw.correctedAnalysis.trim()
    : ""
  if (reviewNote.length > 2_000) {
    return NextResponse.json({ error: "reviewNote must be 2000 characters or fewer" }, { status: 400 })
  }
  if (correctedAnalysis.length > 8_000) {
    return NextResponse.json(
      { error: "correctedAnalysis must be 8000 characters or fewer" },
      { status: 400 }
    )
  }

  const { id, assetId } = await context.params
  try {
    const asset = await reviewInternalCsAsset({
      conversationId: id,
      assetId,
      decision: raw.decision as "approved" | "changes_requested" | "rejected",
      reviewNote: reviewNote || null,
      correctedAnalysis: correctedAnalysis || null,
      actor: actorName(admin),
    })
    if (!asset) return NextResponse.json({ error: "Reviewable asset not found" }, { status: 404 })
    return NextResponse.json({
      asset,
      customerDeliveryAllowed: false,
      reviewedByCsOwner: true,
    })
  } catch (error) {
    console.error(`[PATCH /api/admin/cs-chat/conversations/${id}/assets/${assetId}]`, error)
    return NextResponse.json(
      {
        error: isInternalCsChatNotReadyError(error)
          ? error.message
          : "Failed to review image analysis",
      },
      { status: isInternalCsChatNotReadyError(error) ? 503 : 500 }
    )
  }
}

// 첨부 원본 삭제. 객체를 지우고 행에는 지운 시각만 남긴다(파일 이름·OCR 추출문은 비운다). 되돌릴 수 없다.
export async function DELETE(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CS_COPILOT_API_ROLES)
  if (admin instanceof NextResponse) return admin
  // 되돌릴 수 없는 동작 — capability 가 필요하다(기본 부여 역할은 lib/admin-auth.ts, 지금은 코파일럿 역할 전체).
  const capabilityError = requireCsCopilotCapability(admin, CS_ASSET_DELETE_CAPABILITY)
  if (capabilityError) return capabilityError

  const { id, assetId } = await context.params
  try {
    const asset = await purgeInternalCsAssetObject({
      assetId,
      conversationId: id,
      actor: actorName(admin),
      reason: "admin_delete",
    })
    if (!asset) return NextResponse.json({ error: "Asset not found or already deleted" }, { status: 404 })
    return NextResponse.json({ asset, deleted: true })
  } catch (error) {
    console.error(`[DELETE /api/admin/cs-chat/conversations/${id}/assets/${assetId}]`, error)
    return NextResponse.json(
      {
        error: isInternalCsChatNotReadyError(error)
          ? error.message
          : "Failed to delete the asset",
      },
      { status: isInternalCsChatNotReadyError(error) ? 503 : 500 }
    )
  }
}

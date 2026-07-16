import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  isInternalCsChatNotReadyError,
  reviewInternalCsAsset,
} from "@/lib/repositories/internal-cs-chat"

type Context = { params: Promise<{ id: string; assetId: string }> }

const DECISIONS = new Set(["approved", "changes_requested", "rejected"])

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

export async function PATCH(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
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

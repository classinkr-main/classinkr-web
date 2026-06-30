import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { isCaptureActivityType } from "@/lib/crm/capture/activity-types"
import { createCaptureBatch } from "@/lib/crm/capture/repository"
import type { CrmCaptureSourceType } from "@/lib/supabase/database.types"

export const dynamic = "force-dynamic"

const SOURCE_TYPES = new Set<string>(["pasted_table", "pasted_text", "public_event", "single"])

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const raw = body as Record<string, unknown>
    const sourceType = typeof raw.sourceType === "string" && SOURCE_TYPES.has(raw.sourceType) ? (raw.sourceType as CrmCaptureSourceType) : null
    if (!sourceType) return NextResponse.json({ error: "Invalid sourceType" }, { status: 400 })

    const defaultActivityType = isCaptureActivityType(raw.defaultActivityType) ? raw.defaultActivityType : "memo"
    const defaultTaskEnabled = raw.defaultTaskEnabled !== false
    const offset = Number(raw.defaultTaskOffsetDays ?? 1)
    const defaultTaskOffsetDays = Number.isFinite(offset) ? Math.max(0, Math.min(Math.floor(offset), 60)) : 1

    const publicEventId =
      typeof raw.publicEventId === "string" && raw.publicEventId.trim() ? raw.publicEventId.trim() : null

    const batch = await createCaptureBatch({
      sourceType,
      sourceLabel: typeof raw.sourceLabel === "string" ? raw.sourceLabel : null,
      publicEventId,
      defaultActivityType,
      defaultTaskEnabled,
      defaultTaskOffsetDays,
      createdBy: adminActorName(admin),
    })
    return NextResponse.json({ batch }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/admin/crm/capture/batches]", error)
    return NextResponse.json({ error: "Failed to create capture batch" }, { status: 500 })
  }
}

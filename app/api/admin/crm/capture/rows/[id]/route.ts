import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { isCaptureActivityType } from "@/lib/crm/capture/activity-types"
import { updateCaptureRow } from "@/lib/crm/capture/repository"
import type { CrmCaptureRowUpdate } from "@/lib/supabase/database.types"

export const dynamic = "force-dynamic"

const MATCH_STATUSES = new Set<string>([
  "confirmed_customer",
  "confirmed_lead",
  "multiple_candidates",
  "new_lead_candidate",
  "needs_review",
  "duplicate_in_batch",
])
const TARGET_TYPES = new Set<string>(["lead", "neo_account", "customer", "deal"])
const ATTENDEE_ORIGINS = new Set<string>([
  "ad_lead",
  "site_lead",
  "kr_team_lead",
  "new_lead",
  "existing_customer",
  "partner_customer",
  "unknown",
])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const raw = body as Record<string, unknown>
    const patch: CrmCaptureRowUpdate = {}

    if (typeof raw.selected === "boolean") patch.selected = raw.selected
    if (typeof raw.createTask === "boolean") patch.create_task = raw.createTask
    if (typeof raw.memo === "string") patch.memo = raw.memo.trim() || null
    if (typeof raw.organizationName === "string") patch.organization_name = raw.organizationName.trim() || null
    if (typeof raw.contactName === "string") patch.contact_name = raw.contactName.trim() || null
    if (raw.activityType !== undefined) {
      if (!isCaptureActivityType(raw.activityType)) return NextResponse.json({ error: "Invalid activityType" }, { status: 400 })
      patch.activity_type = raw.activityType
    }
    if (raw.taskDueAt !== undefined) {
      if (raw.taskDueAt === null) patch.task_due_at = null
      else if (typeof raw.taskDueAt === "string" && !Number.isNaN(new Date(raw.taskDueAt).getTime())) {
        patch.task_due_at = new Date(raw.taskDueAt).toISOString()
      } else {
        return NextResponse.json({ error: "Invalid taskDueAt" }, { status: 400 })
      }
    }
    if (raw.matchStatus !== undefined) {
      if (typeof raw.matchStatus !== "string" || !MATCH_STATUSES.has(raw.matchStatus)) {
        return NextResponse.json({ error: "Invalid matchStatus" }, { status: 400 })
      }
      patch.match_status = raw.matchStatus as CrmCaptureRowUpdate["match_status"]
    }
    if (raw.matchedTargetType !== undefined) {
      if (raw.matchedTargetType === null) patch.matched_target_type = null
      else if (typeof raw.matchedTargetType === "string" && TARGET_TYPES.has(raw.matchedTargetType)) {
        patch.matched_target_type = raw.matchedTargetType as CrmCaptureRowUpdate["matched_target_type"]
      } else {
        return NextResponse.json({ error: "Invalid matchedTargetType" }, { status: 400 })
      }
    }
    if (raw.matchedTargetId !== undefined) patch.matched_target_id = typeof raw.matchedTargetId === "string" ? raw.matchedTargetId : null
    if (raw.matchedTargetLabel !== undefined) patch.matched_target_label = typeof raw.matchedTargetLabel === "string" ? raw.matchedTargetLabel : null
    if (raw.attendeeOrigin !== undefined) {
      if (raw.attendeeOrigin === null) patch.attendee_origin = null
      else if (typeof raw.attendeeOrigin === "string" && ATTENDEE_ORIGINS.has(raw.attendeeOrigin)) {
        patch.attendee_origin = raw.attendeeOrigin as CrmCaptureRowUpdate["attendee_origin"]
      } else {
        return NextResponse.json({ error: "Invalid attendeeOrigin" }, { status: 400 })
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    const row = await updateCaptureRow(id, patch)
    if (!row) return NextResponse.json({ error: "Row not found" }, { status: 404 })
    return NextResponse.json({ row })
  } catch (error) {
    console.error(`[PATCH /api/admin/crm/capture/rows/${id}]`, error)
    return NextResponse.json({ error: "Failed to update capture row" }, { status: 500 })
  }
}

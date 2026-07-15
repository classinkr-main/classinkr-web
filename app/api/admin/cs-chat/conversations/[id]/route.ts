import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  cleanInternalCsTags,
  getInternalCsConversation,
  INTERNAL_CS_PRIORITIES,
  INTERNAL_CS_STATUSES,
  isInternalCsChatNotReadyError,
  updateInternalCsConversation,
  type InternalCsPriority,
  type InternalCsStatus,
} from "@/lib/repositories/internal-cs-chat"

type Context = { params: Promise<{ id: string }> }
const STATUS_SET = new Set<string>(INTERNAL_CS_STATUSES)
const PRIORITY_SET = new Set<string>(INTERNAL_CS_PRIORITIES)

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null
}

function stringList(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null
}

function errorResponse(error: unknown, fallback: string) {
  if (isInternalCsChatNotReadyError(error)) {
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await context.params
  try {
    const result = await getInternalCsConversation(id)
    if (!result) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (error) {
    console.error(`[GET /api/admin/cs-chat/conversations/${id}]`, error)
    return errorResponse(error, "Failed to load internal CS conversation")
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const raw = body as Record<string, unknown>
  const action = typeof raw.action === "string" ? raw.action : "update"
  const actor = actorName(admin)
  const now = new Date().toISOString()
  let patch: Record<string, unknown>

  switch (action) {
    case "assign":
      patch = {
        assignee_user_id: raw.assignToMe === true ? admin.userId ?? actor : optionalString(raw.assigneeUserId),
        assignee_name: raw.assignToMe === true ? admin.name ?? actor : optionalString(raw.assigneeName),
        status: "active",
        updated_by: actor,
      }
      break
    case "set_status": {
      if (typeof raw.status !== "string" || !STATUS_SET.has(raw.status)) {
        return NextResponse.json({ error: "Invalid conversation status" }, { status: 400 })
      }
      const status = raw.status as InternalCsStatus
      patch = {
        status,
        updated_by: actor,
        ...(status === "resolved" ? { resolved_at: now, resolved_by: actor } : {}),
        ...(status === "archived" ? { archived_at: now, archived_by: actor } : {}),
      }
      break
    }
    case "archive":
      patch = {
        status: "archived",
        archived_at: now,
        archived_by: actor,
        archive_reason: optionalString(raw.archiveReason),
        updated_by: actor,
      }
      break
    case "reopen":
      patch = {
        status: "queue",
        resolved_at: null,
        resolved_by: null,
        archived_at: null,
        archived_by: null,
        archive_reason: null,
        updated_by: actor,
      }
      break
    case "update": {
      patch = { updated_by: actor }
      if (raw.title !== undefined) patch.title = optionalString(raw.title) ?? "새 내부 CS 상담"
      if (typeof raw.priority === "string") {
        if (!PRIORITY_SET.has(raw.priority)) {
          return NextResponse.json({ error: "Invalid conversation priority" }, { status: 400 })
        }
        patch.priority = raw.priority as InternalCsPriority
      }
      if (raw.tags !== undefined) {
        const tags = stringList(raw.tags)
        if (!tags) return NextResponse.json({ error: "tags must be a string array" }, { status: 400 })
        patch.tags = cleanInternalCsTags(tags)
      }
      if (raw.customerContext !== undefined) {
        if (!raw.customerContext || typeof raw.customerContext !== "object" || Array.isArray(raw.customerContext)) {
          return NextResponse.json({ error: "customerContext must be an object" }, { status: 400 })
        }
        patch.customer_context = raw.customerContext
      }
      break
    }
    default:
      return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 })
  }

  try {
    const conversation = await updateInternalCsConversation(id, patch)
    if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    return NextResponse.json({ conversation })
  } catch (error) {
    console.error(`[PATCH /api/admin/cs-chat/conversations/${id}]`, error)
    return errorResponse(error, "Failed to update internal CS conversation")
  }
}

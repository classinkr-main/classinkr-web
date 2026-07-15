import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  createInternalCsConversation,
  createInternalCsMessage,
  INTERNAL_CS_PRIORITIES,
  INTERNAL_CS_STATUSES,
  isInternalCsChatNotReadyError,
  listInternalCsConversations,
  type InternalCsPriority,
  type InternalCsStatus,
} from "@/lib/repositories/internal-cs-chat"

const STATUS_SET = new Set<string>(INTERNAL_CS_STATUSES)
const PRIORITY_SET = new Set<string>(INTERNAL_CS_PRIORITIES)

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null
}

function stringList(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function boundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

function errorResponse(error: unknown, fallback: string) {
  if (isInternalCsChatNotReadyError(error)) {
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const rawStatus = req.nextUrl.searchParams.get("status")
    const status = rawStatus === "all" || (rawStatus && STATUS_SET.has(rawStatus))
      ? (rawStatus as InternalCsStatus | "all")
      : "all"
    const result = await listInternalCsConversations({
      status,
      assigneeUserId: req.nextUrl.searchParams.get("assigneeUserId") ?? undefined,
      q: req.nextUrl.searchParams.get("q") ?? undefined,
      limit: boundedInt(req.nextUrl.searchParams.get("limit"), 50, 1, 200),
      offset: boundedInt(req.nextUrl.searchParams.get("offset"), 0, 0, 100_000),
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[GET /api/admin/cs-chat/conversations]", error)
    return errorResponse(error, "Failed to load internal CS conversations")
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const raw = body as Record<string, unknown>
  const priority = typeof raw.priority === "string" && PRIORITY_SET.has(raw.priority)
    ? (raw.priority as InternalCsPriority)
    : "normal"
  const customerContext = raw.customerContext === undefined ? {} : record(raw.customerContext)
  if (!customerContext) {
    return NextResponse.json({ error: "customerContext must be an object" }, { status: 400 })
  }
  const actor = actorName(admin)

  try {
    const conversation = await createInternalCsConversation({
      title: optionalString(raw.title),
      priority,
      assigneeUserId: optionalString(raw.assigneeUserId),
      assigneeName: optionalString(raw.assigneeName),
      tags: stringList(raw.tags),
      customerContext,
      actor,
    })

    const initialMessage = optionalString(raw.initialMessage)
    const message = initialMessage
      ? await createInternalCsMessage({
          conversationId: conversation.id,
          role: "user",
          content: initialMessage,
          actor,
        })
      : null
    return NextResponse.json({ conversation, message }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/admin/cs-chat/conversations]", error)
    return errorResponse(error, "Failed to create internal CS conversation")
  }
}

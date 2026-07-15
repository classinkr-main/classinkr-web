import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  createInternalCsMessage,
  INTERNAL_CS_MESSAGE_ROLES,
  isInternalCsChatNotReadyError,
  type InternalCsMessageRole,
} from "@/lib/repositories/internal-cs-chat"

type Context = { params: Promise<{ id: string }> }
const ROLE_SET = new Set<string>(INTERNAL_CS_MESSAGE_ROLES)
const MODEL_MODES = new Set(["fast", "deep", "backup"])

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null
}

export async function POST(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  const content = optionalString(raw.content)
  if (!content) return NextResponse.json({ error: "Message content is required" }, { status: 400 })
  if (typeof raw.role !== "string" || !ROLE_SET.has(raw.role)) {
    return NextResponse.json({ error: "Invalid message role" }, { status: 400 })
  }
  if (raw.sourceRefs !== undefined && !Array.isArray(raw.sourceRefs)) {
    return NextResponse.json({ error: "sourceRefs must be an array" }, { status: 400 })
  }
  if (raw.metadata !== undefined && (!raw.metadata || typeof raw.metadata !== "object" || Array.isArray(raw.metadata))) {
    return NextResponse.json({ error: "metadata must be an object" }, { status: 400 })
  }
  if (raw.modelMode !== undefined && (typeof raw.modelMode !== "string" || !MODEL_MODES.has(raw.modelMode))) {
    return NextResponse.json({ error: "Invalid modelMode" }, { status: 400 })
  }

  try {
    const message = await createInternalCsMessage({
      conversationId: id,
      role: raw.role as InternalCsMessageRole,
      content,
      modelProvider: optionalString(raw.modelProvider),
      modelName: optionalString(raw.modelName),
      modelMode: raw.modelMode as "fast" | "deep" | "backup" | undefined,
      sourceRefs: Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [],
      metadata: raw.metadata as Record<string, unknown> | undefined,
      actor: actorName(admin),
    })
    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error(`[POST /api/admin/cs-chat/conversations/${id}/messages]`, error)
    if (isInternalCsChatNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to create internal CS message" }, { status: 500 })
  }
}

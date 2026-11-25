import { NextRequest, NextResponse } from "next/server"

import { CS_COPILOT_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  createInternalCsMessage,
  isInternalCsChatNotReadyError,
} from "@/lib/repositories/internal-cs-chat"

type Context = { params: Promise<{ id: string }> }
// 사람이 직접 남기는 메시지만 받는다. assistant·system 은 서버(generate·브리지)만 만든다 —
// 모델 이름·출처·메타데이터로 AI 답변처럼 위장하거나 승격 확신도를 정하지 못하게 한다.
const CLIENT_MESSAGE_ROLES = new Set(["user", "internal_note"])
// metadata.kind 허용 목록: hq_reply(본사 회신 기록), observation(담당자 관찰 메모).
const CLIENT_METADATA_KINDS = new Set(["hq_reply", "observation"])

function actorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null
}

export async function POST(req: NextRequest, context: Context) {
  const admin = await requireVerifiedAdminContext(req, CS_COPILOT_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  const content = optionalString(raw.content)
  if (!content) return NextResponse.json({ error: "Message content is required" }, { status: 400 })
  if (typeof raw.role !== "string" || !CLIENT_MESSAGE_ROLES.has(raw.role)) {
    return NextResponse.json({ error: "role must be user or internal_note" }, { status: 400 })
  }
  if (raw.model !== undefined || raw.modelProvider !== undefined || raw.modelName !== undefined || raw.modelMode !== undefined) {
    return NextResponse.json({ error: "model fields are not accepted" }, { status: 400 })
  }
  if (raw.sourceRefs !== undefined) {
    return NextResponse.json({ error: "sourceRefs is not accepted" }, { status: 400 })
  }
  let metadata: Record<string, unknown> | undefined
  if (raw.metadata !== undefined) {
    if (!raw.metadata || typeof raw.metadata !== "object" || Array.isArray(raw.metadata)) {
      return NextResponse.json({ error: "metadata must be an object" }, { status: 400 })
    }
    const kind = (raw.metadata as Record<string, unknown>).kind
    if (kind !== undefined && (typeof kind !== "string" || !CLIENT_METADATA_KINDS.has(kind))) {
      return NextResponse.json({ error: "metadata.kind must be hq_reply or observation" }, { status: 400 })
    }
    // kind 외의 키는 버린다(승격 확신도·브리지 표시 같은 서버 전용 값을 실어 보낼 수 없다).
    metadata = typeof kind === "string" ? { kind } : undefined
  }

  try {
    const message = await createInternalCsMessage({
      conversationId: id,
      role: raw.role as "user" | "internal_note",
      content,
      metadata,
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

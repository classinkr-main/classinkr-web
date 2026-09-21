import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { findAdminCrmOwner, listAdminUserDirectory } from "@/lib/repositories/admin-users"
import {
  cancelCrmTask,
  completeCrmTask,
  getCrmTaskById,
  isCrmTasksNotReadyError,
  reassignCrmTask,
  reopenCrmTask,
  snoozeCrmTask,
  updateCrmTask,
  type CrmTaskRecord,
} from "@/lib/repositories/crm-tasks"

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

type DueAtPatch = { ok: true; dueAt: string | null | undefined } | { ok: false; error: string }

/**
 * update 액션의 dueAt 3상태 — 키 없음 = 기한 그대로, null = 기한 지움, 날짜 문자열 = 그 시각으로 설정.
 * 빈 문자열도 지움으로 받는다(기존 동작 — 비운 날짜 입력칸이 ""를 보낸다).
 * 이전엔 optionalString이 null을 undefined(=그대로)로 버려 기한 없던 할 일의 '내일로' 되돌리기가
 * 기한을 지우지 못했고, 반대로 파싱 안 되는 문자열은 저장소 nullableIso가 null로 바꿔 기한을
 * 조용히 지웠다. 이제 둘 다 명시적으로 갈라, 해석 못 하는 값은 400으로 거절한다.
 */
function parseDueAtPatch(raw: Record<string, unknown>): DueAtPatch {
  const value = raw.dueAt
  if (value === undefined) return { ok: true, dueAt: undefined }
  if (value === null) return { ok: true, dueAt: null }
  if (typeof value !== "string") return { ok: false, error: "dueAt must be a date string or null" }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, dueAt: null }
  const time = new Date(trimmed).getTime()
  if (Number.isNaN(time)) return { ok: false, error: "Invalid dueAt" }
  return { ok: true, dueAt: new Date(time).toISOString() }
}

function notReadyResponse(error: unknown) {
  if (isCrmTasksNotReadyError(error)) {
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const actor = adminActorName(admin)
  const { id } = await params

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const raw = body as Record<string, unknown>
    const action = typeof raw.action === "string" ? raw.action : "update"

    let task: CrmTaskRecord | null = null
    switch (action) {
      case "complete":
        task = await completeCrmTask(id, { outcome: optionalString(raw.outcome), completedBy: actor })
        break
      case "snooze":
        task = await snoozeCrmTask(id, { snoozedUntil: optionalString(raw.snoozedUntil), assignedBy: actor })
        break
      case "reopen":
        task = await reopenCrmTask(id)
        break
      case "cancel":
        task = await cancelCrmTask(id, { outcome: optionalString(raw.outcome), completedBy: actor })
        break
      case "reassign": {
        let ownerKey = optionalString(raw.ownerKey) ?? null
        let ownerNameSnapshot = optionalString(raw.ownerNameSnapshot) ?? null
        if (raw.assignToMe === true) {
          const currentOwner = findAdminCrmOwner(await listAdminUserDirectory(), admin)
          ownerKey = currentOwner.owner?.ownerKey ?? currentOwner.ownerKeys[0] ?? ownerKey
          ownerNameSnapshot = currentOwner.owner?.displayName ?? admin.name ?? ownerNameSnapshot
        }
        task = await reassignCrmTask(id, { ownerKey, ownerNameSnapshot, assignedBy: actor })
        break
      }
      case "update": {
        const due = parseDueAtPatch(raw)
        if (!due.ok) return NextResponse.json({ error: due.error }, { status: 400 })
        task = await updateCrmTask(id, {
          title: optionalString(raw.title),
          detail: optionalString(raw.detail),
          dueAt: due.dueAt,
          priority: optionalString(raw.priority) as CrmTaskRecord["priority"] | undefined,
          taskType: optionalString(raw.taskType) as CrmTaskRecord["taskType"] | undefined,
          targetLabel: optionalString(raw.targetLabel),
        })
        break
      }
      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 })
    }

    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 })
    return NextResponse.json({ task })
  } catch (error) {
    console.error(`[PATCH /api/admin/crm/tasks/${id}]`, error)
    return notReadyResponse(error) ?? NextResponse.json({ error: "Failed to update CRM task" }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  try {
    const task = await getCrmTaskById(id)
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 })
    return NextResponse.json({ task })
  } catch (error) {
    console.error(`[GET /api/admin/crm/tasks/${id}]`, error)
    return notReadyResponse(error) ?? NextResponse.json({ error: "Failed to load CRM task" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const actor = adminActorName(admin)

  try {
    // Keep DELETE for existing clients, but make it reversible. A canceled
    // task can be restored through PATCH { action: "reopen" }.
    const task = await cancelCrmTask(id, {
      outcome: "사용자 삭제 요청으로 보관됨",
      completedBy: actor,
    })
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 })
    return NextResponse.json({ ok: true, recoverable: true, task })
  } catch (error) {
    console.error(`[DELETE /api/admin/crm/tasks/${id}]`, error)
    return notReadyResponse(error) ?? NextResponse.json({ error: "Failed to delete CRM task" }, { status: 500 })
  }
}

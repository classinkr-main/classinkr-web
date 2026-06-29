import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { findAdminCrmOwner, listAdminUserDirectory } from "@/lib/repositories/admin-users"
import {
  cancelCrmTask,
  completeCrmTask,
  deleteCrmTask,
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
      case "update":
        task = await updateCrmTask(id, {
          title: optionalString(raw.title),
          detail: optionalString(raw.detail),
          dueAt: optionalString(raw.dueAt),
          priority: optionalString(raw.priority) as CrmTaskRecord["priority"] | undefined,
          taskType: optionalString(raw.taskType) as CrmTaskRecord["taskType"] | undefined,
          targetLabel: optionalString(raw.targetLabel),
        })
        break
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

  try {
    const deleted = await deleteCrmTask(id)
    if (!deleted) return NextResponse.json({ error: "Task not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(`[DELETE /api/admin/crm/tasks/${id}]`, error)
    return notReadyResponse(error) ?? NextResponse.json({ error: "Failed to delete CRM task" }, { status: 500 })
  }
}

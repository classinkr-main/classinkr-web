import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  CURRENT_ADMIN_OWNER_TOKEN,
  findAdminCrmOwner,
  listAdminUserDirectory,
} from "@/lib/repositories/admin-users"
import {
  CRM_TASK_PRIORITIES,
  CRM_TASK_STATUSES,
  CRM_TASK_TARGET_TYPES,
  CRM_TASK_TYPES,
  createCrmTask,
  isCrmTasksNotReadyError,
  listCrmTasks,
  type CrmTaskPriority,
  type CrmTaskStatus,
  type CrmTaskTargetType,
  type CrmTaskType,
} from "@/lib/repositories/crm-tasks"

const TARGET_TYPES = new Set<string>(CRM_TASK_TARGET_TYPES)
const TASK_TYPES = new Set<string>(CRM_TASK_TYPES)
const PRIORITIES = new Set<string>(CRM_TASK_PRIORITIES)
const STATUSES = new Set<string>(CRM_TASK_STATUSES)

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function optionalString(value: unknown) {
  if (value == null) return undefined
  return typeof value === "string" ? value : null
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const ownerParam = url.searchParams.get("owner") ?? undefined
    const isMine = ownerParam === CURRENT_ADMIN_OWNER_TOKEN
    const currentOwner = isMine ? findAdminCrmOwner(await listAdminUserDirectory(), admin) : null
    const ownerKeys = isMine
      ? currentOwner?.ownerKeys.length
        ? currentOwner.ownerKeys
        : ["__no_current_admin_owner__"]
      : ownerParam
        ? [ownerParam]
        : undefined

    const status = url.searchParams.get("status")
    const taskType = url.searchParams.get("taskType")
    const targetType = url.searchParams.get("targetType")

    const tasks = await listCrmTasks({
      q: url.searchParams.get("q") ?? undefined,
      status:
        status === "active" || status === "all"
          ? status
          : status && STATUSES.has(status)
            ? (status as CrmTaskStatus)
            : "active",
      ownerKeys,
      taskType: taskType && TASK_TYPES.has(taskType) ? (taskType as CrmTaskType) : "all",
      targetType: targetType && TARGET_TYPES.has(targetType) ? (targetType as CrmTaskTargetType) : "all",
      targetId: url.searchParams.get("targetId") ?? undefined,
      dueBefore: url.searchParams.get("dueBefore") ?? undefined,
      limit: parseBoundedInt(url.searchParams.get("limit"), 50, 1, 200),
      offset: parseBoundedInt(url.searchParams.get("offset"), 0, 0, 100_000),
    })
    return adminCachedJson(tasks)
  } catch (error) {
    console.error("[GET /api/admin/crm/tasks]", error)
    return NextResponse.json({ error: "Failed to load CRM tasks" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const actor = adminActorName(admin)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    const title = typeof raw.title === "string" ? raw.title.trim() : ""
    if (!title) {
      return NextResponse.json({ error: "할 일 제목은 필수입니다." }, { status: 400 })
    }

    let ownerKey = optionalString(raw.ownerKey)
    let ownerNameSnapshot = optionalString(raw.ownerNameSnapshot)
    if (raw.assignToMe === true) {
      const currentOwner = findAdminCrmOwner(await listAdminUserDirectory(), admin)
      ownerKey = currentOwner.owner?.ownerKey ?? currentOwner.ownerKeys[0] ?? ownerKey ?? null
      ownerNameSnapshot = currentOwner.owner?.displayName ?? ownerNameSnapshot ?? admin.name ?? null
    }

    const targetTypeRaw = typeof raw.targetType === "string" ? raw.targetType : undefined
    const taskTypeRaw = typeof raw.taskType === "string" ? raw.taskType : undefined
    const priorityRaw = typeof raw.priority === "string" ? raw.priority : undefined

    const task = await createCrmTask({
      targetType:
        targetTypeRaw && TARGET_TYPES.has(targetTypeRaw) ? (targetTypeRaw as CrmTaskTargetType) : "unknown",
      targetId: optionalString(raw.targetId),
      targetLabel: optionalString(raw.targetLabel),
      ownerKey: ownerKey ?? undefined,
      ownerNameSnapshot: ownerNameSnapshot ?? undefined,
      taskType: taskTypeRaw && TASK_TYPES.has(taskTypeRaw) ? (taskTypeRaw as CrmTaskType) : "call",
      title,
      detail: optionalString(raw.detail),
      dueAt: optionalString(raw.dueAt),
      priority: priorityRaw && PRIORITIES.has(priorityRaw) ? (priorityRaw as CrmTaskPriority) : "normal",
      sourceEventId: optionalString(raw.sourceEventId),
      createdBy: actor,
      assignedBy: actor,
    })

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/admin/crm/tasks]", error)
    if (isCrmTasksNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to create CRM task" }, { status: 500 })
  }
}

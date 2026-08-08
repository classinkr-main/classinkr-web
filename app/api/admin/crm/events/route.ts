import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  CRM_EVENT_SENTIMENTS,
  CRM_EVENT_SOURCE_TYPES,
  CRM_EVENT_TARGET_TYPES,
  CRM_WORK_ACTIVITY_SOURCE_TYPES,
  createCrmCustomerEvent,
  listCrmCustomerEvents,
  parseLooseList,
  type CrmCustomerEventSentiment,
  type CrmCustomerEventSourceType,
  type CrmCustomerEventTargetType,
  type CrmEventNextAction,
} from "@/lib/repositories/crm-events"
import { createTasksFromEventNextActions } from "@/lib/repositories/crm-tasks"
import { uploadCrmRecording } from "@/lib/storage/crm-recordings"

type CreatedCrmEvent = Awaited<ReturnType<typeof createCrmCustomerEvent>>

// 기록 저장 후 열린 다음 액션을 crm_tasks로 자동 승격한다(§7.2).
// task 생성 실패가 기록 저장 자체를 깨뜨리면 안 되므로 fail-soft.
async function respondWithCreatedEvent(event: CreatedCrmEvent, createdBy: string) {
  let tasksCreated = 0
  try {
    const tasks = await createTasksFromEventNextActions(event, { createdBy })
    tasksCreated = tasks.length
  } catch (error) {
    console.error("[POST /api/admin/crm/events] auto-task creation", error)
  }
  return NextResponse.json({ event, tasksCreated }, { status: 201 })
}

const SOURCE_TYPES = new Set<string>(CRM_EVENT_SOURCE_TYPES)
const TARGET_TYPES = new Set<string>(CRM_EVENT_TARGET_TYPES)
const SENTIMENTS = new Set<string>(CRM_EVENT_SENTIMENTS)

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

function parseTargetType(value: unknown): CrmCustomerEventTargetType {
  return typeof value === "string" && TARGET_TYPES.has(value) ? (value as CrmCustomerEventTargetType) : "unknown"
}

function parseSourceType(value: unknown, hasRecording: boolean): CrmCustomerEventSourceType {
  if (typeof value === "string" && SOURCE_TYPES.has(value)) return value as CrmCustomerEventSourceType
  return hasRecording ? "recording" : "manual_note"
}

function parseSentiment(value: unknown): CrmCustomerEventSentiment {
  return typeof value === "string" && SENTIMENTS.has(value) ? (value as CrmCustomerEventSentiment) : "neutral"
}

function optionalString(value: unknown) {
  if (value == null) return undefined
  return typeof value === "string" ? value : null
}

function formText(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value : undefined
}

function nextActionsFromFields(input: {
  title?: string | null
  ownerName?: string | null
  dueAt?: string | null
}): CrmEventNextAction[] {
  const title = input.title?.trim()
  if (!title) return []
  return [
    {
      title,
      ownerName: input.ownerName?.trim() || null,
      dueAt: input.dueAt?.trim() || null,
      done: false,
    },
  ]
}

function hasUsefulContent(input: {
  title?: string | null
  summary?: string | null
  body?: string | null
  nextActions?: CrmEventNextAction[]
  recording?: unknown
}) {
  return Boolean(
    input.title?.trim() ||
      input.summary?.trim() ||
      input.body?.trim() ||
      input.nextActions?.length ||
      input.recording
  )
}

function isCrmEventsNotReadyError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes("CRM 기록 DB 마이그레이션")
}

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const url = new URL(req.url)
    const targetType = url.searchParams.get("targetType")
    const sourceType = url.searchParams.get("sourceType")
    const sentiment = url.searchParams.get("sentiment")
    const scope = url.searchParams.get("scope")
    const parsedSourceType = sourceType && SOURCE_TYPES.has(sourceType) ? (sourceType as CrmCustomerEventSourceType) : "all"
    const events = await listCrmCustomerEvents({
      q: url.searchParams.get("q") ?? undefined,
      targetId: url.searchParams.get("targetId") ?? undefined,
      targetType: targetType && TARGET_TYPES.has(targetType) ? (targetType as CrmCustomerEventTargetType) : "all",
      sourceType: parsedSourceType,
      sourceTypes: scope === "work" && parsedSourceType === "all" ? CRM_WORK_ACTIVITY_SOURCE_TYPES : undefined,
      sentiment: sentiment && SENTIMENTS.has(sentiment) ? (sentiment as CrmCustomerEventSentiment) : "all",
      limit: parseBoundedInt(url.searchParams.get("limit"), 50, 1, 100),
      offset: parseBoundedInt(url.searchParams.get("offset"), 0, 0, 100_000),
    })
    return adminCachedJson(events)
  } catch (error) {
    console.error("[GET /api/admin/crm/events]", error)
    return NextResponse.json({ error: "Failed to load CRM events" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const createdBy = adminActorName(admin)

  const contentType = req.headers.get("content-type") ?? ""

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData().catch(() => null)
      if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 })

      const fileValue = formData.get("recording")
      const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null
      const upload = file ? await uploadCrmRecording(file) : null
      if (upload && !upload.ok) {
        if (upload.error.kind === "bad_type") {
          return NextResponse.json({ error: "mp3, m4a, wav, webm, ogg, mp4 녹음파일만 업로드 가능합니다." }, { status: 400 })
        }
        if (upload.error.kind === "too_large") {
          return NextResponse.json({ error: "녹음파일은 50MB 이하만 업로드 가능합니다." }, { status: 400 })
        }
        if (upload.error.kind === "missing") {
          return NextResponse.json({ error: "녹음파일이 없습니다." }, { status: 400 })
        }
        console.error("[POST /api/admin/crm/events] recording upload", upload.error.message)
        return NextResponse.json({ error: "녹음파일 업로드에 실패했습니다." }, { status: 500 })
      }

      const nextActions = nextActionsFromFields({
        title: formText(formData, "nextActionTitle"),
        ownerName: formText(formData, "nextActionOwner"),
        dueAt: formText(formData, "nextActionDueAt"),
      })
      const input = {
        targetType: parseTargetType(formText(formData, "targetType")),
        targetId: formText(formData, "targetId"),
        targetLabel: formText(formData, "targetLabel"),
        sourceType: parseSourceType(formText(formData, "sourceType"), Boolean(upload?.ok)),
        sourceId: formText(formData, "sourceId"),
        occurredAt: formText(formData, "occurredAt"),
        title: formText(formData, "title"),
        summary: formText(formData, "summary"),
        body: formText(formData, "body"),
        meetingPurpose: formText(formData, "meetingPurpose"),
        ownerName: formText(formData, "ownerName"),
        attendees: parseLooseList(formText(formData, "attendees")),
        decisions: parseLooseList(formText(formData, "decisions")),
        blockers: parseLooseList(formText(formData, "blockers")),
        nextActions,
        sentiment: parseSentiment(formText(formData, "sentiment")),
        stageSignal: formText(formData, "stageSignal"),
        tags: parseLooseList(formText(formData, "tags")),
        recording: upload?.ok
          ? {
              storagePath: upload.path,
              fileName: upload.fileName,
              mimeType: upload.mimeType,
              sizeBytes: upload.sizeBytes,
            }
          : null,
        createdBy,
      }

      if (!hasUsefulContent(input)) {
        return NextResponse.json({ error: "제목, 요약, 메모, 다음 액션 또는 녹음파일 중 하나는 필요합니다." }, { status: 400 })
      }

      const event = await createCrmCustomerEvent(input)
      return await respondWithCreatedEvent(event, createdBy)
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    const nextActions = nextActionsFromFields({
      title: optionalString(raw.nextActionTitle),
      ownerName: optionalString(raw.nextActionOwner),
      dueAt: optionalString(raw.nextActionDueAt),
    })
    const input = {
      targetType: parseTargetType(raw.targetType),
      targetId: optionalString(raw.targetId),
      targetLabel: optionalString(raw.targetLabel),
      sourceType: parseSourceType(raw.sourceType, false),
      sourceId: optionalString(raw.sourceId),
      occurredAt: optionalString(raw.occurredAt),
      title: optionalString(raw.title),
      summary: optionalString(raw.summary),
      body: optionalString(raw.body),
      meetingPurpose: optionalString(raw.meetingPurpose),
      ownerName: optionalString(raw.ownerName),
      attendees: parseLooseList(optionalString(raw.attendees)),
      decisions: parseLooseList(optionalString(raw.decisions)),
      blockers: parseLooseList(optionalString(raw.blockers)),
      nextActions,
      sentiment: parseSentiment(raw.sentiment),
      stageSignal: optionalString(raw.stageSignal),
      tags: parseLooseList(optionalString(raw.tags)),
      recording: null,
      createdBy,
    }

    if (
      input.targetId === null ||
      input.targetLabel === null ||
      input.sourceId === null ||
      input.occurredAt === null ||
      input.title === null ||
      input.summary === null ||
      input.body === null ||
      input.meetingPurpose === null ||
      input.ownerName === null ||
      input.stageSignal === null
    ) {
      return NextResponse.json({ error: "Invalid CRM event field" }, { status: 400 })
    }

    if (!hasUsefulContent(input)) {
      return NextResponse.json({ error: "제목, 요약, 메모 또는 다음 액션 중 하나는 필요합니다." }, { status: 400 })
    }

    const event = await createCrmCustomerEvent(input)
    return await respondWithCreatedEvent(event, createdBy)
  } catch (error) {
    console.error("[POST /api/admin/crm/events]", error)
    if (isCrmEventsNotReadyError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json({ error: "Failed to create CRM event" }, { status: 500 })
  }
}

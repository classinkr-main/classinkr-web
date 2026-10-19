import { dataOwnerFromRequest } from "@/lib/admin/data-owner"
import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  channelCarriesResult,
  isContactLogResult,
  resolveComposerContactChannel,
} from "@/lib/crm/contact-log"
import { leadContactTimeError, recordLeadContact, type LeadContactTimeError } from "@/lib/crm/contact-record"
import { getLeadById } from "@/lib/repositories/leads"
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
type CrmEventInput = Parameters<typeof createCrmCustomerEvent>[0]

// 기록 저장 후 열린 다음 액션을 crm_tasks로 자동 승격한다(§7.2).
// task 생성 실패가 기록 저장 자체를 깨뜨리면 안 되므로 fail-soft.
/**
 * 기록은 저장됐는데 다음 액션 → 할 일 승격만 실패한 부분 성공(f989a812). 일반 기록 저장과 컴포저 리드 콜·문자
 * (recordLeadContact 경로, 8b3d7fde)가 같은 문구를 싣는다 — 기록 입력 폼(ActivityQuickForm)이 이 칸을 읽는다.
 */
const TASK_QUEUE_WARNING = "기록은 저장됐지만 다음 액션을 할 일에 추가하지 못했습니다. 전체 로그에서 다음 액션을 확인해 주세요."

async function respondWithCreatedEvent(
  event: CreatedCrmEvent,
  createdBy: string,
  extra: Record<string, unknown> = {}
) {
  let tasksCreated = 0
  let taskQueueWarning: string | undefined
  try {
    const tasks = await createTasksFromEventNextActions(event, { createdBy })
    tasksCreated = tasks.length
  } catch (error) {
    console.error("[POST /api/admin/crm/events] auto-task creation", error)
    taskQueueWarning = TASK_QUEUE_WARNING
  }
  return NextResponse.json(
    { event, tasksCreated, ...(taskQueueWarning ? { taskQueueWarning } : {}), ...extra },
    { status: 201 }
  )
}

function isoOrUndefined(value: string | null | undefined) {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function contactTimeErrorResponse(reason: LeadContactTimeError): NextResponse {
  return NextResponse.json(
    {
      error:
        reason === "future"
          ? "연락 시각이 현재보다 미래입니다. 기록 시각을 확인해 주세요."
          : "연락 시각이 리드 접수 시각보다 이릅니다. 기록 시각을 확인해 주세요.",
    },
    { status: 400 }
  )
}

interface ComposerContactRequest {
  channel?: unknown
  result?: unknown
}

/**
 * 멀티파트(녹음 첨부) 컴포저 요청의 리드 연락 시각을 업로드 전에 검사한다 — saveLeadContactFromComposer 와 같은
 * 판정(leadContactTimeError)을 앞당긴 것이다. 연락이 아니거나 리드를 못 찾으면 null(이후 흐름이 그대로 처리).
 */
async function precheckComposerContactTime(formData: FormData, hasRecording: boolean): Promise<NextResponse | null> {
  const targetType = parseTargetType(formText(formData, "targetType"))
  const leadId = targetType === "lead" ? formText(formData, "targetId")?.trim() : ""
  if (!leadId) return null
  const sourceType = parseSourceType(formText(formData, "sourceType"), hasRecording)
  if (!resolveComposerContactChannel(sourceType, formText(formData, "contactChannel"))) return null
  const lead = await getLeadById(leadId)
  if (!lead) return null
  const reason = leadContactTimeError(lead.timestamp, isoOrUndefined(formText(formData, "occurredAt")))
  return reason ? contactTimeErrorResponse(reason) : null
}

/**
 * 기록 컴포저의 리드 대상 콜·문자(카톡·이메일)는 "연락"이다 — 이벤트만 쓰던 것을 연락 로그 경로
 * (lib/crm/contact-record.ts)로 보내 리드 드로어·연락중 전환·우선순위 큐·참여 신호가 같은 한 건을 본다.
 * 미러 기록은 그 함수가 로그당 한 번 만든다 — 여기서 createCrmCustomerEvent를 따로 부르지 않는다
 * (부르면 같은 연락이 기록 두 건이 된다). 리드를 못 찾으면 이전처럼 기록만 남긴다.
 * 연락이 아니면 null — 호출부가 기존 기록 저장으로 진행한다.
 */
async function saveLeadContactFromComposer(
  input: CrmEventInput,
  contact: ComposerContactRequest,
  createdBy: string
): Promise<NextResponse | null> {
  const channel = resolveComposerContactChannel(input.sourceType, contact.channel)
  const leadId = input.targetType === "lead" ? input.targetId?.trim() : ""
  if (!channel || !leadId) return null
  // resolveComposerContactChannel은 call·sms 모드에서만 채널을 돌려준다.
  const sourceType = input.sourceType === "call" ? "call" : "sms"

  const lead = await getLeadById(leadId)
  if (!lead) {
    const event = await createCrmCustomerEvent(input)
    return respondWithCreatedEvent(event, createdBy, { contact: { recorded: false, reason: "lead_not_found" } })
  }

  const recorded = await recordLeadContact({
    lead,
    entry: {
      type: channel,
      result: isContactLogResult(contact.result) && channelCarriesResult(channel) ? contact.result : undefined,
      notes: firstText(input.body, input.summary, input.title),
      contacted_by: firstText(input.ownerName) ?? createdBy,
      contacted_at: isoOrUndefined(input.occurredAt),
    },
    composer: {
      sourceType,
      targetLabel: input.targetLabel,
      title: input.title,
      summary: input.summary,
      body: input.body,
      meetingPurpose: input.meetingPurpose,
      ownerName: input.ownerName,
      attendees: input.attendees,
      decisions: input.decisions,
      blockers: input.blockers,
      nextActions: input.nextActions,
      sentiment: input.sentiment,
      stageSignal: input.stageSignal,
      tags: input.tags,
      recording: input.recording,
      createdBy: input.createdBy,
    },
    taskCreatedBy: createdBy,
  })

  if (!recorded.ok) return contactTimeErrorResponse(recorded.reason)

  // 부분 성공(로그는 저장됨) — 기록 입력 폼이 warning·taskQueueWarning 을 activitySaveWarnings 로 읽어 role=alert 로 보인다.
  const warnings = [
    recorded.statusSync === "failed" ? "리드 상태를 연락중으로 맞추지 못했습니다." : null,
    recorded.mirror === "failed" ? "CRM 기록 타임라인에 올리지 못했습니다." : null,
  ].filter(Boolean)
  return NextResponse.json(
    {
      event: recorded.event,
      tasksCreated: recorded.tasksCreated,
      contact: {
        recorded: true,
        logId: recorded.log.id,
        channel,
        duplicate: recorded.duplicate,
        statusSync: recorded.statusSync,
        mirror: recorded.mirror,
      },
      ...(warnings.length > 0 ? { warning: `연락 기록은 저장됐지만 ${warnings.join(" ")}` } : {}),
      ...(recorded.taskQueueFailed ? { taskQueueWarning: TASK_QUEUE_WARNING } : {}),
    },
    { status: 201 }
  )
}

const SOURCE_TYPES = new Set<string>(CRM_EVENT_SOURCE_TYPES)
const TARGET_TYPES = new Set<string>(CRM_EVENT_TARGET_TYPES)
const SENTIMENTS = new Set<string>(CRM_EVENT_SENTIMENTS)

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

// A4 기간 칩 — 잘못된 값(파싱 실패)은 조용히 무시한다(무제한 조회로 폴백, 400을 던지지 않음).
function parseIsoOrUndefined(value: string | null): string | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
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

// 리드 대상 콜·문자에 통화 결과(contactResult)만 고른 저장("부재" 한 번 누르기)은 본문이 없어도 연락 기록이다.
function isLeadContactResultOnly(
  input: { sourceType?: string; targetType?: string; targetId?: string | null },
  contact: ComposerContactRequest
) {
  const channel = resolveComposerContactChannel(input.sourceType, contact.channel)
  return Boolean(
    channel &&
      channelCarriesResult(channel) &&
      isContactLogResult(contact.result) &&
      input.targetType === "lead" &&
      input.targetId?.trim()
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
      ownerKeys: url.searchParams.has("targetId") && !url.searchParams.has("owner") ? undefined : await dataOwnerFromRequest(url, admin),
      q: url.searchParams.get("q") ?? undefined,
      targetId: url.searchParams.get("targetId") ?? undefined,
      targetType: targetType && TARGET_TYPES.has(targetType) ? (targetType as CrmCustomerEventTargetType) : "all",
      sourceType: parsedSourceType,
      sourceTypes: scope === "work" && parsedSourceType === "all" ? CRM_WORK_ACTIVITY_SOURCE_TYPES : undefined,
      sentiment: sentiment && SENTIMENTS.has(sentiment) ? (sentiment as CrmCustomerEventSentiment) : "all",
      from: parseIsoOrUndefined(url.searchParams.get("from")),
      to: parseIsoOrUndefined(url.searchParams.get("to")),
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
      // 리드 연락 시각 검사는 녹음 업로드보다 먼저 — 업로드 뒤에 400을 내면 녹음 파일이 스토리지에 고아로 남는다.
      if (file) {
        const timeRejection = await precheckComposerContactTime(formData, true)
        if (timeRejection) return timeRejection
      }
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

      const contact: ComposerContactRequest = {
        channel: formText(formData, "contactChannel"),
        result: formText(formData, "contactResult"),
      }
      if (!hasUsefulContent(input) && !isLeadContactResultOnly(input, contact)) {
        return NextResponse.json({ error: "제목, 요약, 메모, 다음 액션 또는 녹음파일 중 하나는 필요합니다." }, { status: 400 })
      }

      const contactResponse = await saveLeadContactFromComposer(input, contact, createdBy)
      if (contactResponse) return contactResponse

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

    const contact: ComposerContactRequest = { channel: raw.contactChannel, result: raw.contactResult }
    if (!hasUsefulContent(input) && !isLeadContactResultOnly(input, contact)) {
      return NextResponse.json({ error: "제목, 요약, 메모 또는 다음 액션 중 하나는 필요합니다." }, { status: 400 })
    }

    const contactResponse = await saveLeadContactFromComposer(input, contact, createdBy)
    if (contactResponse) return contactResponse

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

import { NextRequest, NextResponse } from "next/server"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  getContactLogs,
  addContactLog,
  deleteContactLog,
  type ContactLogRecord,
  type ContactLogResult,
  type ContactLogType,
} from "@/lib/repositories/contact-logs"
import { buildLeadContactEventInput } from "@/lib/crm/lead-contact-event"
import { channelCarriesResult } from "@/lib/crm/contact-log"
import { getOrCreateCrmCustomerEventBySource } from "@/lib/repositories/crm-events"
import { createTasksFromEventNextActions } from "@/lib/repositories/crm-tasks"
import { getLeadById, updateLead } from "@/lib/repositories/leads"

// 연락 로그를 CRM 활동 타임라인 + 다음 액션 task로 미러링한다.
// CRM 측 실패가 연락 로그 저장을 깨뜨리면 안 되므로 fail-soft.
async function mirrorContactLogToCrm(leadId: string, log: ContactLogRecord) {
  try {
    const lead = await getLeadById(leadId).catch(() => null)
    const label = lead?.org || lead?.name || null
    const event = await getOrCreateCrmCustomerEventBySource(buildLeadContactEventInput(log, label))
    if (event.created) {
      await createTasksFromEventNextActions(event.record, { createdBy: log.contacted_by })
    }
  } catch (error) {
    console.error("[POST /api/admin/leads/:id/logs] mirror to CRM event", error)
  }
}

type Params = { params: Promise<{ id: string }> }

const CONTACT_LOG_TYPES = new Set<ContactLogType>(["call", "sms", "kakao", "email"])
const CONTACT_LOG_RESULTS = new Set<ContactLogResult>(["answered", "no_answer", "callback", "meeting_set"])

function readOptionalString(value: unknown) {
  if (value == null) return undefined
  return typeof value === "string" ? value : null
}

export async function GET(req: NextRequest, { params }: Params) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  try {
    const logs = await getContactLogs(id)
    return NextResponse.json({ logs })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const raw = body as Record<string, unknown>
  const type = raw.type
  if (typeof type !== "string" || !CONTACT_LOG_TYPES.has(type as ContactLogType)) {
    return NextResponse.json({ error: "Invalid contact log type" }, { status: 400 })
  }

  const result = raw.result
  if (result != null && (typeof result !== "string" || !CONTACT_LOG_RESULTS.has(result as ContactLogResult))) {
    return NextResponse.json({ error: "Invalid contact log result" }, { status: 400 })
  }

  const notes = readOptionalString(raw.notes)
  const contactedBy = readOptionalString(raw.contacted_by)
  const contactedAt = readOptionalString(raw.contacted_at)
  if (notes === null || contactedBy === null || contactedAt === null) {
    return NextResponse.json({ error: "Invalid contact log field" }, { status: 400 })
  }
  if (contactedAt && Number.isNaN(new Date(contactedAt).getTime())) {
    return NextResponse.json({ error: "Invalid contacted_at" }, { status: 400 })
  }

  try {
    const lead = await getLeadById(id)
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })

    const contactTime = contactedAt ? new Date(contactedAt).getTime() : Date.now()
    const leadTime = new Date(lead.timestamp).getTime()
    if (contactTime > Date.now() + 5 * 60_000) {
      return NextResponse.json({ error: "contacted_at cannot be in the future" }, { status: 400 })
    }
    if (Number.isFinite(leadTime) && contactTime < leadTime - 5 * 60_000) {
      return NextResponse.json({ error: "contacted_at cannot be before the lead was created" }, { status: 400 })
    }

    const logType = type as ContactLogType
    const log = await addContactLog(id, {
      type: logType,
      // 카카오·이메일은 통화 결과를 가질 수 없다 — 400으로 막지 않고 조용히 떨어뜨린다.
      // (이미 그렇게 저장된 기존 행이 있고, 400은 옛 클라이언트의 기록을 통째로 잃게 만든다.)
      result:
        result != null && channelCarriesResult(logType) ? (result as ContactLogResult) : undefined,
      notes,
      contacted_by: contactedBy ?? admin.name ?? admin.userId ?? admin.role,
      contacted_at: contactedAt,
    })
    let statusSync: "updated" | "unchanged" | "failed" = "unchanged"
    if (lead.status === "new") {
      try {
        const updated = await updateLead(id, {
          status: "contacted",
          confirmed_at: new Date().toISOString(),
        })
        statusSync = updated ? "updated" : "failed"
      } catch (error) {
        // 연락 증거는 이미 저장됐다. 500을 반환하면 클라이언트 재시도로 같은 로그가
        // 중복 저장될 수 있으므로 상태 동기화만 fail-soft로 보고한다.
        console.error("[POST /api/admin/leads/:id/logs] sync lead status", error)
        statusSync = "failed"
      }
    }
    await mirrorContactLogToCrm(id, log)
    return NextResponse.json({
      log,
      statusSync,
      ...(statusSync === "failed"
        ? { warning: "연락 기록은 저장됐지만 리드 상태를 연락중으로 맞추지 못했습니다." }
        : {}),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to add log" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const logId = searchParams.get("logId")
  if (!logId) return NextResponse.json({ error: "logId required" }, { status: 400 })

  try {
    const [lead, logs] = await Promise.all([getLeadById(id), getContactLogs(id)])
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    if (!logs.some((log) => log.id === logId)) {
      return NextResponse.json({ error: "Contact log not found" }, { status: 404 })
    }
    if (lead.status === "contacted" && logs.length <= 1) {
      return NextResponse.json(
        { error: "연락중 상태의 마지막 연락 기록은 삭제할 수 없습니다." },
        { status: 409 }
      )
    }
    await deleteContactLog(logId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to delete log" }, { status: 500 })
  }
}

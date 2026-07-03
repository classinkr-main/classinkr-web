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
import { createCrmCustomerEvent } from "@/lib/repositories/crm-events"
import { createTasksFromEventNextActions } from "@/lib/repositories/crm-tasks"
import { getLeadById } from "@/lib/repositories/leads"

// 연락 로그를 CRM 활동 타임라인 + 다음 액션 task로 미러링한다.
// CRM 측 실패가 연락 로그 저장을 깨뜨리면 안 되므로 fail-soft.
async function mirrorContactLogToCrm(leadId: string, log: ContactLogRecord) {
  try {
    const lead = await getLeadById(leadId).catch(() => null)
    const label = lead?.org || lead?.name || null
    const event = await createCrmCustomerEvent(buildLeadContactEventInput(log, label))
    await createTasksFromEventNextActions(event, { createdBy: log.contacted_by })
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
    const log = await addContactLog(id, {
      type: type as ContactLogType,
      result: result == null ? undefined : (result as ContactLogResult),
      notes,
      contacted_by: contactedBy,
      contacted_at: contactedAt,
    })
    await mirrorContactLogToCrm(id, log)
    return NextResponse.json({ log })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to add log" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { searchParams } = new URL(req.url)
  const logId = searchParams.get("logId")
  if (!logId) return NextResponse.json({ error: "logId required" }, { status: 400 })

  try {
    await deleteContactLog(logId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to delete log" }, { status: 500 })
  }
}

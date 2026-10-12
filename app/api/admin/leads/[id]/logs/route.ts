import { NextRequest, NextResponse } from "next/server"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  getContactLogs,
  type ContactLogResult,
  type ContactLogType,
} from "@/lib/repositories/contact-logs"
import { channelCarriesResult, isContactLogResult, isContactLogType } from "@/lib/crm/contact-log"
import { deleteLeadContactLogWithMirrors, recordLeadContact } from "@/lib/crm/contact-record"
import { getLeadById } from "@/lib/repositories/leads"

// 연락 로그 저장·연락중 전환·CRM 기록 미러·다음 액션 할 일은 lib/crm/contact-record.ts 한 곳에서
// 일어난다 — 기록 컴포저(POST /api/admin/crm/events)의 리드 대상 콜·문자도 같은 함수를 지난다.

type Params = { params: Promise<{ id: string }> }

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
  if (!isContactLogType(type)) {
    return NextResponse.json({ error: "Invalid contact log type" }, { status: 400 })
  }

  const result = raw.result
  if (result != null && !isContactLogResult(result)) {
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

    const logType = type as ContactLogType
    const recorded = await recordLeadContact({
      lead,
      entry: {
        type: logType,
        // 카카오·이메일은 통화 결과를 가질 수 없다 — 400으로 막지 않고 조용히 떨어뜨린다.
        // (이미 그렇게 저장된 기존 행이 있고, 400은 옛 클라이언트의 기록을 통째로 잃게 만든다.)
        result:
          result != null && channelCarriesResult(logType) ? (result as ContactLogResult) : undefined,
        notes,
        contacted_by: contactedBy ?? admin.name ?? admin.userId ?? admin.role,
        contacted_at: contactedAt,
      },
    })
    if (!recorded.ok) {
      return NextResponse.json(
        {
          error:
            recorded.reason === "future"
              ? "contacted_at cannot be in the future"
              : "contacted_at cannot be before the lead was created",
        },
        { status: 400 }
      )
    }

    const { log, statusSync } = recorded
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
    // 로그의 순수 미러를 먼저 지우고 로그를 지운다(유령 연락 방지). 미러 정리가 실패하면 로그도 남겨
    // 500 — 다시 시도하면 된다. 기록 컴포저의 콜·문자 원본 기록은 지우지 않는다(contact-record.ts).
    const removed = await deleteLeadContactLogWithMirrors(id, logId)
    if (!removed.deleted) {
      return NextResponse.json(
        {
          error:
            removed.reason === "mirror_cleanup_failed"
              ? "CRM 기록 타임라인의 같은 연락을 정리하지 못해 삭제하지 않았습니다. 다시 시도해 주세요."
              : "Failed to delete log",
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true, mirrorsRemoved: removed.mirrorsRemoved })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to delete log" }, { status: 500 })
  }
}

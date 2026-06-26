import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  getContactLogs,
  addContactLog,
  deleteContactLog,
  type ContactLogResult,
  type ContactLogType,
} from "@/lib/repositories/contact-logs"

type Params = { params: Promise<{ id: string }> }

const CONTACT_LOG_TYPES = new Set<ContactLogType>(["call", "sms", "kakao", "email"])
const CONTACT_LOG_RESULTS = new Set<ContactLogResult>(["answered", "no_answer", "callback", "meeting_set"])

function readOptionalString(value: unknown) {
  if (value == null) return undefined
  return typeof value === "string" ? value : null
}

export async function GET(req: NextRequest, { params }: Params) {
  const err = await verifyAdmin(req)
  if (err) return err

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
  const err = await verifyAdmin(req)
  if (err) return err

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
    return NextResponse.json({ log })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to add log" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

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

import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getContactLogs, addContactLog, deleteContactLog } from "@/lib/repositories/contact-logs"

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const err = verifyAdmin(req)
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
  const err = verifyAdmin(req)
  if (err) return err

  const { id } = await params
  const body = await req.json()

  try {
    const log = await addContactLog(id, body)
    return NextResponse.json({ log })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to add log" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const err = verifyAdmin(req)
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

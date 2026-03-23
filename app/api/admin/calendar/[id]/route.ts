import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { updateEvent, deleteEvent } from "@/lib/calendar-data"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = verifyAdmin(req)
  if (err) return err
  const { id } = await params
  const patch = await req.json()
  const updated = updateEvent(id, patch)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = verifyAdmin(req)
  if (err) return err
  const { id } = await params
  const ok = deleteEvent(id)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

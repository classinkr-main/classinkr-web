import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { deleteEvent, updateEvent } from "@/lib/calendar-data"
import { validateCalendarEventPayload } from "@/lib/calendar-event-validation"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  const patch = await req.json()
  const validationError = validateCalendarEventPayload(patch)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }
  const updated = await updateEvent(id, patch)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  const ok = await deleteEvent(id)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

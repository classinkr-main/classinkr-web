import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { deleteBugReport, updateBugReport } from "@/lib/bugs-data"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req)
  if (err) return err
  const { id } = await params
  const body = await req.json()
  const updated = updateBugReport(id, body)
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req)
  if (err) return err
  const { id } = await params
  deleteBugReport(id)
  return NextResponse.json({ ok: true })
}

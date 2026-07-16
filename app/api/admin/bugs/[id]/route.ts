import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { deleteBugReport, updateBugReport } from "@/lib/repositories/bugs"
import { isBugSeverity, isBugStatus } from "@/lib/admin/dev-workflow"
import type { BugReport } from "@/lib/bugs-data"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  if (raw.status !== undefined && !isBugStatus(raw.status)) {
    return NextResponse.json({ error: "Invalid bug status" }, { status: 400 })
  }
  if (raw.severity !== undefined && !isBugSeverity(raw.severity)) {
    return NextResponse.json({ error: "Invalid bug severity" }, { status: 400 })
  }
  const updated = await updateBugReport(id, body as Partial<Omit<BugReport, "id" | "createdAt">>)
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  await deleteBugReport(id)
  return NextResponse.json({ ok: true })
}

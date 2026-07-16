import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { updatePatchNote, deletePatchNote } from "@/lib/repositories/patch-notes"
import { isPatchNoteStatus } from "@/lib/admin/dev-workflow"
import type { PatchNote } from "@/lib/patch-notes-data"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  const patch = await req.json().catch(() => null)
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if ("status" in patch && !isPatchNoteStatus((patch as Record<string, unknown>).status)) {
    return NextResponse.json({ error: "Invalid patch note status" }, { status: 400 })
  }
  const updated = await updatePatchNote(id, patch as Partial<Omit<PatchNote, "id" | "createdAt">>)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  const ok = await deletePatchNote(id)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

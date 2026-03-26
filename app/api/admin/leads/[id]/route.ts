import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { updateLead, deleteLead } from "@/lib/repositories/leads"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req)
  if (err) return err

  const { id } = await params
  const patch = await req.json()
  
  try {
    const updated = await updateLead(id, patch)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ lead: updated })
  } catch (error) {
    console.error(`[PATCH /api/admin/leads/${id}] error:`, error)
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req)
  if (err) return err

  const { id } = await params
  
  try {
    const ok = await deleteLead(id)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(`[DELETE /api/admin/leads/${id}] error:`, error)
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 })
  }
}

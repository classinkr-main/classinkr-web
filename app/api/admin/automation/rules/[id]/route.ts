import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { updateRule, deleteRule } from "@/lib/repositories/automation"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const body = await req.json()
    const rule = await updateRule(id, body)
    return NextResponse.json({ ok: true, rule })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  const ok = await deleteRule(id)
  return NextResponse.json({ ok })
}

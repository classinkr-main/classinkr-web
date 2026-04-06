import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { executeRule } from "@/lib/automation-engine"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const result = await executeRule(id)
    return NextResponse.json({ ok: result.status === "sent", ...result })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { scheduledCronProblem } from "@/lib/automation-schedule"
import { updateRule, deleteRule } from "@/lib/repositories/automation"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const body = await req.json()
    // 예약 식을 바꾸는 수정이면 저장 전에 읽을 수 있는 식인지 본다(생성 라우트와 같은 검사).
    if (body && typeof body === "object" && "triggerConfig" in body) {
      const cronProblem = scheduledCronProblem((body as Record<string, unknown>).triggerType, (body as Record<string, unknown>).triggerConfig)
      if (cronProblem) return NextResponse.json({ error: cronProblem }, { status: 400 })
    }
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
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  const ok = await deleteRule(id)
  return NextResponse.json({ ok })
}

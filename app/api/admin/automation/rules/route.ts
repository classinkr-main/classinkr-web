import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { scheduledCronProblem } from "@/lib/automation-schedule"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getAllRules, createRule } from "@/lib/repositories/automation"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const rules = await getAllRules()
    return adminCachedJson({ rules })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const { name, triggerType, triggerConfig, segmentConfig, templateId, status } = body

    if (!name || !triggerType || !triggerConfig || !segmentConfig || !templateId) {
      return NextResponse.json(
        { error: "name, triggerType, triggerConfig, segmentConfig, templateId 필수" },
        { status: 400 }
      )
    }

    // 크론이 읽지 못하는 예약 식은 저장하지 않는다 — 켜진 채 한 번도 돌지 않는 규칙이 된다.
    const cronProblem = scheduledCronProblem(triggerType, triggerConfig)
    if (cronProblem) return NextResponse.json({ error: cronProblem }, { status: 400 })

    const rule = await createRule({ name, triggerType, triggerConfig, segmentConfig, templateId, status })
    return NextResponse.json({ ok: true, rule }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

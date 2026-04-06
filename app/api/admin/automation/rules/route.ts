import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllRules, createRule } from "@/lib/repositories/automation"

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  try {
    const rules = await getAllRules()
    return NextResponse.json({ rules })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req)
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

    const rule = await createRule({ name, triggerType, triggerConfig, segmentConfig, templateId, status })
    return NextResponse.json({ ok: true, rule }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllTemplates, createTemplate } from "@/lib/repositories/automation"

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  try {
    const templates = await getAllTemplates()
    return NextResponse.json({ templates })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const { name, subject, body: htmlBody, variables } = body

    if (!name || !subject || !htmlBody) {
      return NextResponse.json({ error: "name, subject, body 필수" }, { status: 400 })
    }

    const template = await createTemplate({ name, subject, body: htmlBody, variables })
    return NextResponse.json({ ok: true, template }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

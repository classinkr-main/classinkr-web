import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllLogs } from "@/lib/repositories/automation"

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const ruleId = searchParams.get("ruleId") ?? undefined

  try {
    const logs = await getAllLogs(ruleId)
    return NextResponse.json({ logs })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

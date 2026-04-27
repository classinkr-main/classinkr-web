import { NextRequest, NextResponse } from "next/server"
import { runAll } from "@/lib/branch/sync/run-all"

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await runAll({ trigger: "cron" })
  return NextResponse.json(result)
}

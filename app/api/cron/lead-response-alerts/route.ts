import { NextRequest, NextResponse } from "next/server"

import { scanLeadResponseAlerts } from "@/lib/server/lead-response-alerts"

export async function GET(request: NextRequest) {
  if (process.env.VERCEL && !request.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET 환경변수가 설정되지 않았습니다." },
      { status: 401 }
    )
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await scanLeadResponseAlerts()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[cron/lead-response-alerts] failed:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

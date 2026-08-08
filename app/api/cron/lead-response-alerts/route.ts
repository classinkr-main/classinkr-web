import { NextRequest, NextResponse } from "next/server"

import { sendLeadMorningBrief } from "@/lib/server/lead-morning-brief"
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
    const [meta, homepage, responseAlerts] = await Promise.allSettled([
      sendLeadMorningBrief("meta"),
      sendLeadMorningBrief("homepage"),
      scanLeadResponseAlerts(),
    ])
    const taskResults = { meta, homepage, responseAlerts }
    const errors = Object.entries(taskResults)
      .filter(([, result]) => result.status === "rejected")
      .map(([task, result]) => ({
        task,
        error:
          result.status === "rejected"
            ? result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
            : undefined,
      }))
    const response = {
      ok: errors.length === 0,
      meta: meta.status === "fulfilled" ? meta.value : null,
      homepage: homepage.status === "fulfilled" ? homepage.value : null,
      responseAlerts:
        responseAlerts.status === "fulfilled" ? responseAlerts.value : null,
      errors,
    }

    return NextResponse.json(response, { status: errors.length > 0 ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[cron/lead-response-alerts] failed:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

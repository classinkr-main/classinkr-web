import { NextRequest, NextResponse } from "next/server"

import { sendLeadMorningBrief } from "@/lib/server/lead-morning-brief"

export async function GET(request: NextRequest) {
  // 인증은 아래 CRON_SECRET Bearer 하나뿐이다 — Vercel 이 크론에 붙이는 건 그 헤더이지
  // x-vercel-cron 이 아니다. 근거는 app/api/cron/sync-branch/route.ts 주석 참조. (2026-08-28)

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
    // 이 크론은 Meta/홈페이지 아침 공지만 발송한다.
    const [meta, homepage] = await Promise.allSettled([
      sendLeadMorningBrief("meta"),
      sendLeadMorningBrief("homepage"),
    ])
    const taskResults = { meta, homepage }
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
      errors,
    }

    return NextResponse.json(response, { status: errors.length > 0 ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[cron/lead-response-alerts] failed:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

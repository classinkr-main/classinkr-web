import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/server/cron-auth"

import { sendLeadMorningBrief } from "@/lib/server/lead-morning-brief"

export async function GET(request: NextRequest) {
  // 인증은 아래 CRON_SECRET Bearer 하나뿐이다 — Vercel 이 크론에 붙이는 건 그 헤더이지
  // x-vercel-cron 이 아니다. 근거는 app/api/cron/sync-branch/route.ts 주석 참조. (2026-08-28)
  // 비교는 lib/server/cron-auth 의 timing-safe 헬퍼로 한다.

  const authResult = checkCronAuth(request)
  if (authResult === "missing_secret") {
    return NextResponse.json(
      { error: "CRON_SECRET 환경변수가 설정되지 않았습니다." },
      { status: 401 }
    )
  }
  if (authResult !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // 이 크론은 Meta·홈페이지를 합친 아침 카드 한 장만 발송한다.
    const report = await sendLeadMorningBrief()
    return NextResponse.json({ ok: true, report })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[cron/lead-response-alerts] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

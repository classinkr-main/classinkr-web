import { NextRequest, NextResponse } from "next/server"

import { syncChannelConversations } from "@/lib/channel-talk-sync"

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
    const result = await syncChannelConversations({ limit: 50 })
    // 동기화 함수는 운영 오류를 구조화된 결과로 반환한다. Cron이 실패를 HTTP 200으로
    // 기록하면 재시도·알림이 작동하지 않으므로 설정 오류와 upstream 실패를 비정상 상태로 낸다.
    const status = result.ok ? 200 : result.configured ? 502 : 503
    return NextResponse.json(result, { status })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[cron/channel-talk-sync] failed:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

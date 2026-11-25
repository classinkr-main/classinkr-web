import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/server/cron-auth"

import { retryChannelTalkHandoffs } from "@/lib/chatbot/channel-handoff"

// 한 번에 최대 20건, 건마다 채널톡 호출 3번 안팎이라 60초면 충분하다.
export const maxDuration = 60

/**
 * 챗봇 → 채널톡 상담 전환 중 pending·failed 로 남은 건을 다시 보낸다(R11·handoff-4).
 * 15분 넘게 손대지 않은 건만, 보내기 시도 3회까지. 그 뒤에는 포기 표시하고 WeCom 으로 알림 한 번.
 * 별도 켜기 스위치는 없다 — vercel.json crons 에 등록하는 것이 켜는 결정이다. 상담 전환 자체가 꺼져 있으면(채널톡 키 없음,
 * CHANNEL_TALK_HANDOFF_MODE=off 등) 아무것도 하지 않고 enabled:false 로 답한다.
 */
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
    const result = await retryChannelTalkHandoffs()
    // 건별 실패(채널톡 거절)는 다음 실행이 다시 집는다 — 저장소 조회·갱신 자체가 깨진 경우만 비정상으로 낸다.
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (error) {
    // 저장소 오류는 Error 가 아닌 { message } 객체로 올 수 있다.
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error)
    console.error("[cron/chatbot-handoff-retry] failed:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

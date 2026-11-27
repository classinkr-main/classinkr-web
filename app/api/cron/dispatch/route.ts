import { NextRequest, NextResponse } from "next/server"

import { checkCronAuth } from "@/lib/server/cron-auth"
import { resolveDispatchSlot } from "@/lib/server/cron-dispatch-slot"

import { GET as runSlot } from "./[slot]/route"

// [slot] 라우트와 같은 상한 — 이 라우트는 슬롯을 정해 그 본문을 그대로 부른다.
export const maxDuration = 60

/**
 * 시간 슬롯 크론의 단일 진입점 — vercel.json 이 매시 정각(`0 * * * *`)에 이 경로 하나만 깨운다.
 *
 * 예전에는 `/api/cron/dispatch/00`~`/23` 24줄이 시간대마다 하나씩 등록돼 크론 40칸 중 24칸을 썼다
 * (Vercel Hobby 의 "경로당 하루 1회" 시절 설계). Pro 에서는 한 경로를 매시 부를 수 있으므로 슬롯을 경로가 아니라
 * 시계에서 구한다. 도는 잡과 시각은 그대로다 — 슬롯이 정해진 뒤의 본문은 [slot] 라우트 것을 그대로 쓴다.
 *
 * [slot] 라우트는 크론 등록에서만 빠지고 남는다: 수동 재시도·미리보기
 * (`GET /api/cron/dispatch/02?dryRun=true`)는 그 경로로 한다.
 *
 * 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나뿐이다(AGENTS.md 배포/Cron 안전 규칙).
 */
export async function GET(request: NextRequest) {
  const authResult = checkCronAuth(request)
  if (authResult === "missing_secret") {
    return NextResponse.json({ error: "CRON_SECRET 환경변수가 설정되지 않았습니다." }, { status: 401 })
  }
  if (authResult !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const slot = resolveDispatchSlot(new Date())
  return runSlot(request, { params: Promise.resolve({ slot: String(slot).padStart(2, "0") }) })
}

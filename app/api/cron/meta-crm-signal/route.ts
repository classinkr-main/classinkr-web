import { NextRequest, NextResponse } from "next/server"

import { runMetaCrmSignal, type MetaCrmSignalReport } from "@/lib/marketing/meta-crm-signal"
import { checkCronAuth } from "@/lib/server/cron-auth"

export const maxDuration = 60

/**
 * 메타 리드 영업 단계 → Meta Conversions API(전환 리드) — 매시간 40분(vercel.json).
 * 설계·켜는 법: docs/active/meta-crm-stage-signal-2026-11-04.md
 *
 * 기본 꺼짐: META_CRM_SIGNAL_ENABLED=true 가 아니면 DB 도 읽지 않고 200 `disabled`.
 * `?dryRun=true` 는 꺼져 있어도 돈다 — 단계별 보낼 건수만 돌려주고 Meta 호출·원장 쓰기를 하지 않는다(개인정보 없음).
 * 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나뿐이다(AGENTS.md 배포/Cron 안전 규칙).
 * 일부 실패·읽기 실패·미설정은 크론 대시보드에서 보이도록 2xx 가 아닌 코드로 돌려준다.
 */

/** 새 발송을 시작하는 마감 — 1건 시간 초과(2.5초)를 더해도 maxDuration 안에 응답한다. */
const SEND_BUDGET_MS = 45_000

const HTTP_STATUS: Record<MetaCrmSignalReport["status"], number> = {
  ok: 200,
  disabled: 200,
  not_configured: 503,
  failed: 500,
  partial: 500,
}

export async function GET(request: NextRequest) {
  const authResult = checkCronAuth(request)
  if (authResult === "missing_secret") {
    return NextResponse.json({ error: "CRON_SECRET 환경변수가 설정되지 않았습니다." }, { status: 401 })
  }
  if (authResult !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true"
  const report = await runMetaCrmSignal({ dryRun, deadlineAt: Date.now() + SEND_BUDGET_MS })
  console.info("[cron/meta-crm-signal]", {
    status: report.status,
    dryRun: report.dryRun,
    planned: report.planned,
    sent: report.sent,
    rejected: report.rejected,
    unknown: report.unknown,
    ledgerWriteFailed: report.ledgerWriteFailed,
  })
  return NextResponse.json({ ok: HTTP_STATUS[report.status] === 200, ...report }, { status: HTTP_STATUS[report.status] })
}

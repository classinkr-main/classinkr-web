import { NextRequest, NextResponse } from "next/server"

import {
  syncLeadContactFromCompassWithinBudget,
  type LeadContactSyncReport,
} from "@/lib/server/lead-contact-compass-sync"

export const maxDuration = 60

/**
 * 리드 연락 상태 MKT(Compass) 반영 전용 크론 — 평일 근무 시간에 하루 5회(vercel.json).
 * 11시 아침 카드 직전(10:50)에도 한 번 돌아 카드 숫자가 최신 상태로 나간다.
 * 설계: docs/superpowers/specs/2026-09-14-lead-contact-compass-sync-design.md
 *
 * 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나뿐이다 — Vercel 이 크론에 붙이는 게
 * 그 헤더이지 x-vercel-cron 이 아니다(AGENTS.md 배포/Cron 안전 규칙).
 * `?dryRun=true` 는 판정 건수만 돌려주고 쓰지 않는다 — 배포 뒤 첫 실행 전에 확인하는 용도.
 * 건너뜀·실패·시간 초과는 크론 대시보드에서 보이도록 2xx 가 아닌 코드로 돌려준다.
 */

/** 반영 예산 — 실측(운영 dry run)은 0.5초 안팎이고, maxDuration 안에 응답 여유를 남긴다. */
const SYNC_BUDGET_MS = 45_000

const HTTP_STATUS: Record<LeadContactSyncReport["status"], number> = {
  ok: 200,
  bridge_down: 503,
  failed: 500,
  timeout: 504,
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET 환경변수가 설정되지 않았습니다." },
      { status: 401 }
    )
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true"

  try {
    const report = await syncLeadContactFromCompassWithinBudget({ budgetMs: SYNC_BUDGET_MS, dryRun })
    console.info("[cron/lead-contact-sync]", {
      status: report.status,
      dryRun: report.dryRun,
      toContacted: report.toContacted,
      toClosed: report.toClosed,
      applied: report.applied,
    })
    return NextResponse.json({ ok: report.status === "ok", ...report }, { status: HTTP_STATUS[report.status] })
  } catch (error) {
    console.error("[cron/lead-contact-sync] failed:", error instanceof Error ? error.name : "Error")
    return NextResponse.json(
      { ok: false, status: "failed", dryRun, error: "Lead contact sync failed." },
      { status: 500 }
    )
  }
}

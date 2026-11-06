import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { checkCronAuth } from "@/lib/server/cron-auth"

import { SHOWROOM_BOOKINGS_LIST_CACHE_TAG } from "@/app/api/admin/showroom-bookings/_cache"
import {
  syncShowroomConfirmationsFromCompass,
  type ShowroomConfirmSyncReport,
} from "@/lib/server/showroom-compass-confirm"

import {
  syncLeadContactFromCompassWithinBudget,
  type LeadContactSyncReport,
} from "@/lib/server/lead-contact-compass-sync"

export const maxDuration = 60

/**
 * 리드 연락 상태 MKT(Compass) 반영 전용 크론 — 매일 5분 간격(vercel.json).
 * 상태 조건부 UPDATE로 담당자가 바꾼 상태를 보존하며, 외부 발송은 수행하지 않는다.
 * 설계: docs/superpowers/specs/2026-09-14-lead-contact-compass-sync-design.md
 *
 * 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나뿐이다 — Vercel 이 크론에 붙이는 게
 * 그 헤더이지 x-vercel-cron 이 아니다(AGENTS.md 배포/Cron 안전 규칙).
 * `?dryRun=true` 는 판정 건수만 돌려주고 쓰지 않는다 — 배포 뒤 첫 실행 전에 확인하는 용도.
 * 건너뜀·실패·시간 초과는 크론 대시보드에서 보이도록 2xx 가 아닌 코드로 돌려준다.
 *
 * 같은 5분 주기에 쇼룸 확정 동기화(lib/server/showroom-compass-confirm.ts, 2026-11-06)를 이어서 돌린다 — Compass 브리지를 읽는
 * 같은 도메인이고 vercel.json 크론 항목이 상한(40)이라 새 항목을 만들지 않았다. 이쪽은 고객 문자(확정 안내)를 보낼 수 있다:
 * 스위치 SHOWROOM_CONFIRM_ENABLED 가 꺼져 있거나 `?dryRun=true` 면 판정만 한다. 결과는 응답의 `showroomConfirm` 칸.
 */

/** 반영 예산 — 실측(운영 dry run)은 0.5초 안팎이고, maxDuration 안에 응답 여유를 남긴다. */
const SYNC_BUDGET_MS = 45_000

const HTTP_STATUS: Record<LeadContactSyncReport["status"], number> = {
  ok: 200,
  bridge_down: 503,
  failed: 500,
  timeout: 504,
}

const SHOWROOM_HTTP_STATUS: Record<ShowroomConfirmSyncReport["status"], number> = {
  ok: 200,
  bridge_down: 503,
  failed: 500,
  over_cap: 500,
}

/** 쇼룸 확정 동기화 — 던지지 않는 함수지만 혹시 모를 예외가 리드 반영 응답을 지우지 않게 한 겹 더 감싼다. */
async function runShowroomConfirm(dryRun: boolean): Promise<ShowroomConfirmSyncReport | { status: "failed"; error: string }> {
  try {
    const report = await syncShowroomConfirmationsFromCompass({ dryRun })
    if (report.confirmedIds.length > 0) {
      // 접수 큐가 다음 조회에서 확정 상태를 보게 한다(PATCH 라우트와 같은 무효화). 무효화 실패가 확정 결과를 지우지 않게 따로 감싼다.
      try {
        revalidateTag(SHOWROOM_BOOKINGS_LIST_CACHE_TAG, { expire: 0 })
      } catch {
        // 다음 조회의 캐시 TTL 이 메운다.
      }
    }
    console.info("[cron/lead-contact-sync] showroomConfirm", {
      status: report.status,
      enabled: report.enabled,
      dryRun: report.dryRun,
      scanned: report.scanned,
      planned: report.planned,
      confirmed: report.confirmed,
      messages: report.messages,
    })
    return report
  } catch (error) {
    console.error("[cron/lead-contact-sync] showroomConfirm failed:", error instanceof Error ? error.name : "Error")
    return { status: "failed", error: "Showroom confirm sync failed." }
  }
}

export async function GET(request: NextRequest) {
  // 비교는 lib/server/cron-auth 의 timing-safe 헬퍼로 한다(다른 크론 라우트와 같은 판정).
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
    const showroomConfirm = await runShowroomConfirm(dryRun)
    const leadOk = report.status === "ok"
    const showroomOk = showroomConfirm.status === "ok"
    // 리드 반영의 코드가 우선이다. 리드는 정상인데 쇼룸 확정이 실패·상한 초과면 대시보드에 보이도록 비-2xx.
    const status = !leadOk ? HTTP_STATUS[report.status] : showroomOk ? 200 : SHOWROOM_HTTP_STATUS[showroomConfirm.status]
    return NextResponse.json({ ok: leadOk && showroomOk, ...report, showroomConfirm }, { status })
  } catch (error) {
    console.error("[cron/lead-contact-sync] failed:", error instanceof Error ? error.name : "Error")
    return NextResponse.json(
      { ok: false, status: "failed", dryRun, error: "Lead contact sync failed." },
      { status: 500 }
    )
  }
}

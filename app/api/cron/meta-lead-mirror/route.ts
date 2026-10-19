import { NextRequest, NextResponse } from "next/server"

import { checkCronAuth } from "@/lib/server/cron-auth"
import { metaLeadFallbackStep } from "@/lib/server/meta-lead-fallback"
import {
  runMetaLeadMirrorCycle,
  type MetaLeadMirrorCycleReport,
} from "@/lib/server/meta-lead-mirror"

export const maxDuration = 60

/**
 * Meta 리드애즈 단일 수신 — Compass 제출 → public.leads 미러·어드민 폴백·건강 경보·심장박동 크론(10분마다, vercel.json).
 * 설계: META-RECEIVER-FINAL §4-2 H7 · 운영: docs/active/meta-leadgen-single-receiver-2026-09.md
 *
 * 한 사이클(runMetaLeadMirrorCycle): 미러(shadow 면 쓰지 않음) → 폴백(모드와 무관) → 건강 RPC 경보 → 심장박동 → 감사.
 * 스위치가 admin 이고 mirror_since 가 없으면(전환 전 기본) 심장박동만 쓰고 200 `skipped` 다 — 배포만으로는 아무것도 바뀌지 않는다.
 * env META_LEADGEN_FORCE_ADMIN 은 보지 않는다(비상 스위치는 웹훅만 돌린다. 미러·폴백은 원장이 중복을 막는다 — 설계 §5).
 *
 * 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나뿐이다 — Vercel 이 크론에 붙이는 게 그 헤더이지
 * x-vercel-cron 이 아니다(AGENTS.md 배포/Cron 안전 규칙).
 * `?dryRun=true` 는 건수만 계산하고 원장·리드·경보·심장박동·감사를 쓰지 않는다.
 * 유실 위험·막힘·실패·브리지 장애·시간 초과는 크론 대시보드에서 보이도록 2xx 가 아닌 코드로 돌려준다
 * (lead-contact-sync 라우트와 같은 자세).
 */

/** 새 미러 배치·폴백 선점을 시작하는 마감 — 건강 RPC·심장박동은 그 뒤에 돈다(maxDuration 안 응답 여유). */
const CYCLE_BUDGET_MS = 45_000

const HTTP_STATUS: Record<MetaLeadMirrorCycleReport["status"], number> = {
  ok: 200,
  skipped: 200,
  at_risk: 500,
  blocked: 500,
  failed: 500,
  bridge_down: 503,
  timeout: 504,
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
  if (authResult === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true"

  try {
    const report = await runMetaLeadMirrorCycle({
      trigger: "cron",
      dryRun,
      deadlineAt: Date.now() + CYCLE_BUDGET_MS,
      fallback: metaLeadFallbackStep,
    })
    // 건수·상태만 남긴다(식별자·이름·전화·이메일 없음).
    console.info("[cron/meta-lead-mirror]", {
      status: report.status,
      dryRun: report.dryRun,
      mode: report.mode,
      mirror: report.mirror.status,
      inserted: report.mirror.applied.inserted,
      fallback: report.fallback?.status ?? null,
      atRisk: report.health?.metrics.at_risk ?? null,
      alerted: report.health?.alerted.length ?? 0,
      heartbeat: report.heartbeat.written,
    })
    return NextResponse.json(
      { ok: report.status === "ok" || report.status === "skipped", ...report },
      { status: HTTP_STATUS[report.status] }
    )
  } catch (error) {
    console.error("[cron/meta-lead-mirror] failed:", error instanceof Error ? error.name : "Error")
    return NextResponse.json(
      { ok: false, status: "failed", dryRun, error: "Meta lead mirror cycle failed." },
      { status: 500 }
    )
  }
}

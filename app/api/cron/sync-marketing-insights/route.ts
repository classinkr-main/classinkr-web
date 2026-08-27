// GET /api/cron/sync-marketing-insights — 주간 마케팅 브리핑 생성 크론.
// 스케줄: 일요일 22:30 UTC = 월요일 07:30 KST(vercel.json) — 주초 출근 전에 지난주 브리핑이 서 있게.
// 인증은 sync-meta-insights 와 동일(x-vercel-cron + CRON_SECRET Bearer).

import { NextRequest, NextResponse } from "next/server"
import { runMarketingInsights } from "@/lib/marketing/insights/runner"
import { persistWeeklyAdLeadReport } from "@/lib/marketing/weekly-report-store"

// Gemini 왕복 + 숫자 검증 실패 시 1회 재시도까지 들어갈 수 있어 기본(10초)으로는 모자란다.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (process.env.VERCEL && !req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // force=true — 크론은 캐시(digest 히트)를 건너뛰고 주 1회 새 브리핑을 만든다.
  // mode=quality — 주 1회 백그라운드 실행이라 사람이 화면에서 기다리지 않는다. 지연보다 품질.
  // runner 는 자체 try/catch 로 실패를 stale/error 로 강등하므로 여기서 throw 되지 않는다.
  // AI 브리핑과 결정론적 보고서를 병렬·독립 실행한다. 한쪽 장애가 다른 산출물을 지우지 않는다.
  const [result, reportResult] = await Promise.all([
    runMarketingInsights({ force: true, mode: "quality" }),
    persistWeeklyAdLeadReport(),
  ])

  // 브리핑 본문은 응답에 싣지 않는다 — 크론 로그는 실행 결과 요약만 남기면 된다
  // (본문은 marketing_insights 에 저장되고 어드민 API 로 조회한다).
  return NextResponse.json({
    from: result.from,
    error: result.error ?? null,
    retried: result.retried ?? false,
    warnings: result.numerical_warnings?.length ?? 0,
    report: {
      from: reportResult.from,
      period: reportResult.report?.period ?? null,
      error: reportResult.error ?? null,
    },
  })
}

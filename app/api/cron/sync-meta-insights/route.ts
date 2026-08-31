import { NextRequest, NextResponse } from "next/server"
import { kstToday } from "@/lib/marketing/perf-assemble"
import { fetchMetaDailyInsights } from "@/lib/meta/marketing"
import { upsertMetaInsightsDaily } from "@/lib/repositories/meta-insights-daily"

export const maxDuration = 60

export async function GET(req: NextRequest) {
  // 인증은 아래 CRON_SECRET Bearer 하나뿐이다 — Vercel 이 크론에 붙이는 건 그 헤더이지
  // x-vercel-cron 이 아니다. 근거는 app/api/cron/sync-branch/route.ts 주석 참조. (2026-08-28)
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  try {
    // Meta 는 최근 지표를 소급 정정하므로 trailing 3일을 매일 재적재(upsert)한다.
    const since = kstToday(-3)
    const until = kstToday(0)
    const { rows, currency, truncated } = await fetchMetaDailyInsights({ since, until })
    const upserted = await upsertMetaInsightsDaily(rows, currency)
    return NextResponse.json({ since, until, fetched: rows.length, upserted, truncated })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 }
    )
  }
}

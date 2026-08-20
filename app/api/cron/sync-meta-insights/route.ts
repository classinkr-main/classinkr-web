import { NextRequest, NextResponse } from "next/server"
import { kstToday } from "@/lib/marketing/perf-assemble"
import { fetchMetaDailyInsights } from "@/lib/meta/marketing"
import { upsertMetaInsightsDaily } from "@/lib/repositories/meta-insights-daily"

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

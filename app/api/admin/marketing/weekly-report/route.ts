// GET /api/admin/marketing/weekly-report[?fresh=1]
// 최근 완료된 월~일 광고 리드 주간 보고서. 주간 크론이 저장한 보고서를 우선 사용하고,
// 없거나 지난 주 것이면 원천 데이터에서 결정론적으로 다시 만든다(AI 호출 없음).

import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { kstToday } from "@/lib/marketing/perf-assemble"
import {
  isWeeklyAdLeadReport,
  resolveLastCompletedMarketingWeek,
  type WeeklyAdLeadReport,
} from "@/lib/marketing/weekly-report"
import { assembleWeeklyAdLeadReport } from "@/lib/marketing/weekly-report-builder"
import { getLatestInsight } from "@/lib/repositories/marketing-insights"

const REPORT_MEMO_TTL_MS = 60_000
let reportMemo: { at: number; promise: Promise<WeeklyAdLeadReport> } | null = null

function getLiveReport(fresh: boolean): Promise<WeeklyAdLeadReport> {
  if (!fresh && reportMemo && Date.now() - reportMemo.at < REPORT_MEMO_TTL_MS) {
    return reportMemo.promise
  }
  const promise = assembleWeeklyAdLeadReport()
  reportMemo = { at: Date.now(), promise }
  promise.catch(() => {
    if (reportMemo?.promise === promise) reportMemo = null
  })
  return promise
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const fresh = req.nextUrl.searchParams.get("fresh") === "1"
  try {
    if (!fresh) {
      const expectedWeek = resolveLastCompletedMarketingWeek(kstToday())
      const insight = await getLatestInsight("weekly_report").catch(() => null)
      const stored = insight?.payload?.weekly_report
      if (isWeeklyAdLeadReport(stored) && stored.period.until === expectedWeek.until) {
        return NextResponse.json({ report: stored, source: "stored" as const })
      }
    }

    return NextResponse.json({ report: await getLiveReport(fresh), source: "live" as const })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "주간 광고 리드 보고서 생성 실패" },
      { status: 500 }
    )
  }
}

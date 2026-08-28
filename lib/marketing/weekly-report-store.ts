// 주간 광고 리드 보고서 자동 보관 — AI 브리핑 성공 여부와 분리된 결정론적 저장 경로.

import "server-only"

import { assembleWeeklyAdLeadReport } from "@/lib/marketing/weekly-report-builder"
import { isWeeklyAdLeadReport, type WeeklyAdLeadReport } from "@/lib/marketing/weekly-report"
import {
  findInsightByDigest,
  insertInsight,
} from "@/lib/repositories/marketing-insights"

const SCOPE = "weekly_report" as const

export interface PersistWeeklyAdLeadReportResult {
  from: "cache" | "fresh" | "error"
  report?: WeeklyAdLeadReport
  error?: string
}

export async function persistWeeklyAdLeadReport(): Promise<PersistWeeklyAdLeadReportResult> {
  try {
    const report = await assembleWeeklyAdLeadReport()
    const digest = `weekly-ad-lead-report:v${report.version}:${report.period.since}:${report.period.until}`
    // 크론 재시도·수동 재호출이 같은 완료 주간 행을 중복 생성하지 않게 8일 창으로 찾는다.
    const cached = await findInsightByDigest(SCOPE, digest, 24 * 8)
    const cachedReport = cached?.payload?.weekly_report
    if (isWeeklyAdLeadReport(cachedReport)) return { from: "cache", report: cachedReport }

    await insertInsight({
      scope: SCOPE,
      digest,
      headline: `${report.period.since}~${report.period.until} 광고 리드 주간 보고서`,
      payload: { weekly_report: report },
      model: null,
    })
    return { from: "fresh", report }
  } catch (error) {
    return {
      from: "error",
      error: error instanceof Error ? error.message : "주간 광고 리드 보고서 보관 실패",
    }
  }
}

// 최근 완료된 월~일 광고 리드 보고서 서버 조립.

import "server-only"

import { assembleMarketingPerf, kstToday } from "@/lib/marketing/perf-assemble"
import {
  buildWeeklyAdLeadReport,
  resolveLastCompletedMarketingWeek,
  type WeeklyAdLeadReport,
} from "@/lib/marketing/weekly-report"

export async function assembleWeeklyAdLeadReport(): Promise<WeeklyAdLeadReport> {
  const completedWeek = resolveLastCompletedMarketingWeek(kstToday())
  // 7d 집계를 마지막 완료 일요일에 고정하면 current=월~일, previous=직전 월~일이 된다.
  const perf = await assembleMarketingPerf("7d", { today: completedWeek.until })
  return buildWeeklyAdLeadReport(perf, { generatedAt: new Date().toISOString() })
}

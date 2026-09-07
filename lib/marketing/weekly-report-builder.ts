// 최근 완료된 월~일 광고 리드 보고서 서버 조립.

import "server-only"

import { assembleMarketingPerf, kstToday } from "@/lib/marketing/perf-assemble"
import {
  buildWeeklyAdLeadReport,
  resolveLastCompletedMarketingWeek,
  type WeeklyAdLeadRecentIntake,
  type WeeklyAdLeadReport,
} from "@/lib/marketing/weekly-report"
import { getLeads } from "@/lib/repositories/leads"
import {
  formatLeadBriefKstDateTime,
  getLastSentLeadMorningWindowEnd,
  isLeadMorningWeekend,
  summarizeLeadIntake,
} from "@/lib/server/lead-morning-brief"

const DAY_MS = 24 * 60 * 60 * 1000

/** 구간이 토·일 KST 를 하루라도 품는가. 월요일 아침 보고서에서 참이 된다. */
function spansWeekend(since: Date, until: Date) {
  for (let at = since.getTime(); at < until.getTime(); at += DAY_MS) {
    if (isLeadMorningWeekend(new Date(at))) return true
  }
  return isLeadMorningWeekend(until)
}

/**
 * 마지막 일일 보고 이후 지금까지의 유입. 주말에는 일일 카드가 나가지 않으므로
 * 월요일 아침 보고서에서는 이 구간이 곧 금 10:10 ~ 지금, 즉 주말 공백이다.
 * 리드 조회가 실패해도 주간 수치는 살려야 하니 null 로 강등한다.
 */
async function buildRecentIntake(now: Date): Promise<WeeklyAdLeadRecentIntake | null> {
  try {
    const since = getLastSentLeadMorningWindowEnd(now)
    if (since.getTime() >= now.getTime()) return null

    return {
      since: since.toISOString(),
      until: now.toISOString(),
      label: `${formatLeadBriefKstDateTime(since)} - ${formatLeadBriefKstDateTime(now)}`,
      spansWeekend: spansWeekend(since, now),
      ...summarizeLeadIntake(await getLeads(), since, now),
    }
  } catch (error) {
    console.warn(
      "[weekly-report-builder] recent lead intake unavailable:",
      error instanceof Error ? error.message : error
    )
    return null
  }
}

export async function assembleWeeklyAdLeadReport(): Promise<WeeklyAdLeadReport> {
  const now = new Date()
  const completedWeek = resolveLastCompletedMarketingWeek(kstToday())
  // 7d 집계를 마지막 완료 일요일에 고정하면 current=월~일, previous=직전 월~일이 된다.
  const [perf, recentIntake] = await Promise.all([
    assembleMarketingPerf("7d", { today: completedWeek.until }),
    buildRecentIntake(now),
  ])
  return buildWeeklyAdLeadReport(perf, { generatedAt: now.toISOString(), recentIntake })
}

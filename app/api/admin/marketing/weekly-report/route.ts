// GET /api/admin/marketing/weekly-report[?fresh=1]
// 최근 완료된 월~일 광고 리드 주간 보고서. 주간 크론이 저장한 보고서를 우선 사용하고,
// 없거나 지난 주 것이면 원천 데이터에서 결정론적으로 다시 만든다(AI 호출 없음).

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag, unstable_cache } from "next/cache"
import { verifyAdmin } from "@/lib/admin-auth"
import { kstToday } from "@/lib/marketing/perf-assemble"
import { shareInFlight } from "@/lib/server/share-in-flight"
import {
  isWeeklyAdLeadReport,
  resolveLastCompletedMarketingWeek,
  type WeeklyAdLeadReport,
} from "@/lib/marketing/weekly-report"
import { assembleWeeklyAdLeadReport } from "@/lib/marketing/weekly-report-builder"
import { getLatestInsight } from "@/lib/repositories/marketing-insights"

// admin-performance-round3-2026-09-10.md §3.2 — route-local Map(reportMemo)은 Vercel Fluid
// 콜드 인스턴스마다 비어 있었다. unstable_cache(Data Cache)로 교체해 인스턴스 간 공유한다.
//
// TTL은 옛 REPORT_MEMO_TTL_MS와 같은 60초로 유지한다. 무효화 배선은 없다 — 이 "live" 경로는
// 주간 크론(lib/marketing/weekly-report-store.ts의 persistWeeklyAdLeadReport)이 저장한
// marketing_insights 행이 없거나 지난 주 것일 때만 타는 폴백이고, 위 GET 핸들러가 매 요청
// getLatestInsight로 "stored" 우선 경로를 먼저 확인하므로(캐시 없이 매번 최신 조회) 정상
// 상황에서는 이 라이브 캐시를 아예 거치지 않는다. 즉 신선도는 이미 stored 경로가 보장하고,
// 이 캐시는 "폴백이 얼마나 자주 도는가"만 줄이는 목적이라 60초 staleness는 무해하다.
const WEEKLY_REPORT_LIVE_CACHE_TAG = "marketing-weekly-report-live"

const getCachedLiveWeeklyReport = unstable_cache(
  // 인자가 없는 조회 — shareInFlight로 콜드 인스턴스의 동시 미스를 합치고 dev·test에서
  // JSON 안전성을 검사한다.
  () => shareInFlight("marketing-weekly-report-live-v1", assembleWeeklyAdLeadReport),
  ["marketing-weekly-report-live-v1"],
  { revalidate: 60, tags: [WEEKLY_REPORT_LIVE_CACHE_TAG] }
)

function getLiveReport(fresh: boolean): Promise<WeeklyAdLeadReport> {
  // fresh=1: 태그를 먼저 하드 만료시킨 뒤(perf 라우트와 동일 패턴) 캐시된 함수를 불러
  // 재계산 + 재적재한다.
  if (fresh) revalidateTag(WEEKLY_REPORT_LIVE_CACHE_TAG, { expire: 0 })
  return getCachedLiveWeeklyReport()
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

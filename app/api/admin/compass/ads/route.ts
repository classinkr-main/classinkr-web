// GET /api/admin/compass/ads?period=7d|30d|90d|quarter[&fresh=1]
// 마케팅 퍼포먼스 대시보드 "소재별 CPL" 카드의 단일 엔드포인트.
//
// 원천은 Compass 브리지의 읽기 전용 뷰 compass_ads_v(ad 레벨 Meta insights) 하나뿐이다 —
// 우리 meta_insights_daily(캠페인 레벨)와 섞지 않는다. 두 수집이 같은 광고 계정을 보지만
// 집계 단위가 달라 합치면 이중계상이 된다.
//
// 브리지가 죽으면(뷰 스키마 변경·권한) 500 이 아니라 `down: true` 로 200 을 돌려준다 —
// 소비 카드가 "Compass 연결 끊김"으로 강등 표시하기 위한 계약이다(무음 0 강등 금지).

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag, unstable_cache } from "next/cache"

import { verifyAdmin } from "@/lib/admin-auth"
import { getCompassAdsDaily } from "@/lib/compass/bridge"
import {
  aggregateCompassCreatives,
  type CompassCreativeAggregate,
} from "@/lib/marketing/compass-creative"
import { resolvePerfPeriod, shiftDays, type PerfPeriodKey } from "@/lib/marketing/perf"
import { kstToday } from "@/lib/marketing/perf-assemble"

const PERIOD_KEYS: readonly PerfPeriodKey[] = ["7d", "30d", "90d", "quarter"]

/** 스코어보드와 같은 14일 창. */
const SPARKLINE_DAYS = 14

/**
 * 브리지 getCompassAdsDaily 의 .limit() 값 사본. PostgREST 는 상한을 넘는 행을 오류 없이
 * 잘라 주므로(플레이북 "전량 조회" 규칙), 정확히 이 수만큼 왔다면 잘렸을 수 있다고 본다.
 * 브리지를 고쳐 총계를 받아오기 전까지는 이 근사가 유일한 감지 수단이다.
 */
const BRIDGE_ROW_LIMIT = 3000

export interface CompassAdsResponse extends Partial<CompassCreativeAggregate> {
  period: { key: PerfPeriodKey; since: string; until: string }
  /** true 면 브리지 조회 실패 — 수치가 아니라 연결 상태를 표시해야 한다. */
  down: boolean
  /** true 면 조회가 행 상한에 닿아 일부 일자가 빠졌을 수 있다(합계를 "전체"라 부르면 안 된다). */
  truncated?: boolean
  error?: string
}

async function loadCompassAds(periodKey: PerfPeriodKey): Promise<CompassAdsResponse> {
  const period = resolvePerfPeriod(periodKey, kstToday())
  // 스파크라인 창(최근 14일)이 기간보다 앞설 수 있다(7d) — 채워 그릴 범위만큼 실제로 읽는다.
  const sparklineSince = shiftDays(period.until, -(SPARKLINE_DAYS - 1))
  const loadedSince = sparklineSince < period.since ? sparklineSince : period.since

  const { rows, down, error } = await getCompassAdsDaily(loadedSince, period.until)
  const envelope = { key: period.key, since: period.since, until: period.until }
  if (down) return { period: envelope, down: true, error }

  const aggregate = aggregateCompassCreatives(rows, {
    since: period.since,
    until: period.until,
    sparklineDays: SPARKLINE_DAYS,
    loadedSince,
  })
  return {
    period: envelope,
    down: false,
    truncated: rows.length >= BRIDGE_ROW_LIMIT,
    ...aggregate,
  }
}

// perf 라우트(app/api/admin/marketing/perf/route.ts)와 같은 배선 — route-local 45초
// Map(memo)은 Vercel Fluid 콜드 인스턴스마다 비어 있었다. unstable_cache(60초)로 교체한다.
// 이 라우트 파일은 핸들러 외 export가 금지되므로 태그를 여기 모듈 스코프 상수로만 둔다
// (다른 쓰기 경로가 이 태그를 무효화할 일이 없다 — Compass 브리지는 우리가 쓰지 않는
// 읽기 전용 외부 뷰라 fresh=1 수동 새로고침이 유일한 갱신 트리거다).
const COMPASS_ADS_CACHE_TAG = "compass-ads"

const getCachedCompassAds = unstable_cache(
  loadCompassAds,
  ["compass-ads-v1"],
  { revalidate: 60, tags: [COMPASS_ADS_CACHE_TAG] },
)

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const rawPeriod = req.nextUrl.searchParams.get("period") ?? "30d"
  if (!PERIOD_KEYS.includes(rawPeriod as PerfPeriodKey)) {
    return NextResponse.json(
      { error: `유효하지 않은 period — ${PERIOD_KEYS.join("|")} 중 하나여야 합니다` },
      { status: 400 }
    )
  }
  const period = rawPeriod as PerfPeriodKey
  const fresh = req.nextUrl.searchParams.get("fresh") === "1"

  try {
    // fresh=1: 태그를 먼저 하드 만료시킨다({expire:0}) — 그 직후 부르는 getCachedCompassAds가
    // 무효화된 항목을 보고 재계산하며, 계산한 새 값을 캐시에 다시 채워 넣는다(perf 라우트와
    // 동일 패턴).
    if (fresh) revalidateTag(COMPASS_ADS_CACHE_TAG, { expire: 0 })
    return NextResponse.json(await getCachedCompassAds(period))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Compass 소재 집계 실패" },
      { status: 500 }
    )
  }
}

// GET /api/admin/compass/adsets?period=7d|30d|90d|quarter|month[&fresh=1]
// 마케팅 퍼포먼스 대시보드 "광고세트별 성과" 카드의 단일 엔드포인트.
//
// 원천은 Compass 브리지의 읽기 전용 뷰 compass_adsets_v(adset 레벨 Meta insights) 하나뿐이다 —
// 우리 meta_insights_daily(캠페인 레벨)와 섞지 않는다. 두 수집이 같은 광고 계정을 보지만
// 집계 단위가 달라 합치면 이중계상이 된다. ads 라우트(app/api/admin/compass/ads/route.ts)와
// 같은 패턴 — 스파크라인 창이 없어 그만큼 더 단순하다.
//
// 브리지가 죽으면(뷰 스키마 변경·권한) 500 이 아니라 `down: true` 로 200 을 돌려준다 —
// 소비 카드가 "Compass 연결 끊김"으로 강등 표시하기 위한 계약이다(무음 0 강등 금지).

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag, unstable_cache } from "next/cache"
import { assertJsonSafeInDev } from "@/lib/server/json-safe"

import { verifyAdmin } from "@/lib/admin-auth"
import { getCompassAdsetsDaily } from "@/lib/compass/bridge"
import { aggregateCompassAdsets, type CompassAdsetAggregate } from "@/lib/marketing/compass-adset"
// 기간 키는 PERF_PERIOD_KEYS(SSOT) 하나로 판정한다 — 허브의 기간 토글에 프리셋이 늘면(예: '이번 달')
// 이 카드도 같은 키로 조회하므로, 여기 사본 목록을 두면 새 프리셋에서 400 이 난다(ads 라우트와 동일).
import { isPerfPeriodKey, PERF_PERIOD_KEYS, resolvePerfPeriod, type PerfPeriodKey } from "@/lib/marketing/perf"
import { kstToday } from "@/lib/marketing/perf-assemble"

export interface CompassAdsetsResponse extends Partial<CompassAdsetAggregate> {
  period: { key: PerfPeriodKey; since: string; until: string }
  /** true 면 브리지 조회 실패 — 수치가 아니라 연결 상태를 표시해야 한다. */
  down: boolean
  /** true 면 조회가 행 상한에 닿아 일부 일자가 빠졌을 수 있다(합계를 "전체"라 부르면 안 된다). */
  truncated?: boolean
  error?: string
}

async function loadCompassAdsets(periodKey: PerfPeriodKey): Promise<CompassAdsetsResponse> {
  const period = resolvePerfPeriod(periodKey, kstToday())
  const { rows, down, error, truncated } = await getCompassAdsetsDaily(period.since, period.until)
  const envelope = { key: period.key, since: period.since, until: period.until }
  if (down) return { period: envelope, down: true, error }

  const aggregate = aggregateCompassAdsets(rows, { since: period.since, until: period.until })
  return {
    period: envelope,
    down: false,
    // 브리지가 페이지를 끝까지 넘기고 총 행수(count)와 비교해 판정한다(ads 라우트와 동일, 2026-09-21).
    // 예전의 rows.length >= 3000 근사는 PostgREST max-rows(1000) 절단을 잡지 못했고,
    // 정확히 3000행이면 거짓 양성이었다.
    truncated: truncated === true,
    ...aggregate,
  }
}

// ads 라우트와 같은 배선 — route-local 45초 Map(memo)은 Vercel Fluid 콜드 인스턴스마다 비어
// 있었다(admin-performance-round3 §3.2). unstable_cache(60초)로 교체한다.
// 이 라우트 파일은 핸들러 외 export가 금지되므로 태그를 여기 모듈 스코프 상수로만 둔다
// (다른 쓰기 경로가 이 태그를 무효화할 일이 없다 — Compass 브리지는 우리가 쓰지 않는
// 읽기 전용 외부 뷰라 fresh=1 수동 새로고침이 유일한 갱신 트리거다).
const COMPASS_ADSETS_CACHE_TAG = "compass-adsets"

const getCachedCompassAdsets = unstable_cache(
  async (...args: Parameters<typeof loadCompassAdsets>) =>
    assertJsonSafeInDev("compass-adsets", await loadCompassAdsets(...args)),
  ["compass-adsets-v1"],
  { revalidate: 60, tags: [COMPASS_ADSETS_CACHE_TAG] },
)

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const rawPeriod = req.nextUrl.searchParams.get("period") ?? "30d"
  if (!isPerfPeriodKey(rawPeriod)) {
    return NextResponse.json(
      { error: `유효하지 않은 period — ${PERF_PERIOD_KEYS.join("|")} 중 하나여야 합니다` },
      { status: 400 }
    )
  }
  const period = rawPeriod
  const fresh = req.nextUrl.searchParams.get("fresh") === "1"

  try {
    // fresh=1: 태그를 먼저 하드 만료시킨다({expire:0}) — 그 직후 부르는 getCachedCompassAdsets가
    // 무효화된 항목을 보고 재계산하며, 계산한 새 값을 캐시에 다시 채워 넣는다(ads 라우트와 동일 패턴).
    if (fresh) revalidateTag(COMPASS_ADSETS_CACHE_TAG, { expire: 0 })
    return NextResponse.json(await getCachedCompassAdsets(period))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Compass 광고세트 집계 실패" },
      { status: 500 }
    )
  }
}

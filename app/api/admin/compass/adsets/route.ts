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

import { verifyAdmin } from "@/lib/admin-auth"
import { getCompassAdsetsDaily } from "@/lib/compass/bridge"
import { aggregateCompassAdsets, type CompassAdsetAggregate } from "@/lib/marketing/compass-adset"
// 기간 키는 PERF_PERIOD_KEYS(SSOT) 하나로 판정한다 — 허브의 기간 토글에 프리셋이 늘면(예: '이번 달')
// 이 카드도 같은 키로 조회하므로, 여기 사본 목록을 두면 새 프리셋에서 400 이 난다(ads 라우트와 동일).
import { isPerfPeriodKey, PERF_PERIOD_KEYS, resolvePerfPeriod, type PerfPeriodKey } from "@/lib/marketing/perf"
import { kstToday } from "@/lib/marketing/perf-assemble"

/**
 * 브리지 getCompassAdsetsDaily 의 .limit() 값 사본. PostgREST 는 상한을 넘는 행을 오류 없이
 * 잘라 주므로(플레이북 "전량 조회" 규칙), 정확히 이 수만큼 왔다면 잘렸을 수 있다고 본다.
 * 브리지를 고쳐 총계를 받아오기 전까지는 이 근사가 유일한 감지 수단이다(ads 라우트와 동일 값).
 */
const BRIDGE_ROW_LIMIT = 3000

export interface CompassAdsetsResponse extends Partial<CompassAdsetAggregate> {
  period: { key: PerfPeriodKey; since: string; until: string }
  /** true 면 브리지 조회 실패 — 수치가 아니라 연결 상태를 표시해야 한다. */
  down: boolean
  /** true 면 조회가 행 상한에 닿아 일부 일자가 빠졌을 수 있다(합계를 "전체"라 부르면 안 된다). */
  truncated?: boolean
  error?: string
}

// ads 라우트와 같은 45초 서버 메모 — 실패 promise 는 즉시 비운다(에러 재생 방지).
const MEMO_TTL_MS = 45_000
const memo = new Map<string, { at: number; promise: Promise<CompassAdsetsResponse> }>()

async function loadCompassAdsets(periodKey: PerfPeriodKey): Promise<CompassAdsetsResponse> {
  const period = resolvePerfPeriod(periodKey, kstToday())
  const { rows, down, error } = await getCompassAdsetsDaily(period.since, period.until)
  const envelope = { key: period.key, since: period.since, until: period.until }
  if (down) return { period: envelope, down: true, error }

  const aggregate = aggregateCompassAdsets(rows, { since: period.since, until: period.until })
  return {
    period: envelope,
    down: false,
    truncated: rows.length >= BRIDGE_ROW_LIMIT,
    ...aggregate,
  }
}

function getCompassAdsets(periodKey: PerfPeriodKey, fresh: boolean): Promise<CompassAdsetsResponse> {
  if (!fresh) {
    const hit = memo.get(periodKey)
    if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.promise
  }
  const promise = loadCompassAdsets(periodKey)
  memo.set(periodKey, { at: Date.now(), promise })
  promise.catch(() => {
    if (memo.get(periodKey)?.promise === promise) memo.delete(periodKey)
  })
  return promise
}

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
  const fresh = req.nextUrl.searchParams.get("fresh") === "1"

  try {
    return NextResponse.json(await getCompassAdsets(rawPeriod, fresh))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Compass 광고세트 집계 실패" },
      { status: 500 }
    )
  }
}

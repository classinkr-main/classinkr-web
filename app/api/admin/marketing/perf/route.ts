// GET /api/admin/marketing/perf?period=7d|30d|90d|quarter[&fresh=1]
// 마케팅 퍼포먼스 대시보드의 단일 집계 엔드포인트 — 조립은 lib/marketing/perf-assemble.

import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import type { MarketingPerfResponse, PerfPeriodKey } from "@/lib/marketing/perf"
import { assembleMarketingPerf } from "@/lib/marketing/perf-assemble"

const PERIOD_KEYS: readonly PerfPeriodKey[] = ["7d", "30d", "90d", "quarter"]

// 서버 메모 45초 — 같은 period 요청은 조립(DB 5~6콜 + Meta 메모)을 재사용한다.
// lib/meta/marketing 의 dashboardMemo 패턴 미러: 실패 promise 는 즉시 비운다(남기면
// 45초 동안 모든 소비처가 같은 에러를 재생한다). 명시 새로고침은 ?fresh=1 로 우회.
const PERF_MEMO_TTL_MS = 45_000
const perfMemo = new Map<string, { at: number; promise: Promise<MarketingPerfResponse> }>()

function getMarketingPerf(period: PerfPeriodKey, fresh: boolean): Promise<MarketingPerfResponse> {
  if (!fresh) {
    const hit = perfMemo.get(period)
    if (hit && Date.now() - hit.at < PERF_MEMO_TTL_MS) return hit.promise
  }
  const promise = assembleMarketingPerf(period)
  perfMemo.set(period, { at: Date.now(), promise })
  promise.catch(() => {
    if (perfMemo.get(period)?.promise === promise) perfMemo.delete(period)
  })
  return promise
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const rawPeriod = req.nextUrl.searchParams.get("period") ?? "30d"
  if (!PERIOD_KEYS.includes(rawPeriod as PerfPeriodKey)) {
    return NextResponse.json(
      { error: `유효하지 않은 period — ${PERIOD_KEYS.join("|")} 중 하나여야 합니다` },
      { status: 400 }
    )
  }
  const fresh = req.nextUrl.searchParams.get("fresh") === "1"

  try {
    return NextResponse.json(await getMarketingPerf(rawPeriod as PerfPeriodKey, fresh))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "perf 집계 실패" },
      { status: 500 }
    )
  }
}

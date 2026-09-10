// GET /api/admin/marketing/perf?period=7d|30d|90d|quarter[&fresh=1]
// 마케팅 퍼포먼스 대시보드의 단일 집계 엔드포인트 — 조립은 lib/marketing/perf-assemble.

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { verifyAdmin } from "@/lib/admin-auth"
import type { PerfPeriodKey } from "@/lib/marketing/perf"
import { getCachedMarketingPerf } from "@/lib/marketing/perf-assemble"
import { MARKETING_PERF_CACHE_TAG } from "@/lib/repositories/marketing"

const PERIOD_KEYS: readonly PerfPeriodKey[] = ["7d", "30d", "90d", "quarter"]

// 조립(lib/marketing/perf-assemble.ts의 getCachedMarketingPerf)이 60초 Data Cache를 든다 —
// 예전 route-local 45초 Map(perfMemo)은 Vercel Fluid 콜드 인스턴스마다 비어 있었고, insights
// 빌더의 별도 45초 Map과도 캐시를 공유하지 못했다. 이 라우트는 이제 그 캐시된 함수를 그대로
// 호출하기만 한다 — 실패 시 즉시 비우기(옛 "실패 promise 즉시 비움") 로직도 필요 없다.
// unstable_cache는 함수가 던지면(reject) 아무 값도 저장하지 않으므로, 다음 호출이 저절로
// 재시도한다.
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
  const period = rawPeriod as PerfPeriodKey
  const fresh = req.nextUrl.searchParams.get("fresh") === "1"

  try {
    // fresh=1: 먼저 태그를 하드 만료시킨다({expire:0} — lib/repositories/leads.ts의 쓰기 직후
    // 즉시 만료 패턴과 동일 프로필). 그 직후 호출하는 getCachedMarketingPerf는 무효화된 항목을
    // 보고 재계산해 응답하며, 계산한 새 값을 캐시에 다시 채워 넣는다 — 다른 소비처(insights
    // 빌더 등)도 곧바로 이 새 값을 본다.
    if (fresh) revalidateTag(MARKETING_PERF_CACHE_TAG, { expire: 0 })
    return NextResponse.json(await getCachedMarketingPerf(period))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "perf 집계 실패" },
      { status: 500 }
    )
  }
}

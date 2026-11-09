// GET /api/admin/compass/ad-conversion?period=7d|30d|90d|quarter|month[&fresh=1]
// 광고(소재)별 전환·결제 비율 — Compass CRM 리드(meta_ad_id·단계) × Compass ad 레벨 집행비.
// 계산 규칙은 lib/marketing/ad-conversion.ts 한 곳. 브리지 계약은 ../ads/route.ts 와 같다:
// 브리지가 죽으면 500 이 아니라 down:true 로 200(카드가 "Compass 연결 끊김"으로 강등 표시).

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag, unstable_cache } from "next/cache"
import { assertJsonSafeInDev } from "@/lib/server/json-safe"

import { verifyAdmin } from "@/lib/admin-auth"
import { getCompassAdsDaily, getCompassLeadsByInflowRange } from "@/lib/compass/bridge"
import { aggregateAdConversion, type AdConversionResult } from "@/lib/marketing/ad-conversion"
import { isPerfPeriodKey, PERF_PERIOD_KEYS, resolvePerfPeriod, type PerfPeriodKey } from "@/lib/marketing/perf"
import { kstToday } from "@/lib/marketing/perf-assemble"

export interface AdConversionResponse extends Partial<AdConversionResult> {
  period: { key: PerfPeriodKey; since: string; until: string }
  down: boolean
  truncated?: boolean
  error?: string
}

async function loadAdConversion(periodKey: PerfPeriodKey): Promise<AdConversionResponse> {
  const period = resolvePerfPeriod(periodKey, kstToday())
  const envelope = { key: period.key, since: period.since, until: period.until }
  const [ads, leads] = await Promise.all([
    getCompassAdsDaily(period.since, period.until),
    // 유입 창(생성 또는 재유입) 조회 — 모듈이 생성일로 다시 거른다.
    getCompassLeadsByInflowRange(`${period.since}T00:00:00+09:00`, `${period.until}T23:59:59.999+09:00`),
  ])
  if (ads.down || leads.down) return { period: envelope, down: true, error: ads.error ?? leads.error }
  return {
    period: envelope,
    down: false,
    truncated: ads.truncated === true || leads.truncated === true,
    ...aggregateAdConversion(leads.rows, ads.rows, period),
  }
}

const AD_CONVERSION_CACHE_TAG = "compass-ad-conversion"

const getCachedAdConversion = unstable_cache(
  async (...args: Parameters<typeof loadAdConversion>) =>
    assertJsonSafeInDev("compass-ad-conversion", await loadAdConversion(...args)),
  ["compass-ad-conversion-v1"],
  { revalidate: 60, tags: [AD_CONVERSION_CACHE_TAG] },
)

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const rawPeriod = req.nextUrl.searchParams.get("period") ?? "90d"
  if (!isPerfPeriodKey(rawPeriod)) {
    return NextResponse.json(
      { error: `유효하지 않은 period — ${PERF_PERIOD_KEYS.join("|")} 중 하나여야 합니다` },
      { status: 400 }
    )
  }

  try {
    if (req.nextUrl.searchParams.get("fresh") === "1") revalidateTag(AD_CONVERSION_CACHE_TAG, { expire: 0 })
    return NextResponse.json(await getCachedAdConversion(rawPeriod))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "광고별 전환 집계 실패" },
      { status: 500 }
    )
  }
}

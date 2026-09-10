// POST /api/admin/marketing/creative-suggest — AI 소재 제안(온디맨드, v1 결과 미저장).
//
// 랭킹의 뼈대는 leads 의 UTM(getMetaAdInfo)에서 뽑은 소재별 "리드·전환 건수"다. 여기에
// Compass 브리지(compass_ads_v, ad 레벨 Meta insights)의 소재별 지출·CPL 을 광고명으로
// 조인해 얹는다 — 예전 주석의 "소재별 spend·CPL 은 이 저장소 어디에도 없다"는 전제는
// 이 브리지로 깨졌다(2026-08-28).
//
// 정직 규칙:
//  - 조인 실패는 null(미집계)이지 0 이 아니다. 응답의 note 가 매칭 건수를 밝힌다.
//  - cpl_usd 는 Compass 축끼리(spend ÷ Compass leads) 나눈 값이다. 우리 leads 테이블 건수로
//    나눈 축 혼합 CPL 은 만들지 않는다.
//  - 매출·ROAS 는 여전히 없다 — 계산도 표기도 하지 않는다(프롬프트도 같은 제약을 건다).
//  - 브리지가 죽으면 지출 없이 건수 랭킹만으로 진행한다(제안 자체를 막지 않는다).

import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getCompassAdsDaily } from "@/lib/compass/bridge"
import { getMetaIntent, isTestLead } from "@/lib/crm/lead-attribution"
import {
  aggregateCompassCreatives,
  attachCompassSpend,
  indexCompassCreativesByAdName,
  type CompassCreativeNameStat,
} from "@/lib/marketing/compass-creative"
import { aggregateAdCreativePerf } from "@/lib/marketing/creative-input"
import { callCreativeSuggestGemini, type CreativeSuggestIntentContext } from "@/lib/marketing/creative-suggest"
import { kstDateOf, kstToday } from "@/lib/marketing/perf-assemble"
import { resolvePerfPeriod, type PerfPeriodKey } from "@/lib/marketing/perf"
import { getMarketingLeads, type LeadRecord } from "@/lib/repositories/leads"

export const maxDuration = 60

type CreativeSuggestPeriod = Extract<PerfPeriodKey, "30d" | "90d">
const PERIOD_KEYS: readonly CreativeSuggestPeriod[] = ["30d", "90d"]

const TOP_N = 10
const BOTTOM_N = 5
const BOTTOM_MIN_LEADS = 2

function isValidPeriod(value: unknown): value is CreativeSuggestPeriod {
  return typeof value === "string" && (PERIOD_KEYS as readonly string[]).includes(value)
}

/** 이번 기간 리드에서 실제로 감지된 구매 의도 라벨만 추린다(감지되지 않은 라벨을 프롬프트에 흘리지 않기 위함). */
function buildIntentContext(leads: LeadRecord[]): CreativeSuggestIntentContext[] {
  const liftByLabel = new Map<string, number>()
  for (const lead of leads) {
    if (isTestLead(lead)) continue
    const intent = getMetaIntent(lead)
    if (intent) liftByLabel.set(intent.label, intent.lift)
  }
  return Array.from(liftByLabel, ([label, lift]) => ({ label, lift }))
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  let body: { period?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // 빈 바디 허용 — 기본값(90d)으로 진행한다.
  }

  const rawPeriod = body.period ?? "90d"
  if (!isValidPeriod(rawPeriod)) {
    return NextResponse.json(
      { error: `유효하지 않은 period — ${PERIOD_KEYS.join("|")} 중 하나여야 합니다` },
      { status: 400 }
    )
  }
  const period = rawPeriod

  try {
    const today = kstToday()
    const { since, until } = resolvePerfPeriod(period, today)

    const [allLeads, compassAds] = await Promise.all([
      getMarketingLeads(),
      // 브리지 실패는 제안 전체를 막지 않는다 — 지출 없이 건수 랭킹만으로 진행한다.
      getCompassAdsDaily(since, until),
    ])
    const periodLeads = allLeads.filter((lead) => {
      const day = kstDateOf(lead.timestamp)
      return day != null && day >= since && day <= until
    })

    // 스파크라인은 이 경로에서 쓰지 않으므로 조회 범위 = 집계 범위(loadedSince 기본값).
    const spendIndex: ReadonlyMap<string, CompassCreativeNameStat> = compassAds.down
      ? new Map()
      : indexCompassCreativesByAdName(
          aggregateCompassCreatives(compassAds.rows, { since, until }).rows
        )

    const ranked = attachCompassSpend(aggregateAdCreativePerf(periodLeads), spendIndex)
    const top = ranked.slice(0, TOP_N)
    const bottom = ranked.filter((row) => row.leads >= BOTTOM_MIN_LEADS).slice(-BOTTOM_N)
    const intentContext = buildIntentContext(periodLeads)
    const spendMatchedCount = ranked.filter((row) => row.spend_matched).length

    const { result, model } = await callCreativeSuggestGemini({
      period,
      top,
      bottom,
      intentContext,
      spendMatchedCount,
    })

    return NextResponse.json({
      ranked: { top, bottom },
      patterns: result.patterns,
      suggestions: result.suggestions,
      model,
      spendSource: compassAds.down ? "down" : "compass_ads_v",
      spendMatchedCount,
      note: compassAds.down
        ? "Compass 연결 끊김 — 소재별 지출·CPL 미집계, 리드/전환 기준 랭킹"
        : `소재별 지출·CPL 은 Compass 수집분(광고명 매칭 ${spendMatchedCount}/${ranked.length}건) · 매출·ROAS 없음`,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 소재 제안 생성 실패" },
      { status: 500 }
    )
  }
}

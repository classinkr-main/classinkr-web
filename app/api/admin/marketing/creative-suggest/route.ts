// POST /api/admin/marketing/creative-suggest — AI 소재 제안(온디맨드, v1 결과 미저장).
//
// 정직 규칙: Meta Graph 는 캠페인 레벨 insights 만 수집한다(ad/adset 레벨 insights 미수집) —
// 그래서 소재별 spend·CPL·ROAS 는 이 저장소 어디에도 없다. leads 의 UTM(getMetaAdInfo)에서
// 뽑은 소재별 "리드·전환 건수" 랭킹만 Gemini 의 근거로 준다. 응답·프롬프트 모두 이 사실을
// 명시한다 — 소재별 광고비·CPL 을 만들어내지 않는다.

import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getMetaIntent, isTestLead } from "@/lib/crm/lead-attribution"
import { aggregateAdCreativePerf } from "@/lib/marketing/creative-input"
import { callCreativeSuggestGemini, type CreativeSuggestIntentContext } from "@/lib/marketing/creative-suggest"
import { kstToday } from "@/lib/marketing/perf-assemble"
import { resolvePerfPeriod, type PerfPeriodKey } from "@/lib/marketing/perf"
import { getMarketingLeads, type LeadRecord } from "@/lib/repositories/leads"

export const maxDuration = 60

type CreativeSuggestPeriod = Extract<PerfPeriodKey, "30d" | "90d">
const PERIOD_KEYS: readonly CreativeSuggestPeriod[] = ["30d", "90d"]

const TOP_N = 10
const BOTTOM_N = 5
const BOTTOM_MIN_LEADS = 2

// perf-assemble.ts 의 kstToday 와 같은 규약(Asia/Seoul, en-CA=ISO 포맷)의 타임스탬프→KST 일자
// 변환. 그 파일의 kstDateOf 는 export 되지 않아(읽기 전용 — 수정하지 않는다) 같은 규약으로
// 여기 다시 둔다.
const KST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })
function kstDateOf(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return KST_DATE.format(d)
}

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

    const allLeads = await getMarketingLeads()
    const periodLeads = allLeads.filter((lead) => {
      const day = kstDateOf(lead.timestamp)
      return day != null && day >= since && day <= until
    })

    const ranked = aggregateAdCreativePerf(periodLeads)
    const top = ranked.slice(0, TOP_N)
    const bottom = ranked.filter((row) => row.leads >= BOTTOM_MIN_LEADS).slice(-BOTTOM_N)
    const intentContext = buildIntentContext(periodLeads)

    const { result, model } = await callCreativeSuggestGemini({ period, top, bottom, intentContext })

    return NextResponse.json({
      ranked: { top, bottom },
      patterns: result.patterns,
      suggestions: result.suggestions,
      model,
      note: "소재별 광고비·CPL 미수집 — 리드/전환 기준 랭킹",
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 소재 제안 생성 실패" },
      { status: 500 }
    )
  }
}

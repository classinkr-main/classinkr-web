// lib/marketing/perf-assemble.ts
// 퍼포먼스 대시보드 단일 집계 — 소스(DB·Meta 스냅샷)를 모아 MarketingPerfResponse 를 조립한다.
// 순수 계산·응답 계약은 lib/marketing/perf.ts, 이 모듈은 서버 전용 조립만 담당한다.
//
// ── 소스 격리(campaign-rollup-sources 의 gather 패턴) ─────────
// 소스별 실패는 try/catch 로 격리해 해당 섹션만 빈 값/null 로 강등한다 — 한 소스 장애가
// 다른 섹션을 지우거나 전체 응답을 500 으로 만들지 않는다.
// null = "소스 실패(미측정)", 빈 배열/빈 맵 = "성공했지만 데이터 없음" — KPI 는 이 둘을
// 구분해, 실패를 0 으로 포장하지 않는다.
//
// ── 정직 규칙(위반 금지) ──────────────────────────────────────
//  - Meta 금액은 USD 네이티브 — KRW 폴딩·환산 금지(KPI·페이싱·채널믹스 전부 통화 분리).
//  - 분모 0/미측정은 0 이 아니라 null. 집행/매출 null ≠ 0.
//  - 종합 ROAS·채널 ROI 는 계산·표기하지 않는다.

import "server-only"

import { isConvertedLead } from "@/lib/crm/lead-attribution"
import {
  aggregateDailySeries,
  channelSpendFromEventMetrics,
  computeDeltaPct,
  computePacing,
  resolvePerfPeriod,
  shiftDays,
  type MarketingPerfResponse,
  type PerfKpi,
  type PerfPeriodKey,
  type PerfScoreboardRow,
} from "@/lib/marketing/perf"
import { eventAdSpendFromMetrics } from "@/lib/marketing/project-rollup"
import { getMetaCampaignDashboard, type MetaCampaignDashboard } from "@/lib/meta/marketing"
import { latestUpdatesByCampaign, listRecentUpdates } from "@/lib/repositories/campaign-updates"
import { getChannelBudgets } from "@/lib/repositories/channel-budgets"
import { getAllEventMetrics } from "@/lib/repositories/event-metrics"
import { getMarketingLeads, type LeadRecord } from "@/lib/repositories/leads"
import { listCampaigns } from "@/lib/repositories/marketing-campaigns"
import {
  getLatestSyncedAt,
  getMetaInsightsDailyRange,
  type MetaInsightsDailyRecord,
} from "@/lib/repositories/meta-insights-daily"
import { AD_CHANNELS, type AdChannel, type EventMetrics } from "@/lib/types/event-metrics"
import type { CampaignUpdate, CampaignWithLinks } from "@/lib/types/marketing-campaign"

/* ─── KST 날짜 ────────────────────────────────────────────────── */

// en-CA 로케일 = ISO(YYYY-MM-DD) 포맷. 포매터는 생성 비용이 있어 모듈 레벨로 1회만 만든다.
const KST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })

/** KST 기준 오늘(±offsetDays) — 크론(sync-meta-insights)과 perf 조립이 공유하는 단일 정의. */
export function kstToday(offsetDays = 0): string {
  return KST_DATE.format(new Date(Date.now() + offsetDays * 86_400_000))
}

/** 타임스탬프(ISO)를 KST 일자로 접는다. 깨진 날짜는 null — 기간 분할에서 빠진다. */
function kstDateOf(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return KST_DATE.format(d)
}

/* ─── 소소한 산술 ─────────────────────────────────────────────── */

function sum<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0)
}

/** USD 금액 표기 정밀도(센트) — 부동소수 잔여 자릿수를 응답에 흘리지 않는다. */
const round2 = (n: number) => Math.round(n * 100) / 100
/** 비율(%) 은 소수 1자리 — 정수 반올림은 소표본(3/108 등)의 차이를 지운다. */
const round1 = (n: number) => Math.round(n * 10) / 10

/** KPI 봉투 — deltaPct 는 value/previous 에서 파생(하나라도 미측정이거나 이전이 0 이면 null). */
function kpi(value: number | null, previous: number | null, currency?: "USD" | "KRW"): PerfKpi {
  const envelope: PerfKpi = { value, previous, deltaPct: computeDeltaPct(value, previous) }
  if (currency) envelope.currency = currency
  return envelope
}

/* ─── 조립 ────────────────────────────────────────────────────── */

/** 광고 리드 판정 — Meta 리드애즈 유입. 전환 판정(isConvertedLead)과 함께 KPI·퍼널의 분모/분자다. */
const isAdLead = (lead: LeadRecord) => lead.source === "meta_lead_ads"

export async function assembleMarketingPerf(periodKey: PerfPeriodKey): Promise<MarketingPerfResponse> {
  const today = kstToday()
  const period = resolvePerfPeriod(periodKey, today)

  // 스파크라인은 항상 "최근 14일". quarter 초입에는 기간 창(prevSince~until)이 14일보다 짧을
  // 수 있어 로드 범위를 함께 넓힌다 — 로드하지 않은 날짜를 0 으로 채우는 것은 조작이므로,
  // 채워 그릴 범위만큼 실제로 읽는다(7d/30d/90d 는 prevSince 가 이미 14일 이상을 덮는다).
  const sparklineSince = shiftDays(period.until, -13)
  const loadSince = sparklineSince < period.prevSince ? sparklineSince : period.prevSince

  // ── 소스 수집(병렬 + 개별 격리) ──
  const [insightRows, leads, campaigns, budgets, eventMetricsMap, updatesFeed, snapshotAt] =
    await Promise.all([
      // 현재/직전 기간 + 스파크라인 창을 1회 조회로 덮는다 — 이후 전부 메모리 분할.
      getMetaInsightsDailyRange(loadSince, period.until).catch(
        (): MetaInsightsDailyRecord[] | null => null
      ),
      getMarketingLeads().catch((): LeadRecord[] | null => null),
      listCampaigns().catch((): CampaignWithLinks[] => []),
      getChannelBudgets().catch((): Record<AdChannel, number> | null => null),
      getAllEventMetrics().catch((): Record<string, EventMetrics> | null => null),
      listRecentUpdates(20).catch((): CampaignUpdate[] => []),
      getLatestSyncedAt(), // 자체적으로 실패를 null 로 강등한다
    ])

  // ── Meta 일자 스냅샷: 기간 분할 (경계는 KST 일자 문자열 비교 — off-by-one 없음) ──
  const currentRows = insightRows?.filter((r) => r.date >= period.since) ?? []
  const prevRows =
    insightRows?.filter((r) => r.date >= period.prevSince && r.date <= period.prevUntil) ?? []
  const currentSpendUsd = insightRows ? sum(currentRows, (r) => r.spend) : null
  const prevSpendUsd = insightRows ? sum(prevRows, (r) => r.spend) : null

  // ── 리드: created_at(KST 일자)으로 현재/직전 기간 분할 ──
  const currentLeads: LeadRecord[] = []
  const prevLeads: LeadRecord[] = []
  for (const lead of leads ?? []) {
    const date = kstDateOf(lead.timestamp)
    if (!date) continue
    if (date >= period.since && date <= period.until) currentLeads.push(lead)
    else if (date >= period.prevSince && date <= period.prevUntil) prevLeads.push(lead)
  }
  const adLeads = currentLeads.filter(isAdLead)
  const prevAdLeads = prevLeads.filter(isAdLead)
  const convertedAdLeads = adLeads.filter(isConvertedLead)
  const prevConvertedAdLeads = prevAdLeads.filter(isConvertedLead)

  // ── KPI ──
  const spendUsdKpi = kpi(
    currentSpendUsd != null ? round2(currentSpendUsd) : null,
    prevSpendUsd != null ? round2(prevSpendUsd) : null,
    "USD"
  )
  const leadsKpi = leads ? kpi(currentLeads.length, prevLeads.length) : kpi(null, null)
  // CPL(USD) = 기간 Meta spend 합 ÷ 같은 기간 "우리 leads 테이블"의 광고 리드 수.
  // Meta insights 의 leads 필드가 아니라 실제 유입 리드가 분모다(분자·분모 기간 동일).
  const cplUsdKpi =
    currentSpendUsd != null && prevSpendUsd != null && leads
      ? kpi(
          adLeads.length > 0 ? round2(currentSpendUsd / adLeads.length) : null,
          prevAdLeads.length > 0 ? round2(prevSpendUsd / prevAdLeads.length) : null,
          "USD"
        )
      : kpi(null, null, "USD")
  const leadConversionRateKpi = leads
    ? kpi(
        adLeads.length > 0 ? round1((convertedAdLeads.length / adLeads.length) * 100) : null,
        prevAdLeads.length > 0
          ? round1((prevConvertedAdLeads.length / prevAdLeads.length) * 100)
          : null
      )
    : kpi(null, null)

  // KRW 배정 합 대비 KRW 집행 합 — Meta 라이브(USD)는 통화가 달라 절대 불포함(분리 표기).
  // 배정·집행 모두 기간 개념이 없는 수기 누적값이라 previous/delta 는 null 로 고정한다.
  const channelSpend = eventMetricsMap ? channelSpendFromEventMetrics(eventMetricsMap) : null
  let budgetExecutionValue: number | null = null
  if (budgets && channelSpend) {
    const allocatedKrw = sum(Object.values(budgets), (v) => v)
    const measuredSpends = Object.values(channelSpend).filter((v): v is number => v != null)
    // 집행 기록이 한 건도 없으면(전 채널 null) 0% 가 아니라 미측정 — "집행 안 함"과
    // "집행했는데 미입력"을 구분할 수 없다. 명시 입력이 있으면 합이 0 이어도 실측 0%.
    budgetExecutionValue =
      allocatedKrw > 0 && measuredSpends.length > 0
        ? Math.round((sum(measuredSpends, (v) => v) / allocatedKrw) * 100)
        : null
  }
  const budgetExecutionKpi: PerfKpi = {
    value: budgetExecutionValue,
    previous: null,
    deltaPct: null,
    currency: "KRW",
  }

  // ── 스코어보드 준비: 최신 업데이트·Meta 예산(메모 재사용)·행사 KRW 광고비 ──
  const needMetaBudget = campaigns.some(
    (c) => c.links.length > 0 && c.links.every((l) => l.refType === "meta_campaign")
  )
  const [latestByCampaign, metaDash] = await Promise.all([
    campaigns.length > 0
      ? latestUpdatesByCampaign(campaigns.map((c) => c.id)).catch(
          (): Record<string, CampaignUpdate> => ({})
        )
      : ({} as Record<string, CampaignUpdate>),
    needMetaBudget
      ? getMetaCampaignDashboard().catch((): MetaCampaignDashboard | null => null)
      : (null as MetaCampaignDashboard | null),
  ])
  const metaBudgetById = new Map((metaDash?.campaigns ?? []).map((c) => [c.id, c.lifetimeBudget]))
  // lifetimeBudget 은 계정 통화 네이티브 — 계정이 USD 일 때만 "USD" 라벨이 참이다.
  // (프로덕션 계정은 USD. 통화가 바뀌면 라벨을 지어내지 않고 페이싱을 미산정으로 강등.)
  const metaBudgetIsUsd = metaDash?.account.currency === "USD"
  const eventAdSpend = eventMetricsMap ? eventAdSpendFromMetrics(eventMetricsMap) : null

  const rowsByMetaCampaign = new Map<string, MetaInsightsDailyRecord[]>()
  for (const row of insightRows ?? []) {
    const list = rowsByMetaCampaign.get(row.campaignId)
    if (list) list.push(row)
    else rowsByMetaCampaign.set(row.campaignId, [row])
  }
  const sparklineDates: string[] = []
  for (let i = 13; i >= 0; i -= 1) sparklineDates.push(shiftDays(period.until, -i))

  const scoreboard: PerfScoreboardRow[] = campaigns.map((campaign) => {
    const metaRefIds = campaign.links
      .filter((l) => l.refType === "meta_campaign")
      .map((l) => l.refId)
    const metaRows = metaRefIds.flatMap((id) => rowsByMetaCampaign.get(id) ?? [])
    const currentMetaRows = metaRows.filter((r) => r.date >= period.since)

    // 캠페인 귀속이 가능한 유일한 리드 축은 링크된 Meta 캠페인의 일자 leads 카운트다 —
    // KPI 의 리드(우리 leads 테이블)와 정의가 다르며, 리드 1건→광고 캠페인 개별 귀속이
    // 불가능해 여기서만 Meta 카운트를 쓴다.
    const leadsCount = sum(currentMetaRows, (r) => r.leads)
    const spendSum = sum(currentMetaRows, (r) => r.spend)

    // 스파크라인(최근 14일) — 로드 범위가 항상 14일을 덮으므로 행이 없는 날은 실제
    // 무집행(0)이다. 소스 실패·Meta 링크 부재(축 자체가 없음) 시엔 0 을 지어내지 않고
    // 빈 배열로 강등한다.
    let sparkline: Array<{ date: string; leads: number }> = []
    if (insightRows && metaRefIds.length > 0) {
      const leadsByDate = new Map<string, number>()
      for (const r of metaRows) {
        if (r.date >= sparklineSince) {
          leadsByDate.set(r.date, (leadsByDate.get(r.date) ?? 0) + r.leads)
        }
      }
      sparkline = sparklineDates.map((date) => ({ date, leads: leadsByDate.get(date) ?? 0 }))
    }

    // 페이싱 통화 결정 — 혼합 통화 집행률 금지:
    //  (1) 링크가 전부 Meta 이고 lifetimeBudget(계정 통화=USD) 합>0 → USD 기준.
    //      분자는 조회 기간의 Meta spend — lifetime 예산 대비 과소 방향이라 과대포장 없음.
    //      insights 소스가 죽었으면 spend 미상이므로 0% 로 포장하지 않고 미산정으로 둔다.
    //  (2) 캠페인 KRW 예산>0 이고 event 링크가 있으면 → 링크된 행사 KRW 광고비 합 기준.
    //  (3) 둘 다 아니면 집행률 미산정(null) — 기간 경과율은 항상 계산한다.
    const allMeta =
      campaign.links.length > 0 && campaign.links.every((l) => l.refType === "meta_campaign")
    const eventIds = [
      ...new Set(campaign.links.filter((l) => l.refType === "event").map((l) => l.refId)),
    ]
    let pacingSpend: number | null = null
    let pacingBudget: number | null = null
    let pacingCurrency: "USD" | "KRW" | null = null
    if (allMeta && metaBudgetIsUsd && insightRows) {
      const lifetimeSum = sum(metaRefIds, (id) => metaBudgetById.get(id) ?? 0)
      if (lifetimeSum > 0) {
        pacingSpend = spendSum
        pacingBudget = lifetimeSum
        pacingCurrency = "USD"
      }
    }
    if (
      pacingCurrency === null &&
      campaign.budget != null &&
      campaign.budget > 0 &&
      eventIds.length > 0 &&
      eventAdSpend
    ) {
      pacingSpend = sum(eventIds, (id) => eventAdSpend[id] ?? 0)
      pacingBudget = campaign.budget
      pacingCurrency = "KRW"
    }

    const latest = latestByCampaign[campaign.id]
    return {
      campaignId: campaign.id,
      name: campaign.name,
      status: campaign.status,
      pacing: computePacing({
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        today,
        spend: pacingSpend,
        budget: pacingBudget,
      }),
      pacingCurrency,
      leads: leadsCount,
      cpl: leadsCount > 0 ? round2(spendSum / leadsCount) : null,
      sparkline,
      latestUpdate: latest
        ? {
            body: latest.body,
            kind: latest.kind,
            createdAt: latest.createdAt,
            createdBy: latest.createdBy,
          }
        : null,
      anomalies: [], // Phase 3 전까지 빈 배열
    }
  })

  // ── 채널 믹스: 7채널 배정(KRW) vs 수기 집행(KRW), meta 행에만 라이브 USD 를 분리 표기 ──
  const channelMix = budgets
    ? AD_CHANNELS.map((channel) => ({
        channel,
        budget: budgets[channel],
        spendKrw: channelSpend ? channelSpend[channel] : null,
        metaSpendUsd:
          channel === "meta" && currentSpendUsd != null ? round2(currentSpendUsd) : null,
      }))
    : []

  return {
    period,
    snapshotAt,
    kpis: {
      spendUsd: spendUsdKpi,
      leads: leadsKpi,
      cplUsd: cplUsdKpi,
      leadConversionRate: leadConversionRateKpi,
      budgetExecutionPct: budgetExecutionKpi,
    },
    daily: aggregateDailySeries(currentRows),
    scoreboard,
    // 퍼널은 계약상 숫자 고정 — 소스 실패 시 0 으로 강등되는 유일한 지점(빈 데이터와 동일 표기).
    // 실패 여부는 KPI(null)와 snapshotAt 으로 구분 가능하다.
    funnel: {
      impressions: sum(currentRows, (r) => r.impressions),
      clicks: sum(currentRows, (r) => r.clicks),
      adLeads: adLeads.length,
      convertedLeads: convertedAdLeads.length,
    },
    channelMix,
    updatesFeed,
  }
}

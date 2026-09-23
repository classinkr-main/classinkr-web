"use client"

import { useCallback, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { ChartSkeleton, EmptyState, Skeleton } from "@/components/admin/viz"
import CompassPipelineBand, { useCompassPipeline } from "@/components/admin/compass/CompassPipelineBand"
import { BriefingCard } from "@/components/admin/campaigns/perf/BriefingCard"
import type { BriefingAction, BriefingCardProps, BriefingContent } from "@/components/admin/campaigns/perf/BriefingCard"
import { FunnelCard } from "@/components/admin/campaigns/perf/FunnelCard"
import { KpiStrip } from "@/components/admin/campaigns/perf/KpiStrip"
import { MetricDefinitionsDrawer } from "@/components/admin/campaigns/perf/MetricDefinitionsDrawer"
import { TodayIntakeCard } from "@/components/admin/campaigns/perf/TodayIntakeCard"
import { usePerf } from "@/components/admin/campaigns/perf/use-perf"
import { useInsights } from "@/components/admin/campaigns/perf/use-insights"
import { COUNT, PCT1, money } from "@/components/admin/campaigns/event-format"
import { ANOMALY_KIND_LABEL, type AnomalyFlag, type AnomalyKind } from "@/lib/marketing/anomaly"
import type { MarketingGlanceInitialData, MarketingInsightRecord, MarketingInsightsResponse } from "@/lib/marketing/glance-initial-data"
import { campaignHubHref } from "@/lib/marketing/hub-tabs"
import { PERF_PERIOD_BADGE, isPerfPeriodKey, type MarketingPerfResponse, type PerfPeriodKey } from "@/lib/marketing/perf"
import { describeVerdictStatus, resolveVerdictStatus } from "@/lib/marketing/verdict"

// "한눈에" 탭(1층) = 마케팅 대시보드의 첫 화면.
//
// 2026-09-14 재구성: 우측 384px 레일의 콕핏 2단을 버리고 전폭 밴드 순서로 다시 조립했다 —
//   판정 → 숫자 4 → 추이·지금 → 근거(퍼널·Top 3) → 참조(Compass) → 각주.
// 아래로 갈수록 참조 정보다. 소재별 CPL·업데이트 피드·주간 보고서 본문·채널 믹스는 상세·데이터
// 층으로 갔다(기획 docs/active/marketing-tab-dashboard-restructure-2026-09-14.md §3.2).
//
// 데이터는 perf 단일 엔드포인트(/api/admin/marketing/perf) + insights + intake-today + Compass
// 파이프라인 넷뿐이다. 기간 토글은 탭 띠(페이지)가 소유하고 여기서는 period 를 받기만 한다.

// Recharts 를 끄는 두 섹션만 청크 분리 — 나머지(판정·히어로·퍼널·Compass)는 Recharts-free 정적 import.
const DailyTrendSection = dynamic(
  () => import("@/components/admin/campaigns/perf/DailyTrendSection").then((m) => m.DailyTrendSection),
  { ssr: false, loading: () => <ChartSkeleton className="h-[380px]" /> }
)
const CampaignScoreboard = dynamic(
  () => import("@/components/admin/campaigns/perf/CampaignScoreboard").then((m) => m.CampaignScoreboard),
  { ssr: false, loading: () => <ChartSkeleton className="h-[220px]" /> }
)

/* ─── 브리핑 콘텐츠 — AI payload 우선, 실패 시 규칙 기반 폴백 ───────────────────── */
// 규칙 생성기는 실측된 축만 말하고, null 은 문장으로 만들지 않는다. AI 브리핑이 없거나 생성에
// 실패하면 이 규칙 생성기로 폴백한다 — 빈 밴드는 만들지 않는다.

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

function buildBriefing(perf: MarketingPerfResponse): BriefingContent {
  const { kpis, snapshotAt, scoreboard } = perf
  const spend = kpis.spendUsd.value
  const leads = kpis.leads.value
  const snapshotMissing = spend == null && snapshotAt == null

  const items: string[] = []
  const actions: BriefingAction[] = []

  // 헤드라인 1문장 — 실측된 축만 말한다.
  let headline: string
  if (snapshotMissing) {
    headline = "Meta 인사이트 스냅샷이 아직 적재되지 않아 광고 지표를 집계할 수 없습니다."
  } else if (leads != null && leads === 0) {
    headline = `기간 내 집계된 리드가 없습니다${spend != null ? ` — 광고비는 ${money(spend, "USD")} 집행됐습니다` : ""}.`
  } else {
    const parts: string[] = []
    if (leads != null) {
      parts.push(
        `리드 ${COUNT.format(leads)}건${kpis.leads.deltaPct != null ? `, 이전 기간 대비 ${signed(kpis.leads.deltaPct)}%` : ""}`
      )
    }
    if (spend != null) parts.push(`광고비 ${money(spend, "USD")}`)
    if (kpis.cplUsd.value != null) {
      parts.push(
        `CPL ${money(kpis.cplUsd.value, "USD")}${
          kpis.cplUsd.deltaPct != null ? `(${kpis.cplUsd.deltaPct <= 0 ? "개선" : "상승"} ${signed(kpis.cplUsd.deltaPct)}%)` : ""
        }`
      )
    }
    headline =
      parts.length > 0
        ? `${parts.join(" · ")}.`
        : "집계 가능한 지표가 없습니다 — 소스 연결 상태를 확인하세요."
  }

  // 인사이트 항목 — 값이 실측된 지표만.
  if (kpis.leadConversionRate.value != null) {
    const delta =
      kpis.leadConversionRate.deltaPct != null
        ? ` — 이전 기간 대비 ${signed(kpis.leadConversionRate.deltaPct)}%`
        : ""
    items.push(`광고 리드 전환율 ${PCT1.format(kpis.leadConversionRate.value)}%${delta}`)
  }
  if (kpis.budgetExecutionPct.value != null) {
    items.push(`KRW 채널 예산 집행률 ${PCT1.format(kpis.budgetExecutionPct.value)}% — 배정 대비 수기 집행 기준`)
  }
  // 페이싱 뒤처짐(집행률이 기간 경과율보다 20%p 이상 뒤) — 가장 벌어진 진행 캠페인 1건만.
  const lagging = scoreboard
    .filter(
      (row) =>
        row.status === "active" &&
        row.pacing.executionPct != null &&
        row.pacing.elapsedPct != null &&
        row.pacing.elapsedPct - row.pacing.executionPct >= 20
    )
    .sort(
      (a, b) =>
        (b.pacing.elapsedPct ?? 0) - (b.pacing.executionPct ?? 0) -
        ((a.pacing.elapsedPct ?? 0) - (a.pacing.executionPct ?? 0))
    )[0]
  if (lagging) {
    items.push(
      `「${lagging.name}」 집행 ${lagging.pacing.executionPct}% < 기간 경과 ${lagging.pacing.elapsedPct}% — 집행이 일정 대비 뒤처져 있습니다`
    )
  }

  // 번호 액션 최대 3 — 근거(why)와 함께.
  if (snapshotMissing) {
    actions.push({
      title: "Meta 인사이트 스냅샷 적재 확인(크론/백필)",
      why: "스냅샷 미적재 — 광고비·CPL·퍼널 상단이 비어 있습니다",
    })
  }
  if (leads != null && leads === 0) {
    actions.push({
      title: "리드 유입 경로 점검 — Meta 연결·폼 상태 확인",
      why: "기간 내 집계 리드 0건",
    })
  }
  if (kpis.cplUsd.deltaPct != null && kpis.cplUsd.deltaPct >= 20) {
    actions.push({
      title: "CPL 상승 — 소재·타겟 점검",
      why: `이전 기간 대비 +${kpis.cplUsd.deltaPct}%`,
    })
  }
  if (lagging) {
    actions.push({
      title: `「${lagging.name}」 예산 집행 재배분 검토`,
      why: "기간 경과 대비 집행률이 20%p 이상 뒤처짐",
    })
  }
  const staleActive = scoreboard.filter((row) => row.status === "active" && !row.latestUpdate)
  if (staleActive.length > 0) {
    actions.push({
      title: "진행 캠페인에 업데이트 기록 남기기",
      why: `기록 없는 진행 캠페인 ${staleActive.length}개`,
    })
  }

  return {
    headline,
    items: items.slice(0, 3),
    actions: actions.slice(0, 3),
    badges: [PERF_PERIOD_BADGE[perf.period.key], "규칙 기반"],
  }
}

/** 이상 신호 배지 — 종류별로 접고 2건 이상이면 개수를 붙인다("CPL 급등 2"). */
function anomalyBadges(flags: readonly AnomalyFlag[]): string[] {
  const counts = new Map<string, number>()
  for (const flag of flags) counts.set(flag.kind, (counts.get(flag.kind) ?? 0) + 1)
  return [...counts].map(([kind, count]) => {
    const label = ANOMALY_KIND_LABEL[kind as AnomalyKind] ?? kind
    return count > 1 ? `${label} ${count}` : label
  })
}

/** AI payload → 표시 콘텐츠. jsonb 라 형태를 신뢰하지 않고 문자열·객체만 통과시킨다. */
function briefingFromInsight(insight: MarketingInsightRecord): BriefingContent {
  const highlights = Array.isArray(insight.payload?.highlights) ? insight.payload.highlights : []
  const nextActions = Array.isArray(insight.payload?.next_actions) ? insight.payload.next_actions : []
  // 브리핑이 실제로 본 기간을 그대로 표기한다 — 대시보드 기간 토글과 다를 수 있고(브리핑은
  // 항상 30일 기준), 선택한 기간 배지를 붙이면 AI 문장을 그 기간 이야기로 오독하게 된다.
  const insightPeriod = insight.payload?.period?.key
  const periodBadge = isPerfPeriodKey(insightPeriod) ? PERF_PERIOD_BADGE[insightPeriod] : null

  return {
    headline: insight.headline,
    items: highlights.filter((item) => typeof item === "string" && item.trim() !== "").slice(0, 3),
    actions: nextActions
      .filter((action): action is { title: string; why?: string } =>
        Boolean(action && typeof action.title === "string" && action.title.trim() !== "")
      )
      .map((action) => ({ title: action.title, why: action.why }))
      .slice(0, 3),
    badges: periodBadge ? [periodBadge] : [],
  }
}

const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
})

/** 스냅샷 시각·브리핑 생성 시각 공용 표기(KST). 깨진 값은 지어내지 않고 원문 그대로. */
function formatKstTime(iso: string): string {
  const time = new Date(iso)
  return Number.isNaN(time.getTime()) ? iso : KST_TIME.format(time)
}

/** "YYYY-MM-DD" → "MM.DD" — Meta 데이터 완결 일자 표기. */
function shortIsoDate(iso: string): string {
  return iso.length >= 10 ? `${iso.slice(5, 7)}.${iso.slice(8, 10)}` : iso
}

/**
 * 밴드에 넘길 최종 props — AI 브리핑이 있으면 그것을, 없으면 규칙 기반을 쓰고
 * 어느 쪽인지·언제 것인지·왜 강등됐는지를 항상 표기한다(무음 폴백 금지).
 */
function composeBriefing(
  perf: MarketingPerfResponse,
  insights: MarketingInsightsResponse | null,
  insightsError: string | null
): Omit<BriefingCardProps, "status" | "statusLine" | "snapshotLine"> {
  const badges = anomalyBadges(insights?.anomalies ?? [])
  const insight = insights?.insight ?? null

  if (insight) {
    const content = briefingFromInsight(insight)
    const stale = insights?.from === "stale"
    return {
      ...content,
      badges: [...content.badges, ...badges],
      meta: `AI 브리핑 · ${formatKstTime(insight.created_at)} 생성`,
      note: stale
        ? `최신 브리핑 재생성에 실패해 ${formatKstTime(insight.created_at)} 기준으로 표시합니다${
            insights?.error ? ` — ${insights.error}` : ""
          }`
        : null,
    }
  }

  // 폴백 — 규칙 기반. 왜 AI 가 아닌지를 한 줄로 밝힌다.
  const content = buildBriefing(perf)
  let note: string | null = null
  if (insightsError) note = `AI 브리핑을 불러오지 못했습니다 — ${insightsError}`
  else if (insights?.from === "error")
    note = `AI 브리핑 생성에 실패했습니다${insights.error ? ` — ${insights.error}` : ""}`
  else if (insights?.from === "empty") note = "AI 브리핑 없음 — 「다시 생성」으로 생성"

  return { ...content, badges: [...content.badges, ...badges], meta: null, note }
}

/* ─── 스켈레톤 — 밴드 순서 그대로 높이를 예약한다(콜드로드 → 실데이터 전환 점프 방지) ── */

function GlanceSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <ChartSkeleton className="h-[150px] rounded-2xl" />
      <div className="rounded-2xl border border-[#e8e8e4] bg-white px-5 py-1 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 py-4">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-2.5 w-32" />
              <Skeleton className="h-[28px] w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <ChartSkeleton className="h-[380px]" />
        <ChartSkeleton className="h-[380px]" />
      </div>
      <ChartSkeleton className="h-[150px]" />
      <ChartSkeleton className="h-[220px]" />
    </div>
  )
}

/* ─── 본체 ────────────────────────────────────────────────────────────────────── */

export default function SummaryTab({
  period,
  refreshNonce,
  onLoadingChange,
  initialData,
}: {
  period: PerfPeriodKey
  /** 페이지 헤더 "동기화" 트리거 — 증가할 때마다 캐시 우회 재조회. */
  refreshNonce: number
  /** 헤더 동기화 버튼 스피너용 — perf 로딩 상태를 페이지에 올려보낸다. */
  onLoadingChange?: (loading: boolean) => void
  /** 서버 프리페치(RSC) — 첫 HTML 에 실린 응답. 없으면 클라이언트 페치로 시작한다. */
  initialData?: MarketingGlanceInitialData | null
}) {
  const generatedAt = initialData?.generatedAt
  const { data, loading, error, reload } = usePerf(period, refreshNonce, {
    initialData: initialData?.perf,
    initialGeneratedAt: generatedAt,
  })
  const {
    data: insights,
    error: insightsError,
    regenerating,
    reload: reloadInsights,
  } = useInsights(refreshNonce, { initialData: initialData?.insights, initialGeneratedAt: generatedAt })
  const compass = useCompassPipeline(refreshNonce)

  useEffect(() => {
    onLoadingChange?.(loading)
  }, [loading, onLoadingChange])

  const briefing = useMemo(
    () => (data ? composeBriefing(data, insights, insightsError) : null),
    [data, insights, insightsError]
  )

  const regenerateBriefing = useCallback(() => {
    void reloadInsights({ regenerate: true })
  }, [reloadInsights])

  // 판정 상태 점 — 규칙은 lib/marketing/verdict.ts. 측정 여부는 스냅샷·리드 축 중 하나라도 실측인가.
  const verdict = useMemo(() => {
    if (!data) return null
    const anomalies = insights?.anomalies ?? []
    const measured = data.kpis.spendUsd.value != null || data.kpis.leads.value != null
    const status = resolveVerdictStatus({ anomalies, funnel: data.funnel, measured })
    const noContactYet = data.funnel.adLeads > 0 && data.funnel.contacted === 0
    return { status, line: describeVerdictStatus(status, anomalies.length, noContactYet) }
  }, [data, insights])

  // Meta 스냅샷 축 실측 여부 — 퍼널의 노출·클릭 0 강등을 표시층에서 구분하기 위한 신호.
  const metaMeasured = data != null && data.kpis.spendUsd.value != null && data.snapshotAt != null
  const snapshotLine = data
    ? data.snapshotAt
      ? `스냅샷 ${formatKstTime(data.snapshotAt)}${data.metaDataThrough ? ` · Meta ${shortIsoDate(data.metaDataThrough)}까지` : ""}`
      : "스냅샷 미적재"
    : null

  // 이 기간 미컨택 광고 리드 — "지금" 카드 발치의 다음 행동. 기간 축이라 기간 라벨을 함께 쓴다.
  const uncontacted = data ? Math.max(0, data.funnel.adLeads - data.funnel.contacted) : 0
  const detailCampaignsHref = campaignHubHref({ tab: "detail", section: "campaigns", perf: period })
  const detailFunnelHref = campaignHubHref({ tab: "detail", section: "funnel", perf: period })
  const newLeadsHref = campaignHubHref({ tab: "data", section: "new-leads", perf: period })

  return (
    <div className="space-y-4">
      {error && !data ? (
        <EmptyState
          title="퍼포먼스 집계를 불러오지 못했습니다"
          description={error}
          action={
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex items-center rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
            >
              다시 시도
            </button>
          }
        />
      ) : !data || !briefing || !verdict ? (
        <GlanceSkeleton />
      ) : (
        <div aria-busy={loading} className={loading ? "space-y-4 opacity-60 transition-opacity" : "space-y-4"}>
          {/* 재조회 실패 시 화면은 기존 데이터로 유지하되 실패를 밝힌다(무음 강등 금지). */}
          {error && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-[#e8e8e4] px-4 py-3 text-[12px] text-[#1a1a1a]/55"
            >
              <span>{error}</span>
              <button type="button" onClick={() => void reload()} className="shrink-0 font-medium text-[#084734] hover:underline">
                다시 시도
              </button>
            </div>
          )}

          {/* 1. 판정 — 화면의 주어. */}
          <BriefingCard
            {...briefing}
            status={verdict.status}
            statusLine={verdict.line}
            snapshotLine={snapshotLine}
            onRegenerate={regenerateBriefing}
            regenerating={regenerating}
          />

          {/* 2. 핵심 숫자 4 — 스파크라인 원천 2종: 광고비는 Meta 일자 스냅샷, 리드는 리드DB 축. */}
          <KpiStrip
            kpis={data.kpis}
            daily={data.daily}
            leadDailyBySource={data.leadDailyBySource}
            period={data.period}
            funnel={data.funnel}
          />

          {/* 3. 추이(기간 축) + 지금(기간과 무관한 축) — 기간 지표 사이에 끼우면 30일 숫자로 오독되므로 열을 나눈다. */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] xl:items-stretch">
            <DailyTrendSection
              daily={data.daily}
              leadDailyBySource={data.leadDailyBySource}
              period={data.period}
              snapshotAt={data.snapshotAt}
              leadsMeasured={data.kpis.leads.value != null}
            />
            <TodayIntakeCard
              variant="hero"
              maxItems={5}
              refreshNonce={refreshNonce}
              initialData={initialData?.intake}
              initialGeneratedAt={generatedAt}
              footer={
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#f0f0ec] pt-3 text-[12px]">
                  <span className={uncontacted > 0 ? "font-semibold text-[#B85C33]" : "text-[#615D59]"}>
                    {PERF_PERIOD_BADGE[period]} 미컨택 광고 리드 {COUNT.format(uncontacted)}건
                  </span>
                  <Link href={newLeadsHref} className="inline-flex items-center gap-1 font-semibold text-[#084734] hover:underline">
                    신규 리드 큐 → 데이터 <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                </div>
              }
            />
          </div>

          {/* 4. 근거 — 가로 퍼널 + Top 3 캠페인. 전체 스코어보드·세로 퍼널·채널 믹스는 상세 층. */}
          <FunnelCard
            funnel={data.funnel}
            metaMeasured={metaMeasured}
            layout="horizontal"
            action={
              <Link href={detailFunnelHref} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] hover:underline">
                세로 퍼널 · 채널 믹스 → 상세 <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            }
          />
          <CampaignScoreboard rows={data.scoreboard} compact limit={3} moreHref={detailCampaignsHref} />

          {/* 5. 참조 — Compass 파이프라인 3칸. 권한 밖 계정(403)에는 빈 자리를 보여주지 않는다. */}
          {!compass.forbidden && (
            <CompassPipelineBand
              quiet
              data={compass.data}
              loading={compass.loading}
              error={compass.error}
              onRetry={compass.retry}
            />
          )}

          {/* 6. 각주 — 한 줄 + 정의 드로어. 카드마다 붙던 정직 각주를 여기로 모았다. */}
          <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 text-[11px] leading-relaxed text-[#A39E98]">
            <span className="min-w-0 flex-1">
              리드 = 리드DB 전 소스(테스트 제외) · 광고비·CPL = Meta USD 네이티브 · 전환율 = 광고 리드 중 전환 · 오늘 유입 = 리드DB + Compass 전화 키 접기. 미측정은 —, 0은 실측 0.
            </span>
            <MetricDefinitionsDrawer />
          </footer>
        </div>
      )}
    </div>
  )
}

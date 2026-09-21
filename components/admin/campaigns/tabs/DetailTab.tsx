"use client"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import dynamic from "next/dynamic"
import { AlertCircle } from "lucide-react"
import { ChartSkeleton, EmptyState } from "@/components/admin/viz"
import { HubSection, SectionNav, useScrollToHash } from "@/components/admin/campaigns/SectionNav"
import AiCreativeSuggestSection from "@/components/admin/campaigns/creative/AiCreativeSuggestSection"
import { EventPerformanceSection } from "@/components/admin/campaigns/events/EventPerformanceSection"
import { MetaDatePresetToggle } from "@/components/admin/campaigns/meta/MetaCampaignPanel"
import type { MetaPerfRow } from "@/components/admin/campaigns/MetaPerformanceCharts"
import { AttributionFunnelCard } from "@/components/admin/campaigns/perf/AttributionFunnelCard"
import { ChannelCoverageMatrix } from "@/components/admin/campaigns/perf/ChannelCoverageMatrix"
import { ChannelLiveStrip } from "@/components/admin/campaigns/perf/ChannelLiveStrip"
import { ChannelMixCard } from "@/components/admin/campaigns/perf/ChannelMixCard"
import { EmailPerformanceCard } from "@/components/admin/campaigns/perf/EmailPerformanceCard"
import { FunnelCard } from "@/components/admin/campaigns/perf/FunnelCard"
import { usePerf } from "@/components/admin/campaigns/perf/use-perf"
import { DETAIL_SECTIONS, campaignHubHref } from "@/lib/marketing/hub-tabs"
import type { PerfPeriodKey } from "@/lib/marketing/perf"
import { AD_CHANNELS } from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"
import type { MetaCampaignDashboard, MetaDatePreset, PerEventEconRow, Period } from "./types"

// "상세" 탭(2층) — 왜 그런가, 어디서. 차트 위주, 섹션 내비는 스티키.
// 캠페인 · 소재 · 퍼널·채널 · 행사 · 메시지 성과. 기존 컴포넌트를 옮겨 담았고 쓰기 액션은 없다
// (쓰기는 데이터 층). 기획 docs/active/marketing-tab-dashboard-restructure-2026-09-14.md §3.5.
//
// perf 응답은 한눈에 층과 같은 훅·같은 cacheKey(usePerf)를 써서 탭을 오가도 한 응답을 재사용한다.

const CampaignScoreboard = dynamic(
  () => import("@/components/admin/campaigns/perf/CampaignScoreboard").then((m) => m.CampaignScoreboard),
  { ssr: false, loading: () => <ChartSkeleton className="h-[280px]" /> }
)
const CreativeCplCard = dynamic(
  () => import("@/components/admin/campaigns/perf/CreativeCplCard").then((m) => m.CreativeCplCard),
  { ssr: false, loading: () => <ChartSkeleton className="h-[300px]" /> }
)
// 광고세트별 성과(Compass 브리지) — 소재 카드 바로 아래 마운트. Recharts 는 안 쓰지만
// 자기 엔드포인트를 직접 fetch 하는 client-only 카드라 소재 카드와 같은 청크 규약을 따른다.
const AdsetPerfCard = dynamic(
  () => import("@/components/admin/campaigns/perf/AdsetPerfCard").then((m) => m.AdsetPerfCard),
  { ssr: false, loading: () => <ChartSkeleton className="h-[260px]" /> }
)
const MetaPerformanceCharts = dynamic(
  () => import("@/components/admin/campaigns/MetaPerformanceCharts").then((m) => m.MetaPerformanceCharts),
  { ssr: false, loading: () => <ChartSkeleton className="h-[260px]" /> }
)

export interface DetailTabProps {
  period: PerfPeriodKey
  refreshNonce: number
  /** Meta 라이브 대시보드 — 차트용. 표·재개/중지는 데이터 층. */
  metaDashboard: MetaCampaignDashboard | null
  metaLoading: boolean
  metaError: string | null
  metaDatePreset: MetaDatePreset
  onMetaDatePresetChange: (value: MetaDatePreset) => void
  /** 코어(행사·리드·지표) — 행사 성과 비교의 원천. */
  coreLoading: boolean
  coreError: string | null
  filtered: PublicEvent[]
  perEventEcon: PerEventEconRow[]
  eventPeriod: Period
  setEventPeriod: Dispatch<SetStateAction<Period>>
}

export default function DetailTab({
  period,
  refreshNonce,
  metaDashboard,
  metaLoading,
  metaError,
  metaDatePreset,
  onMetaDatePresetChange,
  coreLoading,
  coreError,
  filtered,
  perEventEcon,
  eventPeriod,
  setEventPeriod,
}: DetailTabProps) {
  const { data: perf, error: perfError, reload } = usePerf(period, refreshNonce)
  const sectionIds = useMemo(() => DETAIL_SECTIONS.map((section) => section.id), [])
  // 섹션이 전부 마운트된 뒤(perf 도착) 해시 착지 — 레거시 ?tab=meta 등이 여기로 온다.
  useScrollToHash(perf != null, sectionIds)

  // Meta 차트용 행 — 구 광고 탭과 같은 파생.
  const metaPerfRows = useMemo<MetaPerfRow[]>(() => {
    const campaigns = metaDashboard?.campaigns ?? []
    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      spend: c.insights.spend,
      leads: c.insights.leads,
      clicks: c.insights.clicks,
      impressions: c.insights.impressions,
      ctr: c.insights.ctr,
      cpc: c.insights.cpc,
      cpl: c.insights.leads > 0 ? c.insights.spend / c.insights.leads : null,
      status: c.effectiveStatus ?? c.status,
    }))
  }, [metaDashboard])

  const budgetsHref = campaignHubHref({ tab: "data", section: "budgets", perf: period })

  // 라이브 연동 채널을 뺀 나머지 — 수기 입력만 있는 채널 수(카카오·YouTube·오프라인·기타).
  // AD_CHANNELS 에서 파생해 채널이 늘 때 이 숫자가 자동으로 맞는다.
  const manualChannelCount = AD_CHANNELS.length - (perf?.channelLive.length ?? 0)

  const perfFallback = perfError ? (
    <EmptyState
      title="퍼포먼스 집계를 불러오지 못했습니다"
      description={perfError}
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
  ) : (
    <ChartSkeleton className="h-[280px]" />
  )

  return (
    <div>
      <SectionNav sections={DETAIL_SECTIONS} label="상세 섹션" />
      <div className="space-y-10 pb-8">
        <HubSection
          id="campaigns"
          title="캠페인"
          description="우산 캠페인 스코어보드(perf 스냅샷, 링크 귀속 리드)와 Meta 라이브 차트(리포트 리드) — 두 리드 축은 모집단이 다르다"
          action={<MetaDatePresetToggle value={metaDatePreset} onChange={onMetaDatePresetChange} />}
        >
          {perf ? <CampaignScoreboard rows={perf.scoreboard} /> : perfFallback}
          <div className="mt-4">
            {metaError && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[12.5px] text-[#B43E3E]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{metaError}</span>
              </div>
            )}
            {metaPerfRows.length > 0 ? (
              <MetaPerformanceCharts rows={metaPerfRows} currency={metaDashboard?.account.currency ?? "USD"} />
            ) : metaLoading ? (
              <ChartSkeleton className="h-[260px]" />
            ) : (
              <p className="rounded-xl bg-[#fafaf8] py-6 text-center text-[12px] text-[#A39E98]">
                표시할 Meta 캠페인이 없습니다 — 계정 연결과 표는 데이터 › Meta 캠페인에서 확인합니다.
              </p>
            )}
          </div>
        </HubSection>

        <HubSection
          id="creatives"
          title="소재"
          description="소재별·광고세트별 지출·CPL(Compass 브리지, Meta 리포트 리드 축) + 리드·전환 랭킹 기반 AI 제안"
        >
          <div className="space-y-6">
            <CreativeCplCard period={period} refreshNonce={refreshNonce} />
            {/* 광고세트별 성과 — 소재별 CPL 바로 아래. 같은 질문의 한 단 위 해상도(세트)라 붙여 둔다.
                3층 재구성 전에는 요약 탭 좌측 컬럼에 있었다 — 소재 카드가 상세 › 소재로 오면서 함께 옮겼다. */}
            <AdsetPerfCard period={period} refreshNonce={refreshNonce} />
            <AiCreativeSuggestSection />
          </div>
        </HubSection>

        <HubSection
          id="funnel"
          title="퍼널·채널"
          description="세로 퍼널(단계별 이탈 수) · 귀속 폭포(리드에 출처를 붙일 수 있는가) + 채널 믹스(KRW 배정·집행, Meta USD 병기) · 채널별 라이브 집행(Meta·Google·네이버) — 배정 입력은 데이터 층"
        >
          {perf ? (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
                <FunnelCard
                  funnel={perf.funnel}
                  metaMeasured={perf.kpis.spendUsd.value != null && perf.snapshotAt != null}
                  layout="vertical"
                />
                <ChannelMixCard channelMix={perf.channelMix} budgetExecution={perf.kpis.budgetExecutionPct} editHref={budgetsHref} />
              </div>
              {/* 채널별 집행 — 채널 믹스(배정 대비 집행) 바로 아래. KPI 의 spendUsd 는 Meta 축 한 줄이라
                  채널이 셋이 되면 그 칸만 보고는 어디에 얼마를 썼는지 알 수 없다. 커버리지 매트릭스는
                  접어 둔다 — 매일 볼 표가 아니라 "어디가 비었나"를 물을 때 여는 표다.
                  3층 재구성 전에는 요약 탭 KPI 스트립 아래에 있었다 — 한눈에 층은 판정·핵심 숫자만 두므로
                  "왜·어디서"를 답하는 이 층으로 옮겼다. */}
              <div className="flex flex-col gap-3">
                <ChannelLiveStrip channels={perf.channelLive} manualChannelCount={manualChannelCount} />
                <ChannelCoverageMatrix channels={perf.channelLive} />
              </div>
              {/* 귀속 폭포 — 퍼널 카드와 같은 섹션에 둔다. 둘 다 '퍼널'이지만 축이 다르다:
                  위는 리드가 고객이 되는 과정, 여기는 리드에 출처를 붙일 수 있는가.
                  떨어뜨려 놓으면 같은 걸 두 번 그린 것처럼 읽힌다. */}
              <AttributionFunnelCard
                funnel={perf.attributionFunnel}
                leadsMeasured={perf.kpis.leads.value != null}
              />
            </div>
          ) : (
            perfFallback
          )}
        </HubSection>

        <HubSection id="events" title="행사" description="행사 성과 비교 — 캘린더 타임라인 · 행사별 퍼널 · 목표 달성 · ROI · 리더보드">
          {coreError && (
            <div className="mb-3 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[13px] text-[#B43E3E]">{coreError}</div>
          )}
          <EventPerformanceSection
            loading={coreLoading}
            filtered={filtered}
            perEventEcon={perEventEcon}
            period={eventPeriod}
            setPeriod={setEventPeriod}
          />
        </HubSection>

        <HubSection id="messages" title="메시지 성과" description="이메일 캠페인 오픈·클릭 — 발송·구독자·자동화는 메시지 탭">
          <EmailPerformanceCard messagesHref={campaignHubHref({ tab: "email" })} />
        </HubSection>
      </div>
    </div>
  )
}

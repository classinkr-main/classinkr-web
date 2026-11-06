"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import { AlertCircle } from "lucide-react"
import { ChartSkeleton, EmptyState } from "@/components/admin/viz"
import { AdChannelCards } from "@/components/admin/campaigns/ads/AdChannelCards"
import { HubSection, useScrollToHash } from "@/components/admin/campaigns/SectionNav"
import { MetaDatePresetToggle } from "@/components/admin/campaigns/meta/MetaCampaignPanel"
import type { MetaPerfRow } from "@/components/admin/campaigns/MetaPerformanceCharts"
import { usePerf } from "@/components/admin/campaigns/perf/use-perf"
import { ADS_SECTIONS, campaignHubHref } from "@/lib/marketing/hub-tabs"
import type { PerfPeriodKey } from "@/lib/marketing/perf"
import type { MetaCampaignDashboard, MetaDatePreset } from "./types"

// "광고" 탭(2026-11-06) — 채널 › 캠페인. 위: 채널 카드 3장(계획표 + 스냅샷 + 우리 DB 리드),
// 아래: 상세에서 옮겨 온 우산 캠페인 스코어보드 + Meta 라이브 차트. 쓰기 액션은 없다(데이터 층).
// 기획: docs/active/marketing-ads-campaign-weekly-plan-2026-11-05.md(D1 새 탭) · 시안 C
// docs/active/mockups/campaign-channel-tree-2026-11-06.html

const CampaignScoreboard = dynamic(
  () => import("@/components/admin/campaigns/perf/CampaignScoreboard").then((m) => m.CampaignScoreboard),
  { ssr: false, loading: () => <ChartSkeleton className="h-[280px]" /> }
)
const MetaPerformanceCharts = dynamic(
  () => import("@/components/admin/campaigns/MetaPerformanceCharts").then((m) => m.MetaPerformanceCharts),
  { ssr: false, loading: () => <ChartSkeleton className="h-[260px]" /> }
)

export interface AdsTabProps {
  period: PerfPeriodKey
  refreshNonce: number
  metaDashboard: MetaCampaignDashboard | null
  metaLoading: boolean
  metaError: string | null
  metaDatePreset: MetaDatePreset
  onMetaDatePresetChange: (value: MetaDatePreset) => void
}

export default function AdsTab({
  period,
  refreshNonce,
  metaDashboard,
  metaLoading,
  metaError,
  metaDatePreset,
  onMetaDatePresetChange,
}: AdsTabProps) {
  const { data: perf, error: perfError, reload } = usePerf(period, refreshNonce)
  const sectionIds = useMemo(() => ADS_SECTIONS.map((section) => section.id), [])
  useScrollToHash(perf != null, sectionIds)

  const metaPerfRows = useMemo<MetaPerfRow[]>(
    () =>
      (metaDashboard?.campaigns ?? []).map((c) => ({
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
      })),
    [metaDashboard]
  )

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
    <ChartSkeleton className="h-[320px]" />
  )

  return (
    <div className="space-y-10 pb-8">
      <HubSection
        id="channels"
        title="채널 · 캠페인"
        description="리드 = 우리 DB(utm_campaign · 랜딩 gad_campaignid · gclid 로 짝짓기). 플랫폼이 센 리드·전환은 회색 참고 — 구글 태그는 쿠키 동의 뒤에만 켜져 적게 잡힌다"
      >
        {perf?.adBoard ? (
          <AdChannelCards
            board={perf.adBoard}
            channelLive={perf.channelLive}
            links={{
              google: campaignHubHref({ tab: "data", section: "google", perf: period }),
              metaCreatives: campaignHubHref({ tab: "detail", section: "creatives", perf: period }),
              metaTable: campaignHubHref({ tab: "data", section: "meta", perf: period }),
            }}
          />
        ) : perf ? (
          <p className="rounded-xl border border-[#e8e8e4] bg-white py-8 text-center text-[12px] text-[#84827a]">
            채널 카드 집계가 아직 없습니다 — 동기화를 눌러 다시 불러오세요.
          </p>
        ) : (
          perfFallback
        )}
      </HubSection>

      <HubSection
        id="campaigns"
        title="우산 캠페인 · Meta 차트"
        description="캠페인 관리에서 묶은 우산 캠페인 스코어보드(Meta 링크 귀속 리드)와 Meta 라이브 차트(리포트 리드) — 두 리드 축은 모집단이 다르다"
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
    </div>
  )
}

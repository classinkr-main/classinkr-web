"use client"

import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react"
import { AlertCircle } from "lucide-react"
import { ChartSkeleton } from "@/components/admin/viz"
import { CampaignExportButton } from "@/components/admin/campaigns/CampaignExportButton"
import type { ExportColumn } from "@/components/admin/campaigns/CampaignExportButton"
import { ChannelBudgetTable } from "@/components/admin/campaigns/ChannelBudgetTable"
import type { ChannelEfficiencyRow } from "@/components/admin/campaigns/ChannelEfficiencyChart"
import { EventMetricsQuickTable } from "@/components/admin/campaigns/EventMetricsQuickTable"
import { EventListSection, type EventListSectionProps } from "@/components/admin/campaigns/events/EventListSection"
import AdLeadsPanel from "@/components/admin/campaigns/leads/AdLeadsPanel"
import MetaCampaignPanel from "@/components/admin/campaigns/meta/MetaCampaignPanel"
import { UpdatesFeed, type UpdateSubmitInput } from "@/components/admin/campaigns/perf/UpdatesFeed"
import { usePerf } from "@/components/admin/campaigns/perf/use-perf"
import { WeeklyReportSection } from "@/components/admin/campaigns/perf/WeeklyReportSection"
import { HubSection, SectionNav, useScrollToHash } from "@/components/admin/campaigns/SectionNav"
import NewLeadsTab from "@/components/admin/campaigns/tabs/NewLeadsTab"
import { adminFetchJson } from "@/lib/admin-client"
import { DATA_SECTIONS } from "@/lib/marketing/hub-tabs"
import type { PerfPeriodKey } from "@/lib/marketing/perf"
import type { LeadRecord } from "@/lib/repositories/leads"
import type { AdChannel, EventMetrics } from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"
import type { CampaignAggregate, MetaCampaignDashboard, MetaCampaignRow, MetaDatePreset } from "./types"

// "데이터" 탭(3층) — 목록·입력·내보내기. 표·폼·CSV만. Meta 재개/중지, 리드 전환, 예산 저장,
// 성과 입력, 업데이트 기록 같은 **쓰기 액션은 이 층에서만** 일어난다(기획 §3.5).
// 신규 리드 · 광고 리드 · Meta 캠페인 · 예산·성과 입력 · 업데이트 로그 · 주간 보고서.

export interface DataTabProps {
  period: PerfPeriodKey
  refreshNonce: number
  /** 마케팅 스코프 리드 전량 — 신규 리드 큐와 광고 리드 섹션이 같은 배열을 본다(체크가 양쪽에 반영). */
  adLeads: LeadRecord[]
  adLeadsLoading: boolean
  adLeadsError: string | null
  onRefreshAdLeads: () => void
  onAdLeadsUpdate: (updater: (prev: LeadRecord[]) => LeadRecord[]) => void
  onAdLeadUpdated: (lead: LeadRecord) => void
  /** Meta 라이브 표 + 재개/중지. */
  metaDashboard: MetaCampaignDashboard | null
  metaLoading: boolean
  metaError: string | null
  metaDatePreset: MetaDatePreset
  onMetaDatePresetChange: (value: MetaDatePreset) => void
  onRefreshMeta: () => void
  metaUpdatingId: string | null
  onToggleMetaStatus: (campaign: MetaCampaignRow) => void
  /** 코어(행사·리드·지표) 파생 — 채널 예산 대조·성과 입력. */
  coreLoading: boolean
  coreError: string | null
  channelEfficiencyData: ChannelEfficiencyRow[]
  channelBudgets: Record<AdChannel, number>
  onBudgetChange: (channel: AdChannel, amount: number) => void | Promise<void>
  budgetError: string | null
  aggregate: CampaignAggregate
  onMetricsSaved: (metrics: EventMetrics) => void
  setEditing: Dispatch<SetStateAction<PublicEvent | null>>
  /** 행사 목록·필터·모달·편집기 — 상태는 허브 클라이언트가 소유한다. */
  eventList: EventListSectionProps
}

export default function DataTab({
  period,
  refreshNonce,
  adLeads,
  adLeadsLoading,
  adLeadsError,
  onRefreshAdLeads,
  onAdLeadsUpdate,
  onAdLeadUpdated,
  metaDashboard,
  metaLoading,
  metaError,
  metaDatePreset,
  onMetaDatePresetChange,
  onRefreshMeta,
  metaUpdatingId,
  onToggleMetaStatus,
  coreLoading,
  coreError,
  channelEfficiencyData,
  channelBudgets,
  onBudgetChange,
  budgetError,
  aggregate,
  onMetricsSaved,
  setEditing,
  eventList,
}: DataTabProps) {
  const { data: perf, reload: reloadPerf } = usePerf(period, refreshNonce)
  const sectionIds = useMemo(() => DATA_SECTIONS.map((section) => section.id), [])
  // 첫 섹션(신규 리드)은 리드 도착 뒤 높이가 잡히므로 그때 해시 착지를 시도한다.
  useScrollToHash(!adLeadsLoading, sectionIds)

  // CSV 내보내기 — Meta(구 광고 탭과 같은 컬럼).
  const metaExport = useMemo(() => {
    const columns: ExportColumn[] = [
      { key: "name", label: "캠페인" },
      { key: "status", label: "상태" },
      { key: "spend", label: "광고비" },
      { key: "impressions", label: "노출" },
      { key: "clicks", label: "클릭" },
      { key: "leads", label: "리드" },
      { key: "ctr", label: "CTR(%)" },
      { key: "cpc", label: "CPC" },
      { key: "cpl", label: "CPL" },
    ]
    const campaigns = metaDashboard?.campaigns ?? []
    const rows: Array<Record<string, string | number | null>> = campaigns.map((c) => ({
      name: c.name,
      status: c.effectiveStatus ?? c.status,
      spend: c.insights.spend,
      impressions: c.insights.impressions,
      clicks: c.insights.clicks,
      leads: c.insights.leads,
      ctr: c.insights.ctr,
      cpc: c.insights.cpc,
      cpl: c.insights.leads > 0 ? Math.round(c.insights.spend / c.insights.leads) : null,
    }))
    return { columns, rows }
  }, [metaDashboard])

  const campaignOptions = useMemo(
    () => (perf ? perf.scoreboard.map((row) => ({ id: row.campaignId, name: row.name })) : []),
    [perf]
  )

  // 업데이트 저장 — POST 후 perf 를 fresh 재조회해 피드·스코어보드 최근 1줄을 함께 갱신한다.
  const submitUpdate = useCallback(
    async (input: UpdateSubmitInput) => {
      await adminFetchJson(`/api/admin/marketing-campaigns/${input.campaignId}/updates`, {
        method: "POST",
        body: JSON.stringify({ kind: input.kind, body: input.body }),
      })
      await reloadPerf({ fresh: true })
    },
    [reloadPerf]
  )

  return (
    <div>
      <SectionNav sections={DATA_SECTIONS} label="데이터 섹션" />
      <div className="space-y-10 pb-8">
        <HubSection id="new-leads" title="신규 리드" description="전 소스 신규 유입 큐 — 액션은 연락 체크. 필터·기간은 URL(nl*)에 보존된다">
          <NewLeadsTab leads={adLeads} loading={adLeadsLoading} error={adLeadsError} onLeadUpdated={onAdLeadUpdated} embedded />
        </HubSection>

        <HubSection id="ad-leads" title="광고 리드" description="Meta 광고 리드 묶음 — 광고비·CPL 옆에서 보고 CRM 고객·거래로 전환(비가역)">
          <AdLeadsPanel
            leads={adLeads}
            loading={adLeadsLoading}
            error={adLeadsError}
            onRefresh={onRefreshAdLeads}
            onLeadsUpdate={onAdLeadsUpdate}
            metaSpend={metaDashboard?.summary.spend ?? null}
            metaCurrency={metaDashboard?.account.currency ?? "USD"}
            metaDatePreset={metaDatePreset}
          />
        </HubSection>

        <HubSection
          id="meta"
          title="Meta 캠페인"
          description="라이브 캠페인 표 · 재개/중지는 Meta 광고 관리자에 바로 반영된다"
          action={
            <CampaignExportButton columns={metaExport.columns} rows={metaExport.rows} filename="meta-campaigns" label="Meta CSV" disabled={metaLoading} />
          }
        >
          <MetaCampaignPanel
            dashboard={metaDashboard}
            loading={metaLoading}
            error={metaError}
            datePreset={metaDatePreset}
            updatingId={metaUpdatingId}
            onDatePresetChange={onMetaDatePresetChange}
            onRefresh={onRefreshMeta}
            onToggleStatus={onToggleMetaStatus}
          />
        </HubSection>

        <HubSection
          id="budgets"
          title="예산·성과 입력"
          description="채널별 배정 예산(KRW)과 행사 수기 성과(광고비·매출·목표) — 상세 층의 채널 믹스·행사 비교가 여기서 채워진다"
        >
          {coreError && (
            <div className="mb-3 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[13px] text-[#B43E3E]">{coreError}</div>
          )}
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-[14px] font-semibold text-[#111110]">채널 예산·집행</h3>
              {budgetError && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[12.5px] text-[#B43E3E]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{budgetError}</span>
                </div>
              )}
              {coreLoading ? (
                <ChartSkeleton className="h-[220px]" />
              ) : (
                <ChannelBudgetTable
                  rows={channelEfficiencyData}
                  budgets={channelBudgets}
                  onBudgetChange={onBudgetChange}
                  totalSpend={aggregate.totalSpend}
                  totalRevenue={aggregate.totalRevenue}
                  overallRoi={aggregate.overallRoi}
                  metaLiveSpend={metaDashboard?.summary.spend ?? null}
                  metaCurrency={metaDashboard?.account.currency ?? "USD"}
                />
              )}
            </div>

            {/* 성과 입력 — 표들의 "—"가 어느 행사의 미입력에서 나오는지 여기서 바로 채운다. */}
            <div id="event-metrics-input" className="scroll-mt-16">
              <h3 className="mb-2 text-[14px] font-semibold text-[#111110]">행사 성과 입력</h3>
              {coreLoading ? (
                <ChartSkeleton className="h-[220px]" />
              ) : (
                <EventMetricsQuickTable rows={eventList.perEventEcon} onSaved={onMetricsSaved} onOpenFullEditor={setEditing} />
              )}
            </div>

            <div>
              <EventListSection {...eventList} />
            </div>
          </div>
        </HubSection>

        <HubSection id="updates" title="업데이트 로그" description="캠페인 진행상황 기록 — 스코어보드 최근 1줄과 AI 브리핑 입력의 원천">
          {perf ? (
            <UpdatesFeed updates={perf.updatesFeed} campaignOptions={campaignOptions} onSubmit={submitUpdate} />
          ) : (
            <ChartSkeleton className="h-[200px]" />
          )}
        </HubSection>

        <HubSection id="weekly" title="주간 보고서" description="완료된 월~일 주간의 광고 리드 보고서 — 복사·Markdown 다운로드">
          <WeeklyReportSection refreshNonce={refreshNonce} />
        </HubSection>
      </div>
    </div>
  )
}

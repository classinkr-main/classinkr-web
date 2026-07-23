"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import {
  Activity,
  AlertCircle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  LayoutGrid,
  List as ListIcon,
  Mail,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  Users,
  Wallet,
  X,
  Trash2,
} from "lucide-react"
import AdminTabs from "@/components/admin/AdminTabs"
import { MarketingCrossLinks } from "@/components/admin/MarketingCrossLinks"
import { ChannelHubCards } from "@/components/admin/campaigns/ChannelHubCards"
import { InsightsBanner } from "@/components/admin/campaigns/InsightsBanner"
import type { Insight } from "@/components/admin/campaigns/InsightsBanner"
import { GoalProgressPanel } from "@/components/admin/campaigns/GoalProgressPanel"
import type { GoalEventRow } from "@/components/admin/campaigns/GoalProgressPanel"
import { MiniFunnel } from "@/components/admin/viz/MiniFunnel"
import type { FunnelStage as WaterfallStage } from "@/components/admin/viz/MiniFunnel"
import { StatTile, ChartSkeleton, Skeleton } from "@/components/admin/viz"
import { TopPerformersTable } from "@/components/admin/campaigns/TopPerformersTable"
import type { PerformerRow } from "@/components/admin/campaigns/TopPerformersTable"
import { CampaignExportButton } from "@/components/admin/campaigns/CampaignExportButton"
import type { ExportColumn } from "@/components/admin/campaigns/CampaignExportButton"
import { EventOriginMatrix } from "@/components/admin/campaigns/EventOriginMatrix"
import type { TrendPoint } from "@/components/admin/campaigns/CampaignTrendChart"
import type { ChannelEfficiencyRow } from "@/components/admin/campaigns/ChannelEfficiencyChart"
import { ChannelBudgetTable } from "@/components/admin/campaigns/ChannelBudgetTable"
import type { MetaPerfRow } from "@/components/admin/campaigns/MetaPerformanceCharts"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { textMatchesEventToken } from "@/lib/events/attribution"
import { EventCardHeader } from "@/components/admin/campaigns/EventCardHeader"
import { EventDetailContent, buildFunnel } from "@/components/admin/campaigns/EventDetailContent"
import { EventGalleryCard } from "@/components/admin/campaigns/EventGalleryCard"
import { EventDetailModal } from "@/components/admin/campaigns/EventDetailModal"
import { filterEvents } from "@/components/admin/campaigns/filter-events"
import {
  KRW,
  compact,
  formatMetaDate,
  formatRange,
  money,
  pct,
  won,
} from "@/components/admin/campaigns/event-format"
import { useUrlState } from "@/lib/use-url-state"
import {
  parseMessagePrefill,
  stripMessagePrefillParams,
  type MessagePrefill,
} from "@/lib/message-prefill"
import type { LeadRecord } from "@/lib/db"
import { EVENT_CATEGORIES, type EventCategory, type EventStatus, type PublicEvent } from "@/lib/types/public-events"
import {
  AD_CHANNEL_COLOR,
  AD_CHANNEL_LABEL,
  AD_CHANNELS,
  computeEconomics,
  DEFAULT_EVENT_METRICS,
  type AdChannel,
  type AdSpendEntry,
  type EventMetrics,
  type RelatedLink,
} from "@/lib/types/event-metrics"

// ─── helpers ──────────────────────────────────────────────────────────────────


// ChartSkeleton/Skeleton은 components/admin/viz(primitives)의 SSOT를 그대로 위임한다(로컬 재구현 금지).

const EventFunnelCompareChart = dynamic(
  () => import("@/components/admin/campaigns/CampaignCharts").then((m) => m.EventFunnelCompareChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[260px]" /> }
)

const ChannelSpendPieChart = dynamic(
  () => import("@/components/admin/campaigns/CampaignCharts").then((m) => m.ChannelSpendPieChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[180px]" /> }
)

const EventRoiChart = dynamic(
  () => import("@/components/admin/campaigns/CampaignCharts").then((m) => m.EventRoiChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[200px]" /> }
)

const CampaignTrendChart = dynamic(
  () => import("@/components/admin/campaigns/CampaignTrendChart").then((m) => m.CampaignTrendChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[240px]" /> }
)

const ChannelEfficiencyChart = dynamic(
  () => import("@/components/admin/campaigns/ChannelEfficiencyChart").then((m) => m.ChannelEfficiencyChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[220px]" /> }
)

const MetaPerformanceCharts = dynamic(
  () => import("@/components/admin/campaigns/MetaPerformanceCharts").then((m) => m.MetaPerformanceCharts),
  { ssr: false, loading: () => <ChartSkeleton className="h-[260px]" /> }
)

// 이메일·SMS 허브(구 /admin/marketing)를 이메일 탭에 흡수 — 무거우므로 동적 로딩.
const MarketingHub = dynamic(
  () => import("@/components/admin/marketing/MarketingHub"),
  { ssr: false, loading: () => <ChartSkeleton className="h-[420px]" /> }
)

// ─── attribution: 행사 ↔ 리드 ──────────────────────────────────────────────────
//   1) source/notes 필드에 event:<id> 또는 event:<slug> 토큰이 있으면 우선 매칭
//   2) 그 외에는 행사 기간 내 발생한 리드를 보조 집계로 사용
type EventLeadStats = { attributed: number; during: number }
type LeadLookupRow = { haystack: string; timestampMs: number }

// 각 리드를 최대 한 행사에만 귀속시킨다. 기간 창이 겹치는 여러 행사가 같은
// 리드를 각각 세면(구 방식) 집계 리드·CPL·퍼널이 이중계상되므로, 리드 1건은
//   1) 명시 토큰이 있으면 그 행사(attributed)
//   2) 없으면 리드를 포함하는 행사 중 "가장 최근 시작(동률이면 기간이 짧은)" 한 곳(during)
// 에만 배정한다. 반환 맵은 배정 결과의 행사별 집계다.
function assignEventLeads(
  leads: LeadLookupRow[],
  events: PublicEvent[]
): Map<string, EventLeadStats> {
  const stats = new Map<string, EventLeadStats>()
  const windows = events.map((event) => {
    const startMs = new Date(event.startsAt).getTime()
    // endsAt이 없으면 시작 +1일로 캡한다. Date.now()로 열어두면 과거 단일일 행사가
    // 이후 발생한 무관한 리드를 계속 fallback 집계로 흡수해 매 지표를 부풀린다.
    const endMs = event.endsAt ? new Date(event.endsAt).getTime() : startMs + 24 * 3600 * 1000
    stats.set(event.id, { attributed: 0, during: 0 })
    return { event, startMs, endMs }
  })

  for (const lead of leads) {
    const tokenHit = windows.find((w) => textMatchesEventToken(lead.haystack, w.event))
    if (tokenHit) {
      stats.get(tokenHit.event.id)!.attributed += 1
      continue
    }
    let best: (typeof windows)[number] | null = null
    for (const w of windows) {
      // 양수 포함 검사 — start/end가 NaN(잘못된 날짜)이면 비교가 false가 되어 자동 제외된다.
      if (!(lead.timestampMs >= w.startMs && lead.timestampMs <= w.endMs)) continue
      if (
        best === null ||
        w.startMs > best.startMs ||
        (w.startMs === best.startMs && w.endMs - w.startMs < best.endMs - best.startMs)
      ) {
        best = w
      }
    }
    if (best) stats.get(best.event.id)!.during += 1
  }

  return stats
}

// ─── sub-tabs ─────────────────────────────────────────────────────────────────

type CampaignTab = "summary" | "events" | "meta" | "email"

const CAMPAIGN_TABS: Array<{ id: CampaignTab; label: string; sub: string }> = [
  { id: "summary", label: "요약", sub: "성과 · 전환 · 채널 분포" },
  { id: "events", label: "행사", sub: "행사별 퍼널 · 딜 전환" },
  // id는 딥링크(?tab=meta) 호환을 위해 "meta" 유지 — 라벨은 "광고"로 확장하되 sub에서 Meta만 라이브임을 정직하게 표기.
  { id: "meta", label: "광고", sub: "Meta 라이브 · 캠페인·채널 예산·성과" },
  // id는 기존 딥링크(?tab=email) 호환을 위해 "email" 유지 — 내용은 이메일·문자·카카오 발송 허브.
  { id: "email", label: "메시지", sub: "구독자 · 발송(이메일 라이브 · 문자·카카오 준비 중) · 이력" },
]

type MetaDatePreset = "last_7d" | "last_30d" | "last_90d" | "this_month"

interface MetaCampaignRow {
  id: string
  name: string
  status: string
  effectiveStatus?: string
  objective?: string
  updatedTime?: string
  insights: {
    spend: number
    impressions: number
    reach: number
    clicks: number
    ctr: number | null
    cpc: number | null
    cpm: number | null
    leads: number
  }
}

interface MetaCampaignDashboard {
  account: {
    id: string
    name?: string
    accountStatus?: number
    currency?: string
    timezone?: string
    businessName?: string
  }
  datePreset: string
  campaigns: MetaCampaignRow[]
  summary: {
    campaignCount: number
    activeCount: number
    pausedCount: number
    spend: number
    impressions: number
    reach: number
    clicks: number
    leads: number
    ctr: number | null
    cpc: number | null
    cpm: number | null
  }
}

interface MarketingStatsData {
  subscribers: { total: number; active: number; unsubscribed: number; newThisMonth: number }
  campaigns: {
    total: number
    recentCampaigns: Array<{
      id: string | number
      subject: string
      sentAt: string | null
      recipientCount: number
      status: "draft" | "sent" | "failed"
      tags: string[]
    }>
  }
  automation: { totalRules: number; activeRules: number }
  tagDistribution: Array<{ tag: string; count: number }>
}

// ─── period filter ────────────────────────────────────────────────────────────

type Period = "active" | "30d" | "90d" | "all"

function eventInPeriod(event: PublicEvent, period: Period): boolean {
  if (period === "all") return true
  if (period === "active") return event.status === "진행 중" || event.status === "예정"
  const days = period === "30d" ? 30 : 90
  const cutoff = Date.now() - days * 24 * 3600 * 1000
  const end = event.endsAt ? new Date(event.endsAt).getTime() : new Date(event.startsAt).getTime()
  return end >= cutoff
}

// ─── UI primitives ────────────────────────────────────────────────────────────

// KPI 카드는 공용 StatTile(compact)로 통합 — 로컬 tone은 색이 픽셀 동일한 viz Tone으로 매핑
// (success→brand, warn→danger[#FEF3EE/#B85C33 동일], neutral→neutral).
function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone?: "neutral" | "success" | "warn"
}) {
  const vizTone = tone === "success" ? "brand" : tone === "warn" ? "danger" : "neutral"
  return <StatTile icon={icon} label={label} value={value} hint={hint} tone={vizTone} compact />
}

// KpiCard(compact StatTile)와 정확히 같은 셸(rounded-2xl border p-4)로 맞춘 콜드로드 스켈레톤.
// viz의 KpiSkeleton은 non-compact(p-5) 전용이라 여기선 원자 Skeleton을 compact 치수로 합성한다.
function KpiTileSkeleton() {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <Skeleton className="mb-3 h-8 w-8 rounded-xl" />
      <Skeleton className="mb-1.5 h-2.5 w-16" />
      <Skeleton className="h-5 w-20" />
      <Skeleton className="mt-2 h-2.5 w-24" />
    </div>
  )
}

const META_DATE_OPTIONS: Array<{ value: MetaDatePreset; label: string }> = [
  { value: "last_7d", label: "7일" },
  { value: "last_30d", label: "30일" },
  { value: "last_90d", label: "90일" },
  { value: "this_month", label: "이번 달" },
]

function MetaStatusPill({ status }: { status?: string }) {
  const normalized = status ?? "UNKNOWN"
  const tone =
    normalized === "ACTIVE"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "PAUSED"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-[#e8e8e4] bg-[#f0f0ec] text-[#1a1a1a]/45"

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}>
      {normalized}
    </span>
  )
}

function MetaCampaignPanel({
  dashboard,
  loading,
  error,
  datePreset,
  updatingId,
  onDatePresetChange,
  onRefresh,
  onToggleStatus,
}: {
  dashboard: MetaCampaignDashboard | null
  loading: boolean
  error: string | null
  datePreset: MetaDatePreset
  updatingId: string | null
  onDatePresetChange: (value: MetaDatePreset) => void
  onRefresh: () => void
  onToggleStatus: (campaign: MetaCampaignRow) => void
}) {
  const currency = dashboard?.account.currency ?? "USD"
  const campaigns = dashboard?.campaigns ?? []
  const summary = dashboard?.summary

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-xl bg-[#ECFDF5] p-2 text-[#084734]">
                <Activity className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[15px] font-bold text-[#111110]">
                  {dashboard?.account.name ?? "Meta 광고 계정"}
                </h2>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
                  {dashboard?.account.businessName ?? "Business"} · {dashboard?.account.id ?? "연결 확인 중"} · {dashboard?.account.timezone ?? "timezone"}
                </p>
              </div>
              {dashboard && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  연결됨
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="Meta 성과 기간">
              {META_DATE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onDatePresetChange(option.value)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                    datePreset === option.value ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              동기화
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Wallet className="w-3.5 h-3.5" />} label="Meta 광고비" value={loading && !dashboard ? "..." : money(summary?.spend, currency)} hint={`${datePreset} 기준`} />
        <KpiCard icon={<Target className="w-3.5 h-3.5" />} label="노출 / 전체 클릭" value={loading && !dashboard ? "..." : `${compact.format(summary?.impressions ?? 0)} / ${compact.format(summary?.clicks ?? 0)}`} hint={`CTR ${summary?.ctr != null ? summary.ctr.toFixed(2) + "%" : "—"}`} />
        <KpiCard icon={<Users className="w-3.5 h-3.5" />} label="리드" value={loading && !dashboard ? "..." : KRW.format(summary?.leads ?? 0)} hint={`CPL ${summary && summary.leads > 0 ? money(summary.spend / summary.leads, currency) : "—"}`} tone="success" />
        <KpiCard icon={<Activity className="w-3.5 h-3.5" />} label="캠페인 상태" value={loading && !dashboard ? "..." : `${summary?.activeCount ?? 0} 활성`} hint={`일시중지 ${summary?.pausedCount ?? 0} · 전체 ${summary?.campaignCount ?? 0}`} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
          <h2 className="text-[14px] font-semibold text-[#111110]">Meta 캠페인</h2>
          <a
            href="https://adsmanager.facebook.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
          >
            광고 관리자
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {loading && !dashboard ? (
          <p className="py-12 text-center text-[12px] text-[#1a1a1a]/30">Meta 캠페인을 불러오는 중입니다.</p>
        ) : campaigns.length === 0 ? (
          <p className="py-12 text-center text-[12px] text-[#1a1a1a]/30">표시할 Meta 캠페인이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#f0f0ec] text-left text-[12px]">
              <thead className="bg-[#fafaf8] text-[#1a1a1a]/45">
                <tr>
                  <th className="px-4 py-3 font-semibold">캠페인</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 text-right font-semibold">광고비</th>
                  <th className="px-4 py-3 text-right font-semibold">노출</th>
                  <th className="px-4 py-3 text-right font-semibold">전체 클릭</th>
                  <th className="px-4 py-3 text-right font-semibold">리드</th>
                  <th className="px-4 py-3 text-right font-semibold">CPL</th>
                  <th className="px-4 py-3 text-right font-semibold">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0ec]">
                {campaigns.map((campaign) => {
                  const isActive = campaign.status === "ACTIVE"
                  const nextStatus = isActive ? "PAUSED" : "ACTIVE"
                  return (
                    <tr key={campaign.id} className="align-middle">
                      <td className="max-w-[320px] px-4 py-3">
                        <p className="truncate font-semibold text-[#111110]">{campaign.name}</p>
                        <p className="mt-0.5 text-[10.5px] text-[#1a1a1a]/35">
                          {campaign.objective ?? "목표 없음"} · 업데이트 {formatMetaDate(campaign.updatedTime)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <MetaStatusPill status={campaign.effectiveStatus ?? campaign.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{money(campaign.insights.spend, currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{KRW.format(campaign.insights.impressions)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{KRW.format(campaign.insights.clicks)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{KRW.format(campaign.insights.leads)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {campaign.insights.leads > 0 ? (
                          <span className="font-semibold text-[#084734]">
                            {money(campaign.insights.spend / campaign.insights.leads, currency)}
                          </span>
                        ) : (
                          <span className="text-[#1a1a1a]/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onToggleStatus(campaign)}
                          disabled={updatingId === campaign.id || (campaign.status !== "ACTIVE" && campaign.status !== "PAUSED")}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {updatingId === campaign.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : nextStatus === "ACTIVE" ? (
                            <Play className="h-3.5 w-3.5" />
                          ) : (
                            <Pause className="h-3.5 w-3.5" />
                          )}
                          {nextStatus === "ACTIVE" ? "재개" : "중지"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function MetaLiveSummary({
  dashboard,
  loading,
  error,
  datePreset,
  onOpenMeta,
  onRefresh,
}: {
  dashboard: MetaCampaignDashboard | null
  loading: boolean
  error: string | null
  datePreset: MetaDatePreset
  onOpenMeta: () => void
  onRefresh: () => void
}) {
  const currency = dashboard?.account.currency ?? "USD"
  const summary = dashboard?.summary

  return (
    <div className="mb-5 rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex shrink-0 rounded-xl bg-[#ECFDF5] p-2 text-[#084734]">
            <Activity className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold text-[#111110]">Meta 라이브 현황</h2>
              {dashboard && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  연결됨
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#1a1a1a]/45">
              {dashboard
                ? `${dashboard.account.name ?? "Meta 광고 계정"} · ${dashboard.account.id} · ${datePreset} 기준`
                : "Meta Marketing API에서 캠페인 성과를 불러옵니다."}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            동기화
          </button>
          <button
            type="button"
            onClick={onOpenMeta}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#063d2a]"
          >
            Meta 광고 관리
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : loading && !dashboard ? (
        <p className="mt-4 rounded-xl border border-dashed border-[#e8e8e4] py-8 text-center text-[12px] text-[#1a1a1a]/30">
          Meta 캠페인 현황을 불러오는 중입니다.
        </p>
      ) : dashboard ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#1a1a1a]/35">광고비</p>
            <p className="mt-1 text-[20px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#111110]">
              {money(summary?.spend, currency)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#1a1a1a]/35">노출 / 전체 클릭</p>
            <p className="mt-1 text-[20px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#111110]">
              {compact.format(summary?.impressions ?? 0)} / {compact.format(summary?.clicks ?? 0)}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-[#1a1a1a]/40">
              CTR {summary?.ctr != null ? `${summary.ctr.toFixed(2)}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#1a1a1a]/35">리드</p>
            <p className="mt-1 text-[20px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#084734]">
              {KRW.format(summary?.leads ?? 0)}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-[#1a1a1a]/40">
              CPL {summary && summary.leads > 0 ? money(summary.spend / summary.leads, currency) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#1a1a1a]/35">상태</p>
            <p className="mt-1 text-[20px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#111110]">
              {summary?.activeCount ?? 0} 활성
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-[#1a1a1a]/40">
              일시중지 {summary?.pausedCount ?? 0} · 전체 {summary?.campaignCount ?? 0}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// 전환 초점 3칸은 개별 카드가 아니라 하나의 카드 안에서 divide-x/divide-y로만 구분한다
// (design-taste Rule4: elevation이 불필요한 저정보 셀은 카드 중첩 대신 divide-y/border-t로 위계화).
function ConversionFocusCell({
  label,
  value,
  hint,
  tone = "neutral",
  loading = false,
}: {
  label: string
  value: string
  hint: string
  tone?: "neutral" | "success" | "warn"
  loading?: boolean
}) {
  const valueTone =
    tone === "success" ? "text-[#084734]" : tone === "warn" ? "text-[#B85C33]" : "text-[#111110]"

  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-1.5 h-5 w-16" />
      ) : (
        <p className={`mt-1 text-[20px] font-bold leading-none tracking-[-0.02em] tabular-nums ${valueTone}`}>
          {value}
        </p>
      )}
      <p className="mt-1.5 text-[11px] leading-relaxed text-[#1a1a1a]/45">{hint}</p>
    </div>
  )
}

// ─── timeline (calendar bar) ──────────────────────────────────────────────────

function cssPercent(value: number) {
  return `${value.toFixed(3)}%`
}

let browserTimelineNow: Date | null = null

function subscribeTimelineNow() {
  return () => {}
}

function getBrowserTimelineNow() {
  if (typeof window === "undefined") return null
  browserTimelineNow ??= new Date()
  return browserTimelineNow
}

function getServerTimelineNow() {
  return null
}

function TimelineRow({ events }: { events: PublicEvent[] }) {
  const timelineNow = useSyncExternalStore(
    subscribeTimelineNow,
    getBrowserTimelineNow,
    getServerTimelineNow
  )

  function renderTimelineBody() {
    if (!timelineNow) {
      return (
        <div className="relative px-4 pb-5 pt-4 sm:px-6" aria-hidden="true">
          <div className="relative h-6 border-b border-dashed border-[#e8e8e4]" />
          <div className="mt-3 space-y-2">
            <div className="h-7 w-3/5 rounded-md bg-[#f0f0ec]" />
            <div className="h-7 w-2/5 rounded-md bg-[#f0f0ec]" />
          </div>
        </div>
      )
    }

    // 표시 범위: 현재 월 ±2개월 (5개월)
    const start = new Date(timelineNow.getFullYear(), timelineNow.getMonth() - 2, 1)
    const end = new Date(timelineNow.getFullYear(), timelineNow.getMonth() + 3, 0)
    const totalMs = end.getTime() - start.getTime()
    const months: { label: string; left: number }[] = []
    for (let m = -2; m <= 2; m++) {
      const d = new Date(timelineNow.getFullYear(), timelineNow.getMonth() + m, 1)
      months.push({
        label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`,
        left: ((d.getTime() - start.getTime()) / totalMs) * 100,
      })
    }
    const todayLeft = Math.max(0, Math.min(100, ((timelineNow.getTime() - start.getTime()) / totalMs) * 100))

    const sorted = [...events].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )

    return (
      <div className="relative px-4 pb-5 pt-4 sm:px-6">
        {/* month grid */}
        <div className="relative h-6 border-b border-dashed border-[#e8e8e4]">
          {months.map((m) => (
            <div
              key={m.label}
              className="absolute top-0 -translate-x-1/2 text-[10px] font-medium text-[#1a1a1a]/40"
              style={{ left: cssPercent(m.left) }}
            >
              {m.label}
            </div>
          ))}
          {/* today marker */}
          <div
            className="absolute top-0 h-full w-px bg-[#B85C33]"
            style={{ left: cssPercent(todayLeft) }}
          />
        </div>

        {sorted.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-[#1a1a1a]/30">표시할 행사가 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {sorted.map((event) => {
              const s = new Date(event.startsAt).getTime()
              const e = event.endsAt ? new Date(event.endsAt).getTime() : s + 24 * 3600 * 1000
              const left = Math.max(0, ((s - start.getTime()) / totalMs) * 100)
              const right = Math.min(100, ((e - start.getTime()) / totalMs) * 100)
              const width = Math.max(4, right - left)
              const color =
                event.status === "진행 중"
                  ? "bg-[#084734]"
                  : event.status === "예정"
                    ? "bg-[#D97706]"
                    : "bg-[#84827a]"
              return (
                <div key={event.id} className="relative h-7">
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 rounded-md ${color} px-2 py-1 text-[11px] font-medium text-white truncate shadow-sm`}
                    style={{ left: cssPercent(left), width: cssPercent(width), minWidth: "60px" }}
                    title={`${event.title} · ${formatRange(event.startsAt, event.endsAt)}`}
                  >
                    {event.title}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3 sm:px-6">
        <h2 className="text-[14px] font-semibold text-[#111110]">캘린더 타임라인</h2>
        <Link
          href="/admin/calendar"
          className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          전체 캘린더
        </Link>
      </div>

      {renderTimelineBody()}
    </div>
  )
}

// ─── event card ───────────────────────────────────────────────────────────────

function EventFunnelCard({
  event,
  metrics,
  attributedLeadCount,
  duringLeadCount,
  onEdit,
}: {
  event: PublicEvent
  metrics: EventMetrics
  attributedLeadCount: number
  duringLeadCount: number
  onEdit: () => void
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <EventCardHeader
        event={event}
        actions={
          <button
            onClick={onEdit}
            className="shrink-0 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 transition-colors hover:text-[#111110]"
          >
            성과 입력
          </button>
        }
      />
      <EventDetailContent
        event={event}
        metrics={metrics}
        attributedLeadCount={attributedLeadCount}
        duringLeadCount={duringLeadCount}
      />
    </div>
  )
}

// ─── metrics edit drawer ──────────────────────────────────────────────────────

function MetricsEditor({
  event,
  metrics,
  onClose,
  onSaved,
}: {
  event: PublicEvent
  metrics: EventMetrics
  onClose: () => void
  onSaved: (m: EventMetrics) => void
}) {
  const [form, setForm] = useState({
    targetLeads: metrics.targetLeads,
    targetRevenue: metrics.targetRevenue,
    impressionsCount: metrics.impressionsCount,
    applicationsCount: metrics.applicationsCount,
    qualifiedLeadsCount: metrics.qualifiedLeadsCount,
    attendeesCount: metrics.attendeesCount,
    dealsCount: metrics.dealsCount,
    dealsRevenue: metrics.dealsRevenue,
    closedCustomerCount: metrics.closedCustomerCount,
    dealCustomers: metrics.dealCustomers ?? "",
    notes: metrics.notes ?? "",
    retrospective: metrics.retrospective ?? "",
    shareMemo: metrics.shareMemo ?? "",
  })
  const [adSpend, setAdSpend] = useState<AdSpendEntry[]>(metrics.adSpendEntries ?? [])
  const [relatedLinks, setRelatedLinks] = useState<RelatedLink[]>(metrics.relatedLinks ?? [])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const updateNum = (key: keyof typeof form, v: string) => {
    if (v === "") return update(key, null as never)
    const n = Number(v)
    if (Number.isFinite(n)) update(key, n as never)
  }

  async function handleSave() {
    setSaving(true)
    setErr(null)
    try {
      const saved = await adminFetchJson<EventMetrics>(
        `/api/admin/event-metrics/${event.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...form,
            dealCustomers: form.dealCustomers.trim() || null,
            notes: form.notes.trim() || null,
            retrospective: form.retrospective.trim() || null,
            shareMemo: form.shareMemo.trim() || null,
            adSpendEntries: adSpend,
            relatedLinks,
          }),
        }
      )
      onSaved(saved)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  function addAdEntry() {
    setAdSpend((arr) => [...arr, { channel: "google", amount: 0, note: "" }])
  }
  function updateAdEntry(idx: number, patch: Partial<AdSpendEntry>) {
    setAdSpend((arr) => arr.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function removeAdEntry(idx: number) {
    setAdSpend((arr) => arr.filter((_, i) => i !== idx))
  }

  function addRelatedLink() {
    setRelatedLinks((arr) => [...arr, { label: "", url: "" }])
  }
  function updateRelatedLink(idx: number, patch: Partial<RelatedLink>) {
    setRelatedLinks((arr) => arr.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function removeRelatedLink(idx: number) {
    setRelatedLinks((arr) => arr.filter((_, i) => i !== idx))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">
              성과 입력
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-[#111110]">{event.title}</h2>
            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">{formatRange(event.startsAt, event.endsAt)}</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="text-[#1a1a1a]/40 hover:text-[#111110]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[calc(100dvh-9rem)] space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {err}
            </div>
          )}

          {/* 목표 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              목표
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumInput label="목표 리드 수" value={form.targetLeads} onChange={(v) => updateNum("targetLeads", v)} />
              <NumInput label="목표 매출 (원)" value={form.targetRevenue} onChange={(v) => updateNum("targetRevenue", v)} />
            </div>
          </section>

          {/* 퍼널 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              퍼널 단계
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumInput label="노출 수" value={form.impressionsCount} onChange={(v) => updateNum("impressionsCount", v)} />
              <NumInput label="신청자 수" value={form.applicationsCount} onChange={(v) => updateNum("applicationsCount", v)} />
              <NumInput label="유효 리드 수" value={form.qualifiedLeadsCount} onChange={(v) => updateNum("qualifiedLeadsCount", v)} />
              <NumInput label="참석자 수" value={form.attendeesCount} onChange={(v) => updateNum("attendeesCount", v)} />
              <NumInput label="딜 수" value={form.dealsCount} onChange={(v) => updateNum("dealsCount", v)} />
              <NumInput label="딜 매출 (원)" value={form.dealsRevenue} onChange={(v) => updateNum("dealsRevenue", v)} />
            </div>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">
              ※ 리드 수는 리드 DB에서 자동 집계됩니다 (수동 입력 불필요).
            </p>
          </section>

          {/* 딜 성과 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              딜 성과
            </h3>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <NumInput
                label="실제 성사 고객 수"
                value={form.closedCustomerCount}
                onChange={(v) => updateNum("closedCustomerCount", v)}
                min={0}
                step={1}
              />
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">성사 고객 / 기관</label>
                <textarea
                  value={form.dealCustomers}
                  onChange={(e) => update("dealCustomers", e.target.value)}
                  rows={3}
                  placeholder="예: ○○학원, △△캠퍼스 / 담당자 / 후속 액션"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* 광고비 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
                광고비 (채널별)
              </h3>
              <button
                onClick={addAdEntry}
                className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
              >
                <Plus className="w-3 h-3" />
                채널 추가
              </button>
            </div>
            {adSpend.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-[#1a1a1a]/30">
                채널을 추가하여 광고비를 입력하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {adSpend.map((entry, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[110px_1fr_auto] items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-2 py-1.5 sm:grid-cols-[140px_1fr_1fr_auto]"
                  >
                    <select
                      value={entry.channel}
                      onChange={(e) => updateAdEntry(idx, { channel: e.target.value as AdChannel })}
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    >
                      {(Object.keys(AD_CHANNEL_LABEL) as AdChannel[]).map((c) => (
                        <option key={c} value={c}>
                          {AD_CHANNEL_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      placeholder="금액 (원)"
                      aria-label="광고비 금액(원)"
                      value={entry.amount === 0 ? "" : entry.amount}
                      onChange={(e) =>
                        updateAdEntry(idx, { amount: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    />
                    <input
                      type="text"
                      placeholder="메모 (선택)"
                      aria-label="광고비 메모"
                      value={entry.note ?? ""}
                      onChange={(e) => updateAdEntry(idx, { note: e.target.value })}
                      className="hidden rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px] sm:block"
                    />
                    <button
                      onClick={() => removeAdEntry(idx)}
                      aria-label="채널 삭제"
                      className="rounded-md p-1.5 text-[#1a1a1a]/40 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 관련 자료 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
                관련 자료
              </h3>
              <button
                onClick={addRelatedLink}
                className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
              >
                <Plus className="w-3 h-3" />
                링크 추가
              </button>
            </div>
            {relatedLinks.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-[#1a1a1a]/30">
                블로그·보도자료 등 관련 글 URL을 추가하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {relatedLinks.map((link, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-2 py-1.5"
                  >
                    <input
                      type="text"
                      placeholder="라벨 (예: 블로그 후기)"
                      aria-label="관련 자료 라벨"
                      value={link.label}
                      onChange={(e) => updateRelatedLink(idx, { label: e.target.value })}
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    />
                    <input
                      type="url"
                      placeholder="https://..."
                      aria-label="관련 자료 URL"
                      value={link.url}
                      onChange={(e) => updateRelatedLink(idx, { url: e.target.value })}
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    />
                    <button
                      onClick={() => removeRelatedLink(idx)}
                      aria-label="관련 자료 삭제"
                      className="rounded-md p-1.5 text-[#1a1a1a]/40 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 메모 / 회고 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              메모 / 회고
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">내부 메모 / 다음 액션</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={3}
                  placeholder="운영 중 이슈, 후속 연락, 다음 액션"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">회고</label>
                <textarea
                  value={form.retrospective}
                  onChange={(e) => update("retrospective", e.target.value)}
                  rows={3}
                  placeholder="잘된 점, 아쉬운 점, 다음 행사에 반영할 점"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">공유 포인트</label>
                <textarea
                  value={form.shareMemo}
                  onChange={(e) => update("shareMemo", e.target.value)}
                  rows={3}
                  placeholder="팀에 공유할 핵심 포인트. 예: 부산권 원장님들은 하이브리드 수업보다 신규반 모집 사례에 반응"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e8e8e4] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-[#1a1a1a]/55 hover:text-[#111110]">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#111110] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#084734] disabled:opacity-40"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  )
}

function NumInput({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string
  value: number | null
  onChange: (v: string) => void
  min?: number
  step?: number
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">{label}</label>
      <input
        type="number"
        value={value == null ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        step={step}
        className="w-full rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
      />
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function AdminCampaignsPage() {
  const router = useRouter()
  const [tabParam, setTabParam] = useUrlState("tab", "summary")
  // 고객 360 딥링크(?message_to=&message_name=) 수신자 프리필 — 마운트 시 1회 소모
  const [messagePrefill, setMessagePrefill] = useState<MessagePrefill | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [metricsMap, setMetricsMap] = useState<Record<string, EventMetrics>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>("all")
  const [editing, setEditing] = useState<PublicEvent | null>(null)
  const [viewParam, setViewParam] = useUrlState("view", "list")
  const galleryView = viewParam === "gallery"
  const [eventSearch, setEventSearch] = useState("")
  const [eventStatusFilter, setEventStatusFilter] = useState<EventStatus | "all">("all")
  const [eventCategoryFilter, setEventCategoryFilter] = useState<EventCategory | "all">("all")
  const [viewingEvent, setViewingEvent] = useState<PublicEvent | null>(null)
  const [metaDashboard, setMetaDashboard] = useState<MetaCampaignDashboard | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaDatePreset, setMetaDatePreset] = useState<MetaDatePreset>("last_30d")
  const [metaUpdatingId, setMetaUpdatingId] = useState<string | null>(null)
  const [emailStats, setEmailStats] = useState<MarketingStatsData | null>(null)
  const [channelBudgets, setChannelBudgets] = useState<Record<AdChannel, number>>(
    () => Object.fromEntries(AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])) as Record<AdChannel, number>
  )
  const [eventSort, setEventSort] = useState<"date" | "leads" | "deals" | "roi">("date")
  const activeTab: CampaignTab = CAMPAIGN_TABS.some((tab) => tab.id === tabParam)
    ? (tabParam as CampaignTab)
    : "summary"

  const load = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    setLoading(true)
    setError(null)
    try {
      const [ev, leadData, metricData] = await Promise.all([
        adminFetchJsonCached<PublicEvent[]>("/api/admin/events", undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
        adminFetchJsonCached<{ leads: LeadRecord[] }>("/api/admin/leads", undefined, {
          ttlMs: 45_000,
          force,
          staleIfError: !force,
        }),
        adminFetchJsonCached<{ metrics: Record<string, EventMetrics> }>("/api/admin/event-metrics", undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
      ])
      setEvents(ev)
      setLeads(leadData.leads)
      setMetricsMap(metricData.metrics)
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로딩 실패")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 캠페인 메시지 수신자 프리필 딥링크 소모 (message_to / message_name)
  // - 파라미터를 state로 캡처하고 메시지 탭을 활성화한 뒤,
  // - router.replace로 URL에서 제거해(one-shot) 새로고침 시 재적용을 막는다.
  //   탭 활성화는 이 페이지의 탭 상태 메커니즘(useUrlState → history.replaceState)을 그대로 쓰고,
  //   파라미터 제거는 라우터를 통해 수행한다(raw history API로 지우면 useSearchParams 구독과 어긋난다).
  useEffect(() => {
    const prefill = parseMessagePrefill(window.location.search)
    if (!prefill) return
    setMessagePrefill(prefill)
    setTabParam("email") // "메시지" 탭 (id는 딥링크 호환상 email 유지)
    // setTabParam이 동기적으로 URL에 tab=email을 반영한 뒤의 search에서 message_*만 벗겨낸다.
    const rest = stripMessagePrefillParams(window.location.search)
    router.replace(rest ? `${window.location.pathname}?${rest}` : window.location.pathname, {
      scroll: false,
    })
  }, [router, setTabParam])

  const consumeMessagePrefill = useCallback(() => setMessagePrefill(null), [])

  const loadMeta = useCallback(async () => {
    setMetaLoading(true)
    setMetaError(null)
    try {
      const data = await adminFetchJson<MetaCampaignDashboard & { ok: boolean }>(
        `/api/admin/meta/campaigns?datePreset=${metaDatePreset}&limit=50`
      )
      setMetaDashboard(data)
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : "Meta 캠페인 로딩 실패")
    } finally {
      setMetaLoading(false)
    }
  }, [metaDatePreset])

  const loadEmailStats = useCallback(async () => {
    try {
      const data = await adminFetchJsonCached<MarketingStatsData>("/api/admin/marketing/stats", undefined, {
        ttlMs: 60_000,
        staleIfError: true,
      })
      setEmailStats(data)
    } catch {
      // supplementary — silent failure is acceptable
    }
  }, [])

  useEffect(() => {
    if (activeTab === "summary" || activeTab === "meta") {
      loadMeta()
    }
  }, [activeTab, loadMeta])

  useEffect(() => {
    // 이메일 탭은 MarketingHub가 자체 데이터를 불러온다. 요약 탭 채널 카드용만 여기서 조회.
    if (activeTab === "summary") {
      void loadEmailStats()
    }
  }, [activeTab, loadEmailStats])

  // 채널 예산(배정)은 광고 탭에서만 필요 — 지연 로드. 실패해도 0으로 유지(무크래시).
  const loadChannelBudgets = useCallback(async () => {
    try {
      const data = await adminFetchJson<{ budgets: Record<AdChannel, number> }>(
        "/api/admin/channel-budgets"
      )
      setChannelBudgets(data.budgets)
    } catch {
      // 보조 데이터 — 조용히 실패, 기존 값(0) 유지
    }
  }, [])

  useEffect(() => {
    if (activeTab === "meta") void loadChannelBudgets()
  }, [activeTab, loadChannelBudgets])

  const handleChannelBudgetChange = useCallback(async (channel: AdChannel, amount: number) => {
    try {
      const data = await adminFetchJson<{ budgets: Record<AdChannel, number> }>(
        "/api/admin/channel-budgets",
        { method: "PATCH", body: JSON.stringify({ channel, amount }) }
      )
      setChannelBudgets(data.budgets)
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : "채널 예산 저장 실패")
    }
  }, [])

  const toggleMetaCampaignStatus = useCallback(
    async (campaign: MetaCampaignRow) => {
      const nextStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE"
      const actionLabel = nextStatus === "ACTIVE" ? "재개" : "중지"
      const confirmed = window.confirm(
        `${campaign.name} 캠페인을 ${actionLabel}할까요?\n\n이 작업은 Meta 광고 관리자에 바로 반영됩니다.`
      )
      if (!confirmed) return

      setMetaUpdatingId(campaign.id)
      setMetaError(null)
      try {
        await adminFetchJson(`/api/admin/meta/campaigns/${campaign.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        })
        await loadMeta()
      } catch (e) {
        setMetaError(e instanceof Error ? e.message : "Meta 캠페인 상태 변경 실패")
      } finally {
        setMetaUpdatingId(null)
      }
    },
    [loadMeta]
  )

  const filtered = useMemo(
    () => events.filter((ev) => eventInPeriod(ev, period)),
    [events, period]
  )

  const leadLookupRows = useMemo<LeadLookupRow[]>(
    () =>
      leads.map((lead) => ({
        haystack: `${lead.source ?? ""} ${lead.notes ?? ""}`.toLowerCase(),
        timestampMs: new Date(lead.timestamp).getTime(),
      })),
    [leads]
  )

  const eventLeadStats = useMemo(
    () => assignEventLeads(leadLookupRows, filtered),
    [filtered, leadLookupRows]
  )

  // 집계 (전체 KPI)
  const aggregate = useMemo(() => {
    let totalSpend = 0
    let totalRevenue = 0
    let totalLeads = 0
    let totalDeals = 0
    let totalAttendees = 0
    // ROI 분모는 "매출을 입력한" 행사의 광고비만 합산한다. 매출 미입력 행사의
    // 광고비까지 넣으면 매출 0으로 잡혀 누적 ROI가 거짓 적자로 끌려간다.
    let roiSpend = 0
    let roiRevenue = 0
    const channelTotals = Object.fromEntries(
      AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])
    ) as Record<AdChannel, number>
    for (const ev of filtered) {
      const metrics = metricsMap[ev.id] ?? {
        ...DEFAULT_EVENT_METRICS,
        eventId: ev.id,
        updatedAt: "",
      }
      const leadStats = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
      const attributed = leadStats.attributed
      const during = leadStats.during
      const funnel = buildFunnel(ev, metrics, attributed, during)
      const econ = computeEconomics(funnel, metrics)
      totalSpend += econ.adSpendTotal
      totalRevenue += econ.revenue
      totalLeads += funnel.leads
      totalDeals += funnel.deals
      totalAttendees += funnel.attendees
      if (metrics.dealsRevenue != null) {
        roiSpend += econ.adSpendTotal
        roiRevenue += econ.revenue
      }
      for (const e of metrics.adSpendEntries) channelTotals[e.channel] += e.amount
    }
    const avgCpl = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : null
    const overallRoi = roiSpend > 0 ? Math.round(((roiRevenue - roiSpend) / roiSpend) * 100) : null
    const dealConversionRate = totalLeads > 0 ? Math.round((totalDeals / totalLeads) * 100) : null
    const attendanceToDealRate =
      totalAttendees > 0 ? Math.round((totalDeals / totalAttendees) * 100) : null
    return {
      totalSpend,
      totalRevenue,
      totalLeads,
      totalDeals,
      totalAttendees,
      avgCpl,
      overallRoi,
      dealConversionRate,
      attendanceToDealRate,
      channelTotals,
    }
  }, [eventLeadStats, filtered, metricsMap])

  const channelChartData = useMemo(
    () =>
      (Object.entries(aggregate.channelTotals) as [AdChannel, number][])
        .filter(([, v]) => v > 0)
        .map(([channel, value]) => ({
          channel,
          name: AD_CHANNEL_LABEL[channel],
          value,
          color: AD_CHANNEL_COLOR[channel],
        })),
    [aggregate.channelTotals]
  )

  const sortedEvents = useMemo(() => {
    if (eventSort === "leads") {
      return [...filtered].sort((a, b) => {
        const aS = eventLeadStats.get(a.id) ?? { attributed: 0, during: 0 }
        const bS = eventLeadStats.get(b.id) ?? { attributed: 0, during: 0 }
        return (bS.attributed + bS.during) - (aS.attributed + aS.during)
      })
    }
    if (eventSort === "deals") {
      return [...filtered].sort((a, b) => {
        const aM = metricsMap[a.id] ?? DEFAULT_EVENT_METRICS
        const bM = metricsMap[b.id] ?? DEFAULT_EVENT_METRICS
        return (bM.dealsCount ?? 0) - (aM.dealsCount ?? 0)
      })
    }
    if (eventSort === "roi") {
      return [...filtered].sort((a, b) => {
        const aM = metricsMap[a.id] ?? { ...DEFAULT_EVENT_METRICS, eventId: a.id, updatedAt: "" }
        const bM = metricsMap[b.id] ?? { ...DEFAULT_EVENT_METRICS, eventId: b.id, updatedAt: "" }
        const aS = eventLeadStats.get(a.id) ?? { attributed: 0, during: 0 }
        const bS = eventLeadStats.get(b.id) ?? { attributed: 0, during: 0 }
        const aEcon = computeEconomics(buildFunnel(a, aM, aS.attributed, aS.during), aM)
        const bEcon = computeEconomics(buildFunnel(b, bM, bS.attributed, bS.during), bM)
        if (aEcon.roi === null) return 1
        if (bEcon.roi === null) return -1
        return bEcon.roi - aEcon.roi
      })
    }
    return [...filtered].sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
  }, [filtered, eventSort, eventLeadStats, metricsMap])

  const visibleEvents = useMemo(
    () =>
      filterEvents(sortedEvents, {
        search: eventSearch,
        status: eventStatusFilter,
        category: eventCategoryFilter,
      }),
    [sortedEvents, eventSearch, eventStatusFilter, eventCategoryFilter]
  )

  const roiChartData = useMemo(
    () =>
      filtered
        .map((ev) => {
          const metrics = metricsMap[ev.id] ?? { ...DEFAULT_EVENT_METRICS, eventId: ev.id, updatedAt: "" }
          const leadStats = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
          const funnel = buildFunnel(ev, metrics, leadStats.attributed, leadStats.during)
          const econ = computeEconomics(funnel, metrics)
          return {
            name: ev.title.length > 12 ? ev.title.slice(0, 11) + "…" : ev.title,
            roi: econ.roi,
          }
        })
        .filter((d): d is { name: string; roi: number } => d.roi !== null)
        .slice(0, 8),
    [eventLeadStats, filtered, metricsMap]
  )

  const compareChartData = useMemo(
    () =>
      filtered
        .map((ev) => {
          const metrics = metricsMap[ev.id] ?? {
            ...DEFAULT_EVENT_METRICS,
            eventId: ev.id,
            updatedAt: "",
          }
          const leadStats = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
          const attributed = leadStats.attributed
          const during = leadStats.during
          const funnel = buildFunnel(ev, metrics, attributed, during)
          return {
            name: ev.title.length > 14 ? ev.title.slice(0, 13) + "…" : ev.title,
            리드: funnel.leads,
            신청: funnel.applications,
            참석: funnel.attendees,
            딜: funnel.deals,
          }
        })
        .slice(0, 10),
    [eventLeadStats, filtered, metricsMap]
  )

  const channelEmailStats = emailStats
    ? {
        totalSubscribers: emailStats.subscribers.total,
        activeSubscribers: emailStats.subscribers.active,
        sentCampaigns: emailStats.campaigns.recentCampaigns.filter((c) => c.status === "sent").length,
        newThisMonth: emailStats.subscribers.newThisMonth,
      }
    : null

  // 행사별 funnel+economics 단일 소스 — 아래 모든 파생값이 여기서 읽어 일관성 유지
  const perEventEcon = useMemo(() => {
    return filtered.map((ev) => {
      const metrics: EventMetrics =
        metricsMap[ev.id] ?? { ...DEFAULT_EVENT_METRICS, eventId: ev.id, updatedAt: "" }
      const leadStats = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
      const funnel = buildFunnel(ev, metrics, leadStats.attributed, leadStats.during)
      const econ = computeEconomics(funnel, metrics)
      return { event: ev, metrics, funnel, econ }
    })
  }, [filtered, metricsMap, eventLeadStats])

  // 월별 추이 (YYYY-MM)
  const trendData = useMemo<TrendPoint[]>(() => {
    const buckets = new Map<string, { leads: number; revenue: number; spend: number }>()
    for (const { event, funnel, econ } of perEventEcon) {
      const d = new Date(event.startsAt)
      if (Number.isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const bucket = buckets.get(key) ?? { leads: 0, revenue: 0, spend: 0 }
      bucket.leads += funnel.leads
      bucket.revenue += econ.revenue
      bucket.spend += econ.adSpendTotal
      buckets.set(key, bucket)
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([month, v]) => ({ month, leads: v.leads, revenue: v.revenue, spend: v.spend }))
  }, [perEventEcon])

  // 채널별 효율 — 광고비는 채널 합산, 리드는 행사 내 광고비 비중으로 안분(추정)
  const channelEfficiencyData = useMemo<ChannelEfficiencyRow[]>(() => {
    const spendByChannel = Object.fromEntries(
      AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])
    ) as Record<AdChannel, number>
    const leadsByChannel = Object.fromEntries(
      AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])
    ) as Record<AdChannel, number>
    for (const { metrics, funnel } of perEventEcon) {
      const entries = metrics.adSpendEntries
      const eventSpend = entries.reduce((sum, e) => sum + e.amount, 0)
      for (const e of entries) spendByChannel[e.channel] += e.amount
      if (eventSpend > 0 && funnel.leads > 0) {
        for (const e of entries) {
          leadsByChannel[e.channel] += funnel.leads * (e.amount / eventSpend)
        }
      }
    }
    return (Object.keys(AD_CHANNEL_LABEL) as AdChannel[])
      .filter((channel) => spendByChannel[channel] > 0)
      .map((channel) => {
        const spend = spendByChannel[channel]
        const leads = leadsByChannel[channel]
        const cpl = leads > 0 ? Math.round(spend / leads) : null
        return {
          channel,
          label: AD_CHANNEL_LABEL[channel],
          color: AD_CHANNEL_COLOR[channel],
          spend,
          leads: Math.round(leads),
          cpl,
        }
      })
  }, [perEventEcon])

  // 목표 달성 (targetLeads / targetRevenue 보유 행사만)
  const goalData = useMemo(() => {
    let targetLeads = 0
    let actualLeads = 0
    let targetRevenue = 0
    let actualRevenue = 0
    const perEvent: GoalEventRow[] = []
    for (const { event, metrics, funnel, econ } of perEventEcon) {
      const hasLeadTarget = metrics.targetLeads != null && metrics.targetLeads > 0
      const hasRevTarget = metrics.targetRevenue != null && metrics.targetRevenue > 0
      if (!hasLeadTarget && !hasRevTarget) continue
      if (hasLeadTarget) {
        targetLeads += metrics.targetLeads as number
        actualLeads += funnel.leads
      }
      if (hasRevTarget) {
        targetRevenue += metrics.targetRevenue as number
        actualRevenue += econ.revenue
      }
      perEvent.push({
        id: event.id,
        title: event.title,
        targetLeads: hasLeadTarget ? metrics.targetLeads : null,
        actualLeads: funnel.leads,
        targetRevenue: hasRevTarget ? metrics.targetRevenue : null,
        actualRevenue: econ.revenue,
      })
    }
    return {
      leads: { target: targetLeads, actual: actualLeads },
      revenue: { target: targetRevenue, actual: actualRevenue },
      perEvent,
    }
  }, [perEventEcon])

  // 리더보드 행 (컴포넌트가 자체 정렬·top8)
  const performerRows = useMemo<PerformerRow[]>(() => {
    return perEventEcon.map(({ event, funnel, econ }) => ({
      id: event.id,
      title: event.title,
      leads: funnel.leads,
      deals: funnel.deals,
      revenue: econ.revenue,
      spend: econ.adSpendTotal,
      roi: econ.roi,
      cpl: econ.cpl,
    }))
  }, [perEventEcon])

  // 요약 탭 집계 퍼널 (단계별 합산)
  const summaryFunnelStages = useMemo<WaterfallStage[]>(() => {
    let impressions = 0, leads = 0, applications = 0, qualifiedLeads = 0, attendees = 0, deals = 0
    for (const { funnel } of perEventEcon) {
      impressions += funnel.impressions
      leads += funnel.leads
      applications += funnel.applications
      qualifiedLeads += funnel.qualifiedLeads
      attendees += funnel.attendees
      deals += funnel.deals
    }
    return [
      { key: "impressions", label: "노출", value: impressions, color: "#84827a" },
      { key: "leads", label: "리드", value: leads, color: "#111110" },
      { key: "applications", label: "신청", value: applications, color: "#D97706" },
      { key: "qualifiedLeads", label: "유효 리드", value: qualifiedLeads, color: "#084734" },
      { key: "attendees", label: "참석", value: attendees, color: "#084734" },
      { key: "deals", label: "딜", value: deals, color: "#B85C33" },
    ]
  }, [perEventEcon])

  // 자동 인사이트
  const summaryInsights = useMemo<Insight[]>(() => {
    if (loading) return []
    const out: Insight[] = []
    if (aggregate.overallRoi != null) {
      out.push({
        id: "roi",
        tone: aggregate.overallRoi >= 0 ? "positive" : "warning",
        icon: aggregate.overallRoi >= 0 ? "trend" : "alert",
        title: `누적 ROI ${aggregate.overallRoi}%`,
        body:
          aggregate.overallRoi >= 0
            ? `매출 ${won(aggregate.totalRevenue)} · 광고비 ${won(aggregate.totalSpend)}`
            : "매출보다 광고비가 큽니다. 채널별 효율을 점검하세요.",
      })
    }
    const cplRanked = channelEfficiencyData.filter((r) => r.cpl != null)
    if (cplRanked.length > 0) {
      const best = cplRanked.reduce((a, b) => ((a.cpl as number) <= (b.cpl as number) ? a : b))
      out.push({
        id: "best-channel",
        tone: "positive",
        icon: "spark",
        title: `최고 효율 채널 · ${best.label}`,
        body: `CPL ${won(best.cpl)} · 광고비 ${won(best.spend)}`,
      })
    }
    const bestRoiEvent = perEventEcon
      .filter((e) => e.econ.roi != null)
      .sort((a, b) => (b.econ.roi as number) - (a.econ.roi as number))[0]
    if (bestRoiEvent) {
      out.push({
        id: "best-event",
        tone: "neutral",
        icon: "target",
        title: `최고 ROI 행사 · ${bestRoiEvent.event.title}`,
        body: `ROI ${bestRoiEvent.econ.roi}% · 리드 ${KRW.format(bestRoiEvent.funnel.leads)}건`,
      })
    }
    if (aggregate.avgCpl != null) {
      out.push({
        id: "avg-cpl",
        tone: "neutral",
        icon: "trend",
        title: `평균 CPL ${won(aggregate.avgCpl)}`,
        body: `총 리드 ${KRW.format(aggregate.totalLeads)}건 · 딜 ${KRW.format(aggregate.totalDeals)}건`,
      })
    }
    if (
      emailStats &&
      emailStats.subscribers.active > 10 &&
      emailStats.campaigns.recentCampaigns.filter((c) => c.status === "sent").length === 0
    ) {
      out.push({
        id: "email-gap",
        tone: "warning",
        icon: "alert",
        title: `이메일 구독자 ${emailStats.subscribers.active}명 · 발송 이력 없음`,
        body: "이메일 탭에서 첫 캠페인을 발송하세요.",
      })
    }
    return out
  }, [loading, aggregate, channelEfficiencyData, perEventEcon, emailStats])

  // Meta 차트용 행
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

  // CSV 내보내기 — 행사
  const eventExport = useMemo(() => {
    const columns: ExportColumn[] = [
      { key: "title", label: "행사" },
      { key: "status", label: "상태" },
      { key: "startsAt", label: "시작일" },
      { key: "leads", label: "리드" },
      { key: "applications", label: "신청" },
      { key: "attendees", label: "참석" },
      { key: "deals", label: "딜" },
      { key: "spend", label: "광고비(원)" },
      { key: "revenue", label: "매출(원)" },
      { key: "cpl", label: "CPL(원)" },
      { key: "roi", label: "ROI(%)" },
    ]
    const econById = new Map(perEventEcon.map((e) => [e.event.id, e]))
    const rows: Array<Record<string, string | number | null>> = sortedEvents.map((ev) => {
      const e =
        econById.get(ev.id) ??
        (() => {
          const metrics: EventMetrics =
            metricsMap[ev.id] ?? { ...DEFAULT_EVENT_METRICS, eventId: ev.id, updatedAt: "" }
          const ls = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
          const funnel = buildFunnel(ev, metrics, ls.attributed, ls.during)
          return { event: ev, metrics, funnel, econ: computeEconomics(funnel, metrics) }
        })()
      return {
        title: ev.title,
        status: ev.status,
        startsAt: ev.startsAt.slice(0, 10),
        leads: e.funnel.leads,
        applications: e.funnel.applications,
        attendees: e.funnel.attendees,
        deals: e.funnel.deals,
        spend: e.econ.adSpendTotal,
        revenue: e.econ.revenue,
        cpl: e.econ.cpl,
        roi: e.econ.roi,
      }
    })
    return { columns, rows }
  }, [perEventEcon, sortedEvents, metricsMap, eventLeadStats])

  // CSV 내보내기 — Meta
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

  const recommendedActions = (() => {
    if (loading) return []
    const actions: Array<{
      id: string
      tone: "warn" | "info" | "success"
      title: string
      detail: string
      tabTarget?: CampaignTab
    }> = []

    if (aggregate.totalLeads === 0) {
      actions.push({
        id: "no-leads",
        tone: "info",
        title: "집계된 리드 없음",
        detail: "성과 입력 또는 Meta 연결 필요",
        tabTarget: "events",
      })
    }

    if (aggregate.overallRoi !== null && aggregate.overallRoi < 0) {
      actions.push({
        id: "negative-roi",
        tone: "warn",
        title: `누적 ROI ${aggregate.overallRoi}% — 광고비 점검`,
        detail: "매출 < 광고비 · 채널별 효율 확인",
        tabTarget: "meta",
      })
    }

    const upcomingEvent = events.find((ev) => {
      const start = new Date(ev.startsAt).getTime()
      const now = Date.now()
      return ev.status === "예정" && start > now && start - now < 14 * 24 * 3600 * 1000
    })
    if (upcomingEvent) {
      actions.push({
        id: `upcoming-${upcomingEvent.id}`,
        tone: "info",
        title: `"${upcomingEvent.title}" — 14일 내 시작`,
        detail: "퍼널·사전 안내 준비",
        tabTarget: "events",
      })
    }

    if (
      emailStats &&
      emailStats.subscribers.active > 10 &&
      emailStats.campaigns.recentCampaigns.filter((c) => c.status === "sent").length === 0
    ) {
      actions.push({
        id: "email-gap",
        tone: "info",
        title: `이메일 구독자 ${emailStats.subscribers.active}명 — 발송 이력 없음`,
        detail: "이메일 탭에서 첫 발송",
        tabTarget: "email",
      })
    }

    if (
      aggregate.totalLeads > 0 &&
      aggregate.overallRoi !== null &&
      aggregate.overallRoi >= 0 &&
      actions.length === 0
    ) {
      actions.push({
        id: "all-good",
        tone: "success",
        title: "성과 양호",
        detail: `ROI ${aggregate.overallRoi}% · 리드 ${KRW.format(aggregate.totalLeads)} · 딜 ${KRW.format(aggregate.totalDeals)}`,
      })
    }

    return actions.slice(0, 4)
  })()

  const showFilterRow = activeTab === "summary" || activeTab === "events"
  const refreshLoading =
    activeTab === "meta" ? metaLoading : activeTab === "summary" ? loading || metaLoading : loading
  const refreshCurrent = useCallback(() => {
    if (activeTab === "meta") {
      void loadMeta()
      return
    }
    if (activeTab === "summary") {
      void Promise.all([load({ force: true }), loadMeta()])
      return
    }
    void load({ force: true })
  }, [activeTab, load, loadMeta])

  return (
    <div className="pb-24">
      {/* TopBar — branch admin과 동일한 패턴 */}
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pb-5 pt-6 sm:px-6 lg:px-9 lg:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#615D59]">
              <span>ADMIN</span>
              <span className="opacity-50">›</span>
              <span>그로스</span>
              <span className="opacity-50">›</span>
              <span>캠페인</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">
              캠페인
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={refreshCurrent}
              disabled={refreshLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshLoading ? "animate-spin" : ""}`} />
              동기화
            </button>
            <Link
              href="/admin/events"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#063d2a]"
            >
              <Plus className="w-3.5 h-3.5" />
              행사 관리
            </Link>
          </div>
        </div>

        {showFilterRow && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="기간 필터">
              {(["active", "30d", "90d", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                    period === p ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                  }`}
                >
                  {p === "active" ? "진행중·예정" : p === "30d" ? "30일" : p === "90d" ? "90일" : "전체"}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Sub-tabs — branch admin 스타일 */}
      <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#EBE8E2] px-2 sm:px-4 lg:px-9">
        <AdminTabs
          className="-mb-px py-2"
          label="캠페인 보기"
          variant="subtle"
          items={CAMPAIGN_TABS.map((tab) => ({
            value: tab.id,
            label: tab.label,
            icon:
              tab.id === "meta" ? (
                <Activity className="h-3.5 w-3.5" />
              ) : tab.id === "email" ? (
                <Mail className="h-3.5 w-3.5" />
              ) : undefined,
          }))}
          value={activeTab}
          onValueChange={setTabParam}
        />
      </div>

      {/* 마케팅 워크스페이스 크로스링크 — 형제 마케팅 표면으로 이동(사이드바 그룹 보조).
          공개 행사는 헤더 "행사 관리" CTA로 이미 도달 가능하므로 여기선 제외(한 목적지 중복 라벨 방지). */}
      <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-2.5 sm:px-6 lg:px-9">
        <MarketingCrossLinks currentHref="/admin/campaigns" excludeHrefs={["/admin/events"]} />
      </div>

      {/* Tab content */}
      {activeTab === "email" ? (
        <div className="px-4 pt-6 sm:px-6 lg:px-9">
          <MarketingHub
            recipientPrefill={messagePrefill}
            onRecipientPrefillConsumed={consumeMessagePrefill}
          />
        </div>
      ) : activeTab === "meta" ? (
        <div className="px-4 pt-6 sm:px-6 lg:px-9">
          <div className="mb-4 flex items-center justify-end">
            <CampaignExportButton
              columns={metaExport.columns}
              rows={metaExport.rows}
              filename="meta-campaigns"
              label="Meta CSV"
              disabled={metaLoading}
            />
          </div>
          <MetaCampaignPanel
            dashboard={metaDashboard}
            loading={metaLoading}
            error={metaError}
            datePreset={metaDatePreset}
            updatingId={metaUpdatingId}
            onDatePresetChange={setMetaDatePreset}
            onRefresh={loadMeta}
            onToggleStatus={toggleMetaCampaignStatus}
          />
          {metaPerfRows.length > 0 && (
            <div className="mt-5">
              <MetaPerformanceCharts rows={metaPerfRows} currency={metaDashboard?.account.currency ?? "USD"} />
            </div>
          )}
          <div className="mt-8">
            <div className="mb-3">
              <h2 className="text-[15px] font-semibold text-[#111110]">채널 예산·집행</h2>
              <p className="mt-0.5 text-[12px] text-[#1a1a1a]/50">
                채널별 배정 예산을 입력하고 집행·전환(추정)·CPL과 대조합니다. 채널 귀속이 불가한 ROI는 종합만 표기합니다.
              </p>
            </div>
            <ChannelBudgetTable
              rows={channelEfficiencyData}
              budgets={channelBudgets}
              onBudgetChange={handleChannelBudgetChange}
              totalSpend={aggregate.totalSpend}
              totalRevenue={aggregate.totalRevenue}
              overallRoi={aggregate.overallRoi}
              metaLiveSpend={metaDashboard?.summary.spend ?? null}
              metaCurrency={metaDashboard?.account.currency ?? "USD"}
            />
          </div>
        </div>
      ) : (
        <div className="px-4 pt-6 sm:px-6 lg:px-9">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              {error}
            </div>
          )}

      {activeTab === "summary" && (
        <>
      <ChannelHubCards
        aggregate={aggregate}
        metaDashboard={metaDashboard}
        emailStats={channelEmailStats}
        loading={loading}
        metaLoading={metaLoading}
        onGoTo={(tab) => setTabParam(tab)}
      />

      <MetaLiveSummary
        dashboard={metaDashboard}
        loading={metaLoading}
        error={metaError}
        datePreset={metaDatePreset}
        onOpenMeta={() => setTabParam("meta")}
        onRefresh={loadMeta}
      />

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {loading ? (
          <>
            <KpiTileSkeleton />
            <KpiTileSkeleton />
            <KpiTileSkeleton />
            <KpiTileSkeleton />
            <KpiTileSkeleton />
            <KpiTileSkeleton />
          </>
        ) : (
          <>
            <KpiCard
              icon={<CalendarIcon className="w-3.5 h-3.5" />}
              label="대상 행사"
              value={KRW.format(filtered.length)}
              hint={`전체 ${events.length}건 중`}
            />
            <KpiCard
              icon={<Wallet className="w-3.5 h-3.5" />}
              label="총 광고비"
              value={won(aggregate.totalSpend)}
            />
            <KpiCard
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="행사 귀속 매출(입력 기준)"
              value={won(aggregate.totalRevenue)}
              hint="수기 입력 추정 · 장부 확정매출 아님 · KRW"
              tone="success"
            />
            <KpiCard
              icon={<Target className="w-3.5 h-3.5" />}
              label="평균 CPL"
              value={aggregate.avgCpl != null ? won(aggregate.avgCpl) : "—"}
              hint={`총 리드 ${KRW.format(aggregate.totalLeads)}건 · 선택 기간 행사 기준`}
            />
            <KpiCard
              icon={<Users className="w-3.5 h-3.5" />}
              label="총 참석자"
              value={KRW.format(aggregate.totalAttendees)}
              hint={`딜 ${KRW.format(aggregate.totalDeals)}건`}
            />
            <KpiCard
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="누적 ROI"
              value={aggregate.overallRoi != null ? pct(aggregate.overallRoi) : "—"}
              hint="선택 기간 행사 매출·광고비 기준"
              tone={aggregate.overallRoi != null && aggregate.overallRoi >= 0 ? "success" : "warn"}
            />
          </>
        )}
      </div>

      {/* 자동 인사이트 */}
      {summaryInsights.length > 0 && (
        <div className="mb-5">
          <InsightsBanner insights={summaryInsights} />
        </div>
      )}

      {/* 전환 초점 3칸 — 개별 카드 대신 하나의 카드 안에서 divide로만 구분(카드 과중첩 완화) */}
      <div className="mb-5 grid divide-y divide-[#f0f0ec] rounded-2xl border border-[#e8e8e4] bg-white lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <ConversionFocusCell
          label="전환 초점"
          value={aggregate.dealConversionRate != null ? pct(aggregate.dealConversionRate) : "—"}
          hint={`리드 ${KRW.format(aggregate.totalLeads)}건 중 딜 ${KRW.format(aggregate.totalDeals)}건`}
          tone={aggregate.dealConversionRate != null && aggregate.dealConversionRate > 0 ? "success" : "neutral"}
          loading={loading}
        />
        <ConversionFocusCell
          label="참석 후 딜"
          value={aggregate.attendanceToDealRate != null ? pct(aggregate.attendanceToDealRate) : "—"}
          hint={`참석자 ${KRW.format(aggregate.totalAttendees)}명 기준 후속 영업 전환`}
          tone={aggregate.attendanceToDealRate != null && aggregate.attendanceToDealRate > 0 ? "success" : "neutral"}
          loading={loading}
        />
        <ConversionFocusCell
          label="운영 판단"
          value={aggregate.overallRoi != null ? (aggregate.overallRoi >= 0 ? "확대 검토" : "비용 점검") : "집계 대기"}
          hint={aggregate.avgCpl != null ? `누적 ROI ${pct(aggregate.overallRoi)} · 평균 CPL ${won(aggregate.avgCpl)}` : "ROI·CPL 집계 대기"}
          tone={aggregate.overallRoi == null ? "neutral" : aggregate.overallRoi >= 0 ? "success" : "warn"}
          loading={loading}
        />
      </div>

      {/* timeline */}
      <div className="mb-5">
        <TimelineRow events={filtered} />
      </div>

      {/* 집계 퍼널 + 목표 달성 */}
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold text-[#111110]">전환 퍼널</h2>
              <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">단계별 전환율과 이탈을 추적합니다</p>
            </div>
          </div>
          <MiniFunnel stages={summaryFunnelStages} variant="waterfall" />
        </div>
        <GoalProgressPanel
          leads={goalData.leads}
          revenue={goalData.revenue}
          perEvent={goalData.perEvent}
        />
      </div>

      {/* charts */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5 lg:col-span-2">
          <h2 className="mb-3 text-[14px] font-semibold text-[#111110]">행사별 퍼널 비교</h2>
          {compareChartData.length === 0 ? (
            <p className="py-12 text-center text-[12px] text-[#1a1a1a]/30">표시할 데이터가 없습니다.</p>
          ) : (
            <div className="h-[260px] w-full">
              <EventFunnelCompareChart data={compareChartData} />
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-[14px] font-semibold text-[#111110]">광고비 채널 분포</h2>
          {channelChartData.length === 0 ? (
            <p className="py-12 text-center text-[12px] text-[#1a1a1a]/30">광고비가 입력되지 않았습니다.</p>
          ) : (
            <>
              <div className="h-[180px] w-full">
                <ChannelSpendPieChart data={channelChartData} />
              </div>
              <div className="mt-2 divide-y divide-[#f0f0ec]">
                {channelChartData.map((entry) => (
                  <div key={entry.channel} className="flex items-center justify-between py-1.5 text-[11px]">
                    <span className="flex items-center gap-1.5 text-[#1a1a1a]/55">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: entry.color }} />
                      {entry.name}
                    </span>
                    <span className="font-semibold tabular-nums text-[#111110]">{won(entry.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 채널별 효율 (CPL) */}
      {channelEfficiencyData.length > 0 && (
        <div className="mb-5">
          <ChannelEfficiencyChart data={channelEfficiencyData} />
          <p className="mt-1.5 px-1 text-[10.5px] leading-relaxed text-[#1a1a1a]/35">
            * 채널별 리드는 행사별 광고비 비중으로 안분한 추정치입니다. 채널 단위 리드 태깅이 없어 실제값과 차이가 있을 수 있습니다.
          </p>
        </div>
      )}

      {/* 행사별 ROI 비교 */}
      {roiChartData.length > 0 && (
        <div className="mb-5 rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-[14px] font-semibold text-[#111110]">행사별 ROI 비교</h2>
          <div className="h-[200px] w-full">
            <EventRoiChart data={roiChartData} />
          </div>
        </div>
      )}

      {/* 월별 추이 */}
      {trendData.length > 0 && (
        <div className="mb-5">
          <CampaignTrendChart data={trendData} />
        </div>
      )}

      {/* 추천 액션 */}
      {recommendedActions.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 text-[13px] font-semibold text-[#111110]">추천 액션</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {recommendedActions.map((action) => {
              const toneClass =
                action.tone === "success"
                  ? "border-emerald-100 bg-[#ECFDF5]"
                  : action.tone === "warn"
                    ? "border-amber-100 bg-amber-50"
                    : "border-[#e8e8e4] bg-white"
              const titleClass =
                action.tone === "success"
                  ? "text-[#084734]"
                  : action.tone === "warn"
                    ? "text-amber-700"
                    : "text-[#111110]"
              const detailClass =
                action.tone === "success"
                  ? "text-[#084734]/60"
                  : action.tone === "warn"
                    ? "text-amber-600/80"
                    : "text-[#1a1a1a]/45"
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.tabTarget ? () => setTabParam(action.tabTarget!) : undefined}
                  disabled={!action.tabTarget}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-opacity ${toneClass} ${action.tabTarget ? "hover:opacity-80 cursor-pointer" : "cursor-default"}`}
                >
                  <p className={`text-[12px] font-semibold ${titleClass}`}>{action.title}</p>
                  <p className={`mt-0.5 text-[11px] leading-relaxed ${detailClass}`}>{action.detail}</p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 성과 리더보드 */}
      <div className="mb-5">
        <TopPerformersTable rows={performerRows} />
      </div>
        </>
      )}

      {activeTab === "events" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-[15px] font-semibold text-[#111110]">행사별 퍼널 상세</h2>
            <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="행사 보기 방식">
              <button
                type="button"
                onClick={() => setViewParam("list")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                  !galleryView ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                }`}
              >
                <ListIcon className="h-3.5 w-3.5" />
                리스트
              </button>
              <button
                type="button"
                onClick={() => setViewParam("gallery")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                  galleryView ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                갤러리
              </button>
            </div>
            <CampaignExportButton
              columns={eventExport.columns}
              rows={eventExport.rows}
              filename="campaign-events"
              label="행사 CSV"
              disabled={loading}
            />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#f0f0ec] bg-[#fafaf8] px-3 py-2">
            <div className="flex min-w-[160px] flex-1 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-[#1a1a1a]/35" />
              <input
                type="text"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="행사명 검색..."
                className="w-full text-[12px] outline-none placeholder:text-[#1a1a1a]/35"
              />
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5">
              {(["all", "진행 중", "예정", "마감"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEventStatusFilter(s)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                    eventStatusFilter === s ? "bg-[#fafaf8] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
                  }`}
                >
                  {s === "all" ? "전체" : s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5">
              <button
                type="button"
                onClick={() => setEventCategoryFilter("all")}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                  eventCategoryFilter === "all" ? "bg-[#fafaf8] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
                }`}
              >
                전체
              </button>
              {EVENT_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEventCategoryFilter(c)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                    eventCategoryFilter === c ? "bg-[#fafaf8] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5">
              {(["date", "leads", "deals", "roi"] as const).map((s) => {
                const label = { date: "날짜", leads: "리드", deals: "딜", roi: "ROI" }[s]
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEventSort(s)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      eventSort === s
                        ? "bg-[#fafaf8] text-[#111110] shadow-sm"
                        : "text-[#1a1a1a]/45 hover:text-[#111110]"
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setPeriod((p) => (p === "all" ? "active" : "all"))
              }}
              className="flex items-center gap-1 text-[12px] font-medium text-[#1a1a1a]/45 hover:text-[#111110]"
            >
              {period === "all" ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {period === "all" ? "축소" : "전체 기간 보기"}
            </button>
          </div>

          <EventOriginMatrix className="mb-4" />

          {loading ? (
            <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-16 text-center text-[13px] text-[#1a1a1a]/30">
              불러오는 중...
            </div>
          ) : sortedEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-12 text-center">
              <p className="text-[14px] font-medium text-[#111110]">표시할 행사가 없습니다</p>
              <p className="mx-auto mt-1 max-w-md text-[12px] text-[#1a1a1a]/40">
                기간 필터를 바꾸거나 행사 관리에서 새 행사를 등록하세요.
              </p>
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-12 text-center">
              <p className="text-[14px] font-medium text-[#111110]">필터에 맞는 행사가 없습니다</p>
              <button
                type="button"
                onClick={() => {
                  setEventSearch("")
                  setEventStatusFilter("all")
                  setEventCategoryFilter("all")
                }}
                className="mt-2 text-[12px] font-medium text-[#084734] hover:underline"
              >
                필터 초기화
              </button>
            </div>
          ) : galleryView ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleEvents.map((event) => (
                <EventGalleryCard key={event.id} event={event} onOpen={() => setViewingEvent(event)} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleEvents.map((event) => {
                const metrics = metricsMap[event.id] ?? {
                  ...DEFAULT_EVENT_METRICS,
                  eventId: event.id,
                  updatedAt: "",
                }
                const leadStats = eventLeadStats.get(event.id) ?? { attributed: 0, during: 0 }
                return (
                  <EventFunnelCard
                    key={event.id}
                    event={event}
                    metrics={metrics}
                    attributedLeadCount={leadStats.attributed}
                    duringLeadCount={leadStats.during}
                    onEdit={() => setEditing(event)}
                  />
                )
              })}
            </div>
          )}
        </>
      )}
        </div>
      )}

      {viewingEvent && (
        <EventDetailModal
          event={viewingEvent}
          metrics={
            metricsMap[viewingEvent.id] ?? {
              ...DEFAULT_EVENT_METRICS,
              eventId: viewingEvent.id,
              updatedAt: "",
            }
          }
          attributedLeadCount={(eventLeadStats.get(viewingEvent.id) ?? { attributed: 0, during: 0 }).attributed}
          duringLeadCount={(eventLeadStats.get(viewingEvent.id) ?? { attributed: 0, during: 0 }).during}
          onClose={() => setViewingEvent(null)}
          onEdit={() => {
            const target = viewingEvent
            setViewingEvent(null)
            setEditing(target)
          }}
        />
      )}

      {editing && (
        <MetricsEditor
          event={editing}
          metrics={
            metricsMap[editing.id] ?? {
              ...DEFAULT_EVENT_METRICS,
              eventId: editing.id,
              updatedAt: "",
            }
          }
          onClose={() => setEditing(null)}
          onSaved={(saved) => setMetricsMap((m) => ({ ...m, [saved.eventId]: saved }))}
        />
      )}
    </div>
  )
}

"use client"

import { useMemo, useSyncExternalStore } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"
import { ChannelHubCards } from "@/components/admin/campaigns/ChannelHubCards"
import { InsightsBanner } from "@/components/admin/campaigns/InsightsBanner"
import type { Insight } from "@/components/admin/campaigns/InsightsBanner"
import { GoalProgressPanel } from "@/components/admin/campaigns/GoalProgressPanel"
import type { GoalEventRow } from "@/components/admin/campaigns/GoalProgressPanel"
import { MiniFunnel } from "@/components/admin/viz/MiniFunnel"
import type { FunnelStage as WaterfallStage } from "@/components/admin/viz/MiniFunnel"
import { ChartSkeleton, Skeleton } from "@/components/admin/viz"
import { TopPerformersTable } from "@/components/admin/campaigns/TopPerformersTable"
import type { PerformerRow } from "@/components/admin/campaigns/TopPerformersTable"
import type { TrendPoint } from "@/components/admin/campaigns/CampaignTrendChart"
import type { ChannelEfficiencyRow } from "@/components/admin/campaigns/ChannelEfficiencyChart"
import {
  KRW,
  compact,
  distinguishingLabels,
  formatRange,
  money,
  pct,
  won,
} from "@/components/admin/campaigns/event-format"
import type { PublicEvent } from "@/lib/types/public-events"
import {
  AD_CHANNEL_COLOR,
  AD_CHANNEL_LABEL,
  type AdChannel,
} from "@/lib/types/event-metrics"
import { KpiCard } from "./KpiCard"
import type {
  CampaignAggregate,
  CampaignTab,
  MarketingStatsData,
  MetaCampaignDashboard,
  MetaDatePreset,
  PerEventEconRow,
} from "./types"

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
                <span className="inline-flex items-center gap-1 rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-bold text-[#084734]">
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
            className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
          >
            Meta 광고 관리
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[12px] text-[#B43E3E]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : loading && !dashboard ? (
        <p className="mt-4 rounded-xl border border-dashed border-[#e8e8e4] py-8 text-center text-[12px] text-[#A39E98]">
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

// 14일 내 시작하는 "예정" 행사 — 추천 액션용. Date.now() 기준 비교는 렌더 본문이 아니라
// 모듈 헬퍼에 둔다(페이지의 eventInPeriod와 동일한 패턴 — react-hooks/purity 준수).
function findUpcomingEvent(events: PublicEvent[]): PublicEvent | undefined {
  return events.find((ev) => {
    const start = new Date(ev.startsAt).getTime()
    const now = Date.now()
    return ev.status === "예정" && start > now && start - now < 14 * 24 * 3600 * 1000
  })
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
    // 바 폭이 좁아 CSS 절단이 앞에서부터 일어난다 — 공통 접두어를 벗겨 구분되는 꼬리를 남긴다.
    const barLabels = distinguishingLabels(sorted.map((event) => event.title), 24)

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
          <p className="py-8 text-center text-[12px] text-[#A39E98]">표시할 행사가 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {sorted.map((event, index) => {
              const s = new Date(event.startsAt).getTime()
              const e = event.endsAt ? new Date(event.endsAt).getTime() : s + 24 * 3600 * 1000
              const left = Math.max(0, ((s - start.getTime()) / totalMs) * 100)
              const right = Math.min(100, ((e - start.getTime()) / totalMs) * 100)
              const width = Math.max(4, right - left)
              // 상태색은 DESIGN.md 운영 스케일 — 예정=Warning(#A8741A), 마감=뉴트럴(#A39E98).
              const color =
                event.status === "진행 중"
                  ? "bg-[#084734]"
                  : event.status === "예정"
                    ? "bg-[#A8741A]"
                    : "bg-[#A39E98]"
              return (
                <div key={event.id} className="relative h-7">
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 rounded-md ${color} px-2 py-1 text-[11px] font-medium text-white truncate shadow-sm`}
                    style={{ left: cssPercent(left), width: cssPercent(width), minWidth: "60px" }}
                    title={`${event.title} · ${formatRange(event.startsAt, event.endsAt)}`}
                  >
                    {barLabels[index]}
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

// "요약" 탭 패널 — KPI·인사이트·타임라인·퍼널·차트·추천 액션·리더보드.
// 코어 파생 원본(filtered/eventLeadStats/aggregate/perEventEcon/channelEfficiencyData)은
// 광고 탭과 공유하므로 페이지에서 내려받고, 요약 탭 전용 파생값만 여기서 계산한다.
export default function SummaryTab({
  loading,
  events,
  filtered,
  perEventEcon,
  aggregate,
  channelEfficiencyData,
  emailStats,
  emailStatsError,
  onRetryEmailStats,
  metaDashboard,
  metaLoading,
  metaError,
  metaDatePreset,
  onRefreshMeta,
  onGoToTab,
  onOpenMetricsInput,
}: {
  loading: boolean
  events: PublicEvent[]
  filtered: PublicEvent[]
  perEventEcon: PerEventEconRow[]
  aggregate: CampaignAggregate
  channelEfficiencyData: ChannelEfficiencyRow[]
  emailStats: MarketingStatsData | null
  emailStatsError: string | null
  onRetryEmailStats: () => void
  metaDashboard: MetaCampaignDashboard | null
  metaLoading: boolean
  metaError: string | null
  metaDatePreset: MetaDatePreset
  onRefreshMeta: () => void
  onGoToTab: (tab: CampaignTab) => void
  /** 광고 탭으로 넘어가 성과 입력 표에 착지 — 착지 타이밍은 MetaTab이 로드 완료 후 처리한다. */
  onOpenMetricsInput: () => void
}) {
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

  // 차트 데이터는 페이지 단일 소스(perEventEcon)를 재사용한다 — 여기서 buildFunnel/computeEconomics
  // 를 다시 돌리면 계산이 3중이 될 뿐 아니라 규칙이 갈라질 통로가 된다.
  // 라벨은 공통 접두어("Classin Meets ")를 벗겨 만든다 — 앞에서 자르면 축 라벨이 전부 동일해진다.
  const roiChartData = useMemo(() => {
    const ranked = perEventEcon
      .filter((row): row is PerEventEconRow & { econ: { roi: number } } => row.econ.roi !== null)
      // "행사별 ROI 비교"가 상위 8을 표방하므로 정렬 후 자른다 — API 순서대로 자르면 최고/최저가 빠진다.
      .sort((a, b) => b.econ.roi - a.econ.roi)
      .slice(0, 8)
    const labels = distinguishingLabels(ranked.map((row) => row.event.title), 12)
    return ranked.map((row, i) => ({ name: labels[i], roi: row.econ.roi }))
  }, [perEventEcon])

  const compareChartData = useMemo(() => {
    // 리드 많은 순 상위 10 — 볼 가치가 있는 퍼널부터. 동률(전부 0)일 땐 원래 순서 유지.
    const ranked = [...perEventEcon].sort((a, b) => b.funnel.leads - a.funnel.leads).slice(0, 10)
    const labels = distinguishingLabels(ranked.map((row) => row.event.title), 14)
    return ranked.map((row, i) => ({
      name: labels[i],
      리드: row.funnel.leads,
      신청: row.funnel.applications,
      참석: row.funnel.attendees,
      딜: row.funnel.deals,
    }))
  }, [perEventEcon])

  const channelEmailStats = useMemo(
    () =>
      emailStats
        ? {
            totalSubscribers: emailStats.subscribers.total,
            activeSubscribers: emailStats.subscribers.active,
            sentCampaigns: emailStats.campaigns.recentCampaigns.filter((c) => c.status === "sent").length,
            newThisMonth: emailStats.subscribers.newThisMonth,
          }
        : null,
    [emailStats]
  )

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
      { key: "impressions", label: "노출", value: impressions, color: "#A39E98" },
      { key: "leads", label: "리드", value: leads, color: "#111110" },
      { key: "applications", label: "신청", value: applications, color: "#A8741A" },
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

    const upcomingEvent = findUpcomingEvent(events)
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

  return (
    <>
      {emailStatsError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#e8e8e4] px-4 py-3 text-[13px] text-[#1a1a1a]/55">
          <span>{emailStatsError}</span>
          <button
            type="button"
            onClick={() => void onRetryEmailStats()}
            className="shrink-0 font-medium text-[#084734] hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}
      <ChannelHubCards
        aggregate={aggregate}
        metaDashboard={metaDashboard}
        emailStats={channelEmailStats}
        loading={loading}
        metaLoading={metaLoading}
        onGoTo={onGoToTab}
      />

      <MetaLiveSummary
        dashboard={metaDashboard}
        loading={metaLoading}
        error={metaError}
        datePreset={metaDatePreset}
        onOpenMeta={() => onGoToTab("meta")}
        onRefresh={onRefreshMeta}
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
              /* ₩0이 "0원 집행"이 아니라 "아직 입력 전"일 때 그 사실을 카드가 직접 말한다. */
              hint={aggregate.totalSpend === 0 ? "수기 입력 대기" : undefined}
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

      {/* 입력 대기 안내 — 광고비·매출이 전부 0이면 위 스트립이 ₩0·— 투성이가 되는데,
          그게 "집계 장애"가 아니라 "수기 입력 전"임을 한 줄로 밝히고 입력 표까지 데려간다.
          실패를 빈 데이터로 위장하지 않는 것과 같은 결로, 빈 데이터를 장애처럼 두지도 않는다. */}
      {!loading && filtered.length > 0 && aggregate.totalSpend === 0 && aggregate.totalRevenue === 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-[#e8e8e4] bg-[#FAFAF8] px-4 py-3">
          <p className="text-[12px] text-[#1a1a1a]/60">
            광고비·매출이 아직 입력 전이라 ₩0·—로 보입니다. 성과 입력에서 채우면 CPL·ROI가 집계됩니다.
          </p>
          <button
            type="button"
            onClick={onOpenMetricsInput}
            className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,0,0,0.1)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#111110] transition hover:bg-[#F6F5F4]"
          >
            성과 입력 열기
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
            <p className="py-12 text-center text-[12px] text-[#A39E98]">표시할 데이터가 없습니다.</p>
          ) : (
            <div className="h-[260px] w-full">
              <EventFunnelCompareChart data={compareChartData} />
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-[14px] font-semibold text-[#111110]">광고비 채널 분포</h2>
          {channelChartData.length === 0 ? (
            <p className="py-12 text-center text-[12px] text-[#A39E98]">광고비가 입력되지 않았습니다.</p>
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
          <h2 className="mb-2 text-[14px] font-semibold text-[#111110]">추천 액션</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {recommendedActions.map((action) => {
              const toneClass =
                action.tone === "success"
                  ? "border-emerald-100 bg-[#ECFDF5]"
                  : action.tone === "warn"
                    ? "border-[#ECD29C] bg-[#FBF1E0]"
                    : "border-[#e8e8e4] bg-white"
              const titleClass =
                action.tone === "success"
                  ? "text-[#084734]"
                  : action.tone === "warn"
                    ? "text-[#A8741A]"
                    : "text-[#111110]"
              const detailClass =
                action.tone === "success"
                  ? "text-[#084734]/60"
                  : action.tone === "warn"
                    ? "text-[#A8741A]/80"
                    : "text-[#1a1a1a]/45"
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.tabTarget ? () => onGoToTab(action.tabTarget!) : undefined}
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
  )
}

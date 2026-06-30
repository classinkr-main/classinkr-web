"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Link2,
  Mail,
  Minus,
  Send,
  Users,
} from "lucide-react"
import AdminTabs from "@/components/admin/AdminTabs"
import { adminFetchJsonCached } from "@/lib/admin-client"
import { useUrlState } from "@/lib/use-url-state"
import type { LeadRecord } from "@/lib/db"
import type { BlogPost } from "@/lib/blog-types"
import type { EmailCampaign, Subscriber } from "@/lib/marketing-types"
import type { PublicEvent } from "@/lib/types/public-events"
import {
  computeEconomics,
  DEFAULT_EVENT_METRICS,
  type EventFunnel,
  type EventMetrics,
} from "@/lib/types/event-metrics"

type AnalyticsTab =
  | "leads"
  | "sources"
  | "content"
  | "campaigns"
  | "events"
  | "flow"
  | "tracking"

// "홈페이지 흐름"(flow)·"추적 현황"(tracking)은 /admin/traffic와 중복이라 탭바에서 제외한다.
// activeTab은 이 배열로만 검증되므로(아래 488행) 두 탭은 도달 불가가 되고, Analytics는 비즈니스 분석에 집중한다.
// 해당 렌더 블록(1600행대~)은 후속 정리 대상이며, 공유 상태(visitorStats 등)는 상단 KPI에서 계속 쓰이므로 남겨둔다.
const ANALYTICS_TABS: Array<{ key: AnalyticsTab; label: string }> = [
  { key: "leads", label: "리드" },
  { key: "sources", label: "소스" },
  { key: "content", label: "콘텐츠" },
  { key: "campaigns", label: "이메일 캠페인" },
  { key: "events", label: "행사 퍼널" },
]

interface ClientEventCounts {
  rangeDays: number
  total: number
  byEvent: Array<{ event: string; count: number; lastSeen: string | null }>
  byButton: Array<{ button: string; event: string; count: number; lastSeen: string | null }>
  daily: Array<{ date: string; count: number }>
}

interface VisitorStatsDay {
  date: string
  visitors: number
  pageViews: number
  homeVisitors: number
  homePageViews: number
}

interface VisitorStats {
  rangeDays: number
  timezone: "Asia/Seoul"
  today: VisitorStatsDay
  totals: {
    visitors: number
    pageViews: number
    homeVisitors: number
    homePageViews: number
  }
  daily: VisitorStatsDay[]
}

interface MarketingConversionStatus {
  meta: {
    pixelId: string | null
    datasetId: string | null
    capiConfigured: boolean
    testEventCodeConfigured: boolean
  }
  google: {
    adsId: string
    demoConversionLabelConfigured: boolean
    ga4MeasurementId: string | null
    measurementProtocolConfigured: boolean
  }
  internal: {
    trackingEnabled: boolean
  }
}

interface HomepageFlowPageRow {
  path: string
  pageViews: number
  visitors: number
  avgDwellSeconds: number
  exits: number
  exitRate: number
}

interface HomepageFlow {
  rangeDays: number
  timezone: "Asia/Seoul"
  generatedAt: string
  totals: {
    visitors: number
    pageViews: number
    homeVisitors: number
    homePageViews: number
    downloads: number
    exits: number
    avgDwellSeconds: number
  }
  daily: Array<{
    date: string
    visitors: number
    pageViews: number
    downloads: number
    exits: number
  }>
  nextStepsFromHome: Array<{
    path: string
    label: string
    count: number
    share: number
  }>
  topPages: HomepageFlowPageRow[]
  highDwellPages: HomepageFlowPageRow[]
  exitPages: HomepageFlowPageRow[]
  downloads: Array<{
    asset: string
    source: string | null
    count: number
    lastSeen: string | null
  }>
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    return await adminFetchJsonCached<T>(url, undefined, { ttlMs: 60_000 })
  } catch {
    return null
  }
}

function safeDate(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateTime(value?: string) {
  const date = safeDate(value)
  if (!date) return "시간 정보 없음"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function shiftDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})
const KRW_NUMBER = new Intl.NumberFormat("ko-KR")
const won = (value: number) => KRW_CURRENCY.format(Math.round(value))

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "데이터 없음"
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes > 0 ? `${minutes}분 ${rest}초` : `${rest}초`
}

function formatPathLabel(path: string) {
  if (path === "/") return "홈"
  if (path === "__exit__") return "사이트 이탈"
  return path
}

function getDayWindow(range: number) {
  const today = startOfDay(new Date())
  const start = shiftDays(today, -(range - 1))
  const previousStart = shiftDays(start, -range)
  return { today, start, previousStart }
}

function getLastNDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const date = shiftDays(startOfDay(new Date()), -(n - 1 - i))
    return {
      key: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" })
        .format(date)
        .replace(". ", "/")
        .replace(".", ""),
    }
  })
}

function countInPeriod(values: string[], start: Date, endExclusive: Date) {
  return values.filter((value) => {
    const date = safeDate(value)
    return !!date && date >= start && date < endExclusive
  }).length
}

function getTrend(current: number, previous: number) {
  return current - previous
}

function trendTone(value: number) {
  if (value > 0) return "text-green-600 bg-green-50"
  if (value < 0) return "text-[#B85C33] bg-[#FEF3EE]"
  return "text-[#1a1a1a]/40 bg-[#f0f0ec]"
}

function TrendBadge({ value }: { value: number }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${trendTone(value)}`}>
      {value === 0 ? <Minus className="w-3 h-3" /> : value > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value)}
    </span>
  )
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  trend,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
  trend?: number
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="inline-flex rounded-xl bg-[#f0f0ec] p-2 text-[#1a1a1a]/50">{icon}</div>
        {typeof trend === "number" && <TrendBadge value={trend} />}
      </div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/40">{label}</p>
      <p className="text-[28px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">{hint}</p>}
    </div>
  )
}

function InsightCard({
  eyebrow,
  title,
  description,
  tone = "neutral",
}: {
  eyebrow: string
  title: string
  description: string
  tone?: "neutral" | "success" | "warning" | "danger" | "info"
}) {
  const toneClasses: Record<NonNullable<typeof tone>, string> = {
    neutral: "bg-[#fafaf8] border-[#e8e8e4]",
    success: "bg-green-50/70 border-green-100",
    warning: "bg-amber-50/70 border-amber-100",
    danger: "bg-[#FEF3EE]/70 border-[#F6D5C5]",
    info: "bg-[#ECFDF5]/70 border-[#D1FAE5]",
  }

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClasses[tone]}`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">{eyebrow}</p>
      <p className="mt-2 text-[14px] font-semibold tracking-[-0.01em] text-[#111110]">{title}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[#1a1a1a]/45">{description}</p>
    </div>
  )
}

function MetricRankList({
  rows,
  empty,
  getLabel,
  getValue,
  getMeta,
  getMagnitude,
}: {
  rows: HomepageFlowPageRow[]
  empty: string
  getLabel: (row: HomepageFlowPageRow) => string
  getValue: (row: HomepageFlowPageRow) => string
  getMeta: (row: HomepageFlowPageRow) => string
  getMagnitude: (row: HomepageFlowPageRow) => number
}) {
  const max = Math.max(
    1,
    ...rows.map((row) => getMagnitude(row))
  )

  if (rows.length === 0) {
    return <p className="py-8 text-[12px] text-[#1a1a1a]/45">{empty}</p>
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const value = getMagnitude(row)
        const width = Math.max(8, Math.round((value / max) * 100))
        return (
          <div key={`${row.path}-${getValue(row)}`} className="space-y-1.5">
            <div className="flex items-start justify-between gap-3 text-[12px]">
              <div className="min-w-0">
                <p className="truncate font-mono text-[#111110]">{getLabel(row)}</p>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{getMeta(row)}</p>
              </div>
              <span className="shrink-0 font-semibold text-[#111110]">{getValue(row)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0ec]">
              <div className="h-full rounded-full bg-[#084734]" style={{ width: `${width}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-5 py-12 text-center">
      <p className="text-[14px] font-medium text-[#111110]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-[#1a1a1a]/40">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function TableEmpty({ message }: { message: string }) {
  return <p className="py-8 text-center text-[12px] text-[#1a1a1a]/30">{message}</p>
}

const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  newsletter: "뉴스레터",
  meta_lead_ads: "Meta 리드",
  manual: "수동 등록",
}

const STATUS_LABEL: Record<string, string> = {
  new: "신규",
  contacted: "연락중",
  converted: "전환",
  closed: "종료",
}

const BLOG_STATUS_LABEL: Record<string, string> = {
  draft: "초안",
  published: "공개",
  archived: "보관",
}

const BLOG_STATUS_COLOR: Record<string, string> = {
  draft: "bg-amber-50 text-amber-700",
  published: "bg-green-50 text-green-700",
  archived: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}

const CAMPAIGN_STATUS_LABEL: Record<EmailCampaign["status"], string> = {
  draft: "초안",
  sent: "발송됨",
  failed: "실패",
}

const CAMPAIGN_STATUS_COLOR: Record<EmailCampaign["status"], string> = {
  draft: "bg-amber-50 text-amber-700",
  sent: "bg-[#ECFDF5] text-[#084734]",
  failed: "bg-[#FEF3EE] text-[#B85C33]",
}

const CHART_COLORS = ["#111110", "#084734", "#065c41", "#B85C33", "#84827a"]

function ChartSkeleton({ className = "h-[220px]" }: { className?: string }) {
  return <div className={`${className} rounded-xl bg-[#f0f0ec]`} />
}

const LeadTrendChart = dynamic(
  () => import("@/components/admin/analytics/AnalyticsCharts").then((m) => m.LeadTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)
const DistributionPieChart = dynamic(
  () => import("@/components/admin/analytics/AnalyticsCharts").then((m) => m.DistributionPieChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[180px] w-[180px]" /> }
)
const SourceLeadBarChart = dynamic(
  () => import("@/components/admin/analytics/AnalyticsCharts").then((m) => m.SourceLeadBarChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[260px]" /> }
)
const CategoryBarChart = dynamic(
  () => import("@/components/admin/analytics/AnalyticsCharts").then((m) => m.CategoryBarChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[240px]" /> }
)
const EventCompareChart = dynamic(
  () => import("@/components/admin/analytics/AnalyticsCharts").then((m) => m.EventCompareChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[300px]" /> }
)
const EventEconomicsChart = dynamic(
  () => import("@/components/admin/analytics/AnalyticsCharts").then((m) => m.EventEconomicsChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[300px]" /> }
)
const DailyEventCountsChart = dynamic(
  () => import("@/components/admin/analytics/AnalyticsCharts").then((m) => m.DailyEventCountsChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-56" /> }
)

export default function AnalyticsPage() {
  const [tabParam, setTabParam] = useUrlState("tab", "leads")
  const [range, setRange] = useState<7 | 14 | 30>(30)
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [publicEvents, setPublicEvents] = useState<PublicEvent[]>([])
  const [eventMetricsMap, setEventMetricsMap] = useState<Record<string, EventMetrics>>({})
  const [clientEventCounts, setClientEventCounts] = useState<ClientEventCounts | null>(null)
  const [visitorStats, setVisitorStats] = useState<VisitorStats | null>(null)
  const [marketingStatus, setMarketingStatus] = useState<MarketingConversionStatus | null>(null)
  const [homepageFlow, setHomepageFlow] = useState<HomepageFlow | null>(null)
  const activeTab: AnalyticsTab = ANALYTICS_TABS.some((tab) => tab.key === tabParam)
    ? (tabParam as AnalyticsTab)
    : "leads"

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)

      const [leadData, subscriberData, campaignData, blogData, eventData, metricsData] =
        await Promise.all([
          fetchJson<{ leads: LeadRecord[] }>("/api/admin/leads"),
          fetchJson<{ subscribers: Subscriber[] }>("/api/admin/subscribers"),
          fetchJson<{ campaigns: EmailCampaign[] }>("/api/admin/email"),
          fetchJson<{ posts: BlogPost[] }>("/api/admin/blog"),
          fetchJson<PublicEvent[]>("/api/admin/events"),
          fetchJson<{ metrics: Record<string, EventMetrics> }>("/api/admin/event-metrics"),
        ])

      if (cancelled) return

      setLeads(leadData?.leads ?? [])
      setSubscribers(subscriberData?.subscribers ?? [])
      setCampaigns(campaignData?.campaigns ?? [])
      setPosts(blogData?.posts ?? [])
      setPublicEvents(Array.isArray(eventData) ? eventData : [])
      setEventMetricsMap(metricsData?.metrics ?? {})
      setLoading(false)
    }

    load().finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      fetchJson<ClientEventCounts>(`/api/admin/event-counts?range=${range}`),
      fetchJson<VisitorStats>(`/api/admin/visitor-stats?range=${range}`),
      fetchJson<MarketingConversionStatus>("/api/admin/marketing/conversions/status"),
      fetchJson<HomepageFlow>(`/api/admin/homepage-flow?range=${range}`),
    ]).then(([eventCounts, stats, conversionStatus, flow]) => {
      if (cancelled) return
      setClientEventCounts(eventCounts ?? null)
      setVisitorStats(stats ?? null)
      setMarketingStatus(conversionStatus ?? null)
      setHomepageFlow(flow ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [range])

  const { today, start, previousStart } = getDayWindow(range)
  const nextDay = shiftDays(today, 1)

  const leadTimestamps = leads.map((lead) => lead.timestamp)
  const currentLeadCount = countInPeriod(leadTimestamps, start, nextDay)
  const previousLeadCount = countInPeriod(leadTimestamps, previousStart, start)
  const leadTrend = getTrend(currentLeadCount, previousLeadCount)

  const currentSubscriberCount = countInPeriod(
    subscribers.map((subscriber) => subscriber.createdAt),
    start,
    nextDay
  )
  const previousSubscriberCount = countInPeriod(
    subscribers.map((subscriber) => subscriber.createdAt),
    previousStart,
    start
  )
  const subscriberTrend = getTrend(currentSubscriberCount, previousSubscriberCount)

  const currentCampaignCount = countInPeriod(
    campaigns.map((campaign) => campaign.sentAt ?? campaign.createdAt),
    start,
    nextDay
  )
  const previousCampaignCount = countInPeriod(
    campaigns.map((campaign) => campaign.sentAt ?? campaign.createdAt),
    previousStart,
    start
  )
  const campaignTrend = getTrend(currentCampaignCount, previousCampaignCount)

  const publishedPosts = posts.filter((post) => post.status === "published" && !post.deletedAt)
  const draftPosts = posts.filter((post) => post.status === "draft" && !post.deletedAt)
  const featuredPosts = posts.filter((post) => post.featured && !post.deletedAt)
  const activeSubscribers = subscribers.filter((subscriber) => subscriber.status === "active")
  const convertedLeads = leads.filter((lead) => lead.status === "converted")
  const newLeads = leads.filter((lead) => lead.status === "new").length
  const conversionRate = leads.length > 0 ? Math.round((convertedLeads.length / leads.length) * 100) : 0

  const daySeries = getLastNDays(range)
  const leadsByDay = daySeries.map((day) => ({
    label: day.label,
    count: leads.filter((lead) => lead.timestamp.slice(0, 10) === day.key).length,
  }))

  const statusData = Object.entries(
    leads.reduce<Record<string, number>>((acc, lead) => {
      acc[lead.status] = (acc[lead.status] ?? 0) + 1
      return acc
    }, {})
  ).map(([status, value]) => ({
    name: STATUS_LABEL[status] ?? status,
    value,
  }))

  const sourceRows = Array.from(
    new Set([
      ...leads.map((lead) => lead.source),
      ...subscribers.map((subscriber) => subscriber.source),
    ])
  )
    .map((source) => {
      const sourceLeads = leads.filter((lead) => lead.source === source)
      const sourceSubscribers = subscribers.filter((subscriber) => subscriber.source === source)
      const sourceConverted = sourceLeads.filter((lead) => lead.status === "converted").length
      return {
        source,
        label: SOURCE_LABEL[source] ?? source,
        leadCount: sourceLeads.length,
        convertedCount: sourceConverted,
        conversionRate: sourceLeads.length > 0 ? Math.round((sourceConverted / sourceLeads.length) * 100) : 0,
        subscriberCount: sourceSubscribers.length,
      }
    })
    .sort((a, b) => b.leadCount - a.leadCount || b.subscriberCount - a.subscriberCount)

  const dominantSource = sourceRows[0]

  const contentRows = [...posts]
    .filter((post) => !post.deletedAt)
    .sort((a, b) => {
      const aDate = safeDate(a.updatedAt ?? a.publishedAt ?? a.date)?.getTime() ?? 0
      const bDate = safeDate(b.updatedAt ?? b.publishedAt ?? b.date)?.getTime() ?? 0
      return bDate - aDate
    })
    .slice(0, 6)

  const categoryData = Object.entries(
    publishedPosts.reduce<Record<string, number>>((acc, post) => {
      acc[post.category] = (acc[post.category] ?? 0) + 1
      return acc
    }, {})
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const sentCampaigns = campaigns.filter((campaign) => campaign.status === "sent")
  const failedCampaigns = campaigns.filter((campaign) => campaign.status === "failed")
  const draftCampaigns = campaigns.filter((campaign) => campaign.status === "draft")
  const recentCampaigns = [...campaigns]
    .sort((a, b) => {
      const aDate = safeDate(a.sentAt ?? a.createdAt)?.getTime() ?? 0
      const bDate = safeDate(b.sentAt ?? b.createdAt)?.getTime() ?? 0
      return bDate - aDate
    })
    .slice(0, 6)

  const campaignStatusData = [
    { name: "발송됨", value: sentCampaigns.length },
    { name: "초안", value: draftCampaigns.length },
    { name: "실패", value: failedCampaigns.length },
  ].filter((item) => item.value > 0)

  const tagCounts = campaigns.reduce<Record<string, number>>((acc, campaign) => {
    for (const tag of campaign.targetTags ?? []) {
      acc[tag] = (acc[tag] ?? 0) + 1
    }
    return acc
  }, {})
  const topTags = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const eventCountByName = new Map<string, number>()
  for (const e of clientEventCounts?.byEvent ?? []) {
    eventCountByName.set(e.event, e.count)
  }
  const fmtCount = (n: number | undefined) => (n && n > 0 ? `${n.toLocaleString()}회` : "0회")
  const liveTone = "bg-green-50 text-green-700 border-green-100"
  const idleTone = "bg-[#f0f0ec] text-[#1a1a1a]/55 border-[#e8e8e4]"
  const warningTone = "bg-amber-50 text-amber-700 border-amber-100"
  const pickTone = (count: number | undefined) => ((count ?? 0) > 0 ? liveTone : idleTone)

  const ctaCount = eventCountByName.get("click_cta")
  const demoCount = eventCountByName.get("submit_demo_request")
  const newsletterCount = eventCountByName.get("submit_newsletter")
  const downloadCount = eventCountByName.get("download_materials")
  const checkoutCount = eventCountByName.get("begin_checkout")
  const pageViewCount = eventCountByName.get("page_view")
  const videoCount = eventCountByName.get("view_demo_video")
  const visitorTodayIndex =
    visitorStats?.daily.findIndex((day) => day.date === visitorStats.today.date) ?? -1
  const visitorYesterday =
    visitorStats && visitorTodayIndex > 0 ? visitorStats.daily[visitorTodayIndex - 1] : null
  const homeVisitorTrend = visitorStats
    ? visitorStats.today.homeVisitors - (visitorYesterday?.homeVisitors ?? 0)
    : undefined
  const homeVisitorChartData =
    visitorStats?.daily.map((day) => ({
      date: day.date,
      count: day.homeVisitors,
    })) ?? []
  const flowDailyVisitorData =
    homepageFlow?.daily.map((day) => ({
      date: day.date,
      count: day.visitors,
    })) ?? []
  const flowDailyDownloadData =
    homepageFlow?.daily.map((day) => ({
      date: day.date,
      count: day.downloads,
    })) ?? []

  const trackingCards = [
    {
      title: "CTA 클릭",
      status: fmtCount(ctaCount),
      tone: pickTone(ctaCount),
      description: "Hero, /product/sw, /product/hw 주요 CTA에서 click_cta 이벤트가 button·page 파라미터와 함께 전송됩니다.",
      next: `최근 ${range}일 — Footer·블로그 CTA 확장은 후속 과제`,
      icon: <Link2 className="w-4 h-4" />,
    },
    {
      title: "데모 신청 전환",
      status: fmtCount(demoCount),
      tone: pickTone(demoCount),
      description: "데모 신청과 문의는 submit_demo_request 이벤트로 추적되고 있습니다.",
      next: "소스별 전환 분리만 추가하면 됩니다.",
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
    {
      title: "뉴스레터 구독",
      status: fmtCount(newsletterCount),
      tone: pickTone(newsletterCount),
      description: "NewsletterModal 제출 성공 시 submit_newsletter 이벤트가 source 파라미터와 함께 전송됩니다.",
      next: "구독 → 후속 행동(다운로드/방문) 퍼널 추적",
      icon: <Mail className="w-4 h-4" />,
    },
    {
      title: "자료 다운로드",
      status: fmtCount(downloadCount),
      tone: pickTone(downloadCount),
      description: "HW·SW 브로셔 버튼에서 download_materials 이벤트가 asset_id와 함께 전송됩니다.",
      next: "추가 자료(가격표·체크리스트 등) 발행 시 동일 이벤트 사용",
      icon: <Download className="w-4 h-4" />,
    },
    {
      title: "결제 시작",
      status: fmtCount(checkoutCount),
      tone: pickTone(checkoutCount),
      description: "/product/sw 결제 CTA는 NEXT_PUBLIC_SW_CHECKOUT_ENABLED=true일 때 begin_checkout, 아니면 click_cta로 전송합니다.",
      next: "begin_checkout과 purchase 모두 서버 전환 dedup 연결",
      icon: <Send className="w-4 h-4" />,
    },
    {
      title: "페이지 조회",
      status: fmtCount(pageViewCount),
      tone: pickTone(pageViewCount),
      description: "공개 페이지 공통 트래커가 page_view를 전송하고, admin에서 방문자·조회수 집계에 사용합니다.",
      next: `홈 방문자 최근 ${range}일 ${visitorStats?.totals.homeVisitors.toLocaleString() ?? 0}명`,
      icon: <BarChart2 className="w-4 h-4" />,
    },
    {
      title: "영상 조회",
      status: fmtCount(videoCount),
      tone: pickTone(videoCount),
      description: "Hero의 데모 영상 보기 버튼은 view_demo_video 이벤트를 전송합니다.",
      next: "CTA 클릭과 함께 캠페인/페이지 정보 파라미터 추가 필요",
      icon: <Send className="w-4 h-4" />,
    },
    {
      title: "Meta Pixel + CAPI",
      status: marketingStatus?.meta.capiConfigured
        ? "서버 연결"
        : marketingStatus?.meta.pixelId
          ? "브라우저만"
          : "미설정",
      tone: marketingStatus?.meta.capiConfigured
        ? liveTone
        : marketingStatus?.meta.pixelId
          ? warningTone
          : idleTone,
      description: "Lead, CompleteRegistration, Purchase를 브라우저 Pixel과 서버 CAPI에 같은 event_id로 전송합니다.",
      next: marketingStatus?.meta.testEventCodeConfigured
        ? "테스트 이벤트 코드 활성"
        : "META_DATASET_ID + META_CAPI_ACCESS_TOKEN 설정 권장",
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
    {
      title: "GA4 서버 전환",
      status: marketingStatus?.google.measurementProtocolConfigured
        ? "MP 연결"
        : marketingStatus?.google.ga4MeasurementId
          ? "Secret 필요"
          : "미설정",
      tone: marketingStatus?.google.measurementProtocolConfigured
        ? liveTone
        : marketingStatus?.google.ga4MeasurementId
          ? warningTone
          : idleTone,
      description: "generate_lead와 purchase를 GA4 권장 이벤트명으로 브라우저·서버 양쪽에 전송합니다.",
      next: "GA4_MEASUREMENT_ID + GA4_API_SECRET 설정 시 서버 전환 활성",
      icon: <BarChart2 className="w-4 h-4" />,
    },
    {
      title: "Google Ads 전환 라벨",
      status: marketingStatus?.google.demoConversionLabelConfigured ? "설정됨" : "라벨 필요",
      tone: marketingStatus?.google.demoConversionLabelConfigured ? liveTone : warningTone,
      description: "도입문의 제출은 Google Ads conversion 이벤트로도 발화됩니다.",
      next: `${marketingStatus?.google.adsId ?? "AW-18252550128"} 전환 액션 라벨 확인`,
      icon: <Send className="w-4 h-4" />,
    },
    {
      title: "페이지 체류 시간",
      status: "미연결",
      tone: "bg-[#FEF3EE] text-[#B85C33] border-[#F6D5C5]",
      description: "현재 관리자에서 직접 읽을 수 있는 체류 데이터 소스가 없습니다.",
      next: "time_on_page 수집 설계 필요",
      icon: <Clock3 className="w-4 h-4" />,
    },
  ]

  const leadInsight =
    leads.length === 0
      ? "아직 리드 데이터가 없어 CRM과 Analytics가 모두 가벼운 상태입니다."
      : dominantSource
        ? `${SOURCE_LABEL[dominantSource.source] ?? dominantSource.source} 경로가 현재 가장 큰 유입원이며, 전체 전환율은 ${conversionRate}%입니다.`
        : `최근 ${range}일 리드는 ${currentLeadCount}건이며 전환 리드는 ${convertedLeads.length}건입니다.`

  // ─── 행사 퍼널 데이터 (events tab) ────────────────────────────────────────
  const eventTabNowMs = today.getTime()
  const eventFunnelRows = publicEvents.map((event) => {
    const metrics = eventMetricsMap[event.id] ?? {
      ...DEFAULT_EVENT_METRICS,
      eventId: event.id,
      updatedAt: "",
    }
    const tokenId = `event:${event.id}`.toLowerCase()
    const tokenSlug = event.slug ? `event:${event.slug}`.toLowerCase() : null
    const attributedCount = leads.filter((l) => {
      const haystack = `${l.source ?? ""} ${l.notes ?? ""}`.toLowerCase()
      return haystack.includes(tokenId) || (tokenSlug ? haystack.includes(tokenSlug) : false)
    }).length
    const startMs = new Date(event.startsAt).getTime()
    const endMs = event.endsAt ? new Date(event.endsAt).getTime() : eventTabNowMs
    const duringCount = leads.filter((l) => {
      const t = new Date(l.timestamp).getTime()
      return t >= startMs && t <= endMs
    }).length
    const leadsCount = attributedCount > 0 ? attributedCount : duringCount
    const closedCustomers = metrics.closedCustomerCount ?? 0
    const funnel: EventFunnel = {
      impressions: metrics.impressionsCount ?? 0,
      leads: leadsCount,
      applications: metrics.applicationsCount ?? 0,
      qualifiedLeads: metrics.qualifiedLeadsCount ?? 0,
      attendees: metrics.attendeesCount ?? 0,
      deals: metrics.dealsCount ?? closedCustomers,
    }
    const economics = computeEconomics(funnel, metrics)
    return { event, metrics, funnel, economics, closedCustomers }
  })

  const eventTotals = eventFunnelRows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.funnel.impressions,
      leads: acc.leads + row.funnel.leads,
      applications: acc.applications + row.funnel.applications,
      qualifiedLeads: acc.qualifiedLeads + row.funnel.qualifiedLeads,
      attendees: acc.attendees + row.funnel.attendees,
      deals: acc.deals + row.funnel.deals,
      closedCustomers: acc.closedCustomers + row.closedCustomers,
      spend: acc.spend + row.economics.adSpendTotal,
      revenue: acc.revenue + row.economics.revenue,
    }),
    {
      impressions: 0,
      leads: 0,
      applications: 0,
      qualifiedLeads: 0,
      attendees: 0,
      deals: 0,
      closedCustomers: 0,
      spend: 0,
      revenue: 0,
    }
  )

  const overallEventCpl = eventTotals.leads > 0 ? Math.round(eventTotals.spend / eventTotals.leads) : null
  const overallEventCpd = eventTotals.deals > 0 ? Math.round(eventTotals.spend / eventTotals.deals) : null
  const overallEventRoi =
    eventTotals.spend > 0 ? Math.round(((eventTotals.revenue - eventTotals.spend) / eventTotals.spend) * 100) : null

  const eventCompareData = eventFunnelRows
    .map((row) => ({
      name: row.event.title.length > 12 ? row.event.title.slice(0, 11) + "…" : row.event.title,
      리드: row.funnel.leads,
      신청: row.funnel.applications,
      참석: row.funnel.attendees,
      딜: row.funnel.deals,
      "성사 고객": row.closedCustomers,
    }))
    .slice(0, 8)

  const eventEconomicsData = eventFunnelRows
    .filter((row) => row.economics.adSpendTotal > 0)
    .map((row) => ({
      name: row.event.title.length > 12 ? row.event.title.slice(0, 11) + "…" : row.event.title,
      "광고비(천원)": Math.round(row.economics.adSpendTotal / 1000),
      "매출(천원)": Math.round(row.economics.revenue / 1000),
      ROI: row.economics.roi ?? 0,
    }))
    .slice(0, 8)

  return (
    <div className="px-4 pt-8 pb-16 sm:px-6 sm:pt-10 sm:pb-20 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin</p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">Analytics</h1>
          <p className="mt-2 max-w-2xl text-[13px] text-[#1a1a1a]/45">
            리드, 콘텐츠, 캠페인, 추적 준비 상태를 한 화면에서 확인합니다. 숫자와 계측 준비 상태를 분리해서, 지금 바로 손댈 영역만 빠르게 고릅니다.
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-1 rounded-lg bg-[#f0f0ec] p-1 sm:w-auto sm:grid-cols-3">
          {([7, 14, 30] as const).map((value) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`rounded-md px-2.5 py-2 text-[12px] font-medium transition-colors whitespace-nowrap sm:px-3 sm:py-1.5 ${
                range === value ? "bg-white text-[#111110] shadow-sm" : "text-[#1a1a1a]/50"
              }`}
            >
              {value}일
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          icon={<BarChart2 className="w-4 h-4" />}
          label="오늘 홈 방문자"
          value={visitorStats ? visitorStats.today.homeVisitors : "..."}
          hint={
            visitorStats
              ? `${range}일 홈 ${visitorStats.totals.homeVisitors.toLocaleString()}명 · PV ${visitorStats.totals.homePageViews.toLocaleString()}`
              : "동의 기반 집계"
          }
          trend={homeVisitorTrend}
        />
        <SummaryCard
          icon={<Users className="w-4 h-4" />}
          label="최근 리드"
          value={loading ? "..." : currentLeadCount}
          hint={`${range}일 기준`}
          trend={loading ? undefined : leadTrend}
        />
        <SummaryCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="전환율"
          value={loading ? "..." : `${conversionRate}%`}
          hint={`전환 ${convertedLeads.length}건`}
        />
        <SummaryCard
          icon={<Mail className="w-4 h-4" />}
          label="활성 구독자"
          value={loading ? "..." : activeSubscribers.length}
          hint={`최근 ${range}일 +${currentSubscriberCount}`}
          trend={loading ? undefined : subscriberTrend}
        />
        <SummaryCard
          icon={<FileText className="w-4 h-4" />}
          label="공개 콘텐츠"
          value={loading ? "..." : publishedPosts.length}
          hint={`초안 ${draftPosts.length}건`}
        />
        <SummaryCard
          icon={<Send className="w-4 h-4" />}
          label="발송 캠페인"
          value={loading ? "..." : sentCampaigns.length}
          hint={`초안 ${draftCampaigns.length}건`}
          trend={loading ? undefined : campaignTrend}
        />
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">INSIGHT</p>
          <p className="mt-2 text-[14px] font-semibold text-[#111110]">
            {dominantSource?.label ?? "유입원 없음"}가 가장 강합니다.
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#1a1a1a]/45">
            리드 {dominantSource?.leadCount ?? 0}건 · 전환율 {dominantSource?.conversionRate ?? 0}%
          </p>
        </div>
        <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">ACTION</p>
          <p className="mt-2 text-[14px] font-semibold text-[#111110]">
            {newLeads > 0 ? "CRM 후속이 우선입니다." : "즉시 처리할 신규 리드는 없습니다."}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#1a1a1a]/45">
            {newLeads > 0 ? `${newLeads}건의 신규 리드가 CRM에서 대기 중입니다.` : "운영 알림과 일정만 확인하면 되는 안정 구간입니다."}
          </p>
        </div>
        <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">CONVERSION</p>
          <p className="mt-2 text-[14px] font-semibold text-[#111110]">{conversionRate}% 전환율</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#1a1a1a]/45">
            전환 리드 {convertedLeads.length}건 · 이번 기간 흐름을 바로 비교할 수 있습니다.
          </p>
        </div>
      </div>

      <AdminTabs
        className="mb-6"
        label="Analytics 보기"
        items={ANALYTICS_TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
        value={activeTab}
        onValueChange={setTabParam}
      />

      {activeTab === "leads" && (
        <div className="space-y-6">
          <Panel
            title="이번 기간 해석"
            description="숫자만 보지 않고 이번 기간의 흐름을 한 줄로 해석합니다."
            action={
              <a href="/admin/crm" className="flex items-center gap-1 text-[12px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]">
                CRM 열기
                <ChevronRight className="w-3 h-3" />
              </a>
            }
          >
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">SUMMARY</p>
                <p className="mt-2 text-[14px] font-semibold tracking-[-0.01em] text-[#111110]">{leadInsight}</p>
                <p className="mt-1.5 text-[12px] text-[#1a1a1a]/40">
                  지난 기간 대비 리드는 {leadTrend >= 0 ? "증가" : "감소"}했고, 현재 가장 큰 유입원은 {dominantSource?.label ?? "없음"}입니다.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <InsightCard
                  eyebrow="Top source"
                  title={dominantSource?.label ?? "유입원 없음"}
                  description={`리드 ${dominantSource?.leadCount ?? 0}건 · 전환율 ${dominantSource?.conversionRate ?? 0}%`}
                  tone={dominantSource ? "info" : "neutral"}
                />
                <InsightCard
                  eyebrow="Action needed"
                  title={newLeads > 0 ? "신규 리드 후속 필요" : "즉시 처리할 리드 없음"}
                  description={newLeads > 0 ? `CRM에 ${newLeads}건이 대기 중입니다.` : "지금은 운영 알림과 일정만 확인하면 됩니다."}
                  tone={newLeads > 0 ? "warning" : "neutral"}
                />
                <InsightCard
                  eyebrow="Conversion"
                  title={`${conversionRate}%`}
                  description={`전환 리드 ${convertedLeads.length}건`}
                  tone={conversionRate >= 20 ? "success" : conversionRate >= 10 ? "warning" : "neutral"}
                />
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Panel title="일별 리드 추이" description={`최근 ${range}일 기준 신규 리드 흐름입니다.`}>
              {loading ? (
                <div className="h-[220px] rounded-xl bg-[#f0f0ec]" />
              ) : leads.length === 0 ? (
                <EmptyState
                  title="아직 리드 데이터가 없습니다."
                  description="데모 신청이나 문의가 들어오면 이 그래프가 자동으로 채워집니다."
                  action={
                    <a
                      href="/admin/crm"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#111110] px-3 py-2 text-[12px] font-medium text-white"
                    >
                      CRM 열기
                      <ChevronRight className="w-3 h-3" />
                    </a>
                  }
                />
              ) : (
                <LeadTrendChart data={leadsByDay} range={range} />
              )}
            </Panel>

            <Panel
              title="상태 분포"
              description={`전체 리드 ${leads.length}건 기준`}
              action={<TrendBadge value={leadTrend} />}
            >
              {loading ? (
                <div className="h-[220px] rounded-xl bg-[#f0f0ec]" />
              ) : statusData.length === 0 ? (
                <TableEmpty message="상태 분포를 계산할 리드가 없습니다." />
              ) : (
                <div className="flex items-center gap-6">
                  <DistributionPieChart data={statusData} colors={CHART_COLORS} />
                  <ul className="flex-1 space-y-2">
                    {statusData.map((item, index) => (
                      <li key={item.name} className="flex items-center gap-2 text-[12px]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="text-[#1a1a1a]/60">{item.name}</span>
                        <span className="ml-auto font-semibold text-[#111110]">{item.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          </div>

          <Panel
            title="소스별 리드 품질"
            description="유입량과 전환율을 같이 봅니다."
            action={<span className="text-[12px] text-[#1a1a1a]/40">전환율이 높은 소스를 먼저 관리하세요</span>}
          >
            {loading ? (
              <div className="h-[220px] rounded-xl bg-[#f0f0ec]" />
            ) : sourceRows.length === 0 ? (
              <TableEmpty message="소스별 리드 품질을 계산할 데이터가 없습니다." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-[13px]">
                  <thead>
                    <tr className="border-b border-[#e8e8e4] bg-[#fafaf8]">
                      {["소스", "리드", "전환", "전환율", "구독자"].map((header) => (
                        <th key={header} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/40">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sourceRows.map((row) => (
                      <tr key={row.source} className="border-b border-[#e8e8e4] last:border-0">
                        <td className="px-4 py-3 font-medium text-[#111110]">{row.label}</td>
                        <td className="px-4 py-3">{row.leadCount}</td>
                        <td className="px-4 py-3">{row.convertedCount}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                            {row.conversionRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#1a1a1a]/55">{row.subscriberCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === "sources" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Panel
              title="소스별 리드 규모"
              description="어느 유입 경로가 가장 큰지 빠르게 확인합니다."
              action={<TrendBadge value={dominantSource?.leadCount ?? 0} />}
            >
              {loading ? (
                <div className="h-[260px] rounded-xl bg-[#f0f0ec]" />
              ) : sourceRows.length === 0 ? (
                <TableEmpty message="아직 유입 소스를 비교할 데이터가 없습니다." />
              ) : (
                <SourceLeadBarChart data={sourceRows} />
              )}
            </Panel>

            <Panel title="핵심 포인트" description="이번 기간에 가장 먼저 볼 만한 해석입니다.">
              <div className="space-y-3">
                <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4">
                  <p className="text-[12px] font-medium text-[#111110]">가장 큰 유입원</p>
                  <p className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-[#111110]">{dominantSource?.label ?? "없음"}</p>
                  <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
                    리드 {dominantSource?.leadCount ?? 0}건 · 전환율 {dominantSource?.conversionRate ?? 0}%
                  </p>
                </div>
                <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4">
                  <p className="text-[12px] font-medium text-[#111110]">구독자 전환</p>
                  <p className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-[#111110]">{activeSubscribers.length}명</p>
                  <p className="mt-1 text-[12px] text-[#1a1a1a]/40">현재 활성 구독자 기준입니다.</p>
                </div>
                <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4">
                  <p className="text-[12px] font-medium text-[#111110]">운영 메모</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                    소스별 유입량만이 아니라 전환율과 구독자 축적까지 같이 보는 것이 중요합니다.
                  </p>
                </div>
              </div>
            </Panel>
          </div>

          <Panel
            title="소스별 상세 비교"
            description="유입량, 전환, 구독자 축적을 표로 비교합니다."
            action={<span className="text-[12px] text-[#1a1a1a]/40">소스 품질은 전환율과 구독자 축적을 같이 봅니다</span>}
          >
            {sourceRows.length === 0 ? (
              <TableEmpty message="비교할 소스 데이터가 없습니다." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-[13px]">
                  <thead>
                    <tr className="border-b border-[#e8e8e4] bg-[#fafaf8]">
                      {["소스", "리드 수", "전환 리드", "전환율", "구독자 수", "운영 해석"].map((header) => (
                        <th key={header} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/40">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sourceRows.map((row) => (
                      <tr key={row.source} className="border-b border-[#e8e8e4] last:border-0">
                        <td className="px-4 py-3 font-medium text-[#111110]">{row.label}</td>
                        <td className="px-4 py-3">{row.leadCount}</td>
                        <td className="px-4 py-3">{row.convertedCount}</td>
                        <td className="px-4 py-3">{row.conversionRate}%</td>
                        <td className="px-4 py-3">{row.subscriberCount}</td>
                        <td className="px-4 py-3 text-[#1a1a1a]/45">
                          {row.leadCount === 0
                            ? "아직 데이터 없음"
                            : row.conversionRate >= 30
                              ? "전환 품질이 높은 편"
                              : row.conversionRate >= 10
                                ? "유입은 있으나 후속 관리 여지 있음"
                                : "유입 대비 전환이 낮아 후속 점검 필요"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === "content" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard icon={<FileText className="w-4 h-4" />} label="공개 글" value={publishedPosts.length} />
            <SummaryCard icon={<FileText className="w-4 h-4" />} label="초안" value={draftPosts.length} />
            <SummaryCard icon={<CheckCircle2 className="w-4 h-4" />} label="추천 글" value={featuredPosts.length} />
            <SummaryCard icon={<Link2 className="w-4 h-4" />} label="CTA 포함 글" value={posts.filter((post) => post.cta?.buttonHref).length} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1.2fr]">
            <Panel
              title="카테고리 분포"
              description="공개된 콘텐츠가 어떤 주제에 몰려 있는지 봅니다."
              action={<span className="text-[12px] text-[#1a1a1a]/40">상위 카테고리부터 구조를 점검하세요</span>}
            >
              {loading ? (
                <div className="h-[240px] rounded-xl bg-[#f0f0ec]" />
              ) : categoryData.length === 0 ? (
                <TableEmpty message="분석할 공개 콘텐츠가 없습니다." />
              ) : (
                <CategoryBarChart data={categoryData} />
              )}
            </Panel>

            <Panel
              title="최근 업데이트 콘텐츠"
              description="최근 수정하거나 발행한 글을 우선적으로 확인합니다."
              action={
                <a href="/admin/blog" className="flex items-center gap-1 text-[12px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]">
                  콘텐츠 열기
                  <ChevronRight className="w-3 h-3" />
                </a>
              }
            >
              {contentRows.length === 0 ? (
                <EmptyState
                  title="콘텐츠가 아직 없습니다."
                  description="첫 글을 작성하면 상태와 CTA 구성이 여기서 함께 보입니다."
                  action={
                    <a
                      href="/admin/blog"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#111110] px-3 py-2 text-[12px] font-medium text-white"
                    >
                      콘텐츠 관리
                      <ChevronRight className="w-3 h-3" />
                    </a>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {contentRows.map((post) => (
                    <a
                      key={post.id}
                      href="/admin/blog"
                      className="flex items-start gap-3 rounded-xl border border-[#e8e8e4] px-4 py-3 transition-all hover:border-[#c8c8c4] hover:bg-[#fafaf8]"
                    >
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[#f0f0ec] text-[#1a1a1a]/50">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-semibold text-[#111110]">{post.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${BLOG_STATUS_COLOR[post.status] ?? "bg-[#f0f0ec] text-[#1a1a1a]/50"}`}>
                            {BLOG_STATUS_LABEL[post.status] ?? post.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
                          {post.category} · CTA {post.cta?.buttonLabel || "미설정"} · {formatDateTime(post.updatedAt ?? post.publishedAt ?? post.date)}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel title="콘텐츠 전환 준비 상태" description="실제 CTA 성과 계측 전, 운영자가 먼저 확인해야 할 준비 항목입니다.">
            <div className="grid gap-4 md:grid-cols-3">
              <InsightCard
                eyebrow="CTA 목적지"
                title="글별 연결 점검"
                description="블로그 글의 CTA가 `#demo` 또는 `/contact`에 집중되어 있는지 확인하세요."
                tone="info"
              />
              <InsightCard
                eyebrow="다운로드"
                title="자료별 식별자 확인"
                description="자료실·블로그 다운로드는 download_materials에 lead_magnet과 gate가 함께 기록됩니다."
                tone="info"
              />
              <InsightCard
                eyebrow="콘텐츠 기여"
                title="content_id 파라미터 권장"
                description="글 단위 전환 기여를 보려면 CTA 클릭 이벤트에 content_id를 함께 보내는 것이 좋습니다."
                tone="neutral"
              />
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "campaigns" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard icon={<Send className="w-4 h-4" />} label="총 캠페인" value={campaigns.length} />
            <SummaryCard icon={<CheckCircle2 className="w-4 h-4" />} label="발송됨" value={sentCampaigns.length} />
            <SummaryCard icon={<AlertCircle className="w-4 h-4" />} label="실패" value={failedCampaigns.length} />
            <SummaryCard icon={<Mail className="w-4 h-4" />} label="초안" value={draftCampaigns.length} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
            <Panel
              title="캠페인 상태 분포"
              description="최근 운영 상태를 한 번에 봅니다."
              action={<span className="text-[12px] text-[#1a1a1a]/40">초안이 많으면 발송 리듬을 점검하세요</span>}
            >
              {campaignStatusData.length === 0 ? (
                <EmptyState
                  title="캠페인이 아직 없습니다."
                  description="발송, 초안, 실패 상태가 생기면 여기에서 분포를 확인할 수 있습니다."
                  action={
                    <a
                      href="/admin/campaigns"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#111110] px-3 py-2 text-[12px] font-medium text-white"
                    >
                      캠페인 열기
                      <ChevronRight className="w-3 h-3" />
                    </a>
                  }
                />
              ) : (
                <div className="flex items-center gap-6">
                  <DistributionPieChart data={campaignStatusData} colors={CHART_COLORS} />
                  <ul className="flex-1 space-y-2">
                    {campaignStatusData.map((item, index) => (
                      <li key={item.name} className="flex items-center gap-2 text-[12px]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="text-[#1a1a1a]/60">{item.name}</span>
                        <span className="ml-auto font-semibold text-[#111110]">{item.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>

            <Panel
              title="최근 캠페인"
              description="최근 생성하거나 발송한 캠페인을 우선 확인합니다."
              action={
                <a href="/admin/campaigns" className="flex items-center gap-1 text-[12px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]">
                  캠페인 열기
                  <ChevronRight className="w-3 h-3" />
                </a>
              }
            >
              {recentCampaigns.length === 0 ? (
                <TableEmpty message="표시할 캠페인이 없습니다." />
              ) : (
                <div className="space-y-3">
                  {recentCampaigns.map((campaign) => (
                    <a
                      key={campaign.id}
                      href="/admin/campaigns"
                      className="flex items-start gap-3 rounded-xl border border-[#e8e8e4] px-4 py-3 transition-all hover:border-[#c8c8c4] hover:bg-[#fafaf8]"
                    >
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[#f0f0ec] text-[#1a1a1a]/50">
                        <Send className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-semibold text-[#111110]">{campaign.subject}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CAMPAIGN_STATUS_COLOR[campaign.status]}`}>
                            {CAMPAIGN_STATUS_LABEL[campaign.status]}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
                          대상 {campaign.recipientCount}명 · {formatDateTime(campaign.sentAt ?? campaign.createdAt)}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel
            title="자주 쓰는 세그먼트"
            description="캠페인에서 반복적으로 사용하는 태그를 보여줍니다."
            action={<a href="/admin/campaigns" className="text-[12px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]">구독자 보기</a>}
          >
            {topTags.length === 0 ? (
              <TableEmpty message="아직 태그 기반 캠페인 기록이 없습니다." />
            ) : (
              <div className="flex flex-wrap gap-2">
                {topTags.map((tag) => (
                  <div key={tag.tag} className="inline-flex items-center gap-2 rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2 text-[12px]">
                    <span className="font-medium text-[#111110]">#{tag.tag}</span>
                    <span className="text-[#1a1a1a]/40">{tag.count}회</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === "events" && (
        <div className="space-y-6">
          {/* KPI 4종 */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard
              icon={<Send className="w-4 h-4" />}
              label="총 행사"
              value={publicEvents.length}
              hint={`총 광고비 ${won(eventTotals.spend)}`}
            />
            <SummaryCard
              icon={<Users className="w-4 h-4" />}
              label="누적 리드 → 딜"
              value={`${eventTotals.leads} → ${eventTotals.deals}`}
              hint={`참석 ${eventTotals.attendees}명 · 성사 고객 ${eventTotals.closedCustomers}곳`}
            />
            <SummaryCard
              icon={<BarChart2 className="w-4 h-4" />}
              label="평균 CPL · CPD"
              value={
                overallEventCpl != null
                  ? won(overallEventCpl)
                  : "—"
              }
              hint={
                overallEventCpd != null
                  ? `CPD ${won(overallEventCpd)}`
                  : "딜 데이터 부족"
              }
            />
            <SummaryCard
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="누적 ROI"
              value={overallEventRoi != null ? `${overallEventRoi}%` : "—"}
              hint={`매출 ${won(eventTotals.revenue)}`}
            />
          </div>

          <Panel
            title="행사별 퍼널 비교"
            description="리드 → 신청 → 참석 → 딜의 단계별 절대 수치를 행사별로 비교합니다."
            action={
              <a
                href="/admin/campaigns"
                className="flex items-center gap-1 text-[12px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]"
              >
                캠페인 대시보드 열기
                <ChevronRight className="w-3 h-3" />
              </a>
            }
          >
            {eventCompareData.length === 0 ? (
              <EmptyState
                title="아직 등록된 행사가 없습니다."
                description="행사 캠페인 대시보드에서 행사를 만들고 퍼널 메트릭을 입력하면 비교 차트가 채워집니다."
                action={
                  <a
                    href="/admin/events"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#111110] px-3 py-2 text-[12px] font-medium text-white"
                  >
                    행사 관리 열기
                    <ChevronRight className="w-3 h-3" />
                  </a>
                }
              />
            ) : (
              <div className="h-[300px] w-full">
                <EventCompareChart data={eventCompareData} />
              </div>
            )}
          </Panel>

          <Panel
            title="광고비 vs 매출 (행사별, 단위: 천원)"
            description="투자 대비 회수율을 한눈에 봅니다. ROI는 우측 라인입니다."
          >
            {eventEconomicsData.length === 0 ? (
              <TableEmpty message="광고비 입력이 있는 행사가 없습니다." />
            ) : (
              <div className="h-[300px] w-full">
                <EventEconomicsChart data={eventEconomicsData} />
              </div>
            )}
          </Panel>

          <Panel
            title="행사별 효율 표"
            description="리드, 유효 전환, 참석률, 딜 전환, CPL, CPD, ROI를 한 줄에 모았습니다."
            action={
              <a
                href="/admin/campaigns"
                className="flex items-center gap-1 text-[12px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]"
              >
                상세 입력으로
                <ChevronRight className="w-3 h-3" />
              </a>
            }
          >
            {eventFunnelRows.length === 0 ? (
              <TableEmpty message="등록된 행사가 없습니다." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-[12px]">
                  <thead className="bg-[#fafaf8] text-left text-[#1a1a1a]/45">
                    <tr>
                      <th className="px-3 py-2 font-medium">행사</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                      <th className="px-3 py-2 font-medium text-right">리드</th>
                      <th className="px-3 py-2 font-medium text-right">성사 고객</th>
                      <th className="px-3 py-2 font-medium text-right">유효 전환</th>
                      <th className="px-3 py-2 font-medium text-right">참석률</th>
                      <th className="px-3 py-2 font-medium text-right">딜 전환</th>
                      <th className="px-3 py-2 font-medium text-right">광고비</th>
                      <th className="px-3 py-2 font-medium text-right">CPL</th>
                      <th className="px-3 py-2 font-medium text-right">ROI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f0ec]">
                    {eventFunnelRows.map((row) => (
                      <tr key={row.event.id} className="hover:bg-[#fafaf8]">
                        <td className="px-3 py-2.5">
                          <p className="truncate font-medium text-[#111110]">{row.event.title}</p>
                          <p className="text-[10px] text-[#1a1a1a]/35">{row.event.category}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55">
                            {row.event.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[#111110]">{row.funnel.leads}</td>
                        <td className="px-3 py-2.5 text-right text-[#1a1a1a]/60">
                          {row.closedCustomers > 0 ? `${KRW_NUMBER.format(row.closedCustomers)}곳` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#1a1a1a]/60">
                          {row.economics.leadConversionRate != null ? `${row.economics.leadConversionRate}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#1a1a1a]/60">
                          {row.economics.attendanceRate != null ? `${row.economics.attendanceRate}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#1a1a1a]/60">
                          {row.economics.dealConversionRate != null ? `${row.economics.dealConversionRate}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#1a1a1a]/60">
                          {row.economics.adSpendTotal > 0
                            ? won(row.economics.adSpendTotal)
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#1a1a1a]/60">
                          {row.economics.cpl != null
                            ? won(row.economics.cpl)
                            : "—"}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right font-semibold ${
                            row.economics.roi == null
                              ? "text-[#1a1a1a]/30"
                              : row.economics.roi >= 0
                                ? "text-[#084734]"
                                : "text-[#B85C33]"
                          }`}
                        >
                          {row.economics.roi != null ? `${row.economics.roi}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === "flow" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={<Users className="w-4 h-4" />}
              label="홈 방문자"
              value={homepageFlow ? homepageFlow.totals.homeVisitors.toLocaleString() : "..."}
              hint={`최근 ${range}일 · 홈 PV ${homepageFlow?.totals.homePageViews.toLocaleString() ?? 0}`}
            />
            <SummaryCard
              icon={<BarChart2 className="w-4 h-4" />}
              label="전체 페이지뷰"
              value={homepageFlow ? homepageFlow.totals.pageViews.toLocaleString() : "..."}
              hint={`방문자 ${homepageFlow?.totals.visitors.toLocaleString() ?? 0}명`}
            />
            <SummaryCard
              icon={<Download className="w-4 h-4" />}
              label="자료 다운로드"
              value={homepageFlow ? homepageFlow.totals.downloads.toLocaleString() : "..."}
              hint="download_materials 이벤트 기준"
            />
            <SummaryCard
              icon={<Clock3 className="w-4 h-4" />}
              label="평균 체류"
              value={homepageFlow ? formatDuration(homepageFlow.totals.avgDwellSeconds) : "..."}
              hint="page_exit 샘플 기준"
            />
          </div>

          <Panel
            title="홈페이지 방문 흐름"
            description={`최근 ${range}일 · 홈에서 다음으로 이동한 경로 또는 사이트 이탈 후보입니다.`}
            action={
              <span className="text-[12px] text-[#1a1a1a]/40">
                {homepageFlow?.timezone ?? "Asia/Seoul"}
              </span>
            }
          >
            {homepageFlow ? (
              <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
                <div>
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/40">
                    홈에서 다음 행동
                  </p>
                  <div className="space-y-3">
                    {homepageFlow.nextStepsFromHome.map((step) => (
                      <div key={step.path} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <ChevronRight className="h-4 w-4 shrink-0 text-[#084734]" />
                            <span className="truncate font-mono text-[12px] text-[#111110]">
                              {formatPathLabel(step.label)}
                            </span>
                          </div>
                          <span className="text-[12px] font-semibold text-[#111110]">
                            {step.count.toLocaleString()}회 · {step.share}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white">
                          <div className="h-full rounded-full bg-[#084734]" style={{ width: `${Math.max(6, step.share)}%` }} />
                        </div>
                      </div>
                    ))}
                    {homepageFlow.nextStepsFromHome.length === 0 && (
                      <p className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-4 py-8 text-center text-[12px] text-[#1a1a1a]/45">
                        아직 홈 방문 흐름을 만들 만큼 연속 page_view 데이터가 없습니다.
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <InsightCard
                    eyebrow="Home"
                    title={`${homepageFlow.totals.homeVisitors.toLocaleString()}명`}
                    description={`홈 조회 ${homepageFlow.totals.homePageViews.toLocaleString()}회`}
                    tone="info"
                  />
                  <InsightCard
                    eyebrow="Exit"
                    title={`${homepageFlow.totals.exits.toLocaleString()}회`}
                    description="pagehide로 잡힌 사이트 이탈 후보입니다. SPA 내부 이동은 제외합니다."
                    tone={homepageFlow.totals.exits > 0 ? "warning" : "neutral"}
                  />
                  <InsightCard
                    eyebrow="Dwell"
                    title={formatDuration(homepageFlow.totals.avgDwellSeconds)}
                    description="분석 동의 후 route change/pagehide 시점에 기록된 체류 샘플 평균입니다."
                    tone="neutral"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-[#1a1a1a]/45">
                홈페이지 흐름 데이터를 불러오지 못했습니다. `client_events` 적재와 Supabase 연결을 확인하세요.
              </p>
            )}
          </Panel>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              title="일별 방문자"
              description="전체 공개 페이지 방문자 추이입니다."
            >
              {flowDailyVisitorData.length > 0 ? (
                <div className="h-56 w-full">
                  <DailyEventCountsChart data={flowDailyVisitorData} />
                </div>
              ) : (
                <TableEmpty message="방문자 데이터가 없습니다." />
              )}
            </Panel>
            <Panel
              title="일별 다운로드"
              description="브로셔와 리드마그넷 다운로드 추이입니다."
            >
              {flowDailyDownloadData.length > 0 ? (
                <div className="h-56 w-full">
                  <DailyEventCountsChart data={flowDailyDownloadData} />
                </div>
              ) : (
                <TableEmpty message="다운로드 데이터가 없습니다." />
              )}
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              title="방문 많은 페이지"
              description="page_view 기준 상위 페이지입니다."
            >
              <MetricRankList
                rows={homepageFlow?.topPages ?? []}
                empty="페이지뷰 데이터가 없습니다."
                getLabel={(row) => formatPathLabel(row.path)}
                getValue={(row) => `${row.pageViews.toLocaleString()}회`}
                getMeta={(row) => `방문자 ${row.visitors.toLocaleString()}명 · 평균 체류 ${formatDuration(row.avgDwellSeconds)}`}
                getMagnitude={(row) => row.pageViews}
              />
            </Panel>
            <Panel
              title="체류 많은 페이지"
              description="page_exit duration_ms 평균 기준입니다."
            >
              <MetricRankList
                rows={homepageFlow?.highDwellPages ?? []}
                empty="체류시간 샘플이 아직 없습니다."
                getLabel={(row) => formatPathLabel(row.path)}
                getValue={(row) => formatDuration(row.avgDwellSeconds)}
                getMeta={(row) => `PV ${row.pageViews.toLocaleString()}회 · 이탈 후보 ${row.exits.toLocaleString()}회`}
                getMagnitude={(row) => row.avgDwellSeconds}
              />
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              title="나가는 곳 많은 페이지"
              description="pagehide 기반 사이트 이탈 후보입니다. 내부 라우팅 이동은 제외합니다."
            >
              <MetricRankList
                rows={homepageFlow?.exitPages ?? []}
                empty="이탈 후보 데이터가 아직 없습니다."
                getLabel={(row) => formatPathLabel(row.path)}
                getValue={(row) => `${row.exits.toLocaleString()}회`}
                getMeta={(row) => `이탈률 ${row.exitRate}% · PV ${row.pageViews.toLocaleString()}회`}
                getMagnitude={(row) => row.exits}
              />
            </Panel>
            <Panel
              title="자료 다운로드"
              description="asset_id 또는 lead_magnet 기준 상위 다운로드입니다."
            >
              <div className="space-y-3">
                {(homepageFlow?.downloads ?? []).map((row) => (
                  <div key={row.asset} className="flex items-center justify-between gap-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[12px] font-semibold text-[#111110]">{row.asset}</p>
                      <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
                        {row.source ?? "source 없음"} · 마지막 {formatDateTime(row.lastSeen ?? undefined)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-green-100 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700">
                      {row.count.toLocaleString()}회
                    </span>
                  </div>
                ))}
                {(homepageFlow?.downloads ?? []).length === 0 && (
                  <TableEmpty message="다운로드 데이터가 없습니다." />
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "tracking" && (
        <div className="space-y-6">
          <Panel
            title="홈페이지 일별 방문자"
            description={`최근 ${range}일 · 분석 쿠키에 동의한 방문자의 자체 DB 집계입니다. 날짜 기준은 ${visitorStats?.timezone ?? "Asia/Seoul"}입니다.`}
            action={
              <span className="text-[12px] text-[#1a1a1a]/40">
                오늘 {visitorStats?.today.homeVisitors.toLocaleString() ?? 0}명
              </span>
            }
          >
            {visitorStats ? (
              <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
                <div className="h-56 w-full">
                  <DailyEventCountsChart data={homeVisitorChartData} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <InsightCard
                    eyebrow="Today"
                    title={`${visitorStats.today.homeVisitors.toLocaleString()}명`}
                    description={`홈 페이지뷰 ${visitorStats.today.homePageViews.toLocaleString()}회`}
                    tone={visitorStats.today.homeVisitors > 0 ? "info" : "neutral"}
                  />
                  <InsightCard
                    eyebrow="Range"
                    title={`${visitorStats.totals.homeVisitors.toLocaleString()}명`}
                    description={`최근 ${range}일 홈 방문자 · 조회 ${visitorStats.totals.homePageViews.toLocaleString()}회`}
                    tone="info"
                  />
                  <InsightCard
                    eyebrow="All pages"
                    title={`${visitorStats.totals.visitors.toLocaleString()}명`}
                    description={`전체 공개 페이지 조회 ${visitorStats.totals.pageViews.toLocaleString()}회`}
                    tone="neutral"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-[#1a1a1a]/45">
                방문자 집계를 불러오지 못했습니다. Supabase 연결과 `client_events` 적재 상태를 확인하세요.
              </p>
            )}
          </Panel>

          <Panel
            title="실시간 이벤트 카운트"
            description={`최근 ${range}일 동안 자체 DB에 적재된 클라이언트 이벤트 수입니다. GA·Meta 외 별도로 어드민에서 직접 확인합니다.`}
            action={<span className="text-[12px] text-[#1a1a1a]/40">총 {(clientEventCounts?.total ?? 0).toLocaleString()}건</span>}
          >
            {clientEventCounts && clientEventCounts.daily.length > 0 ? (
              <div className="h-56 w-full">
                <DailyEventCountsChart data={clientEventCounts.daily} />
              </div>
            ) : (
              <p className="text-[13px] text-[#1a1a1a]/45">
                아직 적재된 이벤트가 없습니다. 마이그레이션 적용 + NEXT_PUBLIC_INTERNAL_TRACKING_ENABLED 활성 후 공개 사이트에서 CTA를 클릭해 보세요.
              </p>
            )}
          </Panel>

          <Panel
            title="이벤트별 / Top CTA 버튼"
            description="이벤트 타입별 카운트와, 가장 많이 눌린 button 파라미터 상위 항목입니다."
          >
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/40">이벤트별</p>
                <div className="space-y-2">
                  {(clientEventCounts?.byEvent ?? []).map((row) => (
                    <div key={row.event} className="flex items-center justify-between rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-[13px]">
                      <span className="font-mono text-[12px] text-[#111110]">{row.event}</span>
                      <span className="font-semibold text-[#111110]">{row.count.toLocaleString()}회</span>
                    </div>
                  ))}
                  {(clientEventCounts?.byEvent ?? []).length === 0 && (
                    <p className="text-[12px] text-[#1a1a1a]/45">데이터 없음</p>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/40">Top CTA 버튼 (button 파라미터 기준)</p>
                <div className="space-y-2">
                  {(clientEventCounts?.byButton ?? []).slice(0, 10).map((row) => (
                    <div key={`${row.event}::${row.button}`} className="flex items-center justify-between rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-[13px]">
                      <div className="flex flex-col">
                        <span className="font-mono text-[12px] text-[#111110]">{row.button}</span>
                        <span className="text-[10px] text-[#1a1a1a]/45">{row.event}</span>
                      </div>
                      <span className="font-semibold text-[#111110]">{row.count.toLocaleString()}회</span>
                    </div>
                  ))}
                  {(clientEventCounts?.byButton ?? []).length === 0 && (
                    <p className="text-[12px] text-[#1a1a1a]/45">데이터 없음</p>
                  )}
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="추적 준비 상태"
            description="현재 코드 기준으로 어느 이벤트가 연결되어 있고, 최근 기간 카운트는 얼마인지 봅니다."
            action={<span className="text-[12px] text-[#1a1a1a]/40">최근 {range}일 기준</span>}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {trackingCards.map((card) => (
                <div key={card.title} className="rounded-2xl border border-[#e8e8e4] bg-white p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="inline-flex rounded-xl bg-[#f0f0ec] p-2 text-[#1a1a1a]/55">{card.icon}</div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${card.tone}`}>{card.status}</span>
                  </div>
                  <p className="text-[14px] font-semibold text-[#111110]">{card.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">{card.description}</p>
                  <p className="mt-3 text-[12px] font-medium text-[#111110]">{card.next}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="추천 다음 작업"
            description="운영 효율과 분석 품질을 동시에 높이는 순서입니다."
            action={<a href="/admin/settings" className="text-[12px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]">설정 열기</a>}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                <p className="text-[12px] font-medium text-[#111110]">1. CTA 클릭 확장</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                  Hero, Footer, 블로그 CTA까지 click_cta를 공통 유틸로 묶으면 유입 분석이 바로 살아납니다.
                </p>
              </div>
              <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                <p className="text-[12px] font-medium text-[#111110]">2. 다운로드 식별자 정리</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                  자료실·블로그는 lead_magnet, 브로셔 파일 CTA는 asset_id를 유지하면 콘텐츠 기여 분석이 쉬워집니다.
                </p>
              </div>
              <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                <p className="text-[12px] font-medium text-[#111110]">3. 체류시간</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                  조회수와 방문자 수는 연결됐으므로, 다음 단계는 체류 시간과 이탈 페이지 리포트입니다.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}

"use client"

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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { adminFetchJsonCached } from "@/lib/admin-client"
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

type AnalyticsTab = "leads" | "sources" | "content" | "campaigns" | "events" | "tracking"

interface ClientEventCounts {
  rangeDays: number
  total: number
  byEvent: Array<{ event: string; count: number; lastSeen: string | null }>
  byButton: Array<{ button: string; event: string; count: number; lastSeen: string | null }>
  daily: Array<{ date: string; count: number }>
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

function ChartTooltip({
  active,
  payload,
  label,
  suffix = "건",
}: {
  active?: boolean
  payload?: Array<{ value?: number }>
  label?: string
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-[#111110] px-3 py-2 text-[12px] text-white shadow-xl">
      <p className="mb-0.5 text-white/50">{label}</p>
      <p className="font-bold">
        {payload[0]?.value ?? 0}
        {suffix}
      </p>
    </div>
  )
}

const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  newsletter: "뉴스레터",
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

const CHART_COLORS = ["#111110", "#084734", "#065c41", "#f59e0b", "#B85C33"]

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("leads")
  const [range, setRange] = useState<7 | 14 | 30>(30)
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [publicEvents, setPublicEvents] = useState<PublicEvent[]>([])
  const [eventMetricsMap, setEventMetricsMap] = useState<Record<string, EventMetrics>>({})
  const [clientEventCounts, setClientEventCounts] = useState<ClientEventCounts | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)

      const [leadData, subscriberData, campaignData, blogData, eventData, metricsData, clientEventsData] =
        await Promise.all([
          fetchJson<{ leads: LeadRecord[] }>("/api/admin/leads"),
          fetchJson<{ subscribers: Subscriber[] }>("/api/admin/subscribers"),
          fetchJson<{ campaigns: EmailCampaign[] }>("/api/admin/email"),
          fetchJson<{ posts: BlogPost[] }>("/api/admin/blog"),
          fetchJson<PublicEvent[]>("/api/admin/events"),
          fetchJson<{ metrics: Record<string, EventMetrics> }>("/api/admin/event-metrics"),
          fetchJson<ClientEventCounts>(`/api/admin/event-counts?range=${range}`),
        ])

      if (cancelled) return

      setLeads(leadData?.leads ?? [])
      setSubscribers(subscriberData?.subscribers ?? [])
      setCampaigns(campaignData?.campaigns ?? [])
      setPosts(blogData?.posts ?? [])
      setPublicEvents(Array.isArray(eventData) ? eventData : [])
      setEventMetricsMap(metricsData?.metrics ?? {})
      setClientEventCounts(clientEventsData ?? null)
      setLoading(false)
    }

    load().finally(() => {
      if (!cancelled) setLoading(false)
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
  const pickTone = (count: number | undefined) => ((count ?? 0) > 0 ? liveTone : idleTone)

  const ctaCount = eventCountByName.get("click_cta")
  const demoCount = eventCountByName.get("submit_demo_request")
  const newsletterCount = eventCountByName.get("submit_newsletter")
  const downloadCount = eventCountByName.get("download_materials")
  const checkoutCount = eventCountByName.get("begin_checkout")
  const pageViewCount = eventCountByName.get("page_view")
  const videoCount = eventCountByName.get("view_demo_video")

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
      next: "결제 페이지 활성화 후 begin_checkout → purchase 퍼널 완성",
      icon: <Send className="w-4 h-4" />,
    },
    {
      title: "페이지 조회",
      status: fmtCount(pageViewCount),
      tone: pickTone(pageViewCount),
      description: "page_view 이벤트 타입은 정의되어 있지만 사용처 연결은 아직 없습니다.",
      next: "공개 페이지 공통 레이아웃에서 page_view 수집 권장",
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
      title: "페이지 체류 시간",
      status: "미연결",
      tone: "bg-[#FEF3EE] text-[#B85C33] border-[#F6D5C5]",
      description: "현재 관리자에서 직접 읽을 수 있는 체류 데이터 소스가 없습니다.",
      next: "page_view와 time_on_page 수집 설계 필요",
      icon: <Clock3 className="w-4 h-4" />,
    },
  ]

  const leadInsight =
    leads.length === 0
      ? "아직 리드 데이터가 없어 CRM과 Analytics가 모두 가벼운 상태입니다."
      : dominantSource
        ? `${SOURCE_LABEL[dominantSource.source] ?? dominantSource.source} 경로가 현재 가장 큰 유입원이며, 전체 전환율은 ${conversionRate}%입니다.`
        : `최근 ${range}일 리드는 ${currentLeadCount}건이며 전환 리드는 ${convertedLeads.length}건입니다.`

  const tabButtons: Array<{ key: AnalyticsTab; label: string }> = [
    { key: "leads", label: "리드" },
    { key: "sources", label: "소스" },
    { key: "content", label: "콘텐츠" },
    { key: "campaigns", label: "이메일 캠페인" },
    { key: "events", label: "행사 funnel" },
    { key: "tracking", label: "추적 현황" },
  ]

  // ─── 행사 funnel 데이터 (events tab) ────────────────────────────────────────
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
    const funnel: EventFunnel = {
      impressions: metrics.impressionsCount ?? 0,
      leads: leadsCount,
      applications: metrics.applicationsCount ?? 0,
      qualifiedLeads: metrics.qualifiedLeadsCount ?? 0,
      attendees: metrics.attendeesCount ?? 0,
      deals: metrics.dealsCount ?? 0,
    }
    const economics = computeEconomics(funnel, metrics)
    return { event, metrics, funnel, economics }
  })

  const eventTotals = eventFunnelRows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.funnel.impressions,
      leads: acc.leads + row.funnel.leads,
      applications: acc.applications + row.funnel.applications,
      qualifiedLeads: acc.qualifiedLeads + row.funnel.qualifiedLeads,
      attendees: acc.attendees + row.funnel.attendees,
      deals: acc.deals + row.funnel.deals,
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
    }))
    .slice(0, 8)

  const eventEconomicsData = eventFunnelRows
    .filter((row) => row.economics.adSpendTotal > 0)
    .map((row) => ({
      name: row.event.title.length > 12 ? row.event.title.slice(0, 11) + "…" : row.event.title,
      "광고비(¥K)": Math.round(row.economics.adSpendTotal / 1000),
      "매출(¥K)": Math.round(row.economics.revenue / 1000),
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

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
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

      <div className="mb-6 rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <div className="admin-scroll-snap-x no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {tabButtons.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active ? "bg-[#111110] text-white" : "text-[#1a1a1a]/55 hover:bg-[#f5f5f2] hover:text-[#111110]"
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

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
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={leadsByDay} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} interval={range === 7 ? 0 : range === 14 ? 1 : 4} />
                    <YAxis tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e8e8e4", strokeWidth: 1 }} />
                    <Line type="monotone" dataKey="count" stroke="#111110" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#111110" }} />
                  </LineChart>
                </ResponsiveContainer>
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
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3}>
                        {statusData.map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip suffix="건" />} />
                    </PieChart>
                  </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={sourceRows} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="leadCount" fill="#111110" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={categoryData} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" fill="#111110" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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
                title="asset_id 연결 필요"
                description="자료 다운로드 CTA는 아직 Analytics에 직접 잡히지 않습니다."
                tone="warning"
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
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={campaignStatusData} dataKey="value" cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3}>
                        {campaignStatusData.map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
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
              hint={`총 광고비 ¥${new Intl.NumberFormat("ko-KR").format(eventTotals.spend)}`}
            />
            <SummaryCard
              icon={<Users className="w-4 h-4" />}
              label="누적 리드 → 딜"
              value={`${eventTotals.leads} → ${eventTotals.deals}`}
              hint={`참석 ${eventTotals.attendees}명`}
            />
            <SummaryCard
              icon={<BarChart2 className="w-4 h-4" />}
              label="평균 CPL · CPD"
              value={
                overallEventCpl != null
                  ? `¥${new Intl.NumberFormat("ko-KR").format(overallEventCpl)}`
                  : "—"
              }
              hint={
                overallEventCpd != null
                  ? `CPD ¥${new Intl.NumberFormat("ko-KR").format(overallEventCpd)}`
                  : "딜 데이터 부족"
              }
            />
            <SummaryCard
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="누적 ROI"
              value={overallEventRoi != null ? `${overallEventRoi}%` : "—"}
              hint={`매출 ¥${new Intl.NumberFormat("ko-KR").format(eventTotals.revenue)}`}
            />
          </div>

          <Panel
            title="행사별 깔때기 비교"
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
                description="행사 캠페인 대시보드에서 행사를 만들고 깔때기 메트릭을 입력하면 비교 차트가 채워집니다."
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
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventCompareData}>
                    <CartesianGrid stroke="#f0f0ec" vertical={false} />
                    <XAxis dataKey="name" fontSize={11} stroke="#84827a" />
                    <YAxis fontSize={11} stroke="#84827a" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111110",
                        border: "none",
                        borderRadius: 12,
                        color: "white",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="리드" fill="#84827a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="신청" fill="#1a73e8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="참석" fill="#084734" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="딜" fill="#B85C33" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel
            title="광고비 vs 매출 (행사별, 단위: ¥1,000)"
            description="투자 대비 회수율을 한눈에 봅니다. ROI는 우측 라인입니다."
          >
            {eventEconomicsData.length === 0 ? (
              <TableEmpty message="광고비 입력이 있는 행사가 없습니다." />
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={eventEconomicsData}>
                    <CartesianGrid stroke="#f0f0ec" vertical={false} />
                    <XAxis dataKey="name" fontSize={11} stroke="#84827a" />
                    <YAxis yAxisId="left" fontSize={11} stroke="#84827a" />
                    <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="#84827a" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111110",
                        border: "none",
                        borderRadius: 12,
                        color: "white",
                        fontSize: 12,
                      }}
                    />
                    <Bar yAxisId="left" dataKey="광고비(¥K)" fill="#B85C33" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="매출(¥K)" fill="#084734" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="ROI" stroke="#111110" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
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
                <table className="min-w-[820px] w-full text-[12px]">
                  <thead className="bg-[#fafaf8] text-left text-[#1a1a1a]/45">
                    <tr>
                      <th className="px-3 py-2 font-medium">행사</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                      <th className="px-3 py-2 font-medium text-right">리드</th>
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
                            ? `¥${new Intl.NumberFormat("ko-KR").format(row.economics.adSpendTotal)}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#1a1a1a]/60">
                          {row.economics.cpl != null
                            ? `¥${new Intl.NumberFormat("ko-KR").format(row.economics.cpl)}`
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

      {activeTab === "tracking" && (
        <div className="space-y-6">
          <Panel
            title="실시간 이벤트 카운트"
            description={`최근 ${range}일 동안 자체 DB에 적재된 클라이언트 이벤트 수입니다. GA·Meta 외 별도로 어드민에서 직접 확인합니다.`}
            action={<span className="text-[12px] text-[#1a1a1a]/40">총 {(clientEventCounts?.total ?? 0).toLocaleString()}건</span>}
          >
            {clientEventCounts && clientEventCounts.daily.length > 0 ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientEventCounts.daily} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e4" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#1a1a1a99" }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: "#1a1a1a99" }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#084734" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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
                <p className="text-[12px] font-medium text-[#111110]">2. 다운로드 이벤트 연결</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                  자료 다운로드 CTA마다 asset_id를 붙여 download_materials를 보내면 콘텐츠 기여 분석이 쉬워집니다.
                </p>
              </div>
              <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                <p className="text-[12px] font-medium text-[#111110]">3. page_view / 체류시간</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                  공개 페이지 공통 레이아웃에서 조회/체류를 잡아야 홈페이지 체류 분석과 이탈 페이지 리포트가 가능해집니다.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}

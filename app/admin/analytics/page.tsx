"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  ChevronRight,
  FileText,
  Link2,
  Mail,
  Minus,
  Users,
} from "lucide-react"
import AdminTabs from "@/components/admin/AdminTabs"
import { StatTile } from "@/components/admin/viz"
import { adminFetchJsonCached } from "@/lib/admin-client"
import { useUrlState } from "@/lib/use-url-state"
import type { LeadRecord } from "@/lib/db"
import type { BlogPost } from "@/lib/blog-types"
import type { Subscriber } from "@/lib/marketing-types"

type AnalyticsTab = "leads" | "sources" | "content"

// Analytics는 리드·소스·콘텐츠 비즈니스 분석 전용 화면이다.
// 행사 퍼널·이메일 캠페인 성과는 /admin/campaigns, 홈페이지 흐름·트래픽은 /admin/traffic에 단일화되어
// 중복 탭(campaigns·events·flow·tracking)은 이 화면에서 제거했다(근거: admin-ia-redesign-2026-06-29 §2-🟠4).
const ANALYTICS_TABS: Array<{ key: AnalyticsTab; label: string }> = [
  { key: "leads", label: "리드" },
  { key: "sources", label: "소스" },
  { key: "content", label: "콘텐츠" },
]

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

// KPI 카드는 공용 StatTile(components/admin/viz)로 통합 — trend(number)는 StatTile이 지원.
// (로컬 TrendBadge는 Panel action 슬롯에서 별도 사용 중이라 유지)
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
  return <StatTile icon={icon} label={label} value={value} hint={hint} trend={trend} />
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

export default function AnalyticsPage() {
  const [tabParam, setTabParam] = useUrlState("tab", "leads")
  const [range, setRange] = useState<7 | 14 | 30>(30)
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [visitorStats, setVisitorStats] = useState<VisitorStats | null>(null)
  const activeTab: AnalyticsTab = ANALYTICS_TABS.some((tab) => tab.key === tabParam)
    ? (tabParam as AnalyticsTab)
    : "leads"

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)

      const [leadData, subscriberData, blogData] = await Promise.all([
        fetchJson<{ leads: LeadRecord[] }>("/api/admin/leads"),
        fetchJson<{ subscribers: Subscriber[] }>("/api/admin/subscribers"),
        fetchJson<{ posts: BlogPost[] }>("/api/admin/blog"),
      ])

      if (cancelled) return

      setLeads(leadData?.leads ?? [])
      setSubscribers(subscriberData?.subscribers ?? [])
      setPosts(blogData?.posts ?? [])
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

    void fetchJson<VisitorStats>(`/api/admin/visitor-stats?range=${range}`).then((stats) => {
      if (cancelled) return
      setVisitorStats(stats ?? null)
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

  // 상단 KPI "오늘 홈 방문자" 카드가 쓰는 방문자 추세만 파생한다.
  const visitorTodayIndex =
    visitorStats?.daily.findIndex((day) => day.date === visitorStats.today.date) ?? -1
  const visitorYesterday =
    visitorStats && visitorTodayIndex > 0 ? visitorStats.daily[visitorTodayIndex - 1] : null
  const homeVisitorTrend = visitorStats
    ? visitorStats.today.homeVisitors - (visitorYesterday?.homeVisitors ?? 0)
    : undefined

  const leadInsight =
    leads.length === 0
      ? "아직 리드 데이터가 없어 CRM과 Analytics가 모두 가벼운 상태입니다."
      : dominantSource
        ? `${SOURCE_LABEL[dominantSource.source] ?? dominantSource.source} 경로가 현재 가장 큰 유입원이며, 전체 전환율은 ${conversionRate}%입니다.`
        : `최근 ${range}일 리드는 ${currentLeadCount}건이며 전환 리드는 ${convertedLeads.length}건입니다.`

  return (
    <div className="px-4 pt-8 pb-16 sm:px-6 sm:pt-10 sm:pb-20 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin</p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">Analytics</h1>
          <p className="mt-2 max-w-2xl text-[13px] text-[#1a1a1a]/45">
            리드·소스·콘텐츠 비즈니스 분석에 집중합니다. 행사·이메일 성과는 캠페인, 홈페이지 흐름·트래픽은 트래픽 화면에서 봅니다.
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
        <StatTile
          icon={<Users className="w-4 h-4" />}
          label="최근 리드"
          value={loading ? "..." : currentLeadCount}
          hint={`${range}일 기준`}
          trend={loading ? undefined : leadTrend}
        />
        <StatTile
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="전환율"
          value={loading ? "..." : `${conversionRate}%`}
          hint={`전환 ${convertedLeads.length}건`}
        />
        <StatTile
          icon={<Mail className="w-4 h-4" />}
          label="활성 구독자"
          value={loading ? "..." : activeSubscribers.length}
          hint={`최근 ${range}일 +${currentSubscriberCount}`}
          trend={loading ? undefined : subscriberTrend}
        />
        <StatTile
          icon={<FileText className="w-4 h-4" />}
          label="공개 콘텐츠"
          value={loading ? "..." : publishedPosts.length}
          hint={`초안 ${draftPosts.length}건`}
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

      <a
        href="/admin/campaigns"
        className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-[#D1FAE5] bg-[#ECFDF5] px-4 py-3.5 transition-colors hover:bg-[#DCFCE9] sm:px-5"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#084734]">
            <Mail className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-[#084734]">행사 퍼널·이메일 캠페인 성과는 캠페인에서 봅니다</p>
            <p className="mt-0.5 text-[12px] text-[#084734]/70">
              행사 리드 → 딜 퍼널과 이메일 발송 성과를 한 화면에 모았습니다.
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#084734]">
          캠페인 열기
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </a>

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
            <StatTile icon={<FileText className="w-4 h-4" />} label="공개 글" value={publishedPosts.length} />
            <StatTile icon={<FileText className="w-4 h-4" />} label="초안" value={draftPosts.length} />
            <StatTile icon={<CheckCircle2 className="w-4 h-4" />} label="추천 글" value={featuredPosts.length} />
            <StatTile icon={<Link2 className="w-4 h-4" />} label="CTA 포함 글" value={posts.filter((post) => post.cta?.buttonHref).length} />
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
    </div>
  )
}

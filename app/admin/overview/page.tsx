"use client"

import { useEffect, useState } from "react"
import {
  Users,
  TrendingUp,
  CheckCircle2,
  Mail,
  FileText,
  Eye,
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Link2,
  Send,
  ShieldAlert,
} from "lucide-react"
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { adminFetchJsonCached } from "@/lib/admin-client"
import { StatCard } from "@/components/admin/StatCard"
import type { LeadRecord, SiteSettings } from "@/lib/db"
import type { CalendarEvent } from "@/lib/calendar-data"
import type { BlogPost } from "@/lib/blog-types"
import type { EmailCampaign } from "@/lib/marketing-types"
import type { BugReport } from "@/lib/bugs-data"
import type { PatchNote } from "@/lib/patch-notes-data"

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    return await adminFetchJsonCached<T>(url, undefined, {
      ttlMs: 60_000,
      // 재방문 시 10분 내 데이터면 스피너 없이 즉시 표시 + 백그라운드 갱신
      staleWhileRevalidateMs: 10 * 60_000,
    })
  } catch {
    return null
  }
}

function isValidDate(value?: string) {
  if (!value) return false
  return !Number.isNaN(new Date(value).getTime())
}

function scoreDate(value?: string) {
  if (!value || !isValidDate(value)) return 0
  return new Date(value).getTime()
}

function formatDateShort(value?: string) {
  if (!value || !isValidDate(value)) return "날짜 없음"
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(new Date(value))
}

function formatDateTime(value?: string) {
  if (!value || !isValidDate(value)) return "시간 정보 없음"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function isWithinNextDays(dateStr: string, days: number) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + days)
  const target = new Date(`${dateStr}T00:00:00`)
  return target >= start && target <= end
}

function statusToneClasses(tone: "neutral" | "info" | "warning" | "danger" | "success") {
  switch (tone) {
    case "info":
      return "bg-[#ECFDF5] text-[#084734] border-[#D1FAE5]"
    case "warning":
      return "bg-amber-50 text-amber-700 border-amber-100"
    case "danger":
      return "bg-[#FEF3EE] text-[#B85C33] border-[#F6D5C5]"
    case "success":
      return "bg-green-50 text-green-700 border-green-100"
    default:
      return "bg-[#f0f0ec] text-[#1a1a1a]/50 border-[#e8e8e4]"
  }
}

function SectionCard({
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
    <section className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">{title}</h2>
          {description && <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#f0f0ec] rounded-lg animate-pulse ${className}`} />
}

function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="w-2/3 h-3" />
            <Skeleton className="w-1/2 h-2.5" />
          </div>
          <Skeleton className="w-16 h-5 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function KpiSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5 space-y-3">
      <Skeleton className="w-8 h-8 rounded-xl" />
      <Skeleton className="w-20 h-3" />
      <Skeleton className="w-14 h-7" />
      <Skeleton className="w-24 h-3" />
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#111110] text-white text-[12px] px-3 py-2 rounded-xl shadow-xl">
      <p className="text-white/50 mb-0.5">{label}</p>
      <p className="font-bold">{payload[0].value}건</p>
    </div>
  )
}

const DONUT_COLORS = ["#111110", "#4b8cf7", "#22c55e"]
const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  newsletter: "뉴스레터",
  meta_lead_ads: "Meta 리드",
}
const STATUS_LABEL: Record<string, string> = {
  new: "신규",
  contacted: "연락중",
  converted: "전환",
  closed: "종료",
}
const STATUS_COLOR: Record<string, string> = {
  new: "bg-[#ECFDF5] text-[#084734]",
  contacted: "bg-yellow-50 text-yellow-600",
  converted: "bg-[#D1FAE5] text-[#065c41]",
  closed: "bg-[#f0f0ec] text-[#1a1a1a]/40",
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
const PUBLISH_STATUS_LABEL: Record<BlogPost["status"], string> = {
  draft: "초안",
  review: "검수",
  published: "공개",
  archived: "보관",
}
const PUBLISH_STATUS_COLOR: Record<BlogPost["status"], string> = {
  draft: "bg-amber-50 text-amber-700",
  review: "bg-sky-50 text-sky-700",
  published: "bg-green-50 text-green-700",
  archived: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}
const COMPACT_NUMBER = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 })

type OverviewOperationalAlert = {
  id: string
  scope: string
  title: string
  description: string
  meta: string
  tone: "neutral" | "info" | "warning" | "danger" | "success"
  action: string
  href: string
  priority: number
}

interface InstagramOverviewDashboard {
  account: {
    username?: string
    followersCount: number
  }
  summary: {
    mediaCount: number
    totalViews: number
    averageViews: number
    followerDelta: number
  }
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-4 py-10 text-center sm:py-12">
      <p className="text-[14px] font-medium text-[#111110]">{title}</p>
      <p className="text-[12px] text-[#1a1a1a]/40 mt-1 max-w-sm leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function SignalChip({
  href,
  label,
  value,
  hint,
  tone,
}: {
  href: string
  label: string
  value: string
  hint: string
  tone: "neutral" | "info" | "warning" | "success" | "danger"
}) {
  return (
    <a
      href={href}
      className="group flex items-start justify-between gap-4 rounded-2xl border border-[#e8e8e4] bg-white/90 px-4 py-4 shadow-[0_1px_0_rgba(17,17,16,0.02)] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4] hover:shadow-[0_12px_30px_rgba(17,17,16,0.04)] sm:flex-row"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusToneClasses(tone)}`}>{label}</span>
        </div>
        <p className="mt-2 text-[17px] font-bold tracking-[-0.03em] text-[#111110] sm:text-[18px]">{value}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/40">{hint}</p>
      </div>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#1a1a1a]/25 transition-colors group-hover:text-[#111110]" />
    </a>
  )
}

export default function OverviewPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([])
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [patchNotes, setPatchNotes] = useState<PatchNote[]>([])
  const [instagramDashboard, setInstagramDashboard] = useState<InstagramOverviewDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartRange, setChartRange] = useState<7 | 30>(7)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)

      // Instagram은 외부 Meta API라 느리거나 미설정일 수 있으므로
      // 핵심 대시보드 로딩을 막지 않도록 분리해서 로드한다.
      void fetchJson<InstagramOverviewDashboard>(
        "/api/admin/meta/instagram?datePreset=last_30d&limit=25"
      ).then((instagramData) => {
        if (!cancelled) setInstagramDashboard(instagramData ?? null)
      })

      // 대시보드는 앞으로 7일치 일정만 쓰므로 전체 일정 대신 해당 월만 요청한다.
      const now = new Date()
      const weekLater = new Date(now)
      weekLater.setDate(now.getDate() + 7)
      const calendarMonths = [{ year: now.getFullYear(), month: now.getMonth() + 1 }]
      if (weekLater.getMonth() !== now.getMonth() || weekLater.getFullYear() !== now.getFullYear()) {
        calendarMonths.push({ year: weekLater.getFullYear(), month: weekLater.getMonth() + 1 })
      }

      const [
        leadsData,
        subscribersData,
        blogData,
        campaignData,
        calendarData,
        settingsData,
        bugsData,
        patchNotesData,
      ] = await Promise.all([
        fetchJson<{ leads: LeadRecord[] }>("/api/admin/leads"),
        fetchJson<{ subscribers: unknown[]; total: number }>("/api/admin/subscribers"),
        fetchJson<{ posts: BlogPost[] }>("/api/admin/blog"),
        fetchJson<{ campaigns: EmailCampaign[] }>("/api/admin/email"),
        Promise.all(
          calendarMonths.map(({ year, month }) =>
            fetchJson<CalendarEvent[]>(`/api/admin/calendar?year=${year}&month=${month}`)
          )
        ).then((results) => {
          const merged = new Map<string, CalendarEvent>()
          for (const events of results) {
            for (const event of events ?? []) merged.set(event.id, event)
          }
          return Array.from(merged.values())
        }),
        fetchJson<SiteSettings>("/api/admin/settings"),
        fetchJson<BugReport[]>("/api/admin/bugs"),
        fetchJson<PatchNote[]>("/api/admin/patch-notes"),
      ])

      if (cancelled) return

      setLeads(leadsData?.leads ?? [])
      setSubscriberCount(subscribersData?.total ?? 0)
      setBlogPosts(blogData?.posts ?? [])
      setCampaigns(campaignData?.campaigns ?? [])
      setCalendarEvents(calendarData ?? [])
      setSettings(settingsData ?? null)
      setBugs(bugsData ?? [])
      setPatchNotes(patchNotesData ?? [])
      setLoading(false)
    }

    load().finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const total = leads.length
  const newLeads = leads.filter((l) => l.status === "new").length
  const contactedLeads = leads.filter((l) => l.status === "contacted").length
  const converted = leads.filter((l) => l.status === "converted").length
  const closedLeads = leads.filter((l) => l.status === "closed").length
  const activePipelineLeads = newLeads + contactedLeads
  const convRate = total > 0 ? Math.round((converted / total) * 100) : 0

  const today = new Date()
  const todayStr = today.toDateString()
  const weekAgo = new Date(today)
  weekAgo.setDate(today.getDate() - 7)
  const twoWeeksAgo = new Date(today)
  twoWeeksAgo.setDate(today.getDate() - 14)

  const todayLeads = leads.filter((l) => new Date(l.timestamp).toDateString() === todayStr).length
  const thisWeekLeads = leads.filter((l) => new Date(l.timestamp) >= weekAgo).length
  const lastWeekLeads = leads.filter((l) => {
    const d = new Date(l.timestamp)
    return d >= twoWeeksAgo && d < weekAgo
  }).length
  const weekTrend = thisWeekLeads - lastWeekLeads

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const thisMonthLeads = leads.filter((l) => new Date(l.timestamp) >= monthStart).length
  const lastMonthLeads = leads.filter((l) => {
    const d = new Date(l.timestamp)
    return d >= lastMonthStart && d < monthStart
  }).length
  const monthTrend = thisMonthLeads - lastMonthLeads
  const convertedThisMonth = leads.filter(
    (l) => l.status === "converted" && new Date(l.timestamp) >= monthStart
  ).length
  const convertedLastMonth = leads.filter((l) => {
    if (l.status !== "converted") return false
    const d = new Date(l.timestamp)
    return d >= lastMonthStart && d < monthStart
  }).length
  const convertedTrend = convertedThisMonth - convertedLastMonth

  const chartData = Array.from({ length: chartRange }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (chartRange - 1 - i))
    return {
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      count: leads.filter((l) => new Date(l.timestamp).toDateString() === d.toDateString()).length,
    }
  })
  const chartTotal = chartData.reduce((sum, point) => sum + point.count, 0)

  const sourceMap: Record<string, number> = {}
  leads.forEach((l) => {
    sourceMap[l.source] = (sourceMap[l.source] ?? 0) + 1
  })
  const pieData = Object.entries(sourceMap).map(([key, value]) => ({
    name: SOURCE_LABEL[key] ?? key,
    value,
  }))

  const recentLeads = [...leads].sort((a, b) => scoreDate(b.timestamp) - scoreDate(a.timestamp)).slice(0, 6)
  const draftBlogPosts = blogPosts.filter((post) => post.status === "draft").length
  const publishedBlogPosts = blogPosts.filter((post) => post.status === "published")
  const publishedPostsWithCta = publishedBlogPosts.filter((post) => {
    const cta = post.cta
    return Boolean(cta?.title?.trim() && cta?.buttonLabel?.trim() && cta?.buttonHref?.trim())
  }).length
  const ctaCoverage = publishedBlogPosts.length > 0 ? Math.round((publishedPostsWithCta / publishedBlogPosts.length) * 100) : 0
  const recentPosts = [...blogPosts]
    .sort((a, b) => scoreDate(b.updatedAt ?? b.publishedAt) - scoreDate(a.updatedAt ?? a.publishedAt))
    .slice(0, 4)
  const recentCampaigns = [...campaigns]
    .sort((a, b) => scoreDate(b.sentAt ?? b.createdAt) - scoreDate(a.sentAt ?? a.createdAt))
    .slice(0, 4)
  const failedCampaigns = [...campaigns]
    .filter((campaign) => campaign.status === "failed")
    .sort((a, b) => scoreDate(b.sentAt ?? b.createdAt) - scoreDate(a.sentAt ?? a.createdAt))
  const upcomingEvents = [...calendarEvents]
    .filter((event) => isWithinNextDays(event.date, 7))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
    .slice(0, 5)
  const openBugs = [...bugs]
    .filter((bug) => bug.status === "open" || bug.status === "in-progress")
    .sort((a, b) => {
      const severityOrder: Record<BugReport["severity"], number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
      }
      return (
        severityOrder[b.severity] - severityOrder[a.severity] ||
        scoreDate(b.updatedAt) - scoreDate(a.updatedAt)
      )
    })
    .slice(0, 4)
  const draftCampaigns = campaigns.filter((campaign) => campaign.status === "draft")
  const sentCampaigns = campaigns.filter((campaign) => campaign.status === "sent")
  const latestPatchNote = [...patchNotes].sort((a, b) => scoreDate(b.date) - scoreDate(a.date))[0]
  const latestFailedCampaign = failedCampaigns[0]
  const nextUpcomingEvent = upcomingEvents[0]
  const criticalOpenBugs = openBugs.filter((bug) => bug.severity === "critical" || bug.severity === "high")
  const publishedPostsWithoutCta = Math.max(0, publishedBlogPosts.length - publishedPostsWithCta)
  const instagramViews = instagramDashboard?.summary.totalViews ?? 0
  const instagramMediaCount = instagramDashboard?.summary.mediaCount ?? 0
  const instagramAverageViews = instagramDashboard?.summary.averageViews ?? 0
  const assigneeMap = upcomingEvents.reduce<Record<string, number>>((acc, event) => {
    event.assignees?.forEach((assignee) => {
      acc[assignee] = (acc[assignee] ?? 0) + 1
    })
    return acc
  }, {})
  const activeAssigneeCount = Object.keys(assigneeMap).length
  const unassignedEventCount = upcomingEvents.filter((event) => !event.assignees?.length).length
  const busiestAssignee = Object.entries(assigneeMap).sort((a, b) => b[1] - a[1])[0]
  const branchMap = leads.reduce<Record<string, number>>((acc, lead) => {
    const branch = lead.branch?.trim()
    if (!branch) return acc
    acc[branch] = (acc[branch] ?? 0) + 1
    return acc
  }, {})
  const topBranch = Object.entries(branchMap).sort((a, b) => b[1] - a[1])[0]

  const connections = [
    {
      label: "Google Sheet",
      description: "리드를 시트로 자동 기록",
      value: settings?.googleSheetWebhookUrl,
      href: "/admin/settings",
    },
    {
      label: "리드 Webhook",
      description: "외부 자동화 플랫폼과 연동",
      value: settings?.leadWebhookUrl,
      href: "/admin/settings",
    },
    {
      label: "ChannelTalk",
      description: "상담 인박스로 전달",
      value: settings?.channelTalkWebhookUrl,
      href: "/admin/settings",
    },
    {
      label: "이메일 Webhook",
      description: "캠페인 발송 연동",
      value: settings?.emailWebhookUrl,
      href: "/admin/settings",
    },
  ]

  const teamSummaryItems = [
    {
      title: "세일즈 퍼널",
      value: `${activePipelineLeads}건`,
      badge: newLeads > 0 ? `신규 ${newLeads}` : "신규 없음",
      description:
        total > 0
          ? `전체 ${total}건 · 연락중 ${contactedLeads}건 · 전환 ${converted}건 · 종료 ${closedLeads}건`
          : "리드가 쌓이면 신규, 연락중, 전환 상태를 퍼널로 보여줍니다.",
      href: "/admin/crm",
      action: "CRM 열기",
      tone: newLeads > 0 ? ("warning" as const) : ("neutral" as const),
    },
    {
      title: "담당자 커버리지",
      value: activeAssigneeCount > 0 ? `${activeAssigneeCount}명` : "대기",
      badge: unassignedEventCount > 0 ? `미배정 ${unassignedEventCount}` : "배정 안정",
      description:
        upcomingEvents.length > 0
          ? `${upcomingEvents.length}개 일정 · ${busiestAssignee ? `${busiestAssignee[0]} ${busiestAssignee[1]}건 집중` : "담당자 정보 없음"}`
          : "이번 주 팀 일정이 등록되면 담당자별 집중도를 표시합니다.",
      href: "/admin/calendar",
      action: "캘린더",
      tone: unassignedEventCount > 0 ? ("warning" as const) : activeAssigneeCount > 0 ? ("success" as const) : ("neutral" as const),
    },
    {
      title: "캠페인 상태",
      value: `${campaigns.length}건`,
      badge: failedCampaigns.length > 0 ? `실패 ${failedCampaigns.length}` : `발송 ${sentCampaigns.length}`,
      description:
        campaigns.length > 0
          ? `초안 ${draftCampaigns.length}건 · 발송 ${sentCampaigns.length}건 · 대상 구독자 ${subscriberCount}명`
          : "캠페인 초안과 발송 이력이 생기면 상태를 집계합니다.",
      href: "/admin/campaigns",
      action: "캠페인",
      tone: failedCampaigns.length > 0 ? ("danger" as const) : draftCampaigns.length > 0 ? ("info" as const) : ("neutral" as const),
    },
    {
      title: "문서/콘텐츠 상태",
      value: `${publishedBlogPosts.length}개`,
      badge: publishedPostsWithoutCta > 0 ? `CTA 미완 ${publishedPostsWithoutCta}` : "CTA 안정",
      description:
        blogPosts.length > 0
          ? `공개 ${publishedBlogPosts.length}개 · 초안 ${draftBlogPosts}개 · CTA 커버리지 ${publishedBlogPosts.length > 0 ? `${ctaCoverage}%` : "대기"}`
          : "문서와 블로그가 쌓이면 공개/초안/CTA 상태를 함께 보여줍니다.",
      href: "/admin/blog",
      action: "문서 확인",
      tone: publishedPostsWithoutCta > 0 ? ("warning" as const) : publishedBlogPosts.length > 0 ? ("success" as const) : ("neutral" as const),
    },
  ]
  const statusFunnelItems = [
    { label: STATUS_LABEL.new, value: newLeads, tone: newLeads > 0 ? ("warning" as const) : ("neutral" as const) },
    { label: STATUS_LABEL.contacted, value: contactedLeads, tone: contactedLeads > 0 ? ("info" as const) : ("neutral" as const) },
    { label: STATUS_LABEL.converted, value: converted, tone: converted > 0 ? ("success" as const) : ("neutral" as const) },
    { label: STATUS_LABEL.closed, value: closedLeads, tone: "neutral" as const },
  ]

  const missingConnections = connections.filter((connection) => !connection.value?.trim())
  const missingConnectionLabels = missingConnections.map((connection) => connection.label)
  const missingConnectionSummary =
    missingConnectionLabels.length > 2
      ? `${missingConnectionLabels.slice(0, 2).join(", ")} 외 ${missingConnectionLabels.length - 2}개`
      : missingConnectionLabels.join(", ")
  const urgentRiskCount = [
    newLeads > 0,
    Boolean(latestFailedCampaign),
    missingConnections.length > 0,
    criticalOpenBugs.length > 0,
    publishedPostsWithoutCta > 0,
  ].filter(Boolean).length
  const topSignals = [
    {
      label: "세일즈 파이프라인",
      value: `${activePipelineLeads}건`,
      hint:
        total > 0
          ? `신규 ${newLeads}건 · 연락중 ${contactedLeads}건 · 전환율 ${convRate}%`
          : "문의가 들어오면 파이프라인 총량을 표시합니다.",
      href: "/admin/crm",
      tone: newLeads > 0 ? ("warning" as const) : activePipelineLeads > 0 ? ("info" as const) : ("neutral" as const),
    },
    {
      label: "급한 리스크",
      value: urgentRiskCount > 0 ? `${urgentRiskCount}건` : "안정",
      hint:
        urgentRiskCount > 0
          ? "신규 리드, 캠페인 실패, 연동 누락, 이슈를 우선 점검합니다."
          : "주의 등급 이상의 운영 알림이 없습니다.",
      href: urgentRiskCount > 0 ? "/admin/dev" : "/admin/settings",
      tone: urgentRiskCount > 0 ? ("warning" as const) : ("success" as const),
    },
    {
      label: "이번 주 유입",
      value: `${thisWeekLeads}건`,
      hint: topBranch ? `${topBranch[0]} ${topBranch[1]}건 · 지난주 대비 ${weekTrend >= 0 ? "+" : ""}${weekTrend}건` : weekTrend >= 0 ? `지난주 대비 +${weekTrend}건` : `지난주 대비 ${weekTrend}건`,
      href: "/admin/crm",
      tone: weekTrend >= 0 ? ("info" as const) : ("warning" as const),
    },
    {
      label: "캠페인/문서",
      value: `${sentCampaigns.length}/${publishedBlogPosts.length}`,
      hint: `발송 캠페인 ${sentCampaigns.length}건 · 공개 문서 ${publishedBlogPosts.length}개 · CTA ${publishedBlogPosts.length > 0 ? `${ctaCoverage}%` : "대기"}`,
      href: "/admin/campaigns",
      tone: failedCampaigns.length > 0 || publishedPostsWithoutCta > 0 ? ("warning" as const) : ("info" as const),
    },
  ]
  const operationalAlertItems: Array<OverviewOperationalAlert | null> = [
    newLeads > 0
      ? {
          id: "lead-followup",
          scope: "CRM",
          title: "신규 문의 후속 리스크",
          description: `미처리 ${newLeads}건 · 오늘 유입 ${todayLeads}건 · 세일즈 후속 상태를 우선 점검하세요.`,
          meta: todayLeads > 0 ? `오늘 ${todayLeads}건` : `이번 주 ${thisWeekLeads}건`,
          tone: "warning" as const,
          action: "CRM 확인",
          href: "/admin/crm",
          priority: 100,
        }
      : null,
    latestFailedCampaign
      ? {
          id: `campaign-failed-${latestFailedCampaign.id}`,
          scope: "캠페인",
          title: "실패 캠페인 재점검",
          description: `${latestFailedCampaign.subject} · ${formatDateTime(latestFailedCampaign.sentAt ?? latestFailedCampaign.createdAt)} · 발송 실패 상태입니다.`,
          meta: "즉시 확인",
          tone: "danger" as const,
          action: "캠페인",
          href: "/admin/campaigns",
          priority: 95,
        }
      : null,
    missingConnections.length > 0
      ? {
          id: "connection-missing",
          scope: "연동",
          title: "외부 연동 설정 필요",
          description: `미연결 ${missingConnections.length}건 · ${missingConnectionSummary} · 전송 경로를 먼저 복구하세요.`,
          meta: `미연결 ${missingConnections.length}건`,
          tone: "warning" as const,
          action: "설정",
          href: "/admin/settings",
          priority: 90,
        }
      : null,
    openBugs.length > 0
      ? {
          id: "open-bugs",
          scope: "Dev",
          title: "오픈 이슈 모니터링",
          description: `진행중 ${openBugs.length}건 · Critical/High ${criticalOpenBugs.length}건 · 최근 업데이트 ${formatDateTime(openBugs[0]?.updatedAt)}.`,
          meta: criticalOpenBugs.length > 0 ? `긴급 ${criticalOpenBugs.length}건` : `오픈 ${openBugs.length}건`,
          tone: criticalOpenBugs.length > 0 ? ("danger" as const) : ("warning" as const),
          action: "Dev 열기",
          href: "/admin/dev",
          priority: criticalOpenBugs.length > 0 ? 85 : 75,
        }
      : null,
    publishedPostsWithoutCta > 0
      ? {
          id: "cta-coverage",
          scope: "콘텐츠",
          title: "콘텐츠 CTA 보강 필요",
          description: `공개 글 ${publishedBlogPosts.length}건 중 CTA 미완성 ${publishedPostsWithoutCta}건 · 현재 커버리지 ${ctaCoverage}%.`,
          meta: `CTA ${ctaCoverage}%`,
          tone: ctaCoverage < 50 ? ("warning" as const) : ("info" as const),
          action: "콘텐츠",
          href: "/admin/blog",
          priority: 70,
        }
      : null,
    draftCampaigns.length > 0
      ? {
          id: "campaign-drafts",
          scope: "캠페인",
          title: "발송 대기 초안 확인",
          description: `초안 ${draftCampaigns.length}건 · 발송 완료 ${sentCampaigns.length}건 · 발송 검토 대상을 정리하세요.`,
          meta: `초안 ${draftCampaigns.length}건`,
          tone: "info" as const,
          action: "초안 열기",
          href: "/admin/campaigns",
          priority: 60,
        }
      : null,
    nextUpcomingEvent
      ? {
          id: `calendar-${nextUpcomingEvent.id}`,
          scope: "일정",
          title: "다가오는 일정 점검",
          description: `${nextUpcomingEvent.title} · ${formatDateTime(`${nextUpcomingEvent.date}T${nextUpcomingEvent.time ?? "09:00"}`)} · 준비 상태를 미리 확인하세요.`,
          meta: nextUpcomingEvent.assignees?.join(", ") || "캘린더",
          tone: "info" as const,
          action: "캘린더",
          href: "/admin/calendar",
          priority: 50,
        }
      : null,
    latestPatchNote
      ? {
          id: latestPatchNote.id,
          scope: "배포",
          title: `최근 패치노트 v${latestPatchNote.version}`,
          description: `${latestPatchNote.title} · ${formatDateShort(latestPatchNote.date)} · 최근 변경 범위를 빠르게 확인합니다.`,
          meta: latestPatchNote.status === "published" ? "배포 완료" : "초안",
          tone: latestPatchNote.status === "published" ? ("success" as const) : ("info" as const),
          action: "패치노트",
          href: "/admin/dev",
          priority: 40,
        }
      : null,
  ]
  const operationalAlerts = operationalAlertItems
    .filter((item): item is OverviewOperationalAlert => Boolean(item))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6)
  const actionableOperationalAlertCount = operationalAlerts.filter(
    (item) => item.tone === "warning" || item.tone === "danger"
  ).length

  return (
    <div className="relative overflow-hidden px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 lg:pb-20">
      <div className="relative mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">Overview</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
            팀 전체 세일즈 퍼널, 급한 리스크, 담당자 커버리지, 캠페인과 문서 상태를 한 화면에서 점검하는 운영 허브입니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/admin/crm"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#e8e8e4] bg-white text-[12px] font-medium text-[#1a1a1a]/70 hover:text-[#111110] hover:border-[#c8c8c4] transition-colors"
          >
            문의 관리
            <ChevronRight className="w-3 h-3" />
          </a>
          <a
            href="/admin/campaigns"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#e8e8e4] bg-white text-[12px] font-medium text-[#1a1a1a]/70 hover:text-[#111110] hover:border-[#c8c8c4] transition-colors"
          >
            캠페인
            <ChevronRight className="w-3 h-3" />
          </a>
          <a
            href="/admin/settings"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#e8e8e4] bg-white text-[12px] font-medium text-[#1a1a1a]/70 hover:text-[#111110] hover:border-[#c8c8c4] transition-colors"
          >
            설정
            <ChevronRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      {!loading && newLeads > 0 && (
        <div className="relative mb-6 flex flex-col gap-3 rounded-xl border border-[#D1FAE5] bg-[#ECFDF5] px-4 py-3 shadow-[0_1px_0_rgba(8,71,52,0.04)] sm:flex-row sm:items-center">
          <AlertCircle className="w-4 h-4 text-[#084734] shrink-0" />
          <p className="text-[13px] text-[#084734] font-medium">
            세일즈 퍼널에 신규 문의 <span className="font-bold">{newLeads}건</span>이 대기 중입니다.
          </p>
          <a
            href="/admin/crm"
            className="text-[12px] text-[#065c41] hover:text-[#084734] font-medium flex items-center gap-1 shrink-0 transition-colors sm:ml-auto"
          >
            문의 관리 <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
      )}

      <div className="relative mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[124px] rounded-2xl" />)
        ) : (
          topSignals.map((signal) => (
            <SignalChip
              key={signal.label}
              href={signal.href}
              label={signal.label}
              value={signal.value}
              hint={signal.hint}
              tone={signal.tone}
            />
          ))
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 mb-8">
          {Array.from({ length: 7 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 mb-8">
          <StatCard
            icon={<Users className="w-4 h-4" />}
            label="전체 리드"
            value={total}
            sub={`오늘 +${todayLeads} · 이번 달 ${thisMonthLeads}`}
            trend={{ value: monthTrend, label: "지난달 대비" }}
            href="/admin/crm"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="신규 리드"
            value={newLeads}
            sub="미처리 문의"
            accent="bg-[#ECFDF5]"
            iconColor="text-[#084734]"
            href="/admin/crm"
          />
          <StatCard
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="전환율"
            value={`${convRate}%`}
            sub={`전환 ${converted}건 · 이번 달 ${convertedThisMonth}건`}
            trend={{ value: convertedTrend, label: "지난달 대비" }}
            accent="bg-green-50"
            iconColor="text-green-500"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="주간 유입"
            value={thisWeekLeads}
            trend={{ value: weekTrend, label: "지난주 대비" }}
            accent="bg-[#F6F5F4]"
            iconColor="text-[#615D59]"
          />
          <StatCard
            icon={<Mail className="w-4 h-4" />}
            label="구독자"
            value={subscriberCount}
            sub="활성 구독자"
            accent="bg-orange-50"
            iconColor="text-orange-500"
            href="/admin/campaigns"
          />
          <StatCard
            icon={<Eye className="w-4 h-4" />}
            label="인스타 조회수"
            value={instagramDashboard ? COMPACT_NUMBER.format(instagramViews) : "연결 필요"}
            sub={
              instagramDashboard
                ? `최근 ${instagramMediaCount}개 · 평균 ${COMPACT_NUMBER.format(instagramAverageViews)}`
                : "콘텐츠 탭에서 확인"
            }
            accent="bg-[#FEF3EE]"
            iconColor="text-[#B85C33]"
          />
          <StatCard icon={<FileText className="w-4 h-4" />} label="블로그" value={blogPosts.length} sub="발행된 포스트" href="/admin/blog" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 shadow-[0_1px_0_rgba(17,17,16,0.02)] sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[14px] font-semibold text-[#111110]">홈페이지 유입 추이</p>
              <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">
                최근 {chartRange}일 · {chartTotal}건
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-0.5">
                {([7, 30] as const).map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setChartRange(range)}
                    className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                      chartRange === range
                        ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(17,17,16,0.08)]"
                        : "text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70"
                    }`}
                  >
                    {range}일
                  </button>
                ))}
              </div>
              <span className="rounded-full bg-[#f0f0ec] px-2.5 py-1 text-[10px] font-medium text-[#1a1a1a]/50">
                {total > 0 ? `${total}건 누적` : "데이터 대기"}
              </span>
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-[180px]" />
          ) : chartTotal === 0 ? (
            <div className="flex h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-[#ecece8] bg-[#fafaf8]">
              <p className="text-[13px] font-medium text-[#1a1a1a]/50">최근 {chartRange}일 유입이 없습니다</p>
              <p className="mt-1 text-[11px] text-[#1a1a1a]/35">문의가 들어오면 일별 추이가 표시됩니다.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#1a1a1a", opacity: 0.4 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis tick={{ fontSize: 11, fill: "#1a1a1a", opacity: 0.4 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e8e8e4", strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#111110"
                  strokeWidth={2}
                  dot={chartRange === 7 ? { fill: "#111110", strokeWidth: 0, r: 3 } : false}
                  activeDot={{ r: 5, fill: "#111110", strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 shadow-[0_1px_0_rgba(17,17,16,0.02)] sm:p-6">
          <div className="mb-4">
            <p className="text-[14px] font-semibold text-[#111110]">주요 유입 경로</p>
            <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">전체 기간</p>
          </div>
          {loading ? (
            <Skeleton className="h-[180px]" />
          ) : pieData.length === 0 ? (
            <div className="flex items-center justify-center h-[180px] text-[12px] text-[#1a1a1a]/30">데이터 없음</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [`${v ?? 0}건`, ""]}
                    contentStyle={{ border: "none", borderRadius: 12, background: "#111110", color: "#fff", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="text-[12px] text-[#1a1a1a]/60">{d.name}</span>
                    </div>
                    <span className="text-[12px] font-medium text-[#111110]">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white shadow-[0_1px_0_rgba(17,17,16,0.02)]">
        <div className="flex flex-col gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-[14px] font-semibold text-[#111110]">세일즈 퍼널 / 최근 유입</h2>
            <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">상태별 누적과 최근 접수 흐름을 함께 봅니다.</p>
          </div>
          <a href="/admin/crm" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
            전체 보기 <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="w-32 h-3" />
                  <Skeleton className="w-20 h-2.5" />
                </div>
                <Skeleton className="w-12 h-5 rounded-full" />
              </div>
            ))}
          </div>
        ) : recentLeads.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState
                title="아직 리드가 없습니다."
                description="데모 신청이나 문의가 들어오면 여기에서 팀 단위 세일즈 상태를 관리할 수 있습니다."
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
          </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 border-b border-[#e8e8e4] bg-[#fafaf8] p-4 sm:grid-cols-4 sm:px-6">
                {statusFunnelItems.map((item) => (
                  <a
                    key={item.label}
                    href="/admin/crm"
                    className="rounded-xl border border-[#e8e8e4] bg-white px-3 py-3 transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4]"
                  >
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusToneClasses(item.tone)}`}>
                      {item.label}
                    </span>
                    <p className="mt-2 text-[22px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{item.value}</p>
                  </a>
                ))}
              </div>
              <ul>
                {recentLeads.map((lead) => (
                  <li
                    key={lead.id}
                    className="flex flex-col gap-3 border-b border-[#e8e8e4] px-4 py-3.5 transition-colors last:border-0 hover:bg-[#fafaf8] sm:flex-row sm:items-center sm:gap-4 sm:px-6"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#f0f0ec] flex items-center justify-center text-[12px] font-semibold text-[#1a1a1a]/50 shrink-0">
                        {(lead.name ?? lead.email ?? "?")[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[#111110] truncate">
                          {lead.name ?? lead.email ?? "이름 없음"}
                          {lead.org && <span className="font-normal text-[#1a1a1a]/40"> · {lead.org}</span>}
                        </p>
                        <p className="text-[11px] text-[#1a1a1a]/40">{SOURCE_LABEL[lead.source] ?? lead.source}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-auto">
                      <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium shrink-0 ${STATUS_COLOR[lead.status]}`}>
                        {STATUS_LABEL[lead.status]}
                      </span>
                      <p className="text-[11px] text-[#1a1a1a]/30 shrink-0 w-14 text-right">
                        {formatDateShort(lead.timestamp)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <SectionCard
          title="팀 현황 요약"
          description="퍼널, 담당자, 캠페인, 문서 상태를 팀 단위로 압축해 봅니다."
          action={
            <a href="/admin/crm" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
              CRM 열기 <ArrowUpRight className="w-3 h-3" />
            </a>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : (
            <div className="space-y-3">
              {teamSummaryItems.map((item) => (
                <a
                  key={item.title}
                  href={item.href}
                  className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                >
                  <div className={`mt-0.5 w-9 h-9 rounded-xl border flex items-center justify-center ${statusToneClasses(item.tone)}`}>
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-[#111110]">{item.title}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusToneClasses(item.tone)}`}>{item.badge}</span>
                    </div>
                    <p className="mt-1 text-[18px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{item.value}</p>
                    <p className="text-[12px] text-[#1a1a1a]/40 mt-1.5 leading-relaxed">{item.description}</p>
                  </div>
                  <span className="text-[12px] font-medium text-[#1a1a1a]/35 group-hover:text-[#111110] flex items-center gap-1 shrink-0">
                    {item.action}
                    <ChevronRight className="w-3 h-3" />
                  </span>
                </a>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="이번 주 일정"
          description="월별 캘린더의 핵심 일정만 먼저 보여줍니다."
          action={
            <a href="/admin/calendar" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
              캘린더 보기 <ArrowUpRight className="w-3 h-3" />
            </a>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : upcomingEvents.length === 0 ? (
            <EmptyState
              title="이번 주 일정이 없습니다."
              description="운영 회의, 캠페인 일정, 마감 일정이 생기면 여기에서 빠르게 확인할 수 있습니다."
              action={
                <a
                  href="/admin/calendar"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111110] text-white text-[12px] font-medium"
                >
                  일정 추가
                  <ChevronRight className="w-3 h-3" />
                </a>
              }
            />
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <a
                  key={event.id}
                  href="/admin/calendar"
                  className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] px-4 py-3 transition-all hover:-translate-y-0.5 hover:bg-[#fafaf8] hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                >
                  <div className="mt-0.5 w-9 h-9 rounded-xl bg-[#f0f0ec] flex items-center justify-center text-[#1a1a1a]/50">
                    <CalendarDays className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-[#111110]">{event.title}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#084734]">
                        {event.type === "team"
                          ? "팀 일정"
                          : event.type === "meeting"
                            ? "회의"
                            : event.type === "deadline"
                              ? "마감"
                              : event.type === "launch"
                                ? "런칭"
                                : event.type === "holiday"
                                  ? "휴일"
                                  : "기타"}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#1a1a1a]/40 mt-1">
                      {formatDateShort(event.date)}
                      {event.time ? ` · ${event.time}${event.endTime ? ` ~ ${event.endTime}` : ""}` : ""}
                      {event.assignees?.length ? ` · ${event.assignees.join(", ")}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#1a1a1a]/25 group-hover:text-[#111110] shrink-0 mt-1" />
                </a>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <SectionCard
          title="문서/콘텐츠 상태"
          description="최근 수정 문서와 공개/초안 흐름을 확인합니다."
          action={
            <a href="/admin/blog" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
              콘텐츠 열기 <ArrowUpRight className="w-3 h-3" />
            </a>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : recentPosts.length === 0 ? (
            <EmptyState
              title="아직 콘텐츠가 없습니다."
              description="블로그 초안을 만들면 여기에서 발행 상태와 최근 수정 내역을 확인할 수 있습니다."
              action={
                <a
                  href="/admin/blog/new"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111110] text-white text-[12px] font-medium"
                >
                  새 글 작성
                  <ChevronRight className="w-3 h-3" />
                </a>
              }
            />
          ) : (
            <div className="space-y-3">
              {recentPosts.map((post) => (
                <a
                  key={post.id}
                  href="/admin/blog"
                  className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] px-4 py-3 transition-all hover:-translate-y-0.5 hover:bg-[#fafaf8] hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                >
                  <div className="mt-0.5 w-9 h-9 rounded-xl bg-[#f0f0ec] flex items-center justify-center text-[#1a1a1a]/50">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-[#111110] truncate">{post.title}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PUBLISH_STATUS_COLOR[post.status]}`}>
                        {PUBLISH_STATUS_LABEL[post.status]}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#1a1a1a]/40 mt-1">
                      {post.category} · {post.author} · {formatDateTime(post.updatedAt ?? post.publishedAt)}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#1a1a1a]/25 group-hover:text-[#111110] shrink-0 mt-1" />
                </a>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="캠페인 상태"
          description="구독자 발송 내역, 초안, 실패 상태를 확인합니다."
          action={
            <a href="/admin/campaigns" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
              캠페인 열기 <ArrowUpRight className="w-3 h-3" />
            </a>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : recentCampaigns.length === 0 ? (
            <EmptyState
              title="아직 발송된 캠페인이 없습니다."
              description="구독자에게 보낼 첫 이메일을 작성하면 이 영역에 발송 히스토리가 쌓입니다."
              action={
                <a
                  href="/admin/campaigns"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111110] text-white text-[12px] font-medium"
                >
                  캠페인 만들기
                  <ChevronRight className="w-3 h-3" />
                </a>
              }
            />
          ) : (
            <div className="space-y-3">
              {recentCampaigns.map((campaign) => (
                <a
                  key={campaign.id}
                  href="/admin/campaigns"
                  className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] px-4 py-3 transition-all hover:-translate-y-0.5 hover:bg-[#fafaf8] hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                >
                  <div className="mt-0.5 w-9 h-9 rounded-xl bg-[#f0f0ec] flex items-center justify-center text-[#1a1a1a]/50">
                    <Send className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-[#111110] truncate">{campaign.subject}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CAMPAIGN_STATUS_COLOR[campaign.status]}`}>
                        {CAMPAIGN_STATUS_LABEL[campaign.status]}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#1a1a1a]/40 mt-1">
                      {campaign.recipientCount}명 · {campaign.targetTags.length > 0 ? campaign.targetTags.join(", ") : "전체"} · {formatDateTime(campaign.sentAt ?? campaign.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#1a1a1a]/25 group-hover:text-[#111110] shrink-0 mt-1" />
                </a>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="급한 리스크 / 연동 상태"
          description="세일즈, 캠페인, 문서, 외부 연결의 이상 징후를 한 곳에서 점검합니다."
          action={
            <a href="/admin/settings" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
              설정 열기 <ArrowUpRight className="w-3 h-3" />
            </a>
          }
        >
          {loading ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <SectionSkeleton rows={3} />
              <SectionSkeleton rows={4} />
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[13px] font-semibold text-[#111110]">리스크 알림 내역</p>
                    <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">즉시 대응, 상태 점검, 최근 변경을 우선순위로 정렬합니다.</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusToneClasses(actionableOperationalAlertCount > 0 ? "warning" : operationalAlerts.length > 0 ? "info" : "success")}`}>
                    {actionableOperationalAlertCount > 0 ? `주의 ${actionableOperationalAlertCount}` : operationalAlerts.length > 0 ? `최근 ${operationalAlerts.length}` : "정상"}
                  </span>
                </div>

                {operationalAlerts.length === 0 ? (
                  <EmptyState
                    title="지금은 운영 주의 신호가 없습니다."
                    description="문의, 캠페인, 연동, 일정, 배포 변경이 안정 상태면 이 영역은 비어 있습니다."
                    action={
                      <a
                        href="/admin/dev"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111110] text-white text-[12px] font-medium"
                      >
                        Dev Mode 열기
                        <ChevronRight className="w-3 h-3" />
                      </a>
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {operationalAlerts.map((item) => (
                      <a
                        key={item.id}
                        href={item.href}
                        className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                      >
                        <div className={`mt-0.5 w-9 h-9 rounded-xl border flex items-center justify-center ${statusToneClasses(item.tone)}`}>
                          <ShieldAlert className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusToneClasses(item.tone)}`}>
                              {item.scope}
                            </span>
                            <span className="text-[11px] text-[#1a1a1a]/35">{item.meta}</span>
                          </div>
                          <p className="mt-1 text-[13px] font-semibold text-[#111110] truncate">{item.title}</p>
                          <p className="text-[12px] text-[#1a1a1a]/40 mt-1 leading-relaxed">{item.description}</p>
                        </div>
                        <span className="text-[12px] font-medium text-[#1a1a1a]/35 group-hover:text-[#111110] flex items-center gap-1 shrink-0">
                          {item.action}
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[13px] font-semibold text-[#111110]">연동 상태</p>
                    <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">외부 전송 경로를 점검합니다.</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusToneClasses(missingConnections.length > 0 ? "warning" : "success")}`}>
                    {missingConnections.length > 0 ? `미연결 ${missingConnections.length}` : "연결됨"}
                  </span>
                </div>

                {connections.length === 0 ? null : (
                  <div className="space-y-3">
                    {connections.map((connection) => {
                      const connected = Boolean(connection.value?.trim())
                      return (
                        <a
                          key={connection.label}
                          href={connection.href}
                          className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                        >
                          <div
                            className={`mt-0.5 w-9 h-9 rounded-xl border flex items-center justify-center ${
                              connected ? "bg-green-50 text-green-700 border-green-100" : "bg-amber-50 text-amber-700 border-amber-100"
                            }`}
                          >
                            <Link2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] font-semibold text-[#111110]">{connection.label}</p>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                  connected ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {connected ? "연결됨" : "설정 필요"}
                              </span>
                            </div>
                            <p className="text-[12px] text-[#1a1a1a]/40 mt-1">{connection.description}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-[#1a1a1a]/25 group-hover:text-[#111110] shrink-0 mt-1" />
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

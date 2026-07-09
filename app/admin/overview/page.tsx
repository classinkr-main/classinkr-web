"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
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
  CircleDollarSign,
  PhoneCall,
  MapPin,
  BarChart3,
} from "lucide-react"
import { adminFetchJsonCached } from "@/lib/admin-client"
import { StatCard } from "@/components/admin/StatCard"
import CrmHealthDonut from "@/components/admin/crm/CrmHealthDonut"
import type { Period, Team } from "@/components/admin/branch/types"
import {
  EmptyState,
  KpiSkeleton,
  MiniFunnel,
  SectionCard,
  SectionSkeleton,
  Skeleton,
  SOURCE_PALETTE,
  type FunnelStage,
} from "@/components/admin/viz"
import type { LeadRecord } from "@/lib/site-settings-types"
import type { AdminIntegrationStatusResponse } from "@/lib/admin-integrations/types"
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

// SectionCard·Skeleton·SectionSkeleton·KpiSkeleton·EmptyState는 @/components/admin/viz로 이관(중복 제거).

// Recharts는 무거우므로 KPI 카드가 먼저 그려진 뒤 차트만 지연 로드한다.
const LeadTrendChart = dynamic(
  () => import("@/components/admin/overview/OverviewCharts").then((m) => m.LeadTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-[180px]" /> }
)
const SourcePie = dynamic(
  () => import("@/components/admin/overview/OverviewCharts").then((m) => m.SourcePie),
  { ssr: false, loading: () => <Skeleton className="h-[140px]" /> }
)
// KPI 카드 미니 추이 — Recharts 경계를 overview가 소유.
const Sparkline = dynamic(
  () => import("@/components/admin/viz/Sparkline").then((m) => m.Sparkline),
  { ssr: false, loading: () => <div className="h-[30px]" /> }
)
// 지사 지역 히트맵 — 기존 라이브 컴포넌트를 홈(Command 링) 요약으로 재사용(재빌드 아님).
// 자체적으로 /api/admin/branch/heatmap을 지연 로드하므로 핵심 KPI 렌더를 막지 않는다.
const BranchRegionHeatmap = dynamic(
  () => import("@/components/admin/branch/sections/BranchRegionHeatmap"),
  { ssr: false, loading: () => <Skeleton className="h-[420px]" /> }
)
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
  contacted: "bg-amber-50 text-amber-700",
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
  review: "bg-[#ECFDF5] text-[#084734]",
  published: "bg-green-50 text-green-700",
  archived: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}
const COMPACT_NUMBER = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 })

// CRM 운영 라우트 런처 — 근간 라우트를 4개 링(작업대·매출·분석·파트너)으로 묶어 홈에서 직접 진입.
// 지금까지 홈에서 진입 가능한 CRM 라우트는 3개뿐 → 고아 라우트(revenue·partners*)까지 노출한다.
const CRM_ROUTE_GROUPS: Array<{
  key: string
  title: string
  caption: string
  icon: ReactNode
  links: Array<{ href: string; label: string }>
}> = [
  {
    key: "operate",
    title: "작업대",
    caption: "리드 · 고객 · 기록",
    icon: <PhoneCall className="h-4 w-4" />,
    links: [
      { href: "/admin/crm/customers/leads", label: "리드" },
      { href: "/admin/crm/customers/unified", label: "고객 DB" },
      { href: "/admin/crm/customers/accounts", label: "원천 고객" },
      { href: "/admin/crm/activity", label: "활동 기록" },
      { href: "/admin/crm/capture", label: "참석자 입력" },
    ],
  },
  {
    key: "deals",
    title: "매출 · 딜",
    caption: "견적 · 오더 · 시트",
    icon: <CircleDollarSign className="h-4 w-4" />,
    // revenue·partners*는 이미 이 라우트들로 튕기는 legacy redirect 스텁이라 노출하지 않는다(중복 방지).
    links: [
      { href: "/admin/crm/deals", label: "견적·매출" },
      { href: "/admin/crm/deals/orders", label: "오더·설치" },
      { href: "/admin/crm/deals/rev-sheet", label: "매출시트" },
      { href: "/admin/crm/deals/kpi", label: "워크스페이스" },
    ],
  },
  {
    key: "analyze",
    title: "분석",
    caption: "인사이트 · 매칭 · 지사",
    icon: <BarChart3 className="h-4 w-4" />,
    links: [
      { href: "/admin/crm/insights", label: "인사이트 분석" },
      { href: "/admin/crm/matching", label: "데이터 매칭·커버리지" },
      { href: "/admin/branch", label: "KR Team 지사" },
      { href: "/admin/branch/ledger", label: "매출 장부" },
    ],
  },
]

// 홈 히트맵 요약은 KR 전체·연간 누적 기준(월 선택은 period=Y에서 무시됨).
const OVERVIEW_BRANCH_TEAM: Team = "ALL"
const OVERVIEW_BRANCH_PERIOD: Period = "Y"

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

// 운영 OS 요약 스트립 전용 (읽기 전용 합성 데이터)
interface BranchSummaryPayload {
  revenue: { confirmed: number; goal: number; pacing_pct: number }
  monthly_series: {
    goal_cum: number[]
    revenue_cum: number[]
    revenue_trend_cum: number[]
  }
}

interface LeadActionKpisPayload {
  unresponded24hCount: number
}

interface OsSummaryPayload {
  renewal: { expiringSoonCount: number }
  matching: { coveragePct: number; linked: number; total: number; needsReview: number }
  // plannedBoards86: 배송예정(아직 실판매 아님) — 구 캐시 응답에는 없을 수 있어 optional.
  hw: { boards86: number; plannedBoards86?: number; target: number }
  content: { blogPublished: number; target: number }
  events: { count: number; target: number }
}

interface VisitorStatsPayload {
  today: {
    date: string
    homeVisitors: number
    homePageViews: number
  }
  totals: {
    homeVisitors: number
    homePageViews: number
    visitors: number
    pageViews: number
  }
  daily: Array<{
    date: string
    homeVisitors: number
    homePageViews: number
  }>
}

export default function OverviewPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([])
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [integrationStatus, setIntegrationStatus] = useState<AdminIntegrationStatusResponse | null>(null)
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [patchNotes, setPatchNotes] = useState<PatchNote[]>([])
  const [instagramDashboard, setInstagramDashboard] = useState<InstagramOverviewDashboard | null>(null)
  const [branchSummary, setBranchSummary] = useState<BranchSummaryPayload | null>(null)
  const [leadActionKpis, setLeadActionKpis] = useState<LeadActionKpisPayload | null>(null)
  const [osSummary, setOsSummary] = useState<OsSummaryPayload | null>(null)
  const [visitorStats, setVisitorStats] = useState<VisitorStatsPayload | null>(null)
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

      // 운영 OS 요약 스트립도 외부 시트/CRM 합성이라 느릴 수 있으므로
      // 핵심 대시보드와 분리해 비차단으로 로드한다. (읽기 전용)
      void fetchJson<BranchSummaryPayload>("/api/admin/branch/summary?team=ALL&period=Y").then(
        (data) => {
          if (!cancelled) setBranchSummary(data ?? null)
        }
      )
      void fetchJson<{ leads: LeadActionKpisPayload }>("/api/admin/crm/action-kpis").then((data) => {
        if (!cancelled) setLeadActionKpis(data?.leads ?? null)
      })
      void fetchJson<OsSummaryPayload>("/api/admin/os-summary").then((data) => {
        if (!cancelled) setOsSummary(data ?? null)
      })
      void fetchJson<VisitorStatsPayload>("/api/admin/visitor-stats?range=7").then((data) => {
        if (!cancelled) setVisitorStats(data ?? null)
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
        integrationStatusData,
        bugsData,
        patchNotesData,
      ] = await Promise.all([
        fetchJson<{ leads: LeadRecord[] }>("/api/admin/leads?scope=dashboard"),
        fetchJson<{ subscribers: unknown[]; total: number }>("/api/admin/subscribers?count=1"),
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
        // 연동 여부는 GET /api/admin/settings가 webhook URL을 마스킹하므로
        // env+DB 합성 health(integrations/status)를 사용한다. (ops/settings와 동일 소스)
        fetchJson<AdminIntegrationStatusResponse>("/api/admin/settings/integrations/status"),
        fetchJson<BugReport[]>("/api/admin/bugs"),
        fetchJson<PatchNote[]>("/api/admin/patch-notes"),
      ])

      if (cancelled) return

      setLeads(leadsData?.leads ?? [])
      setSubscriberCount(subscribersData?.total ?? 0)
      setBlogPosts(blogData?.posts ?? [])
      setCampaigns(campaignData?.campaigns ?? [])
      setCalendarEvents(calendarData ?? [])
      setIntegrationStatus(integrationStatusData ?? null)
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

  // 리드 파생값을 단일 패스로 집계하고 useMemo로 캐싱한다.
  // (기존엔 렌더마다 status별 filter + 날짜 파싱을 15회+ 반복)
  const leadAgg = useMemo(() => {
    const now = new Date()
    const todayStr = now.toDateString()
    const weekAgo = new Date(now)
    weekAgo.setDate(now.getDate() - 7)
    const twoWeeksAgo = new Date(now)
    twoWeeksAgo.setDate(now.getDate() - 14)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const weekAgoT = weekAgo.getTime()
    const twoWeeksAgoT = twoWeeksAgo.getTime()
    const monthStartT = monthStart.getTime()
    const lastMonthStartT = lastMonthStart.getTime()

    let newLeads = 0
    let contactedLeads = 0
    let converted = 0
    let closedLeads = 0
    let todayLeads = 0
    let thisWeekLeads = 0
    let lastWeekLeads = 0
    let thisMonthLeads = 0
    let lastMonthLeads = 0
    let convertedThisMonth = 0
    let convertedLastMonth = 0
    const sourceMap: Record<string, number> = {}
    const branchMap: Record<string, number> = {}
    const dayCount: Record<string, number> = {}

    for (const l of leads) {
      if (l.status === "new") newLeads++
      else if (l.status === "contacted") contactedLeads++
      else if (l.status === "converted") converted++
      else if (l.status === "closed") closedLeads++

      const t = new Date(l.timestamp).getTime()
      if (!Number.isNaN(t)) {
        const key = new Date(t).toDateString()
        dayCount[key] = (dayCount[key] ?? 0) + 1
        if (key === todayStr) todayLeads++
        if (t >= weekAgoT) thisWeekLeads++
        else if (t >= twoWeeksAgoT) lastWeekLeads++
        if (t >= monthStartT) {
          thisMonthLeads++
          if (l.status === "converted") convertedThisMonth++
        } else if (t >= lastMonthStartT) {
          lastMonthLeads++
          if (l.status === "converted") convertedLastMonth++
        }
      }

      sourceMap[l.source] = (sourceMap[l.source] ?? 0) + 1
      const branch = l.branch?.trim()
      if (branch) branchMap[branch] = (branchMap[branch] ?? 0) + 1
    }

    const total = leads.length
    const pieData = Object.entries(sourceMap).map(([key, value]) => ({
      name: SOURCE_LABEL[key] ?? key,
      value,
    }))
    const recentLeads = [...leads]
      .sort((a, b) => scoreDate(b.timestamp) - scoreDate(a.timestamp))
      .slice(0, 6)
    const topBranch = Object.entries(branchMap).sort((a, b) => b[1] - a[1])[0]

    return {
      total,
      newLeads,
      contactedLeads,
      converted,
      closedLeads,
      activePipelineLeads: newLeads + contactedLeads,
      convRate: total > 0 ? Math.round((converted / total) * 100) : 0,
      todayLeads,
      thisWeekLeads,
      weekTrend: thisWeekLeads - lastWeekLeads,
      thisMonthLeads,
      monthTrend: thisMonthLeads - lastMonthLeads,
      convertedThisMonth,
      convertedTrend: convertedThisMonth - convertedLastMonth,
      pieData,
      recentLeads,
      dayCount,
      topBranch,
    }
  }, [leads])

  const {
    total,
    newLeads,
    contactedLeads,
    converted,
    closedLeads,
    activePipelineLeads,
    convRate,
    todayLeads,
    thisWeekLeads,
    weekTrend,
    thisMonthLeads,
    convertedThisMonth,
    convertedTrend,
    pieData,
    recentLeads,
  } = leadAgg

  const chartData = useMemo(
    () =>
      Array.from({ length: chartRange }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (chartRange - 1 - i))
        return {
          label: `${d.getMonth() + 1}/${d.getDate()}`,
          count: leadAgg.dayCount[d.toDateString()] ?? 0,
        }
      }),
    [leadAgg, chartRange]
  )
  const chartTotal = useMemo(() => chartData.reduce((sum, point) => sum + point.count, 0), [chartData])

  // 지사 히트맵 요약용 월 키(period=Y에선 무시되지만 프롭 계약상 유효한 값 전달).
  const overviewMonthKey = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }, [])

  const {
    publishedBlogPosts,
    ctaCoverage,
    recentPosts,
    publishedPostsWithoutCta,
  } = useMemo(() => {
    const draftBlogPosts = blogPosts.filter((post) => post.status === "draft").length
    const publishedBlogPosts = blogPosts.filter((post) => post.status === "published")
    const publishedPostsWithCta = publishedBlogPosts.filter((post) => {
      const cta = post.cta
      return Boolean(cta?.title?.trim() && cta?.buttonLabel?.trim() && cta?.buttonHref?.trim())
    }).length
    const ctaCoverage =
      publishedBlogPosts.length > 0 ? Math.round((publishedPostsWithCta / publishedBlogPosts.length) * 100) : 0
    const recentPosts = [...blogPosts]
      .sort((a, b) => scoreDate(b.updatedAt ?? b.publishedAt) - scoreDate(a.updatedAt ?? a.publishedAt))
      .slice(0, 4)
    return {
      draftBlogPosts,
      publishedBlogPosts,
      ctaCoverage,
      recentPosts,
      publishedPostsWithoutCta: Math.max(0, publishedBlogPosts.length - publishedPostsWithCta),
    }
  }, [blogPosts])

  const { recentCampaigns, draftCampaigns, sentCampaigns, latestFailedCampaign } = useMemo(() => {
    const recentCampaigns = [...campaigns]
      .sort((a, b) => scoreDate(b.sentAt ?? b.createdAt) - scoreDate(a.sentAt ?? a.createdAt))
      .slice(0, 4)
    const failedCampaigns = [...campaigns]
      .filter((campaign) => campaign.status === "failed")
      .sort((a, b) => scoreDate(b.sentAt ?? b.createdAt) - scoreDate(a.sentAt ?? a.createdAt))
    return {
      recentCampaigns,
      failedCampaigns,
      draftCampaigns: campaigns.filter((campaign) => campaign.status === "draft"),
      sentCampaigns: campaigns.filter((campaign) => campaign.status === "sent"),
      latestFailedCampaign: failedCampaigns[0],
    }
  }, [campaigns])

  const { upcomingEvents, nextUpcomingEvent } = useMemo(() => {
    const upcomingEvents = [...calendarEvents]
      .filter((event) => isWithinNextDays(event.date, 7))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
      .slice(0, 5)
    const assigneeMap = upcomingEvents.reduce<Record<string, number>>((acc, event) => {
      event.assignees?.forEach((assignee) => {
        acc[assignee] = (acc[assignee] ?? 0) + 1
      })
      return acc
    }, {})
    return {
      upcomingEvents,
      activeAssigneeCount: Object.keys(assigneeMap).length,
      unassignedEventCount: upcomingEvents.filter((event) => !event.assignees?.length).length,
      busiestAssignee: Object.entries(assigneeMap).sort((a, b) => b[1] - a[1])[0],
      nextUpcomingEvent: upcomingEvents[0],
    }
  }, [calendarEvents])

  const { openBugs, criticalOpenBugs } = useMemo(() => {
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
    return {
      openBugs,
      criticalOpenBugs: openBugs.filter((bug) => bug.severity === "critical" || bug.severity === "high"),
    }
  }, [bugs])

  const latestPatchNote = useMemo(
    () => [...patchNotes].sort((a, b) => scoreDate(b.date) - scoreDate(a.date))[0],
    [patchNotes]
  )

  const instagramViews = instagramDashboard?.summary.totalViews ?? 0
  const instagramMediaCount = instagramDashboard?.summary.mediaCount ?? 0
  const instagramAverageViews = instagramDashboard?.summary.averageViews ?? 0
  const visitorTodayIndex =
    visitorStats?.daily.findIndex((day) => day.date === visitorStats.today.date) ?? -1
  const visitorYesterday =
    visitorStats && visitorTodayIndex > 0 ? visitorStats.daily[visitorTodayIndex - 1] : null
  const homeVisitorTrend = visitorStats
    ? visitorStats.today.homeVisitors - (visitorYesterday?.homeVisitors ?? 0)
    : 0

  // 연동 상태 카드 — integrations/status 항목 중 외부 전송 경로 4종만 노출한다.
  const connections = (
    [
      { key: "lead_webhooks", fallbackLabel: "Lead Webhooks", description: "리드를 시트·외부 자동화로 전송" },
      { key: "channel_talk", fallbackLabel: "Channel Talk", description: "상담 인박스로 전달" },
      { key: "email_provider", fallbackLabel: "Email", description: "캠페인 발송 연동" },
      { key: "notifications", fallbackLabel: "Notifications", description: "운영 알림(WeCom·알림톡) 전송" },
    ] as const
  ).map(({ key, fallbackLabel, description }) => {
    const item = integrationStatus?.items.find((entry) => entry.key === key)
    return {
      label: item?.label ?? fallbackLabel,
      description,
      connected: item?.configured ?? false,
      href: item?.adminHref ?? "/admin/settings?tab=integrations",
    }
  })

  // 세일즈 퍼널 시각화용 단계 (MiniFunnel).
  const funnelStages: FunnelStage[] = [
    { label: STATUS_LABEL.new, value: newLeads, tone: newLeads > 0 ? "caution" : "brand", href: "/admin/crm" },
    { label: STATUS_LABEL.contacted, value: contactedLeads, href: "/admin/crm" },
    { label: STATUS_LABEL.converted, value: converted, href: "/admin/crm" },
    { label: STATUS_LABEL.closed, value: closedLeads, tone: "neutral", href: "/admin/crm" },
  ]

  // 상태 응답이 없을 때(로딩/실패)는 미연결로 단정하지 않는다. (상시 오탐 방지)
  const missingConnections = integrationStatus
    ? connections.filter((connection) => !connection.connected)
    : []
  const missingConnectionLabels = missingConnections.map((connection) => connection.label)
  const missingConnectionSummary =
    missingConnectionLabels.length > 2
      ? `${missingConnectionLabels.slice(0, 2).join(", ")} 외 ${missingConnectionLabels.length - 2}개`
      : missingConnectionLabels.join(", ")
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
          href: "/admin/settings?tab=integrations",
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

  // REV 장부 금액은 전부 위안화 — CRM CurrencyChip 아이디엄(기호+통화 병기)대로 ¥를 붙여 합산 오독을 막는다.
  const fmtCny = (value: number) => `¥${COMPACT_NUMBER.format(value)}`

  // KPI 카드 스파크라인 데이터.
  const sparkLeads = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (13 - i))
    return leadAgg.dayCount[d.toDateString()] ?? 0
  })
  const sparkRevenue = branchSummary?.monthly_series.revenue_cum ?? []
  const sparkVisitors = visitorStats?.daily.map((day) => day.homeVisitors) ?? []

  const pipelineCoverage = (() => {
    const series = branchSummary?.monthly_series
    if (!series) return null
    const last = (arr: number[] | undefined) => (arr && arr.length > 0 ? arr[arr.length - 1] : 0)
    const confirmed = last(series.revenue_cum)
    const pipelineTotal = last(series.revenue_trend_cum) - confirmed
    const remaining = last(series.goal_cum) - confirmed
    return remaining > 0 ? pipelineTotal / remaining : null
  })()

  const osLeadUnresponded24h = leadActionKpis?.unresponded24hCount ?? null
  const osMatchingCoverage = osSummary?.matching.coveragePct ?? null

  return (
    <div className="relative overflow-hidden px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 lg:pb-20">
      {/* 헤더 */}
      <div className="relative mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin</p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">Overview</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
            세일즈 파이프라인, 오늘의 주의 신호, 트래픽과 매출 흐름을 한 화면에서 점검하는 운영 허브입니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { href: "/admin/crm", label: "문의 관리" },
            { href: "/admin/campaigns", label: "캠페인" },
            { href: "/admin/settings", label: "설정" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#1a1a1a]/70 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
            >
              {link.label}
              <ChevronRight className="h-3 w-3" />
            </a>
          ))}
        </div>
      </div>

      {/* (a) 커맨드 바 — 핵심 KPI + 스파크라인 */}
      <section className="relative mb-6 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-[#111110]">핵심 지표</h2>
          <span className="text-[11px] text-[#1a1a1a]/45">오늘 운영 상태를 한눈에</span>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <KpiSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="세일즈 파이프라인"
              value={activePipelineLeads}
              sub={`신규 ${newLeads} · 연락중 ${contactedLeads}`}
              tone={newLeads > 0 ? "caution" : "brand"}
              sparkline={<Sparkline data={sparkLeads} tone={newLeads > 0 ? "caution" : "brand"} />}
              href="/admin/crm"
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="이번 주 유입"
              value={thisWeekLeads}
              sub={`오늘 +${todayLeads} · 이번 달 ${thisMonthLeads}`}
              trend={{ value: weekTrend, label: "지난주 대비" }}
              sparkline={<Sparkline data={sparkLeads.slice(7)} />}
              href="/admin/crm"
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="전환율"
              value={`${convRate}%`}
              sub={`전환 ${converted}건 · 이번 달 ${convertedThisMonth}건`}
              trend={{ value: convertedTrend, label: "지난달 대비" }}
              tone="brand"
              href="/admin/crm"
            />
            <StatCard
              icon={<Eye className="h-4 w-4" />}
              label="오늘 홈 방문자"
              value={visitorStats ? visitorStats.today.homeVisitors : "…"}
              sub={
                visitorStats
                  ? `7일 ${visitorStats.totals.homeVisitors}명 · PV ${visitorStats.today.homePageViews}`
                  : "동의 기반 집계"
              }
              trend={visitorStats ? { value: homeVisitorTrend, label: "전일 대비" } : undefined}
              tone="brand"
              sparkline={sparkVisitors.length ? <Sparkline data={sparkVisitors} /> : undefined}
              href="/admin/traffic"
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="매출 페이싱(연)"
              value={branchSummary ? `${Math.round(branchSummary.revenue.pacing_pct)}%` : "…"}
              sub={
                branchSummary
                  ? `확정 ${fmtCny(branchSummary.revenue.confirmed)} / 목표 ${fmtCny(branchSummary.revenue.goal)} · CNY`
                  : "불러오는 중"
              }
              tone="brand"
              sparkline={sparkRevenue.length ? <Sparkline data={sparkRevenue} /> : undefined}
              href="/admin/branch/ledger"
            />
          </div>
        )}
      </section>

      {/* (a') 운영 OS — 보조 지표 (demote) */}
      <section className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[#1a1a1a]/70">운영 OS</h2>
          <span className="rounded-full border border-[#D1FAE5] bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-medium text-[#084734]">
            베타
          </span>
          <span className="rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/40">
            읽기 전용
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard
            icon={<AlertCircle className="h-4 w-4" />}
            label="골든타임 24h"
            value={osLeadUnresponded24h != null ? `${osLeadUnresponded24h}건` : "…"}
            sub="24h 미응답 인바운드"
            tone={osLeadUnresponded24h && osLeadUnresponded24h > 0 ? "danger" : "brand"}
            href="/admin/crm"
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="파이프 커버리지"
            value={!branchSummary ? "…" : pipelineCoverage != null ? `${pipelineCoverage.toFixed(1)}x` : "—"}
            sub="예상 파이프 ÷ 잔여목표 (≥2.0x 권장)"
            tone={pipelineCoverage != null && pipelineCoverage < 2.0 ? "danger" : "brand"}
            href="/admin/branch/ledger"
          />
          <StatCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="리뉴얼 D-90"
            value={osSummary ? `${osSummary.renewal.expiringSoonCount}건` : "…"}
            sub="만료 임박 (선제 대응)"
            tone="brand"
            href="/admin/crm/customers/accounts"
          />
          <StatCard
            icon={<Link2 className="h-4 w-4" />}
            label="매칭 커버리지"
            value={osMatchingCoverage != null ? `${osMatchingCoverage}%` : "…"}
            sub={
              osSummary
                ? `연결 ${osSummary.matching.linked}/${osSummary.matching.total} · 검토 ${osSummary.matching.needsReview}`
                : "불러오는 중"
            }
            tone={osMatchingCoverage != null && osMatchingCoverage < 80 ? "caution" : "brand"}
            href="/admin/crm/matching"
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="진척(HW/콘텐츠/행사)"
            value={osSummary ? `${osSummary.hw.boards86}/${osSummary.hw.target}` : "…"}
            sub={
              osSummary
                ? [
                    // boards86은 실판매만 집계 — 배송예정분은 별도 캡션으로 병기(구 캐시엔 필드 없음).
                    (osSummary.hw.plannedBoards86 ?? 0) > 0 ? `배송예정 ${osSummary.hw.plannedBoards86}대` : null,
                    `블로그 ${osSummary.content.blogPublished}/${osSummary.content.target} · 행사 ${osSummary.events.count}/${osSummary.events.target}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "불러오는 중"
            }
            tone="neutral"
            href="/admin/hardware"
          />
        </div>
      </section>

      {/* (b) 오늘 할 일 / 주의 신호 — 배너·시그널칩·리스크 통합 */}
      <div className="mb-6">
        <SectionCard
          title="오늘 할 일 / 주의 신호"
          description="문의·캠페인·연동·일정·배포 신호를 우선순위로 모았습니다. 클릭하면 상세로 이동."
          action={
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusToneClasses(
                actionableOperationalAlertCount > 0 ? "warning" : operationalAlerts.length > 0 ? "info" : "success"
              )}`}
            >
              {actionableOperationalAlertCount > 0
                ? `주의 ${actionableOperationalAlertCount}`
                : operationalAlerts.length > 0
                  ? `최근 ${operationalAlerts.length}`
                  : "정상"}
            </span>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : operationalAlerts.length === 0 ? (
            <EmptyState
              title="지금은 운영 주의 신호가 없습니다."
              description="문의, 캠페인, 연동, 일정, 배포 변경이 안정 상태면 이 영역은 비어 있습니다."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {operationalAlerts.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                >
                  <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border ${statusToneClasses(item.tone)}`}>
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusToneClasses(item.tone)}`}>
                        {item.scope}
                      </span>
                      <span className="text-[11px] text-[#1a1a1a]/35">{item.meta}</span>
                    </div>
                    <p className="mt-1 truncate text-[13px] font-semibold text-[#111110]">{item.title}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/40">{item.description}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#1a1a1a]/35 group-hover:text-[#111110]">
                    {item.action}
                    <ChevronRight className="h-3 w-3" />
                  </span>
                </a>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* 핵심 KPI는 상단 커맨드 바로, 신규 리드 배너·시그널칩은 주의 신호 피드로 통합됨 */}

      {/* CRM · 운영 라우트 런처 — 근간 라우트를 링별(작업대·매출·분석·파트너)로 홈에서 직접 진입 */}
      <div className="mb-6">
        <SectionCard
          title="CRM · 운영 라우트"
          description="리드부터 매출·분석·파트너까지 CRM 근간 라우트를 한곳에서 진입합니다."
          action={
            <a href="/admin/crm" className="flex items-center gap-1 text-[12px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]">
              CRM 홈 <ArrowUpRight className="h-3 w-3" />
            </a>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {CRM_ROUTE_GROUPS.map((group) => (
              <div key={group.key} className="rounded-xl border border-[#e8e8e4] bg-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0f0ec] text-[#1a1a1a]/55">
                    {group.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#111110]">{group.title}</p>
                    <p className="truncate text-[11px] text-[#1a1a1a]/40">{group.caption}</p>
                  </div>
                </div>
                <div className="flex flex-col">
                  {group.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-[#1a1a1a]/70 transition-colors hover:bg-[#fafaf8] hover:text-[#111110]"
                    >
                      {link.label}
                      <ChevronRight className="h-3.5 w-3.5 text-[#1a1a1a]/25 group-hover:text-[#111110]" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 shadow-[0_1px_0_rgba(17,17,16,0.02)] sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[14px] font-semibold text-[#111110]">문의 유입 추이</p>
              <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">
                최근 {chartRange}일 · 문의 접수 {chartTotal}건
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
              <p className="text-[13px] font-medium text-[#1a1a1a]/50">최근 {chartRange}일 문의 유입이 없습니다</p>
              <p className="mt-1 text-[11px] text-[#1a1a1a]/35">문의가 들어오면 일별 추이가 표시됩니다.</p>
            </div>
          ) : (
            <LeadTrendChart data={chartData} range={chartRange} />
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
              <SourcePie data={pieData} colors={SOURCE_PALETTE} />
              <div className="space-y-1.5 mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SOURCE_PALETTE[i % SOURCE_PALETTE.length] }} />
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
              <div className="border-b border-[#e8e8e4] bg-[#fafaf8] p-4 sm:px-6">
                <MiniFunnel stages={funnelStages} />
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

      {/* 지사 · 지역 히트맵 + 고객 건강도 — 지사 탭에 갇힌 시각화를 홈 요약(Command 링)으로 복원 */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white shadow-[0_1px_0_rgba(17,17,16,0.02)]">
          <div className="flex items-center justify-between gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#084734]" />
              <div>
                <h2 className="text-[14px] font-semibold text-[#111110]">지사 · 지역별 매출 히트맵</h2>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">KR 지역별 매출·달성률 분포 · 연간 누적</p>
              </div>
            </div>
            <a href="/admin/branch" className="flex items-center gap-1 text-[12px] text-[#1a1a1a]/40 transition-colors hover:text-[#111110]">
              지사 대시보드 <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
          <div className="p-3 sm:p-4">
            <BranchRegionHeatmap
              team={OVERVIEW_BRANCH_TEAM}
              period={OVERVIEW_BRANCH_PERIOD}
              selectedMonth={overviewMonthKey}
              refreshKey={0}
            />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {/* 고객 건강도 도넛 — 데이터 없으면 컴포넌트가 자동 숨김(가짜 분포 금지) */}
          <CrmHealthDonut variant="summary" />
        </div>
      </div>

      {/* (e) 드릴다운 그리드 — 일정 / 콘텐츠 / 캠페인 */}
      <div className="grid grid-cols-1 gap-6 mt-6 xl:grid-cols-3">
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

      {/* 연동 상태 + 채널 지표 */}
      <div className="grid grid-cols-1 gap-6 mt-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SectionCard
          title="연동 상태"
          description="외부 전송 경로(리드 Webhook·채널톡·이메일·알림)를 점검합니다."
          action={
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusToneClasses(
                missingConnections.length > 0 ? "warning" : "success"
              )}`}
            >
              {missingConnections.length > 0 ? `미연결 ${missingConnections.length}` : "연결됨"}
            </span>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {connections.map((connection) => {
                const connected = connection.connected
                return (
                  <a
                    key={connection.label}
                    href={connection.href}
                    className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                  >
                    <div
                      className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border ${
                        connected ? "border-green-100 bg-green-50 text-green-700" : "border-amber-100 bg-amber-50 text-amber-700"
                      }`}
                    >
                      <Link2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-[#111110]">{connection.label}</p>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                            connected ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {connected ? "연결됨" : "설정 필요"}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] text-[#1a1a1a]/40">{connection.description}</p>
                    </div>
                  </a>
                )
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="채널 지표" description="구독자·소셜·콘텐츠 요약.">
          {loading ? (
            <SectionSkeleton rows={3} />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              <StatCard
                icon={<Mail className="h-4 w-4" />}
                label="구독자"
                value={subscriberCount}
                sub="활성 구독자"
                tone="brand"
                href="/admin/campaigns"
              />
              <StatCard
                icon={<Eye className="h-4 w-4" />}
                label="인스타 조회수"
                value={instagramDashboard ? COMPACT_NUMBER.format(instagramViews) : "연결 필요"}
                sub={
                  instagramDashboard
                    ? `최근 ${instagramMediaCount}개 · 평균 ${COMPACT_NUMBER.format(instagramAverageViews)}`
                    : "콘텐츠 탭에서 확인"
                }
                tone={instagramDashboard ? "danger" : "neutral"}
              />
              <StatCard
                icon={<FileText className="h-4 w-4" />}
                label="블로그"
                value={blogPosts.length}
                sub="발행된 포스트"
                tone="neutral"
                href="/admin/blog"
              />
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

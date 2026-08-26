"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  Users,
  TrendingUp,
  CheckCircle2,
  Mail,
  FileText,
  Eye,
  AlertCircle,
  ArrowUpRight,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Inbox,
  Link2,
  Send,
  ShieldAlert,
} from "lucide-react"
import { adminFetchJsonCached } from "@/lib/admin-client"
import { StatCard } from "@/components/admin/StatCard"
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
// 파생 로직(신호 판정·집계·우선순위)은 전부 insights 순수 모듈 소유 — 이 컴포넌트는 주입+렌더만.
import {
  aggregateLeads,
  buildOperationalAlerts,
  computePipelineCoverage,
  deriveBlogInsights,
  deriveBugInsights,
  deriveCampaignInsights,
  deriveConnections,
  deriveEventInsights,
  deriveLatestPatchNote,
  formatDateShort,
  formatDateTime,
  resolveUnrespondedSignal,
  SOURCE_LABEL,
  type BranchMonthlySeries,
  type OverviewSignalTone,
} from "@/lib/admin/overview/insights"
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

function statusToneClasses(tone: OverviewSignalTone) {
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
// SOURCE_LABEL은 insights 모듈로 이관(pieData 집계와 렌더가 같은 라벨을 공유).
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

// KPI 스트립 공통 레이아웃 — 모바일은 가로 스냅 스크롤(2+2+1 고아 행 제거), md+는 그리드.
// Tailwind grid-cols-*는 minmax(0,1fr)라 min-w-0 규약을 만족한다(우측 삐져나옴 방지).
const KPI_STRIP_CLASS =
  "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 md:grid md:snap-none md:grid-cols-3 md:overflow-visible md:pb-0 xl:grid-cols-5"
// 타일 래퍼 — 모바일은 스냅 카드 폭 고정, md+는 그리드 아이템. 내부 카드/스켈레톤은 높이를 채운다.
const KPI_TILE_CLASS =
  "w-[76vw] min-w-[220px] max-w-[280px] shrink-0 snap-start md:w-auto md:min-w-0 md:max-w-none [&>*]:h-full"
// 인바운드 요약 스트립 — 3타일 전용(KPI_STRIP_CLASS는 5열 고정이라 재사용 불가).
const INBOUND_STRIP_CLASS =
  "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 md:grid md:snap-none md:grid-cols-3 md:overflow-visible md:pb-0"

// 챗봇 stats 응답의 from 파라미터용 로컬 날짜(YYYY-MM-DD).
function localDateOnly(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
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
  monthly_series: BranchMonthlySeries
}

// 미응답 정의의 캐논 원천(action-kpis → getLeadActionStats). 타일·주의신호가 같은 수를 쓴다.
interface LeadActionKpisPayload {
  unrespondedCount: number
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

// 인바운드 요약 스트립 전용 — /api/admin/chatbot/stats 응답 중 totals만 소비한다.
interface ChatbotStatsPayload {
  totals: {
    questionCount: number
    unresolvedCount: number
    handoffCount: number
    directAnswerCount: number
  }
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
  const [chatbotStats, setChatbotStats] = useState<ChatbotStatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartRange, setChartRange] = useState<7 | 30>(7)
  const [alertsExpanded, setAlertsExpanded] = useState(false)

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
      // 챗봇 문의 요약 — 무파라미터 stats URL(사이드바 warmup 캐시 키)은 기본 30일 창이라
      // 인바운드 스트립의 7일 창과 어긋난다 → from을 명시해 별도 키로 조회한다(오늘 포함 7일).
      const chatbotFrom = new Date()
      chatbotFrom.setDate(chatbotFrom.getDate() - 6)
      void fetchJson<ChatbotStatsPayload>(
        `/api/admin/chatbot/stats?from=${localDateOnly(chatbotFrom)}`
      ).then((data) => {
        if (!cancelled) setChatbotStats(data ?? null)
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

  // 리드 파생값(확인 게이트 포함)은 insights.aggregateLeads가 단일 패스로 집계한다.
  const leadAgg = useMemo(() => aggregateLeads(leads), [leads])

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
    contactPageToday,
    contactPageThisWeek,
    contactPageTotal,
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

  const { publishedBlogPosts, ctaCoverage, recentPosts, publishedPostsWithoutCta } = useMemo(
    () => deriveBlogInsights(blogPosts),
    [blogPosts]
  )

  const { recentCampaigns, draftCampaigns, sentCampaigns, latestFailedCampaign } = useMemo(
    () => deriveCampaignInsights(campaigns),
    [campaigns]
  )

  const { upcomingEvents, nextUpcomingEvent } = useMemo(
    () => deriveEventInsights(calendarEvents),
    [calendarEvents]
  )

  const { openBugs, criticalOpenBugs } = useMemo(() => deriveBugInsights(bugs), [bugs])

  const latestPatchNote = useMemo(() => deriveLatestPatchNote(patchNotes), [patchNotes])

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

  // 연동 상태 카드 — 외부 전송 경로 4종. 미연결 판정은 insights.deriveConnections 소유(오탐 방지 규칙 포함).
  const { connections, missingConnections } = deriveConnections(integrationStatus)

  // 세일즈 퍼널 시각화용 단계 (MiniFunnel) — 각 단계는 해당 필터가 켜진 리드 보드로 착지한다.
  const funnelStages: FunnelStage[] = [
    { label: STATUS_LABEL.new, value: newLeads, tone: newLeads > 0 ? "caution" : "brand", href: "/admin/crm/customers/leads?filter=new" },
    { label: STATUS_LABEL.contacted, value: contactedLeads, href: "/admin/crm/customers/leads?filter=contacted" },
    { label: STATUS_LABEL.converted, value: converted, href: "/admin/crm/customers/leads?filter=converted" },
    { label: STATUS_LABEL.closed, value: closedLeads, tone: "neutral", href: "/admin/crm/customers/leads?filter=closed" },
  ]

  // '미응답' 수치는 이 화면 전체에서 resolveUnrespondedSignal 하나로만 산출한다(단일 정의·단일 수치).
  // 캐논 원천은 action-kpis 라우트 — 도착 전이나 실패 시에만 같은 정의로 리드 목록에서 파생한다.
  const unrespondedSignal = useMemo(
    () => resolveUnrespondedSignal(leadActionKpis, loading ? null : leads),
    [leadActionKpis, loading, leads]
  )

  // 오늘 할 일 / 주의 신호 — 우선순위·tone·임계값 판정은 insights.buildOperationalAlerts 소유.
  const { alerts: operationalAlerts, actionableAlertCount: actionableOperationalAlertCount } =
    buildOperationalAlerts({
      unrespondedCount: unrespondedSignal?.unrespondedCount ?? 0,
      unresponded24hCount: unrespondedSignal?.unresponded24hCount ?? 0,
      todayLeads,
      thisWeekLeads,
      latestFailedCampaign,
      missingConnectionLabels: missingConnections.map((connection) => connection.label),
      openBugs,
      criticalOpenBugs,
      publishedBlogPostCount: publishedBlogPosts.length,
      publishedPostsWithoutCta,
      ctaCoverage,
      draftCampaignCount: draftCampaigns.length,
      sentCampaignCount: sentCampaigns.length,
      nextUpcomingEvent,
      latestPatchNote,
    })

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

  const pipelineCoverage = computePipelineCoverage(branchSummary?.monthly_series)

  return (
    <div className="relative overflow-hidden px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 lg:pb-20">
      {/* 헤더 */}
      <div className="relative mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin</p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">Overview</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
            골든타임·커버리지·리뉴얼 신호와 오늘의 주의 신호, 트래픽·매출 흐름을 한 화면에서 점검하는 운영 허브입니다.
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

      {/* 인바운드 요약 — 홈페이지 방문·문의(contact)·챗봇 질문을 최상단에 고정한다
          ('관망 지표 하강 배치' 규칙의 명시적 예외). 세 타일 모두 '최근 7일' 단일 창. */}
      <section className="relative mb-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[#1a1a1a]/70">인바운드 요약</h2>
          <span className="text-[11px] text-[#1a1a1a]/40">최근 7일 · 홈페이지 방문 · 문의 · 챗봇</span>
        </div>
        <div className={INBOUND_STRIP_CLASS}>
          <div className={KPI_TILE_CLASS}>
            {visitorStats ? (
              <StatCard
                icon={<Eye className="h-4 w-4" />}
                label="홈페이지 방문"
                value={`${visitorStats.totals.homeVisitors.toLocaleString("ko-KR")}명`}
                sub={`오늘 ${visitorStats.today.homeVisitors} · PV ${visitorStats.totals.homePageViews.toLocaleString("ko-KR")} · 동의 기반`}
                tone="neutral"
                sparkline={sparkVisitors.length ? <Sparkline data={sparkVisitors} /> : undefined}
                href="/admin/traffic"
              />
            ) : (
              <KpiSkeleton />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {loading ? (
              <KpiSkeleton />
            ) : (
              <StatCard
                icon={<Inbox className="h-4 w-4" />}
                label="홈페이지 문의"
                value={`${contactPageThisWeek}건`}
                sub={`오늘 ${contactPageToday} · 누적 ${contactPageTotal} · contact 폼`}
                tone="neutral"
                href="/admin/crm/customers/leads?source=contact_page"
              />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {chatbotStats ? (
              <StatCard
                icon={<Bot className="h-4 w-4" />}
                label="챗봇 문의"
                value={`${chatbotStats.totals.questionCount.toLocaleString("ko-KR")}건`}
                sub={`미해결 ${chatbotStats.totals.unresolvedCount} · 상담연결 ${chatbotStats.totals.handoffCount}`}
                tone="neutral"
                href="/admin/chatbot"
              />
            ) : (
              <KpiSkeleton />
            )}
          </div>
        </div>
      </section>

      {/* (a) 운영 OS 커맨드 바 — 이 표면의 존재 이유. 신호는 필터드 딥링크로 행동에 직결한다.
          콜드로드: 각 타일은 자기 원천(fetch)이 null이면 '…' 대신 레이아웃 일치 KpiSkeleton을 렌더한다. */}
      <section className="relative mb-6 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-[#111110]">운영 OS</h2>
          <span className="text-[11px] text-[#1a1a1a]/45">지금 잡아야 할 신호 · 읽기 전용</span>
        </div>
        <div className={`${KPI_STRIP_CLASS} -mx-4 px-4 sm:-mx-5 sm:px-5 md:mx-0 md:px-0`}>
          <div className={KPI_TILE_CLASS}>
            {unrespondedSignal ? (
              <StatCard
                icon={<AlertCircle className="h-4 w-4" />}
                label="골든타임 24h"
                value={`${unrespondedSignal.unresponded24hCount}건`}
                // 산정 기준 캡션 — 주의신호 카드와 동일 어휘·동일 기준(미응답 리드=데모·문의·Meta 신규).
                sub="24h+ 미응답 리드 · 데모·문의·Meta 신규"
                tone={unrespondedSignal.unresponded24hCount > 0 ? "danger" : "neutral"}
                href="/admin/crm/customers/leads?filter=unresponded&focus=risk"
              />
            ) : (
              <KpiSkeleton />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {branchSummary ? (
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="파이프 커버리지"
                value={pipelineCoverage != null ? `${pipelineCoverage.toFixed(1)}x` : "—"}
                sub="예상 파이프 ÷ 잔여목표 (≥2.0x 권장)"
                tone={pipelineCoverage != null && pipelineCoverage < 2.0 ? "danger" : "neutral"}
                href="/admin/branch/ledger"
              />
            ) : (
              <KpiSkeleton />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {osSummary ? (
              <StatCard
                icon={<CalendarDays className="h-4 w-4" />}
                // 원천 임계값이 60일(crm-neo-customer-snapshots)이므로 라벨도 D-60로 고정한다.
                label="리뉴얼 D-60"
                value={`${osSummary.renewal.expiringSoonCount}건`}
                sub="60일 이내 만료 · 선제 대응"
                tone={osSummary.renewal.expiringSoonCount > 0 ? "caution" : "neutral"}
                href="/admin/crm/customers/accounts?expiring=1"
              />
            ) : (
              <KpiSkeleton />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {osSummary ? (
              <StatCard
                icon={<Link2 className="h-4 w-4" />}
                label="매칭 커버리지"
                value={`${osSummary.matching.coveragePct}%`}
                sub={`연결 ${osSummary.matching.linked}/${osSummary.matching.total} · 검토 ${osSummary.matching.needsReview}`}
                tone={osSummary.matching.coveragePct < 80 ? "caution" : "neutral"}
                href="/admin/crm/matching"
              />
            ) : (
              <KpiSkeleton />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {osSummary ? (
              <StatCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="진척 · HW"
                value={`${osSummary.hw.boards86}/${osSummary.hw.target}`}
                sub={
                  // boards86은 실판매만 집계 — 배송예정분은 별도 캡션으로 병기(구 캐시엔 필드 없음).
                  (osSummary.hw.plannedBoards86 ?? 0) > 0
                    ? `86보드 실판매 기준 · 배송예정 ${osSummary.hw.plannedBoards86}대`
                    : "86보드 실판매 기준"
                }
                tone="neutral"
                href="/admin/hardware"
              />
            ) : (
              <KpiSkeleton />
            )}
          </div>
        </div>
        {/* 진척 세부(콘텐츠·행사)는 타일에서 분리해 도메인별 딥링크로 제공한다. */}
        {osSummary ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[rgba(0,0,0,0.08)] pt-3 text-[11px] text-[#1a1a1a]/45">
            <span className="text-[#1a1a1a]/35">진척 상세</span>
            <Link
              href="/admin/blog"
              className="inline-flex items-center gap-1 font-medium transition-colors hover:text-[#111110]"
            >
              블로그 {osSummary.content.blogPublished}/{osSummary.content.target}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <Link
              href="/admin/events"
              className="inline-flex items-center gap-1 font-medium transition-colors hover:text-[#111110]"
            >
              행사 {osSummary.events.count}/{osSummary.events.target}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        ) : null}
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
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {(alertsExpanded ? operationalAlerts : operationalAlerts.slice(0, 6)).map((item) => (
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
              {operationalAlerts.length > 6 ? (
                <button
                  type="button"
                  onClick={() => setAlertsExpanded((prev) => !prev)}
                  className="mt-3 flex w-full items-center justify-center gap-1 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
                >
                  {alertsExpanded ? "접기" : `더보기 (${operationalAlerts.length - 6})`}
                  {alertsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              ) : null}
            </>
          )}
        </SectionCard>
      </div>

      {/* (c) 흐름 지표 — 관망 지표는 신호 아래로 하강 배치. 정상 상태는 중립 톤(신호색 예산제). */}
      <section className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[#1a1a1a]/70">흐름 지표</h2>
          <span className="text-[11px] text-[#1a1a1a]/40">리드 유입 · 전환 · 방문자 · 매출 페이싱</span>
        </div>
        {loading ? (
          <div className={KPI_STRIP_CLASS}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={KPI_TILE_CLASS}>
                <KpiSkeleton />
              </div>
            ))}
          </div>
        ) : (
          <div className={KPI_STRIP_CLASS}>
            <div className={KPI_TILE_CLASS}>
              <StatCard
                icon={<Users className="h-4 w-4" />}
                label="세일즈 파이프라인"
                value={activePipelineLeads}
                sub={`신규 ${newLeads} · 연락중 ${contactedLeads}`}
                tone={newLeads > 0 ? "caution" : "neutral"}
                sparkline={<Sparkline data={sparkLeads} tone={newLeads > 0 ? "caution" : "brand"} />}
                href="/admin/crm/customers/leads"
              />
            </div>
            <div className={KPI_TILE_CLASS}>
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="이번 주 유입"
                value={thisWeekLeads}
                sub={`오늘 +${todayLeads} · 이번 달 ${thisMonthLeads}`}
                trend={{ value: weekTrend, label: "지난주 대비" }}
                sparkline={<Sparkline data={sparkLeads.slice(7)} />}
                href="/admin/crm/customers/leads"
              />
            </div>
            <div className={KPI_TILE_CLASS}>
              <StatCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="전환율"
                value={`${convRate}%`}
                sub={`전환 ${converted}건 · 이번 달 ${convertedThisMonth}건`}
                trend={{ value: convertedTrend, label: "지난달 대비" }}
                href="/admin/crm/customers/leads?filter=converted"
              />
            </div>
            <div className={KPI_TILE_CLASS}>
              {visitorStats ? (
                <StatCard
                  icon={<Eye className="h-4 w-4" />}
                  label="오늘 홈 방문자"
                  value={visitorStats.today.homeVisitors}
                  sub={`7일 ${visitorStats.totals.homeVisitors}명 · PV ${visitorStats.today.homePageViews} · 동의 기반`}
                  trend={{ value: homeVisitorTrend, label: "전일 대비" }}
                  sparkline={sparkVisitors.length ? <Sparkline data={sparkVisitors} /> : undefined}
                  href="/admin/traffic"
                />
              ) : (
                <KpiSkeleton />
              )}
            </div>
            <div className={KPI_TILE_CLASS}>
              {branchSummary ? (
                <StatCard
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="매출 페이싱(연)"
                  value={`${Math.round(branchSummary.revenue.pacing_pct)}%`}
                  sub={`확정 ${fmtCny(branchSummary.revenue.confirmed)} / 목표 ${fmtCny(branchSummary.revenue.goal)} · CNY`}
                  sparkline={sparkRevenue.length ? <Sparkline data={sparkRevenue} /> : undefined}
                  href="/admin/branch/ledger"
                />
              ) : (
                <KpiSkeleton />
              )}
            </div>
          </div>
        )}
      </section>

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
          <Link href="/admin/crm/customers/leads" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
            전체 보기 <ArrowUpRight className="w-3 h-3" />
          </Link>
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
                  <li key={lead.id} className="border-b border-[#e8e8e4] last:border-0">
                    <Link
                      href={`/admin/crm/customers/leads?lead=${lead.id}`}
                      className="group flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-[#fafaf8] sm:flex-row sm:items-center sm:gap-4 sm:px-6"
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
                        <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25 transition-transform group-hover:translate-x-0.5 sm:block" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
        )}
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
                tone="neutral"
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
                tone="neutral"
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

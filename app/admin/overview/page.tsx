"use client"

import { useEffect, useState } from "react"
import {
  Users,
  TrendingUp,
  CheckCircle2,
  Mail,
  FileText,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
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
import type { LeadRecord, SiteSettings } from "@/lib/db"
import type { CalendarEvent } from "@/lib/calendar-data"
import type { BlogPost } from "@/lib/blog-types"
import type { EmailCampaign } from "@/lib/marketing-types"
import type { BugReport } from "@/lib/bugs-data"
import type { PatchNote } from "@/lib/patch-notes-data"

function adminFetch(url: string) {
  const token = sessionStorage.getItem("admin_password") ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await adminFetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
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
      return "bg-blue-50 text-blue-700 border-blue-100"
    case "warning":
      return "bg-amber-50 text-amber-700 border-amber-100"
    case "danger":
      return "bg-red-50 text-red-600 border-red-100"
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

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  trend?: { value: number; label: string }
  accent?: string
  iconColor?: string
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  trend,
  accent = "bg-[#f0f0ec]",
  iconColor = "text-[#1a1a1a]/50",
}: KpiCardProps) {
  const trendPositive = trend && trend.value > 0
  const trendNeutral = trend && trend.value === 0
  return (
    <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5 shadow-[0_1px_0_rgba(17,17,16,0.02)] transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4] hover:shadow-[0_12px_30px_rgba(17,17,16,0.04)]">
      <div className="flex items-start justify-between mb-3">
        <div className={`inline-flex p-2 rounded-xl ${accent}`}>
          <span className={iconColor}>{icon}</span>
        </div>
        {trend && (
          <span
            className={`flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
              trendNeutral
                ? "text-[#1a1a1a]/40 bg-[#f0f0ec]"
                : trendPositive
                  ? "text-green-600 bg-green-50"
                  : "text-red-500 bg-red-50"
            }`}
          >
            {trendNeutral ? (
              <Minus className="w-3 h-3" />
            ) : trendPositive ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {Math.abs(trend.value)}
          </span>
        )}
      </div>
      <p className="text-[11px] font-medium text-[#1a1a1a]/40 mb-1 uppercase tracking-wide">{label}</p>
      <p className="text-[28px] font-bold text-[#111110] tracking-[-0.03em] leading-none">{value}</p>
      {sub && <p className="text-[11px] text-[#1a1a1a]/40 mt-1.5">{sub}</p>}
      {trend && <p className="text-[11px] text-[#1a1a1a]/30 mt-0.5">{trend.label}</p>}
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
}
const STATUS_LABEL: Record<string, string> = {
  new: "신규",
  contacted: "연락중",
  converted: "전환",
  closed: "종료",
}
const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-50 text-blue-600",
  contacted: "bg-yellow-50 text-yellow-600",
  converted: "bg-green-50 text-green-600",
  closed: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}
const CAMPAIGN_STATUS_LABEL: Record<EmailCampaign["status"], string> = {
  draft: "초안",
  sent: "발송됨",
  failed: "실패",
}
const CAMPAIGN_STATUS_COLOR: Record<EmailCampaign["status"], string> = {
  draft: "bg-amber-50 text-amber-700",
  sent: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-600",
}
const BUG_STATUS_LABEL: Record<BugReport["status"], string> = {
  open: "오픈",
  "in-progress": "진행중",
  resolved: "해결됨",
  closed: "종료",
}
const BUG_SEVERITY_LABEL: Record<BugReport["severity"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
}
const PUBLISH_STATUS_LABEL: Record<BlogPost["status"], string> = {
  draft: "초안",
  published: "공개",
  archived: "보관",
}
const PUBLISH_STATUS_COLOR: Record<BlogPost["status"], string> = {
  draft: "bg-amber-50 text-amber-700",
  published: "bg-green-50 text-green-700",
  archived: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}

function getLast7DayLabels() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d
      .toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })
      .replace(" ", "")
      .replace("월 ", "/")
      .replace("일", "")
  })
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)

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
        fetchJson<CalendarEvent[]>("/api/admin/calendar"),
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
  const converted = leads.filter((l) => l.status === "converted").length
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

  const dayLabels = getLast7DayLabels()
  const chartData = dayLabels.map((label, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return {
      label,
      count: leads.filter((l) => new Date(l.timestamp).toDateString() === d.toDateString()).length,
    }
  })

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
  const enabledHomepageModules = [
    settings?.demoFormEnabled,
    settings?.demoBannerEnabled,
    settings?.blogSectionEnabled,
    settings?.noticeBannerEnabled,
  ].filter(Boolean).length
  const homepageModuleTotal = 4
  const recentPosts = [...blogPosts]
    .sort((a, b) => scoreDate(b.updatedAt ?? b.publishedAt) - scoreDate(a.updatedAt ?? a.publishedAt))
    .slice(0, 4)
  const recentCampaigns = [...campaigns]
    .sort((a, b) => scoreDate(b.sentAt ?? b.createdAt) - scoreDate(a.sentAt ?? a.createdAt))
    .slice(0, 4)
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

  const taskItems = [
    {
      title: "홈페이지 전환",
      count: newLeads,
      description:
        thisWeekLeads > 0
          ? `오늘 ${todayLeads}건 · 이번 주 ${thisWeekLeads}건의 유입이 들어왔습니다.`
          : "이번 주 유입이 잠시 쉬고 있습니다.",
      href: "/admin/crm",
      action: newLeads > 0 ? "유입 관리" : "전환 확인",
      tone: newLeads > 0 ? ("warning" as const) : ("neutral" as const),
    },
    {
      title: "콘텐츠 관리",
      count: publishedBlogPosts.length,
      description:
        blogPosts.length > 0
          ? `공개 ${publishedBlogPosts.length}건 · 초안 ${draftBlogPosts}건`
          : "아직 발행된 콘텐츠가 없습니다.",
      href: "/admin/blog",
      action: publishedBlogPosts.length > 0 ? "콘텐츠 보기" : "작성 시작",
      tone: publishedBlogPosts.length > 0 ? ("info" as const) : ("neutral" as const),
    },
    {
      title: "캠페인 준비",
      count: draftCampaigns.length,
      description:
        campaigns.length > 0
          ? `초안 ${draftCampaigns.length}건 · 발송 ${sentCampaigns.length}건`
          : "아직 캠페인 발송 이력이 없습니다.",
      href: "/admin/campaigns",
      action: draftCampaigns.length > 0 ? "캠페인 열기" : "캠페인 만들기",
      tone: draftCampaigns.length > 0 ? ("info" as const) : ("neutral" as const),
    },
    {
      title: "오픈 이슈",
      count: openBugs.length,
      description:
        openBugs.length > 0
          ? `운영 이슈 ${openBugs.length}건을 확인하세요.`
          : "열려 있는 버그가 없습니다.",
      href: "/admin/dev",
      action: openBugs.length > 0 ? "이슈 보기" : "Dev Mode",
      tone: openBugs.length > 0 ? ("danger" as const) : ("neutral" as const),
    },
  ]

  const missingConnections = connections.filter((connection) => !connection.value?.trim())
  const topSignals = [
    {
      label: "홈페이지 모듈",
      value: `${enabledHomepageModules}/${homepageModuleTotal}`,
      hint: "데모 폼, 배너, 블로그 섹션, 공지 배너의 노출 상태입니다.",
      href: "/admin/settings",
      tone: enabledHomepageModules === homepageModuleTotal ? ("success" as const) : ("info" as const),
    },
    {
      label: "CTA 건강",
      value: publishedBlogPosts.length > 0 ? `${ctaCoverage}%` : "데이터 대기",
      hint:
        publishedBlogPosts.length > 0
          ? `공개 글 ${publishedBlogPosts.length}개 중 CTA가 채워진 글 ${publishedPostsWithCta}개`
          : "공개 글이 쌓이면 CTA 상태를 보여줍니다.",
      href: "/admin/blog",
      tone:
        publishedBlogPosts.length === 0
          ? ("neutral" as const)
          : ctaCoverage >= 80
            ? ("success" as const)
            : ctaCoverage >= 50
              ? ("info" as const)
              : ("warning" as const),
    },
    {
      label: "이번 주 유입",
      value: `${thisWeekLeads}건`,
      hint: weekTrend >= 0 ? `지난주 대비 +${weekTrend}건` : `지난주 대비 ${weekTrend}건`,
      href: "/admin/crm",
      tone: weekTrend >= 0 ? ("info" as const) : ("warning" as const),
    },
    {
      label: "연동 상태",
      value: missingConnections.length > 0 ? `미연결 ${missingConnections.length}` : "정상",
      hint: missingConnections.length > 0 ? "Settings에서 외부 전송 경로를 먼저 연결하세요." : "핵심 웹훅이 모두 연결되어 있습니다.",
      href: "/admin/settings",
      tone: missingConnections.length > 0 ? ("warning" as const) : ("success" as const),
    },
  ]
  const operationalAlerts = [
    ...openBugs.map((bug) => ({
      id: bug.id,
      title: bug.title,
      description: `${BUG_SEVERITY_LABEL[bug.severity]} · ${BUG_STATUS_LABEL[bug.status]} · ${formatDateTime(bug.updatedAt)}`,
      tone: bug.severity === "critical" || bug.severity === "high" ? ("danger" as const) : ("warning" as const),
      action: "Dev 열기",
      href: "/admin/dev",
    })),
    ...(latestPatchNote
      ? [
          {
            id: latestPatchNote.id,
            title: `최근 패치노트 v${latestPatchNote.version}`,
            description: `${latestPatchNote.title} · ${formatDateShort(latestPatchNote.date)}`,
            tone: latestPatchNote.status === "published" ? ("success" as const) : ("info" as const),
            action: "패치노트 보기",
            href: "/admin/dev",
          },
        ]
      : []),
  ].slice(0, 4)

  return (
    <div className="relative overflow-hidden px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 lg:pb-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[260px] bg-[radial-gradient(circle_at_top_left,_rgba(75,140,247,0.09),_transparent_36%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.08),_transparent_30%),linear-gradient(to_bottom,_rgba(255,255,255,0.95),_rgba(250,250,248,0))]" />

      <div className="relative mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">Overview</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/45">
            홈페이지 노출 상태, CTA, 콘텐츠, 캠페인, 연동을 한 화면에서 점검하는 운영 허브입니다.
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
        <div className="relative mb-6 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 shadow-[0_1px_0_rgba(59,130,246,0.04)] sm:flex-row sm:items-center">
          <AlertCircle className="w-4 h-4 text-blue-500 shrink-0" />
          <p className="text-[13px] text-blue-700 font-medium">
            미처리 신규 문의 <span className="font-bold">{newLeads}건</span>이 대기 중입니다.
          </p>
          <a
            href="/admin/crm"
            className="text-[12px] text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1 shrink-0 transition-colors sm:ml-auto"
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-8">
          <KpiCard icon={<Users className="w-4 h-4" />} label="전체 리드" value={total} sub={`오늘 +${todayLeads}`} />
          <KpiCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="신규 (미처리)"
            value={newLeads}
            accent="bg-blue-50"
            iconColor="text-blue-500"
          />
          <KpiCard
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="전환율"
            value={`${convRate}%`}
            sub={`전환 ${converted}건`}
            accent="bg-green-50"
            iconColor="text-green-500"
          />
          <KpiCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="이번 주"
            value={thisWeekLeads}
            trend={{ value: weekTrend, label: "지난주 대비" }}
            accent="bg-purple-50"
            iconColor="text-purple-500"
          />
          <KpiCard
            icon={<Mail className="w-4 h-4" />}
            label="구독자"
            value={subscriberCount}
            sub="활성 구독자"
            accent="bg-orange-50"
            iconColor="text-orange-500"
          />
          <KpiCard icon={<FileText className="w-4 h-4" />} label="블로그" value={blogPosts.length} sub="발행된 포스트" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 shadow-[0_1px_0_rgba(17,17,16,0.02)] sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[14px] font-semibold text-[#111110]">홈페이지 유입 추이</p>
              <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">최근 7일</p>
            </div>
            <span className="rounded-full bg-[#f0f0ec] px-2.5 py-1 text-[10px] font-medium text-[#1a1a1a]/50">
              {total > 0 ? `${total}건 누적` : "데이터 대기"}
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-[180px]" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#1a1a1a", opacity: 0.4 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#1a1a1a", opacity: 0.4 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e8e8e4", strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#111110"
                  strokeWidth={2}
                  dot={{ fill: "#111110", strokeWidth: 0, r: 3 }}
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
            <h2 className="text-[14px] font-semibold text-[#111110]">최근 유입</h2>
            <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">최근 접수 순으로 바로 후속할 수 있습니다.</p>
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
                description="데모 신청이나 문의가 들어오면 여기에서 바로 후속 상태를 관리할 수 있습니다."
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
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <SectionCard
          title="홈페이지 운영 포인트"
          description="홈페이지 전환, 콘텐츠, 캠페인, 운영 이슈를 한 번에 점검합니다."
          action={
            <a href="/admin/crm" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
              전체 열기 <ArrowUpRight className="w-3 h-3" />
            </a>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : (
            <div className="space-y-3">
              {taskItems.map((item) => (
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusToneClasses(item.tone)}`}>{item.count}건</span>
                    </div>
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
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
          title="최근 콘텐츠"
          description="최근 수정되거나 발행된 글을 빠르게 확인합니다."
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
          title="최근 캠페인"
          description="구독자 발송 내역과 초안 상태를 확인합니다."
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
          title="운영 알림 / 연동 상태"
          description="이상 징후와 외부 연결 상태를 한 곳에서 점검합니다."
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
                    <p className="text-[13px] font-semibold text-[#111110]">운영 알림</p>
                    <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">버그와 배포 메모를 함께 확인합니다.</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusToneClasses(operationalAlerts.length > 0 ? "warning" : "success")}`}>
                    {operationalAlerts.length > 0 ? `${operationalAlerts.length}건` : "정상"}
                  </span>
                </div>

                {operationalAlerts.length === 0 ? (
                  <EmptyState
                    title="현재 운영 경고가 없습니다."
                    description="이슈가 생기면 여기에서 먼저 확인하고 바로 Dev Mode로 이동할 수 있습니다."
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
                          <p className="text-[13px] font-semibold text-[#111110] truncate">{item.title}</p>
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

"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Flame,
  Globe,
  Inbox,
  LayoutGrid,
  List,
  MessageCircle,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import QuickCallLogModal from "@/components/admin/cs/QuickCallLogModal"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import {
  CS_CATEGORY_MAP,
  type CsDashboardPeriod,
  type CsFrequentIssue,
  type CsInquiryDashboardData,
  type CsTrendBucket,
  type CsUnansweredInquiry,
} from "@/lib/cs/inquiry-types"
import { cn } from "@/lib/utils"

const PERIOD_OPTIONS: Array<{ value: CsDashboardPeriod; label: string }> = [
  { value: "today", label: "오늘" },
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
  { value: "90d", label: "최근 90일" },
  { value: "all", label: "전체" },
]

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "방금 전"
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  return date.toISOString().slice(0, 10)
}

function formatWaitingHours(minutes: number): string {
  if (minutes < 60) return `${minutes}분 경과`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분 경과` : `${hours}시간 경과`
  }
  const days = Math.floor(hours / 24)
  return `${days}일 ${hours % 24}시간 경과`
}

function formatScheduledTime(dateStr: string, timeStr?: string): string {
  const [, month, day] = dateStr.split("-")
  const dateLabel = month && day ? `${Number(month)}월 ${Number(day)}일` : dateStr
  return timeStr ? `${dateLabel} ${timeStr}` : dateLabel
}

/** Pure SVG Circular SLA Gauge Component */
function CircularSlaGauge({
  rate,
  target = 90,
}: {
  rate: number
  target?: number
}) {
  const size = 118
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clampedRate = Math.min(100, Math.max(0, rate))
  const offset = circumference - (clampedRate / 100) * circumference
  const isHealthy = clampedRate >= target

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90 transform">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isHealthy ? "#084734" : "#A8741A"}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold tracking-tight text-[#111110] tabular-nums">
          {clampedRate}%
        </span>
        <span className="text-[10px] font-semibold text-[#615D59]">
          목표 {target}%
        </span>
      </div>
    </div>
  )
}

export default function CsInquiryDashboard() {
  const [period, setPeriod] = useState<CsDashboardPeriod>("7d")
  const [data, setData] = useState<CsInquiryDashboardData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<boolean>(false)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)

  // Filters for inquiries
  const [selectedGenre, setSelectedGenre] = useState<string | "all">("all")
  const [unansweredChannelTab, setUnansweredChannelTab] = useState<
    "all" | "channel_talk" | "homepage" | "call_log" | "critical"
  >("all")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [isCallLogModalOpen, setIsCallLogModalOpen] = useState<boolean>(false)

  // Filters for upcoming tasks (앞으로 예정된 작업)
  const [taskTypeFilter, setTaskTypeFilter] = useState<"all" | "follow_up" | "showroom" | "install" | "crm_task" | "guide_doc">("all")
  const [taskSearchQuery, setTaskSearchQuery] = useState<string>("")
  const [taskViewMode, setTaskViewMode] = useState<"cards" | "timeline">("cards")

  // Inquiry detail quick view modal
  const [selectedInquiry, setSelectedInquiry] = useState<CsUnansweredInquiry | null>(null)
  const [copiedContact, setCopiedContact] = useState<boolean>(false)

  function handleCopyContact(text: string) {
    void navigator.clipboard.writeText(text)
    setCopiedContact(true)
    setTimeout(() => setCopiedContact(false), 2000)
  }

  // FAQ promotion feedback state
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [promotedMap, setPromotedMap] = useState<Record<string, boolean>>({})

  const loadData = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/admin/cs/dashboard?period=${period}`
      const result = await adminFetchJsonCached<CsInquiryDashboardData>(url, undefined, {
        ttlMs: 30_000,
        force,
      })
      setData(result)
    } catch (err) {
      console.error("[CsInquiryDashboard] fetch failed:", err)
      setError(err instanceof Error ? err.message : "대시보드 데이터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Sync Channel Talk action
  async function handleSyncChannelTalk() {
    setSyncing(true)
    setSyncNotice(null)
    try {
      const res = await adminFetchJson<{ ok: boolean; fetchedChats?: number; newConversations?: number }>(
        "/api/admin/channel-talk/sync",
        { method: "POST" }
      )
      setSyncNotice(`채널톡 동기화 완료: 상담 ${res.fetchedChats ?? 0}건 확인 (신규 ${res.newConversations ?? 0}건)`)
      await loadData(true)
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : "채널톡 동기화 실패")
    } finally {
      setSyncing(false)
    }
  }

  // Promote recurring issue to FAQ
  async function handlePromoteToFaq(issue: CsFrequentIssue) {
    setPromotingId(issue.id)
    try {
      await adminFetchJson("/api/admin/chatbot/recommended-questions", {
        method: "POST",
        body: JSON.stringify({
          prompt: issue.title,
          category: issue.category,
          status: "draft",
          sampleQuestions: issue.sampleQuestions,
        }),
      })
      setPromotedMap((prev) => ({ ...prev, [issue.id]: true }))
    } catch (err) {
      alert(err instanceof Error ? err.message : "추천 질문 등록 실패")
    } finally {
      setPromotingId(null)
    }
  }

  // Filtered unanswered inquiries
  const filteredUnanswered = useMemo(() => {
    if (!data?.unansweredInquiries) return []
    return data.unansweredInquiries.filter((item) => {
      if (unansweredChannelTab === "channel_talk" && item.channel !== "channel_talk") return false
      if (unansweredChannelTab === "homepage" && item.channel !== "homepage") return false
      if (unansweredChannelTab === "call_log" && item.channel !== "call_log") return false
      if (unansweredChannelTab === "critical" && item.urgency !== "critical") return false

      if (selectedGenre !== "all" && item.category !== selectedGenre) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = item.customerName?.toLowerCase().includes(q)
        const matchOrg = item.customerOrg?.toLowerCase().includes(q)
        const matchText = item.inquiryText?.toLowerCase().includes(q)
        const matchContact = item.customerContact?.toLowerCase().includes(q)
        if (!matchName && !matchOrg && !matchText && !matchContact) return false
      }

      return true
    })
  }, [data?.unansweredInquiries, unansweredChannelTab, selectedGenre, searchQuery])

  // Filtered frequent issues
  const filteredFrequentIssues = useMemo(() => {
    if (!data?.frequentIssues) return []
    if (selectedGenre === "all") return data.frequentIssues
    return data.frequentIssues.filter((item) => item.category === selectedGenre)
  }, [data?.frequentIssues, selectedGenre])

  // Filtered upcoming tasks
  const filteredUpcomingTasks = useMemo(() => {
    if (!data?.upcomingTasks) return []
    return data.upcomingTasks.filter((task) => {
      if (taskTypeFilter !== "all" && task.type !== taskTypeFilter) return false
      if (taskSearchQuery.trim()) {
        const q = taskSearchQuery.toLowerCase().trim()
        const matchTitle = task.title.toLowerCase().includes(q)
        const matchCustomer = task.customerName?.toLowerCase().includes(q)
        const matchOrg = task.customerOrg?.toLowerCase().includes(q)
        const matchOwner = task.ownerName?.toLowerCase().includes(q)
        if (!matchTitle && !matchCustomer && !matchOrg && !matchOwner) return false
      }
      return true
    })
  }, [data?.upcomingTasks, taskTypeFilter, taskSearchQuery])

  // Grouped timeline tasks for timeline view mode
  const timelineGroups = useMemo(() => {
    const todayAndUrgent: typeof filteredUpcomingTasks = []
    const tomorrow: typeof filteredUpcomingTasks = []
    const thisWeek: typeof filteredUpcomingTasks = []

    for (const t of filteredUpcomingTasks) {
      if (t.urgency === "urgent" || t.dDay.includes("지연") || t.urgency === "today" || t.dDay.includes("오늘")) {
        todayAndUrgent.push(t)
      } else if (t.dDay.includes("D-1") || t.dDay.includes("내일")) {
        tomorrow.push(t)
      } else {
        thisWeek.push(t)
      }
    }
    return { todayAndUrgent, tomorrow, thisWeek }
  }, [filteredUpcomingTasks])

  // Category resolution rate matrix calculation
  const categoryResolutionStats = useMemo(() => {
    if (!data?.genres) return []
    const unansweredMap: Record<string, number> = {}
    data.unansweredInquiries.forEach((item) => {
      unansweredMap[item.category] = (unansweredMap[item.category] ?? 0) + 1
    })

    return data.genres
      .filter((g) => g.count > 0)
      .map((g) => {
        const unans = unansweredMap[g.category] ?? 0
        const resolved = Math.max(0, g.count - unans)
        const rate = g.count > 0 ? Math.round((resolved / g.count) * 100) : 100
        return {
          ...g,
          unanswered: unans,
          resolved,
          rate,
        }
      })
      .sort((a, b) => b.count - a.count)
  }, [data?.genres, data?.unansweredInquiries])

  // CSV export
  function exportCsv() {
    if (!data) return
    const rows = [
      ["구분", "고객명", "기관명", "연락처", "카테고리", "내용", "대기시간(분)", "접수시각"],
      ...data.unansweredInquiries.map((item) => [
        item.channelLabel,
        item.customerName,
        item.customerOrg ?? "",
        item.customerContact ?? "",
        item.categoryLabel,
        `"${item.inquiryText.replace(/"/g, '""')}"`,
        item.waitingMinutes.toString(),
        item.createdAt,
      ]),
    ]
    const csvContent = "\uFEFF" + rows.map((e) => e.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `cs_inquiries_${period}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const kpis = data?.kpis
  const connections = data?.connections
  const criticalCount = data?.unansweredInquiries.filter((i) => i.urgency === "critical").length ?? 0
  const upcomingTodayCount = data?.upcomingTasks.filter((t) => t.urgency === "today" || t.dDay.includes("오늘")).length ?? 0
  const upcomingUrgentCount = data?.upcomingTasks.filter((t) => t.urgency === "urgent" || t.dDay.includes("지연")).length ?? 0

  const channelTalkCount = data?.channels.find((c) => c.channel === "channel_talk")?.count ?? 0
  const channelTalkPct = data?.channels.find((c) => c.channel === "channel_talk")?.percentage ?? 0
  const homepageCount = data?.channels.find((c) => c.channel === "homepage")?.count ?? 0
  const homepagePct = data?.channels.find((c) => c.channel === "homepage")?.percentage ?? 0
  const chatbotCount = data?.channels.find((c) => c.channel === "chatbot")?.count ?? 0
  const chatbotPct = data?.channels.find((c) => c.channel === "chatbot")?.percentage ?? 0

  // Daily average for trend bar chart
  const dailyAverage = useMemo(() => {
    if (!data?.trends || data.trends.length === 0) return 0
    const total = data.trends.reduce((acc, t) => acc + t.total, 0)
    return Math.round((total / data.trends.length) * 10) / 10
  }, [data?.trends])

  return (
    <div className="mx-auto w-full max-w-[1240px] px-3.5 pt-6 pb-20 sm:px-6 sm:pt-8 sm:pb-24 lg:px-8">
      {/* =========================================================================
          PART 1. 간략한 대시보드 상단부 (Header + Inline Chips + Action Controls)
          ========================================================================= */}
      <div className="flex flex-col gap-4 border-b border-black/[0.06] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111110]">CS 문의 대시보드</h1>
            <span className="rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-bold text-[#084734]">
              실시간 통합 관제
            </span>

            {/* Compact inline connection status chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 sm:pt-0 sm:ml-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-colors",
                  connections?.channelTalk.status === "connected"
                    ? "bg-[#ECFDF5] text-[#084734]"
                    : "bg-[#FBF1E0] text-[#A8741A]"
                )}
                title={`채널톡 ${connections?.channelTalk.syncIntervalLabel ?? "평일 30분 동기화"} · 총 ${connections?.channelTalk.totalCount ?? 0}건`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                채널톡 {connections?.channelTalk.status === "connected" ? "30분동기화" : "확인필요"}
              </span>

              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-colors",
                  connections?.callLog?.todayCount
                    ? "bg-[#EEF2FF] text-[#4338CA]"
                    : "bg-[#ECFDF5] text-[#084734]"
                )}
                title={`사내 전화일지 · 오늘 ${connections?.callLog?.todayCount ?? 0}건 접수 / 총 ${connections?.callLog?.totalCount ?? 0}건`}
              >
                <PhoneCall className="h-3 w-3" />
                전화일지 {connections?.callLog?.todayCount ? `오늘 ${connections.callLog.todayCount}건` : "정상"}
              </span>

              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-colors",
                  connections?.homepage.status === "connected"
                    ? "bg-[#ECFDF5] text-[#084734]"
                    : "bg-[#FBF1E0] text-[#A8741A]"
                )}
                title={`홈페이지 문의 폼 연동 · 총 ${connections?.homepage.totalCount ?? 0}건`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                홈페이지 폼 {connections?.homepage.status === "connected" ? "정상" : "점검"}
              </span>

              <span
                className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] font-semibold text-[#084734] transition-colors"
                title={`피그마 CSM 캡처 가이드 ${connections?.knowledgeBase?.figmaGuidesCount ?? 107}건 및 MD 매뉴얼 인덱싱`}
              >
                <BookOpen className="h-3 w-3" />
                지식베이스 피그마 {connections?.knowledgeBase?.figmaGuidesCount ?? 107}건
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-[#615D59]">
            채널톡 실시간 상담 · 홈페이지 문의 폼 · 챗봇 응대 현황 및 통합 지원 일정
          </p>
        </div>

        {/* Action Controls: Period filter + Refresh + CSV */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Period Selector with horizontal scroll safety */}
          <div className="flex max-w-full overflow-x-auto rounded-full border border-black/[0.08] bg-[#F6F5F4] p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 sm:px-3 py-1 text-[11.5px] sm:text-[12px] font-medium transition-colors",
                  period === opt.value
                    ? "bg-white font-semibold text-[#111110] shadow-2xs"
                    : "text-[#615D59] hover:text-[#111110]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 전화 일지 빠른 등록 버튼 */}
          <button
            type="button"
            onClick={() => setIsCallLogModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#084734]/25 bg-[#ECFDF5] px-3 py-1.5 text-[12px] font-semibold text-[#084734] shadow-2xs transition-colors hover:bg-[#d1fae5]"
            title="사내 채팅방 통화 메모 10초 빠른 등록"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            <span>전화 일지 등록</span>
          </button>

          {/* Quick Refresh */}
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium text-[#111110] shadow-2xs transition-colors hover:bg-[#F6F5F4] disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin text-[#084734]")} />
            <span className="hidden sm:inline">새로고침</span>
          </button>

          {/* CSV Export */}
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data || data.unansweredInquiries.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium text-[#615D59] shadow-2xs transition-colors hover:bg-[#F6F5F4] hover:text-[#111110] disabled:opacity-40"
            title="미답변 내역 CSV 다운로드"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* Sync Notice Alert */}
      {syncNotice ? (
        <div className="mt-3 flex items-center justify-between rounded-[12px] border border-[#084734]/20 bg-[#ECFDF5] px-4 py-2.5 text-[13px] text-[#084734]">
          <span>{syncNotice}</span>
          <button
            type="button"
            onClick={() => setSyncNotice(null)}
            className="text-[12px] font-medium underline"
          >
            닫기
          </button>
        </div>
      ) : null}

      {/* Error State */}
      {error ? (
        <div className="mt-4 rounded-[14px] border border-[#B43E3E]/30 bg-[#FCE9E9] p-4 text-[#8F2C2C]">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" />
            <span>데이터 로드 오류</span>
          </div>
          <p className="mt-1 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => void loadData(true)}
            className="mt-3 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#8F2C2C] shadow-xs hover:bg-[#F6F5F4]"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {/* =========================================================================
          PART 2. 6대 핵심 KPI 요약 밴드 (컴팩트 대시보드 스트립)
          ========================================================================= */}
      <section className="mt-5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-6">
          {/* 1. 총 문의량 */}
          <div className="rounded-[16px] border border-black/[0.08] bg-white p-3 sm:p-3.5 shadow-2xs transition-shadow hover:shadow-xs">
            <div className="flex items-center justify-between text-[#615D59]">
              <span className="text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-wider text-[#A39E98]">
                총 문의량
              </span>
              <Inbox className="h-3.5 w-3.5 text-[#111110]/40" />
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#111110] tabular-nums">
              {kpis ? `${kpis.totalInquiries}건` : "—"}
            </p>
            <div className="mt-1 flex items-center gap-1 text-[10.5px] sm:text-[11px] text-[#615D59] truncate">
              {kpis?.prevPeriodDiff.totalPercent !== undefined && kpis.prevPeriodDiff.totalPercent !== 0 ? (
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    kpis.prevPeriodDiff.totalPercent > 0 ? "text-[#084734]" : "text-[#B43E3E]"
                  )}
                >
                  {kpis.prevPeriodDiff.totalPercent > 0 ? `+${kpis.prevPeriodDiff.totalPercent}%` : `${kpis.prevPeriodDiff.totalPercent}%`}
                </span>
              ) : null}
              <span className="truncate">이전 대비</span>
            </div>
          </div>

          {/* 2. 해결 율 */}
          <div className="rounded-[16px] border border-black/[0.08] bg-white p-3 sm:p-3.5 shadow-2xs transition-shadow hover:shadow-xs">
            <div className="flex items-center justify-between text-[#615D59]">
              <span className="text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-wider text-[#A39E98]">
                해결 율
              </span>
              <CheckCircle2 className="h-3.5 w-3.5 text-[#084734]" />
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#084734] tabular-nums">
              {kpis ? `${kpis.resolutionRate}%` : "—"}
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className="h-full rounded-full bg-[#084734] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, kpis?.resolutionRate ?? 0))}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-[#A39E98] tabular-nums truncate">
              완료 {kpis?.resolvedCount ?? 0} · 처리중 {kpis?.inProgressCount ?? 0}
            </p>
          </div>

          {/* 3. 답변 대기 */}
          <div
            className={cn(
              "rounded-[16px] border p-3 sm:p-3.5 shadow-2xs transition-all",
              criticalCount > 0
                ? "border-[#B43E3E]/40 bg-[#FCE9E9]/40"
                : "border-black/[0.08] bg-white hover:shadow-xs"
            )}
          >
            <div className="flex items-center justify-between text-[#615D59]">
              <span className="text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-wider text-[#A39E98]">
                답변 대기
              </span>
              <Clock className={cn("h-3.5 w-3.5", criticalCount > 0 ? "text-[#B43E3E]" : "text-[#111110]/40")} />
            </div>
            <p
              className={cn(
                "mt-1.5 text-xl sm:text-2xl font-bold tracking-tight tabular-nums",
                criticalCount > 0 ? "text-[#8F2C2C]" : "text-[#111110]"
              )}
            >
              {kpis ? `${kpis.unansweredCount}건` : "—"}
            </p>
            <div className="mt-1 text-[10.5px] sm:text-[11px] truncate">
              {criticalCount > 0 ? (
                <span className="font-bold text-[#8F2C2C] truncate">
                  🚨 24h 초과 {criticalCount}건
                </span>
              ) : (
                <span className="text-[#084734] font-medium truncate">SLA 정상 준수</span>
              )}
            </div>
          </div>

          {/* 4. 채널톡 상담 */}
          <div className="rounded-[16px] border border-black/[0.08] bg-white p-3 sm:p-3.5 shadow-2xs transition-shadow hover:shadow-xs">
            <div className="flex items-center justify-between text-[#615D59]">
              <span className="text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-wider text-[#A39E98]">
                채널톡 상담
              </span>
              <MessageSquare className="h-3.5 w-3.5 text-[#FF6B00]" />
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#111110] tabular-nums">
              {channelTalkCount}건
            </p>
            <p className="mt-1 text-[10.5px] sm:text-[11px] text-[#615D59] truncate">
              비중: <span className="font-semibold text-[#111110] tabular-nums">{channelTalkPct}%</span>
            </p>
          </div>

          {/* 5. 홈페이지 문의 */}
          <div className="rounded-[16px] border border-black/[0.08] bg-white p-3 sm:p-3.5 shadow-2xs transition-shadow hover:shadow-xs">
            <div className="flex items-center justify-between text-[#615D59]">
              <span className="text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-wider text-[#A39E98]">
                홈페이지 문의
              </span>
              <Globe className="h-3.5 w-3.5 text-[#084734]" />
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#111110] tabular-nums">
              {homepageCount}건
            </p>
            <p className="mt-1 text-[10.5px] sm:text-[11px] text-[#615D59] truncate">
              비중: <span className="font-semibold text-[#111110] tabular-nums">{homepagePct}%</span>
            </p>
          </div>

          {/* 6. 챗봇 응대 */}
          <div className="rounded-[16px] border border-black/[0.08] bg-white p-3 sm:p-3.5 shadow-2xs transition-shadow hover:shadow-xs">
            <div className="flex items-center justify-between text-[#615D59]">
              <span className="text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-wider text-[#A39E98]">
                챗봇 응대
              </span>
              <Bot className="h-3.5 w-3.5 text-[#D4537E]" />
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#111110] tabular-nums">
              {chatbotCount}건
            </p>
            <p className="mt-1 text-[10.5px] sm:text-[11px] text-[#615D59] truncate">
              비중: <span className="font-semibold text-[#111110] tabular-nums">{chatbotPct}%</span>
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          PART 3. 시각 차트 매트릭스 그리드 (동시 4개 패널 풍부한 시각화)
          ========================================================================= */}
      <section className="mt-6">
        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
          {/* PANEL 1: 기간별 문의 유입 & 해결 추이 (Trend Bar Chart - 너비 7 cols) */}
          <div className="flex flex-col justify-between rounded-[18px] border border-black/[0.08] bg-white p-4 sm:p-5 shadow-2xs lg:col-span-7">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#084734]" />
                  <h2 className="text-sm font-bold text-[#111110]">기간별 문의 접수 및 해결 추이</h2>
                </div>
                <p className="mt-0.5 text-[11px] sm:text-[11.5px] text-[#615D59]">
                  일별 전체 문의량(연회색) · 해결 완료(초록색) · 답변 대기(적색) 추이
                </p>
              </div>
              <div className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-[11px] font-semibold text-[#615D59] border border-black/[0.04]">
                일평균 <span className="font-bold text-[#111110] tabular-nums">{dailyAverage}건</span>
              </div>
            </div>

            {/* Bar Chart Container */}
            <div className="mt-4 h-[210px] sm:h-[240px] w-full">
              {data && data.trends.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.trends} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0EC" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10.5, fill: "#615D59" }}
                      axisLine={{ stroke: "#E8E8E4" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10.5, fill: "#615D59" }}
                      axisLine={{ stroke: "#E8E8E4" }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const cur = payload[0].payload as CsTrendBucket
                        return (
                          <div className="rounded-xl border border-black/[0.08] bg-white p-3 shadow-md text-xs">
                            <p className="font-bold text-[#111110]">{label} ({cur.date})</p>
                            <div className="mt-1.5 space-y-1">
                              <p className="flex items-center justify-between gap-4 text-[#111110]">
                                <span>전체 문의:</span>
                                <span className="font-bold tabular-nums">{cur.total}건</span>
                              </p>
                              <p className="flex items-center justify-between gap-4 text-[#084734]">
                                <span>해결 완료:</span>
                                <span className="font-semibold tabular-nums">{cur.resolved}건</span>
                              </p>
                              <p className="flex items-center justify-between gap-4 text-[#B43E3E]">
                                <span>답변 대기:</span>
                                <span className="font-semibold tabular-nums">{cur.unanswered}건</span>
                              </p>
                              <div className="mt-1 border-t border-black/[0.04] pt-1 text-[11px] text-[#A39E98]">
                                채널톡 {cur.channelTalk} · 홈페이지 {cur.homepage}
                              </div>
                            </div>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="total" fill="#E8E8E4" radius={[4, 4, 0, 0]} maxBarSize={22} name="전체 문의" />
                    <Bar dataKey="resolved" fill="#084734" radius={[4, 4, 0, 0]} maxBarSize={22} name="해결 완료" />
                    <Bar dataKey="unanswered" fill="#B43E3E" radius={[4, 4, 0, 0]} maxBarSize={22} name="답변 대기" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[#A39E98]">
                  해당 기간 내 문의 데이터가 없습니다.
                </div>
              )}
            </div>

            {/* Bottom Legend */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.04] pt-2 text-[10.5px] sm:text-[11px] text-[#615D59]">
              <span className="text-[#A39E98]">총 {kpis?.totalInquiries ?? 0}건 접수 집계</span>
              <div className="flex items-center gap-2.5 sm:gap-3">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#E8E8E4]" /> 전체
                </span>
                <span className="flex items-center gap-1 font-semibold text-[#084734]">
                  <span className="h-2 w-2 rounded-full bg-[#084734]" /> 완료 {kpis?.resolvedCount ?? 0}
                </span>
                <span className="flex items-center gap-1 font-semibold text-[#B43E3E]">
                  <span className="h-2 w-2 rounded-full bg-[#B43E3E]" /> 대기 {kpis?.unansweredCount ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* PANEL 2: SLA 해결 준수율 & 응대 건강도 (Circular Progress Gauge - 너비 5 cols) */}
          <div className="flex flex-col justify-between rounded-[18px] border border-black/[0.08] bg-white p-4 sm:p-5 shadow-2xs lg:col-span-5">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#111110]">SLA 준수율 & 해결 건강도</h2>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                    criticalCount > 0 ? "bg-[#FCE9E9] text-[#8F2C2C]" : "bg-[#ECFDF5] text-[#084734]"
                  )}
                >
                  {criticalCount > 0 ? `긴급 ${criticalCount}건` : "건강도 우수"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] sm:text-[11.5px] text-[#615D59]">
                목표 해결률 90% 기준 대비 달성도 및 지연 건수
              </p>
            </div>

            {/* Gauge & Metrics Row */}
            <div className="my-3 flex items-center justify-around gap-3 sm:gap-4">
              <CircularSlaGauge rate={kpis?.resolutionRate ?? 0} target={90} />

              <div className="flex flex-col gap-2 text-xs">
                <div className="rounded-[12px] bg-[#FAFAF8] p-2 sm:p-2.5 border border-black/[0.04]">
                  <span className="text-[10px] sm:text-[10.5px] text-[#A39E98]">해결 완료</span>
                  <div className="flex items-baseline gap-1 font-bold text-[#084734]">
                    <span className="text-sm sm:text-base tabular-nums">{kpis?.resolvedCount ?? 0}건</span>
                    <span className="text-[10.5px] sm:text-[11px] font-normal text-[#615D59]">
                      ({kpis?.totalInquiries ? Math.round(((kpis.resolvedCount) / kpis.totalInquiries) * 100) : 0}%)
                    </span>
                  </div>
                </div>

                <div className="rounded-[12px] bg-[#FAFAF8] p-2 sm:p-2.5 border border-black/[0.04]">
                  <span className="text-[10px] sm:text-[10.5px] text-[#A39E98]">처리 진행 중</span>
                  <div className="flex items-baseline gap-1 font-bold text-[#111110]">
                    <span className="text-sm sm:text-base tabular-nums">{kpis?.inProgressCount ?? 0}건</span>
                    <span className="text-[10.5px] sm:text-[11px] font-normal text-[#615D59]">진행</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Alert / Status banner */}
            <div
              className={cn(
                "rounded-[12px] px-3 py-2 text-xs",
                criticalCount > 0
                  ? "border border-[#B43E3E]/20 bg-[#FCE9E9]/40 text-[#8F2C2C]"
                  : "border border-[#084734]/20 bg-[#ECFDF5]/50 text-[#084734]"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-semibold text-[11.5px] sm:text-xs">
                  {criticalCount > 0
                    ? `🚨 24시간 초과 건이 ${criticalCount}건 있습니다!`
                    : "🟢 모든 문의가 SLA 기준 시간 내 응대 중입니다."}
                </span>
                {criticalCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUnansweredChannelTab("critical")
                      document.getElementById("unanswered-section")?.scrollIntoView({ behavior: "smooth" })
                    }}
                    className="font-bold underline hover:opacity-80 text-[11.5px]"
                  >
                    대기 큐 보기
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* PANEL 3: 8대 장르별 문의 점유율 (Donut Chart with Center Metric - 너비 6 cols) */}
          <div className="flex flex-col justify-between rounded-[18px] border border-black/[0.08] bg-white p-4 sm:p-5 shadow-2xs lg:col-span-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#111110]">8대 장르별 문의 점유율</h2>
                <p className="mt-0.5 text-[11px] sm:text-[11.5px] text-[#615D59]">
                  카테고리별 클릭 시 하단 목록 필터링
                </p>
              </div>
              {selectedGenre !== "all" ? (
                <button
                  type="button"
                  onClick={() => setSelectedGenre("all")}
                  className="rounded-full bg-[#F6F5F4] px-2.5 py-0.5 text-[11px] font-semibold text-[#084734] hover:bg-[#E8E8E4]"
                >
                  필터 초기화
                </button>
              ) : null}
            </div>

            {/* Donut and Legend Layout */}
            <div className="my-2 flex flex-col sm:flex-row sm:items-center sm:justify-around gap-4">
              {/* Donut with Center Count */}
              <div className="relative h-[180px] w-[180px] sm:h-[190px] sm:w-[190px] shrink-0 mx-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data?.genres.filter((g) => g.count > 0)}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {data?.genres.map((g) => (
                        <Cell
                          key={g.category}
                          fill={g.color}
                          stroke={selectedGenre === g.category ? "#111110" : "none"}
                          strokeWidth={selectedGenre === g.category ? 2 : 0}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const p = payload[0].payload as { label: string; count: number; percentage: number; color: string }
                        return (
                          <div className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 shadow-sm text-xs">
                            <span className="font-bold text-[#111110]">{p.label}: </span>
                            <span className="font-semibold tabular-nums">{p.count}건 ({p.percentage}%)</span>
                          </div>
                        )
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Badge */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] font-medium text-[#A39E98]">총 문의</span>
                  <span className="text-lg sm:text-xl font-bold tracking-tight text-[#111110] tabular-nums">
                    {kpis?.totalInquiries ?? 0}
                  </span>
                </div>
              </div>

              {/* 8 Genres Legend Matrix */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs w-full sm:w-auto">
                {data?.genres.map((g) => {
                  const isSelected = selectedGenre === g.category
                  return (
                    <button
                      key={g.category}
                      type="button"
                      onClick={() => setSelectedGenre(isSelected ? "all" : g.category)}
                      className={cn(
                        "flex items-center justify-between gap-1.5 rounded-lg px-2 py-1 text-left transition-colors",
                        isSelected
                          ? "bg-[#ECFDF5] font-bold text-[#084734] ring-1 ring-[#084734]/30"
                          : "hover:bg-[#F6F5F4] text-[#615D59]"
                      )}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                        <span className="truncate text-[11px] sm:text-xs">{g.label}</span>
                      </div>
                      <span className="font-semibold tabular-nums text-[#111110] text-[10.5px] sm:text-[11px] shrink-0">
                        {g.percentage}%
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-2 border-t border-black/[0.04] pt-2 text-[10.5px] sm:text-[11px] text-[#A39E98] flex items-center justify-between">
              <span className="truncate">선택: {selectedGenre === "all" ? "전체 (8개 장르)" : CS_CATEGORY_MAP[selectedGenre as keyof typeof CS_CATEGORY_MAP]?.label}</span>
              <span className="shrink-0">분류 {data?.genres.reduce((a, b) => a + b.count, 0) ?? 0}건</span>
            </div>
          </div>

          {/* PANEL 4: 유입 채널별 비중 & 상위 장르 해결률 매트릭스 (Channel & Resolution Matrix - 너비 6 cols) */}
          <div className="flex flex-col justify-between rounded-[18px] border border-black/[0.08] bg-white p-4 sm:p-5 shadow-2xs lg:col-span-6">
            <div>
              <h2 className="text-sm font-bold text-[#111110]">채널별 유입 & 상위 장르 해결률</h2>
              <p className="mt-0.5 text-[11px] sm:text-[11.5px] text-[#615D59]">
                채널 점유율과 주요 장르별 실시간 처리 진행 건강도
              </p>
            </div>

            {/* Horizontal Channel Stack Bar */}
            <div className="my-3 rounded-[14px] bg-[#FAFAF8] p-3 border border-black/[0.04]">
              <div className="flex flex-wrap items-center justify-between text-xs text-[#615D59] mb-1.5 gap-1">
                <span className="font-semibold text-[#111110]">채널별 점유율</span>
                <span className="text-[10.5px] sm:text-[11px] text-[#A39E98]">
                  채널톡 {channelTalkPct}% · 홈페이지 {homepagePct}% · 챗봇 {chatbotPct}%
                </span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-black/[0.04]">
                <div
                  style={{ width: `${channelTalkPct}%` }}
                  className="h-full bg-[#FF6B00] transition-all"
                  title={`채널톡: ${channelTalkCount}건 (${channelTalkPct}%)`}
                />
                <div
                  style={{ width: `${homepagePct}%` }}
                  className="h-full bg-[#084734] transition-all"
                  title={`홈페이지: ${homepageCount}건 (${homepagePct}%)`}
                />
                <div
                  style={{ width: `${chatbotPct}%` }}
                  className="h-full bg-[#D4537E] transition-all"
                  title={`챗봇: ${chatbotCount}건 (${chatbotPct}%)`}
                />
              </div>
            </div>

            {/* Top Categories Resolution Rates */}
            <div className="space-y-2 text-xs">
              <span className="text-[10.5px] sm:text-[11px] font-semibold text-[#615D59]">상위 장르별 해결률 현황</span>
              {categoryResolutionStats.slice(0, 4).map((item) => (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] sm:text-[11.5px]">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-medium text-[#111110] truncate">{item.label}</span>
                      <span className="text-[10px] sm:text-[10.5px] text-[#A39E98] shrink-0">({item.count}건)</span>
                    </div>
                    <span className="font-bold tabular-nums text-[#084734] shrink-0 ml-2">
                      {item.rate}% 완료
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.04]">
                    <div
                      className="h-full rounded-full bg-[#084734] transition-all duration-500"
                      style={{ width: `${item.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 border-t border-black/[0.04] pt-2 text-[10.5px] sm:text-[11px] text-[#A39E98] flex items-center justify-between">
              <span>하위 병목 장르 점검 권장</span>
              <Link href="/admin/channel-talk" className="font-semibold text-[#084734] hover:underline">
                상담 관리 바로가기 →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          PART 4. 그다음 내용: 상세 운영 및 고객 지원 내역 (Structured Content)
          ========================================================================= */}
      <div className="mt-12 mb-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-black/[0.08]" />
        <span className="text-xs font-bold uppercase tracking-wider text-[#A39E98]">
          상세 운영 및 고객 지원 내역
        </span>
        <div className="h-px flex-1 bg-black/[0.08]" />
      </div>

      {/* -------------------------------------------------------------------------
          SECTION 1. 앞으로 예정된 작업 (CS & 고객 지원 일정)
          ------------------------------------------------------------------------- */}
      <section id="upcoming-section" className="mt-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-[#084734]" />
              <h2 className="text-lg font-bold text-[#111110]">
                앞으로 예정된 작업 (CS & 고객 지원 일정)
              </h2>
              <span className="rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-xs font-bold text-[#084734] tabular-nums">
                {filteredUpcomingTasks.length}건
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#615D59]">
              고객 상담 팔로업 · 쇼룸 방문 예약 · 하드웨어 설치 지원 · CS 문서 보강 계획
            </p>
          </div>

          {/* View Mode Toggle & Quick Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1 rounded-full border border-black/[0.08] bg-[#F6F5F4] p-0.5 text-xs self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setTaskViewMode("cards")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors",
                  taskViewMode === "cards" ? "bg-white font-bold text-[#111110] shadow-xs" : "text-[#615D59]"
                )}
              >
                <LayoutGrid className="h-3 w-3" />
                <span>카드</span>
              </button>
              <button
                type="button"
                onClick={() => setTaskViewMode("timeline")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors",
                  taskViewMode === "timeline" ? "bg-white font-bold text-[#111110] shadow-xs" : "text-[#615D59]"
                )}
              >
                <List className="h-3 w-3" />
                <span>타임라인</span>
              </button>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
              <input
                type="text"
                value={taskSearchQuery}
                onChange={(e) => setTaskSearchQuery(e.target.value)}
                placeholder="일정, 고객명 검색..."
                className="w-full rounded-full border border-black/[0.08] bg-white py-1.5 pl-8 pr-3 text-[12px] text-[#111110] placeholder:text-[#A39E98] focus:border-[#084734] focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Task Type Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-black/[0.06] pb-2 text-xs">
          <button
            type="button"
            onClick={() => setTaskTypeFilter("all")}
            className={cn(
              "rounded-full px-2.5 sm:px-3 py-1 font-semibold transition-colors",
              taskTypeFilter === "all"
                ? "bg-[#111110] text-white"
                : "bg-[#F6F5F4] text-[#615D59] hover:text-[#111110]"
            )}
          >
            전체 ({data?.upcomingTasks.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTaskTypeFilter("follow_up")}
            className={cn(
              "rounded-full px-2.5 sm:px-3 py-1 font-semibold transition-colors",
              taskTypeFilter === "follow_up"
                ? "bg-[#084734] text-white"
                : "bg-[#F6F5F4] text-[#615D59] hover:text-[#111110]"
            )}
          >
            팔로업 ({data?.upcomingTasks.filter((t) => t.type === "follow_up").length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTaskTypeFilter("showroom")}
            className={cn(
              "rounded-full px-2.5 sm:px-3 py-1 font-semibold transition-colors",
              taskTypeFilter === "showroom"
                ? "bg-[#084734] text-white"
                : "bg-[#F6F5F4] text-[#615D59] hover:text-[#111110]"
            )}
          >
            쇼룸 ({data?.upcomingTasks.filter((t) => t.type === "showroom").length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTaskTypeFilter("install")}
            className={cn(
              "rounded-full px-2.5 sm:px-3 py-1 font-semibold transition-colors",
              taskTypeFilter === "install"
                ? "bg-[#084734] text-white"
                : "bg-[#F6F5F4] text-[#615D59] hover:text-[#111110]"
            )}
          >
            설치 ({data?.upcomingTasks.filter((t) => t.type === "install").length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTaskTypeFilter("guide_doc")}
            className={cn(
              "rounded-full px-2.5 sm:px-3 py-1 font-semibold transition-colors",
              taskTypeFilter === "guide_doc"
                ? "bg-[#084734] text-white"
                : "bg-[#F6F5F4] text-[#615D59] hover:text-[#111110]"
            )}
          >
            가이드 ({data?.upcomingTasks.filter((t) => t.type === "guide_doc").length ?? 0})
          </button>

          {/* Quick Stat Pill */}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 text-[10.5px] sm:text-[11px]">
            {upcomingUrgentCount > 0 ? (
              <span className="rounded-full bg-[#FCE9E9] px-2 py-0.5 font-bold text-[#8F2C2C]">
                지연 {upcomingUrgentCount}건
              </span>
            ) : null}
            {upcomingTodayCount > 0 ? (
              <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 font-bold text-[#084734]">
                오늘 {upcomingTodayCount}건
              </span>
            ) : null}
          </div>
        </div>

        {/* Task Content: Cards vs Timeline */}
        {taskViewMode === "cards" ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredUpcomingTasks.length > 0 ? (
              filteredUpcomingTasks.map((task) => {
                const isUrgent = task.urgency === "urgent" || task.dDay.includes("지연")
                const isToday = task.urgency === "today" || task.dDay.includes("오늘")
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "flex flex-col justify-between rounded-[16px] border p-4 shadow-2xs transition-all hover:border-black/[0.16]",
                      isUrgent
                        ? "border-[#B43E3E]/40 bg-[#FCE9E9]/20"
                        : isToday
                          ? "border-[#084734]/30 bg-[#ECFDF5]/20"
                          : "border-black/[0.08] bg-white"
                    )}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                              isUrgent
                                ? "bg-[#B43E3E] text-white"
                                : isToday
                                  ? "bg-[#084734] text-white"
                                  : "bg-[#F6F5F4] text-[#615D59]"
                            )}
                          >
                            {task.dDay}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                              task.type === "follow_up"
                                ? "bg-[#ECFDF5] text-[#084734]"
                                : task.type === "showroom"
                                  ? "bg-[#F6F5F4] text-[#084734] border border-[#084734]/20"
                                  : task.type === "install"
                                    ? "bg-[#FBF1E0] text-[#A8741A]"
                                    : "bg-[#F6F5F4] text-[#615D59]"
                            )}
                          >
                            {task.typeLabel}
                          </span>
                        </div>

                        {/* Scheduled Time */}
                        <span className="flex items-center gap-1 text-[11px] font-medium text-[#615D59]">
                          <Clock className="h-3 w-3 text-[#A39E98]" />
                          {formatScheduledTime(task.scheduledDate, task.scheduledTime)}
                        </span>
                      </div>

                      {/* Task Title */}
                      <h3 className="mt-2 text-sm font-bold text-[#111110]">
                        {task.title}
                      </h3>

                      {/* Customer Org & Info */}
                      {task.customerName || task.customerOrg ? (
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-[#615D59]">
                          <span className="font-semibold text-[#111110]">{task.customerName}</span>
                          {task.customerOrg ? <span>• {task.customerOrg}</span> : null}
                        </div>
                      ) : null}

                      {/* Description excerpt */}
                      {task.description ? (
                        <p className="mt-2 line-clamp-2 text-[11.5px] text-[#615D59]">
                          {task.description}
                        </p>
                      ) : null}
                    </div>

                    {/* Bottom Action row */}
                    <div className="mt-4 flex items-center justify-between border-t border-black/[0.04] pt-2.5 text-xs">
                      <span className="text-[11px] text-[#A39E98]">
                        {task.ownerName ? `담당: ${task.ownerName}` : "담당 미지정"}
                      </span>
                      <Link
                        href={task.targetUrl}
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#084734] hover:underline"
                      >
                        <span>{task.targetUrlLabel}</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="col-span-full rounded-[16px] border border-black/[0.08] bg-[#FAFAF8] p-8 text-center text-sm text-[#A39E98]">
                해당 분류의 앞으로 예정된 작업 일정이 없습니다.
              </div>
            )}
          </div>
        ) : (
          /* Timeline Chronological View */
          <div className="mt-4 space-y-4">
            {/* Group 1: 오늘 및 지연 */}
            {timelineGroups.todayAndUrgent.length > 0 ? (
              <div className="rounded-[16px] border border-[#084734]/20 bg-[#ECFDF5]/30 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#084734]">
                  <Flame className="h-3.5 w-3.5" />
                  <span>오늘 마감 및 지연 과업 ({timelineGroups.todayAndUrgent.length}건)</span>
                </div>
                <div className="mt-2.5 divide-y divide-black/[0.04]">
                  {timelineGroups.todayAndUrgent.map((task) => (
                    <div key={task.id} className="flex flex-col justify-between gap-2 py-2 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded-full bg-[#084734] px-2 py-0.5 text-[10px] font-bold text-white">
                          {task.dDay}
                        </span>
                        <span className="font-semibold text-[#111110]">{task.title}</span>
                        {task.customerName ? <span className="text-[#615D59]">({task.customerName})</span> : null}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-[11px] text-[#A39E98]">{formatScheduledTime(task.scheduledDate, task.scheduledTime)}</span>
                        <Link href={task.targetUrl} className="font-semibold text-[#084734] hover:underline">
                          {task.targetUrlLabel} →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Group 2: 내일 예정 */}
            {timelineGroups.tomorrow.length > 0 ? (
              <div className="rounded-[16px] border border-black/[0.08] bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#111110]">
                  <Clock className="h-3.5 w-3.5 text-[#084734]" />
                  <span>내일 예정 과업 ({timelineGroups.tomorrow.length}건)</span>
                </div>
                <div className="mt-2.5 divide-y divide-black/[0.04]">
                  {timelineGroups.tomorrow.map((task) => (
                    <div key={task.id} className="flex flex-col justify-between gap-2 py-2 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[10px] font-semibold text-[#615D59]">
                          {task.dDay}
                        </span>
                        <span className="font-semibold text-[#111110]">{task.title}</span>
                        {task.customerName ? <span className="text-[#615D59]">({task.customerName})</span> : null}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-[11px] text-[#A39E98]">{formatScheduledTime(task.scheduledDate, task.scheduledTime)}</span>
                        <Link href={task.targetUrl} className="font-semibold text-[#084734] hover:underline">
                          {task.targetUrlLabel} →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Group 3: 이번 주 후반 */}
            {timelineGroups.thisWeek.length > 0 ? (
              <div className="rounded-[16px] border border-black/[0.08] bg-[#FAFAF8] p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#615D59]">
                  <CalendarClock className="h-3.5 w-3.5" />
                  <span>이번 주 후반 예정 ({timelineGroups.thisWeek.length}건)</span>
                </div>
                <div className="mt-2.5 divide-y divide-black/[0.04]">
                  {timelineGroups.thisWeek.map((task) => (
                    <div key={task.id} className="flex flex-col justify-between gap-2 py-2 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#A39E98] shadow-2xs">
                          {task.dDay}
                        </span>
                        <span className="font-medium text-[#111110]">{task.title}</span>
                        {task.customerName ? <span className="text-[#615D59]">({task.customerName})</span> : null}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-[11px] text-[#A39E98]">{formatScheduledTime(task.scheduledDate, task.scheduledTime)}</span>
                        <Link href={task.targetUrl} className="font-semibold text-[#084734] hover:underline">
                          {task.targetUrlLabel} →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {filteredUpcomingTasks.length === 0 ? (
              <div className="rounded-[16px] border border-black/[0.08] bg-[#FAFAF8] p-8 text-center text-sm text-[#A39E98]">
                예정된 작업 일정이 없습니다.
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* -------------------------------------------------------------------------
          SECTION 2. 최신 자주 오는 문제 (이슈 클러스터링 & 1-클릭 FAQ 승격)
          ------------------------------------------------------------------------- */}
      <section className="mt-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-[#B85C33]" />
              <h2 className="text-lg font-bold text-[#111110]">최신 자주 오는 문제</h2>
            </div>
            <p className="mt-0.5 text-xs text-[#615D59]">
              상담 및 챗봇 질문 중 반복 빈도가 높은 핵심 문제 군집 (FAQ 등록 및 가이드 보강 추천)
            </p>
          </div>

          {selectedGenre !== "all" ? (
            <div className="flex items-center gap-1.5 text-xs text-[#615D59]">
              <span>선택 장르 필터:</span>
              <span className="rounded-full bg-[#ECFDF5] px-2.5 py-0.5 font-semibold text-[#084734]">
                {data?.genres.find((g) => g.category === selectedGenre)?.label ?? selectedGenre}
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFrequentIssues.length > 0 ? (
            filteredFrequentIssues.map((issue) => {
              const isPromoted = promotedMap[issue.id]
              const isPromoting = promotingId === issue.id
              return (
                <div
                  key={issue.id}
                  className="flex flex-col justify-between rounded-[16px] border border-black/[0.08] bg-white p-4 shadow-2xs transition-all hover:border-black/[0.16]"
                >
                  <div>
                    {/* Top tags */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                          style={{
                            backgroundColor: `${CS_CATEGORY_MAP[issue.category]?.color ?? "#64748B"}15`,
                            color: CS_CATEGORY_MAP[issue.category]?.color ?? "#64748B",
                          }}
                        >
                          {issue.categoryLabel}
                        </span>
                        <span className="rounded-full bg-[#F6F5F4] px-1.5 py-0.5 text-[10px] text-[#615D59]">
                          {issue.sourceLabel}
                        </span>
                      </div>
                      <span className="rounded-full bg-[#FAFAF8] px-2 py-0.5 text-[11.5px] font-bold text-[#111110] tabular-nums border border-black/[0.04]">
                        {issue.count}회 반복
                      </span>
                    </div>

                    {/* Question title */}
                    <h3 className="mt-2 text-sm font-bold leading-snug text-[#111110]">
                      {issue.title}
                    </h3>

                    {/* Samples */}
                    {issue.sampleQuestions.length > 0 ? (
                      <div className="mt-2.5 space-y-1 rounded-[10px] bg-[#FAFAF8] p-2 text-[11px] text-[#615D59]">
                        <p className="text-[10px] font-semibold text-[#A39E98]">실제 고객 질문 예시:</p>
                        {issue.sampleQuestions.map((q, idx) => (
                          <p key={idx} className="truncate">
                            • {q}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center justify-between border-t border-black/[0.04] pt-3 text-[11.5px]">
                    <span className="text-[11px] text-[#A39E98]">
                      최근 발생: {formatRelativeTime(issue.lastAskedAt)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handlePromoteToFaq(issue)}
                        disabled={isPromoted || isPromoting}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                          isPromoted
                            ? "bg-[#ECFDF5] text-[#084734]"
                            : "border border-[#084734]/30 bg-white text-[#084734] hover:bg-[#ECFDF5]"
                        )}
                      >
                        <Sparkles className="h-3 w-3" />
                        {isPromoted ? "등록 완료" : isPromoting ? "등록 중..." : "추천 질문 등록"}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="col-span-full rounded-[16px] border border-black/[0.08] bg-[#FAFAF8] p-8 text-center text-sm text-[#A39E98]">
              해당 조건의 자주 오는 문제 군집이 없습니다.
            </div>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------------------
          SECTION 3. 답변 안된 내역 (Unanswered Inquiries Table / Stream)
          ------------------------------------------------------------------------- */}
      <section id="unanswered-section" className="mt-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#B43E3E]" />
              <h2 className="text-lg font-bold text-[#111110]">
                답변 안된 내역 (실시간 대기 큐)
              </h2>
              <span className="rounded-full bg-[#B43E3E]/10 px-2.5 py-0.5 text-xs font-bold text-[#B43E3E] tabular-nums">
                {filteredUnanswered.length}건
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#615D59]">
              고객 응대가 필요한 채널톡 및 홈페이지 신규 접수 리드
            </p>
          </div>

          {/* Quick Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="고객명, 기관, 내용 검색..."
              className="w-full rounded-full border border-black/[0.08] bg-white py-1.5 pl-8 pr-3 text-[12px] text-[#111110] placeholder:text-[#A39E98] focus:border-[#084734] focus:outline-hidden"
            />
          </div>
        </div>

        {/* Tab filters */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-black/[0.06] pb-2">
          <button
            type="button"
            onClick={() => setUnansweredChannelTab("all")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              unansweredChannelTab === "all"
                ? "bg-[#111110] text-white"
                : "bg-[#F6F5F4] text-[#615D59] hover:text-[#111110]"
            )}
          >
            전체 대기 ({data?.unansweredInquiries.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setUnansweredChannelTab("channel_talk")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              unansweredChannelTab === "channel_talk"
                ? "bg-[#FF6B00] text-white"
                : "bg-[#F6F5F4] text-[#615D59] hover:text-[#111110]"
            )}
          >
            채널톡 ({data?.unansweredInquiries.filter((i) => i.channel === "channel_talk").length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setUnansweredChannelTab("homepage")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              unansweredChannelTab === "homepage"
                ? "bg-[#084734] text-white"
                : "bg-[#F6F5F4] text-[#615D59] hover:text-[#111110]"
            )}
          >
            홈페이지 문의 ({data?.unansweredInquiries.filter((i) => i.channel === "homepage").length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setUnansweredChannelTab("call_log")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              unansweredChannelTab === "call_log"
                ? "bg-[#6366F1] text-white"
                : "bg-[#F6F5F4] text-[#615D59] hover:text-[#111110]"
            )}
          >
            전화 일지 ({data?.unansweredInquiries.filter((i) => i.channel === "call_log").length ?? 0})
          </button>
          {criticalCount > 0 ? (
            <button
              type="button"
              onClick={() => setUnansweredChannelTab("critical")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold transition-colors",
                unansweredChannelTab === "critical"
                  ? "bg-[#B43E3E] text-white"
                  : "bg-[#FCE9E9] text-[#8F2C2C] hover:bg-[#B43E3E] hover:text-white"
              )}
            >
              🚨 24시간 초과 긴급 ({criticalCount})
            </button>
          ) : null}
        </div>

        {/* Inquiries List */}
        <div className="mt-4 space-y-2.5">
          {filteredUnanswered.length > 0 ? (
            filteredUnanswered.map((inquiry) => {
              const isCritical = inquiry.urgency === "critical"
              const isWarning = inquiry.urgency === "warning"
              return (
                <div
                  key={inquiry.id}
                  className={cn(
                    "flex flex-col justify-between gap-3 rounded-[16px] border p-3.5 sm:p-4 shadow-2xs transition-all sm:flex-row sm:items-center",
                    isCritical
                      ? "border-[#B43E3E]/40 bg-[#FCE9E9]/30 hover:border-[#B43E3E]"
                      : isWarning
                        ? "border-[#A8741A]/30 bg-[#FBF1E0]/20 hover:border-[#A8741A]"
                        : "border-black/[0.08] bg-white hover:border-black/[0.16]"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    {/* Header info row */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
                      {/* Urgency Badge */}
                      {isCritical ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#B43E3E] px-2 py-0.5 text-[10px] sm:text-[10.5px] font-bold text-white shrink-0">
                          <AlertTriangle className="h-3 w-3" />
                          24시간 초과 긴급
                        </span>
                      ) : isWarning ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FBF1E0] px-2 py-0.5 text-[10px] sm:text-[10.5px] font-semibold text-[#7A520F] shrink-0">
                          <Clock className="h-3 w-3" />
                          2시간 경과
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[10px] sm:text-[10.5px] font-medium text-[#615D59] shrink-0">
                          신규
                        </span>
                      )}

                      {/* Channel Badge */}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] sm:text-[10.5px] font-semibold shrink-0",
                          inquiry.channel === "channel_talk"
                            ? "bg-[#FF6B00]/10 text-[#D85A30]"
                            : "bg-[#084734]/10 text-[#084734]"
                        )}
                      >
                        {inquiry.channelLabel}
                      </span>

                      {/* Category Badge */}
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] sm:text-[10.5px] font-semibold shrink-0"
                        style={{
                          backgroundColor: `${CS_CATEGORY_MAP[inquiry.category]?.color ?? "#64748B"}15`,
                          color: CS_CATEGORY_MAP[inquiry.category]?.color ?? "#64748B",
                        }}
                      >
                        {inquiry.categoryLabel}
                      </span>

                      {/* Customer Info */}
                      <span className="font-bold text-[#111110] truncate">
                        {inquiry.customerName}
                      </span>
                      {inquiry.customerOrg ? (
                        <span className="text-[#615D59] truncate text-[11px] sm:text-xs">({inquiry.customerOrg})</span>
                      ) : null}
                      {inquiry.customerContact ? (
                        <span className="text-[#A39E98] text-[11px] hidden sm:inline">• {inquiry.customerContact}</span>
                      ) : null}

                      {/* Waiting time */}
                      <span
                        className={cn(
                          "ml-auto text-[10.5px] sm:text-[11px] font-medium tabular-nums shrink-0",
                          isCritical ? "text-[#8F2C2C] font-bold" : "text-[#A39E98]"
                        )}
                      >
                        {formatWaitingHours(inquiry.waitingMinutes)}
                      </span>
                    </div>

                    {/* Inquiry Message Text */}
                    <p className="mt-2 text-[13px] sm:text-sm leading-relaxed text-[#31302E] line-clamp-2">
                      {inquiry.inquiryText}
                    </p>
                  </div>

                  {/* Action Link buttons */}
                  <div className="flex shrink-0 items-center justify-end gap-2 pt-2 sm:pt-0 sm:self-center border-t sm:border-t-0 border-black/[0.04]">
                    <button
                      type="button"
                      onClick={() => setSelectedInquiry(inquiry)}
                      className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[11.5px] sm:text-xs font-semibold text-[#615D59] shadow-2xs transition-colors hover:bg-[#F6F5F4] hover:text-[#111110]"
                    >
                      상세보기
                    </button>
                    <Link
                      href={inquiry.targetUrl}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[11.5px] sm:text-xs font-semibold shadow-xs transition-colors",
                        isCritical
                          ? "bg-[#B43E3E] text-white hover:bg-[#8F2C2C]"
                          : "bg-[#084734] text-white hover:bg-[#065c41]"
                      )}
                    >
                      <span>답변하기</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="rounded-[16px] border border-black/[0.08] bg-[#FAFAF8] p-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-[#084734]" />
              <p className="mt-2 text-sm font-bold text-[#111110]">
                모든 문의가 답변 완료되었습니다!
              </p>
              <p className="mt-0.5 text-xs text-[#615D59]">
                현재 대기 중인 채널톡 및 홈페이지 문의가 없습니다.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------------------
          SECTION 4. 연동 세부 상태 및 CS 콘솔 바로가기 (하단 배치로 깔끔한 마무리)
          ------------------------------------------------------------------------- */}
      <section className="mt-12 rounded-[18px] border border-black/[0.08] bg-[#F6F5F4] p-5">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Channel Talk Connection Details */}
          <div className="flex flex-col justify-between rounded-[14px] bg-white p-4 border border-black/[0.06] shadow-2xs">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734]">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#111110]">채널톡 연동 세부 정보</h3>
                  <p className="text-[11px] text-[#615D59]">웹 위젯 · 실시간 인바운드 웹훅 · Open API</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSyncChannelTalk}
                disabled={syncing}
                className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-[#F6F5F4] px-2.5 py-1 text-[11px] font-semibold text-[#111110] transition-colors hover:bg-black/[0.06] disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin text-[#084734]")} />
                <span>{syncing ? "동기화 중..." : "동기화"}</span>
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-y-1 gap-x-4 border-t border-black/[0.04] pt-2 text-[11.5px] text-[#615D59]">
              <div>
                마지막 동기화:{" "}
                <span className="font-semibold text-[#111110]">
                  {formatRelativeTime(connections?.channelTalk.lastSyncedAt)}
                </span>
              </div>
              <div>
                누적 상담:{" "}
                <span className="font-semibold tabular-nums text-[#111110]">
                  {connections?.channelTalk.totalCount ?? 0}건
                </span>
              </div>
              <Link
                href="/admin/channel-talk"
                className="ml-auto inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[#084734] hover:underline"
              >
                채널톡 Inbox 바로가기
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* Homepage Form Connection Details */}
          <div className="flex flex-col justify-between rounded-[14px] bg-white p-4 border border-black/[0.06] shadow-2xs">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734]">
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#111110]">홈페이지 문의 폼 연동 세부 정보</h3>
                  <p className="text-[11px] text-[#615D59]">/contact 문의 · 데모 신청 폼 · DB 영속</p>
                </div>
              </div>

              <Link
                href="/contact"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-[#F6F5F4] px-2.5 py-1 text-[11px] font-semibold text-[#111110] transition-colors hover:bg-black/[0.06]"
              >
                <span>폼 확인</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-y-1 gap-x-4 border-t border-black/[0.04] pt-2 text-[11.5px] text-[#615D59]">
              <div>
                최근 접수:{" "}
                <span className="font-semibold text-[#111110]">
                  {formatRelativeTime(connections?.homepage.lastInquiryAt)}
                </span>
              </div>
              <div>
                누적 접수:{" "}
                <span className="font-semibold tabular-nums text-[#111110]">
                  {connections?.homepage.totalCount ?? 0}건
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <span>알림톡:</span>
                <span
                  className={cn(
                    "font-semibold",
                    connections?.homepage.smsConfigured ? "text-[#084734]" : "text-[#A8741A]"
                  )}
                >
                  {connections?.homepage.smsConfigured ? "발송 활성" : "미설정"}
                </span>
              </div>
              <Link
                href="/admin/crm"
                className="ml-auto inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[#084734] hover:underline"
              >
                CRM 리드 바로가기
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* CS Ops Shortcuts */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-3">
          <span className="text-xs font-bold text-[#111110]">CS 콘솔 바로가기:</span>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/channel-talk"
              className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-[#111110] shadow-2xs hover:bg-[#FAFAF8]"
            >
              채널톡 상담 Inbox ↗
            </Link>
            <Link
              href="/admin/docs?tab=gaps"
              className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-[#111110] shadow-2xs hover:bg-[#FAFAF8]"
            >
              미해결 큐 ↗
            </Link>
            <Link
              href="/admin/docs?tab=quality"
              className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-[#111110] shadow-2xs hover:bg-[#FAFAF8]"
            >
              AI 품질 검수 ↗
            </Link>
            <Link
              href="/admin/docs?tab=documents"
              className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-[#111110] shadow-2xs hover:bg-[#FAFAF8]"
            >
              가이드 문서 ↗
            </Link>
          </div>
        </div>
      </section>

      {/* Quick View Modal for selected inquiry */}
      {selectedInquiry ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6 backdrop-blur-xs"
          onClick={() => setSelectedInquiry(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[20px] border border-black/[0.08] bg-white p-4 sm:p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10.5px] sm:text-[11px] font-bold",
                      selectedInquiry.urgency === "critical"
                        ? "bg-[#B43E3E] text-white"
                        : selectedInquiry.urgency === "warning"
                          ? "bg-[#FBF1E0] text-[#7A520F]"
                          : "bg-[#F6F5F4] text-[#615D59]"
                    )}
                  >
                    {selectedInquiry.urgency === "critical"
                      ? "🚨 24h 초과 긴급"
                      : selectedInquiry.urgency === "warning"
                        ? "⚠️ 2h 경과"
                        : "신규"}
                  </span>
                  <span className="rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[10.5px] sm:text-[11px] font-semibold text-[#615D59]">
                    {selectedInquiry.channelLabel}
                  </span>
                  <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] sm:text-[11px] font-semibold text-[#084734]">
                    {selectedInquiry.categoryLabel}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-bold text-[#111110]">
                  {selectedInquiry.customerName}{" "}
                  {selectedInquiry.customerOrg ? `(${selectedInquiry.customerOrg})` : ""}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInquiry(null)}
                className="rounded-full p-1.5 text-[#A39E98] hover:bg-[#F6F5F4] hover:text-[#111110]"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-1.5 rounded-[12px] bg-[#F6F5F4] p-3 text-xs">
              <div className="flex items-center justify-between text-[#615D59]">
                <span>연락처:</span>
                <div className="flex items-center gap-1.5 font-semibold text-[#111110]">
                  <span>{selectedInquiry.customerContact || "연락처 미등록"}</span>
                  {selectedInquiry.customerContact ? (
                    <button
                      type="button"
                      onClick={() => handleCopyContact(selectedInquiry.customerContact!)}
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] font-normal hover:bg-black/[0.08]"
                    >
                      {copiedContact ? (
                        <Check className="h-3 w-3 text-[#084734]" />
                      ) : (
                        <Copy className="h-3 w-3 text-[#615D59]" />
                      )}
                      <span>{copiedContact ? "복사됨" : "복사"}</span>
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center justify-between text-[#615D59]">
                <span>대기 시간:</span>
                <span className="font-bold tabular-nums text-[#111110]">
                  {formatWaitingHours(selectedInquiry.waitingMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#615D59]">
                <span>접수 시각:</span>
                <span className="tabular-nums text-[#111110]">
                  {new Date(selectedInquiry.createdAt).toLocaleString("ko-KR")}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-bold text-[#615D59]">문의 내용 전문</h4>
              <div className="mt-1.5 max-h-48 overflow-y-auto rounded-[12px] border border-black/[0.06] bg-white p-3.5 text-[13px] sm:text-sm leading-relaxed text-[#111110]">
                {selectedInquiry.inquiryText}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-black/[0.06] pt-4">
              <button
                type="button"
                onClick={() => setSelectedInquiry(null)}
                className="rounded-full border border-black/[0.08] px-4 py-2 text-xs font-semibold text-[#615D59] hover:bg-[#F6F5F4] text-center"
              >
                닫기
              </button>
              <Link
                href={selectedInquiry.targetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#084734] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#065c41] text-center"
              >
                <span>
                  {selectedInquiry.channel === "channel_talk"
                    ? "채널톡에서 응대하기"
                    : "CRM에서 처리하기"}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Quick Call Log Ingestion Modal */}
      <QuickCallLogModal
        isOpen={isCallLogModalOpen}
        onClose={() => setIsCallLogModalOpen(false)}
        onSuccess={() => void loadData(true)}
      />
    </div>
  )
}

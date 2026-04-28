"use client"

import { type DragEvent, useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
} from "lucide-react"
import { CustomerDialog } from "@/components/partner-portal/crud/CustomerDialog"
import { DealQuickCreateDialog } from "@/components/partner-portal/crud/DealQuickCreateDialog"
import { ScheduleDialog } from "@/components/partner-portal/crud/ScheduleDialog"
import { MobileActionLauncher } from "@/components/partner-portal/mobile/MobileActionLauncher"
import { Button } from "@/components/ui/button"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"

/* ─── Types ──────────────────────────────────────────────────── */

type PartnerReadMode = "v2" | "legacy" | "demo"

type OverviewMetrics = {
  customer_count: number
  active_deal_count: number
  installation_deal_count: number
  unpaid_deal_count: number
  contracted_amount: number
  installed_amount: number
  paid_amount: number
  outstanding_amount: number
}

type ActivityLog = {
  id: string
  summary: string
  action_type: string
  created_at: string
}

type InstallationEvent = {
  id: string
  title: string
  location: string | null
  scheduled_start_at: string
  scheduled_end_at: string
}

type PaymentRecord = {
  id: string
  amount: number
  paid_at: string
  payment_method: string
}

type CalendarEvent = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  source_type: string
}

type CustomerItem = {
  customer: {
    id: string
    name: string
    campus_name: string | null
    region_label: string | null
  }
  summary: {
    active_deals: number
    unpaid_deals: number
    outstanding_amount: number
    last_deal_updated_at: string | null
  } | null
}

type DealItem = {
  id: string
  customer_id: string
  title: string
  deal_code: string
  current_stage: string
  customer_name: string | null
  customer_campus_name: string | null
  expected_amount: number
  contracted_amount: number
  paid_amount: number
  outstanding_amount: number
  manager_name?: string | null
}

type InventorySkuSummary = {
  sku: string
  product_name: string
  pending_qty: number
  shipped_qty: number
  delivered_qty: number
  total_qty: number
}

type PartnerOverviewPayload = {
  mode: PartnerReadMode
  metrics: OverviewMetrics
  customers: CustomerItem[]
  deals: DealItem[]
  recent_activity: ActivityLog[]
  upcoming_installations: InstallationEvent[]
  recent_payments: PaymentRecord[]
  recent_calendar_events: CalendarEvent[]
  inventory_summary: InventorySkuSummary[]
}

type PartnerOverviewResponse = Partial<PartnerOverviewPayload> & {
  error?: string
  inventory_summary?: InventorySkuSummary[]
}

type PartnerPortalLinkTargets = {
  calendar: string
  documents: string
  workspace: string
}

type PartnerPortalHomeProps = {
  overviewEndpoint?: string
  linkTargets?: Partial<PartnerPortalLinkTargets>
  allowCreate?: boolean
  adminView?: boolean
  embedded?: boolean
}

const DEFAULT_LINK_TARGETS: PartnerPortalLinkTargets = {
  calendar: "/partner/calendar",
  documents: "/partner/documents",
  workspace: "/partner/workspace",
}

/* ─── Constants ──────────────────────────────────────────────── */

const STAGE_PIPELINE = [
  "contact", "quote", "contract", "confirmed", "installation", "payment",
] as const

type PipelineStage = (typeof STAGE_PIPELINE)[number]

const STAGE_CFG: Record<string, {
  label: string
  dotCls: string
  badgeCls: string
  headerCls: string
  borderCls: string
}> = {
  contact:      { label: "컨택",  dotCls: "bg-stone-400",   badgeCls: "bg-stone-100 text-stone-600",       headerCls: "text-stone-500",      borderCls: "border-l-stone-300"     },
  quote:        { label: "견적",  dotCls: "bg-amber-500",   badgeCls: "bg-amber-100 text-amber-700",       headerCls: "text-amber-600",      borderCls: "border-l-amber-400"     },
  contract:     { label: "계약",  dotCls: "bg-[#084734]",   badgeCls: "bg-[#ECFDF5] text-[#084734]",       headerCls: "text-[#084734]",      borderCls: "border-l-[#084734]"     },
  confirmed:    { label: "확정",  dotCls: "bg-teal-500",    badgeCls: "bg-teal-100 text-teal-700",         headerCls: "text-teal-600",       borderCls: "border-l-teal-400"      },
  installation: { label: "설치",  dotCls: "bg-orange-500",  badgeCls: "bg-orange-100 text-orange-700",   headerCls: "text-orange-600",   borderCls: "border-l-orange-400"  },
  payment:      { label: "수납",  dotCls: "bg-emerald-500", badgeCls: "bg-emerald-100 text-emerald-700", headerCls: "text-emerald-600",  borderCls: "border-l-emerald-400" },
  closed:       { label: "완료",  dotCls: "bg-gray-400",    badgeCls: "bg-gray-100 text-gray-500",       headerCls: "text-gray-400",     borderCls: "border-l-gray-300"    },
  cancelled:    { label: "취소",  dotCls: "bg-red-400",     badgeCls: "bg-red-100 text-red-500",         headerCls: "text-red-400",      borderCls: "border-l-red-300"     },
}

const ACTIVITY_TYPE_CFG: Record<string, { cls: string; emoji: string }> = {
  document: { cls: "bg-amber-100 text-amber-700",     emoji: "📄" },
  schedule: { cls: "bg-orange-100 text-orange-600",   emoji: "📅" },
  payment:  { cls: "bg-emerald-100 text-emerald-600", emoji: "💰" },
  default:  { cls: "bg-stone-100 text-stone-500",     emoji: "·"  },
}

const CAL_SOURCE_EMOJI: Record<string, string> = {
  meeting:      "🤝",
  document_due: "📋",
  installation: "⚒",
  internal:     "📌",
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank_transfer: "계좌이체",
  card:          "카드",
  cash:          "현금",
}

/* ─── Empty Data ─────────────────────────────────────────────── */

const EMPTY_OVERVIEW: PartnerOverviewPayload = {
  mode: "legacy",
  metrics: {
    customer_count: 0,
    active_deal_count: 0,
    installation_deal_count: 0,
    unpaid_deal_count: 0,
    contracted_amount: 0,
    installed_amount: 0,
    paid_amount: 0,
    outstanding_amount: 0,
  },
  customers: [],
  deals: [],
  recent_activity: [],
  upcoming_installations: [],
  recent_payments: [],
  recent_calendar_events: [],
  inventory_summary: [],
}

/* ─── Utils ──────────────────────────────────────────────────── */

function fmt(v: number): string {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`
  if (v >= 10000000)  return `${Math.floor(v / 10000000) * 1000 + Math.floor((v % 10000000) / 10000)}만`
  if (v >= 10000)     return `${Math.floor(v / 10000)}만`
  return `${v.toLocaleString("ko-KR")}원`
}

function fmtFull(v: number): string {
  return `${v.toLocaleString("ko-KR")}원`
}

function fmtShortDate(d: string): string {
  return new Date(d).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
}

function fmtRelative(d: string): string {
  const diff = Date.now() - new Date(d).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return "방금 전"
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days === 1) return "어제"
  if (days < 7) return `${days}일 전`
  return fmtShortDate(d)
}

function daysUntil(d: string): number {
  const target = new Date(d)
  const now = new Date()
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - now.getTime()) / 86400000)
}

function dealPaymentBadge(deal: DealItem): { label: string; cls: string } {
  if (deal.contracted_amount === 0) return { label: "미계약", cls: "bg-stone-100 text-stone-500" }
  if (deal.outstanding_amount === 0) return { label: "완납", cls: "bg-emerald-100 text-emerald-700" }
  if (deal.paid_amount > 0) return { label: "부분수납", cls: "bg-amber-100 text-amber-700" }
  return { label: "미수", cls: "bg-red-100 text-red-600" }
}

/* ─── Normalize / Type-guard ─────────────────────────────────── */

function isPartnerReadMode(value: unknown): value is PartnerReadMode {
  return value === "v2" || value === "legacy" || value === "demo"
}

function isPipelineStage(value: string): value is PipelineStage {
  return STAGE_PIPELINE.some(stage => stage === value)
}

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback
  try {
    const value = window.localStorage.getItem(key)
    return value === null ? fallback : value === "true"
  } catch {
    return fallback
  }
}

function normalizeOverviewPayload(payload: PartnerOverviewResponse): PartnerOverviewPayload {
  const metrics = payload.metrics
  return {
    mode: isPartnerReadMode(payload.mode) ? payload.mode : EMPTY_OVERVIEW.mode,
    metrics: {
      customer_count: metrics?.customer_count ?? 0,
      active_deal_count: metrics?.active_deal_count ?? 0,
      installation_deal_count: metrics?.installation_deal_count ?? 0,
      unpaid_deal_count: metrics?.unpaid_deal_count ?? 0,
      contracted_amount: metrics?.contracted_amount ?? 0,
      installed_amount: metrics?.installed_amount ?? 0,
      paid_amount: metrics?.paid_amount ?? 0,
      outstanding_amount: metrics?.outstanding_amount ?? 0,
    },
    customers: Array.isArray(payload.customers) ? payload.customers : [],
    deals: Array.isArray(payload.deals) ? payload.deals : [],
    recent_activity: Array.isArray(payload.recent_activity) ? payload.recent_activity : [],
    upcoming_installations: Array.isArray(payload.upcoming_installations) ? payload.upcoming_installations : [],
    recent_payments: Array.isArray(payload.recent_payments) ? payload.recent_payments : [],
    recent_calendar_events: Array.isArray(payload.recent_calendar_events) ? payload.recent_calendar_events : [],
    inventory_summary: Array.isArray(payload.inventory_summary) ? payload.inventory_summary : [],
  }
}

/* ─── Mini Calendar ──────────────────────────────────────────── */

type CalDot = { day: number; type: "installation" | "other" }

function MiniCalendar({
  eventDots,
}: {
  eventDots: CalDot[]
}) {
  const today = new Date()
  const [viewYear, setViewYear]   = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-indexed

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDow    = new Date(viewYear, viewMonth, 1).getDay() // 0=Sun

  const isCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth()

  const dotsByDay = useMemo(() => {
    const map: Record<number, CalDot["type"][]> = {}
    for (const dot of eventDots) {
      if (!map[dot.day]) map[dot.day] = []
      map[dot.day].push(dot.type)
    }
    return map
  }, [eventDots])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // pad to full rows
  while (cells.length % 7 !== 0) cells.push(null)

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long",
  })

  return (
    <div className="select-none">
      {/* header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-[#111110]">{monthLabel}</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#1a1a1a]/40 transition-colors hover:bg-[#f0ebe2] hover:text-[#111110]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#1a1a1a]/40 transition-colors hover:bg-[#f0ebe2] hover:text-[#111110]"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* weekday header */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {["일", "월", "화", "수", "목", "금", "토"].map(d => (
          <span key={d} className="text-[10px] font-medium text-[#1a1a1a]/35">{d}</span>
        ))}
      </div>

      {/* day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="h-8" />
          }
          const isToday = isCurrentMonth && day === today.getDate()
          const dots    = dotsByDay[day] ?? []
          return (
            <div key={day} className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-medium leading-none
                  ${isToday
                    ? "bg-[#111110] text-white"
                    : "text-[#1a1a1a]/70 hover:bg-[#f0ebe2]"
                  }`}
              >
                {day}
              </div>
              {/* event dots */}
              {dots.length > 0 && (
                <div className="mt-0.5 flex gap-0.5">
                  {dots.slice(0, 2).map((type, di) => (
                    <span
                      key={di}
                      className={`h-1 w-1 rounded-full ${type === "installation" ? "bg-orange-400" : "bg-teal-400"}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Left Sidebar ───────────────────────────────────────────── */

function LeftSidebar({
  open,
  onOpenChange,
  upcoming_installations,
  recent_calendar_events,
  recent_activity,
  calendarHref,
  adminView = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  upcoming_installations: InstallationEvent[]
  recent_calendar_events: CalendarEvent[]
  recent_activity: ActivityLog[]
  calendarHref: string
  adminView?: boolean
}) {
  // build event dots for current month
  const calDots: CalDot[] = useMemo(() => {
    const now = new Date()
    const dots: CalDot[] = []
    for (const inst of upcoming_installations) {
      const d = new Date(inst.scheduled_start_at)
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        dots.push({ day: d.getDate(), type: "installation" })
      }
    }
    for (const evt of recent_calendar_events) {
      const d = new Date(evt.starts_at)
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        dots.push({ day: d.getDate(), type: "other" })
      }
    }
    return dots
  }, [upcoming_installations, recent_calendar_events])

  // upcoming schedule: merge installations + calendar events, sort by date, max 6
  const upcomingItems = useMemo(() => {
    type Item = { id: string; title: string; date: string; type: "installation" | "calendar"; source_type?: string; location?: string | null; days: number }
    const items: Item[] = [
      ...upcoming_installations.map(i => ({
        id: i.id,
        title: i.title,
        date: i.scheduled_start_at,
        type: "installation" as const,
        location: i.location,
        days: daysUntil(i.scheduled_start_at),
      })),
      ...recent_calendar_events.map(e => ({
        id: e.id,
        title: e.title,
        date: e.starts_at,
        type: "calendar" as const,
        source_type: e.source_type,
        days: daysUntil(e.starts_at),
      })),
    ]
    return items
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 6)
  }, [upcoming_installations, recent_calendar_events])

  if (!open) {
    return (
      <aside
        className={`hidden border-r border-[#e7e0d6] bg-white lg:flex lg:flex-col lg:items-center ${
          adminView ? "lg:sticky lg:top-0 lg:h-[100dvh]" : "lg:sticky lg:top-[56px] lg:h-[calc(100vh-56px)]"
        }`}
      >
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          title="일정 패널 펼치기"
          className="mt-4 flex h-40 w-9 flex-col items-center justify-center gap-2 rounded-2xl border border-[#e7e0d6] bg-[#F6F5F4] text-[#A39E98] transition-colors hover:bg-[#ECFDF5] hover:text-[#084734]"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          <span
            className="text-[10px] font-semibold"
            style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}
          >
            일정
          </span>
        </button>
      </aside>
    )
  }

  return (
    <aside
      className={`hidden border-r border-[#e7e0d6] bg-white lg:flex lg:flex-col lg:overflow-y-auto ${
        adminView ? "lg:sticky lg:top-0 lg:h-[100dvh]" : "lg:sticky lg:top-[56px] lg:h-[calc(100vh-56px)]"
      }`}
    >
      <div className="p-4 space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#A39E98]">일정 패널</span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            title="일정 패널 접기"
            className="rounded-lg p-1 text-[#A39E98] transition-colors hover:bg-black/5 hover:text-[#615D59]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Mini Calendar */}
        <div>
          <MiniCalendar eventDots={calDots} />
        </div>

        <div className="h-px bg-[#e7e0d6]" />

        {/* Upcoming Schedule */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#111110]">급한 일정</h3>
            <a href={calendarHref} className="text-[10px] text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
              전체 →
            </a>
          </div>
          {upcomingItems.length === 0 ? (
            <p className="text-xs text-[#1a1a1a]/35">예정된 일정이 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {upcomingItems.map(item => {
                const isInstall = item.type === "installation"
                const emoji = isInstall ? "⚒" : (CAL_SOURCE_EMOJI[item.source_type ?? ""] ?? "📅")
                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-2 rounded-lg px-2.5 py-2 ${
                      isInstall
                        ? "border border-orange-100 bg-orange-50"
                        : "border border-[#ece4d8] bg-[#faf6ef]"
                    }`}
                  >
                    <span className="mt-0.5 text-sm leading-none">{emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-xs font-medium ${isInstall ? "text-orange-900" : "text-[#111110]"}`}>
                        {item.title}
                      </p>
                      <p className={`mt-0.5 text-[10px] ${isInstall ? "text-orange-600/70" : "text-[#1a1a1a]/40"}`}>
                        {fmtShortDate(item.date)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      item.days === 0
                        ? "bg-orange-500 text-white"
                        : item.days <= 3
                        ? "bg-orange-100 text-orange-700"
                        : isInstall
                        ? "bg-orange-50 text-orange-500"
                        : "bg-[#ece4d8] text-[#1a1a1a]/50"
                    }`}>
                      {item.days === 0 ? "오늘" : `D-${item.days}`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="h-px bg-[#e7e0d6]" />

        {/* Recent Activity */}
        <div>
          <h3 className="mb-3 text-xs font-semibold text-[#111110]">최근 활동</h3>
          {recent_activity.length === 0 ? (
            <p className="text-xs text-[#1a1a1a]/35">최근 활동이 없습니다.</p>
          ) : (
            <div className="space-y-0">
              {recent_activity.slice(0, 4).map((log, i) => {
                const isLast = i === Math.min(recent_activity.length, 4) - 1
                const atCfg  = ACTIVITY_TYPE_CFG[log.action_type] ?? ACTIVITY_TYPE_CFG.default
                return (
                  <div key={log.id} className="flex gap-2">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${atCfg.cls}`}>
                        {atCfg.emoji}
                      </div>
                      {!isLast && <div className="w-px flex-1 bg-[#e7e0d6]" style={{ minHeight: 10 }} />}
                    </div>
                    <div className="pb-3 pt-0.5">
                      <p className="text-xs font-medium text-[#111110] leading-snug">{log.summary}</p>
                      <p className="mt-0.5 text-[10px] text-[#1a1a1a]/40">{fmtRelative(log.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

/* ─── Main Component ──────────────────────────────────────────── */

export function PartnerPortalHome({
  overviewEndpoint = "/api/portal/overview",
  linkTargets,
  allowCreate,
  adminView = false,
  embedded = false,
}: PartnerPortalHomeProps = {}) {
  const [overview, setOverview] = useState<PartnerOverviewPayload>(EMPTY_OVERVIEW)
  const [loading, setLoading]   = useState(true)
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set(["c1"]))
  const [isCustomerDialogOpen, setIsCustomerDialogOpen]   = useState(false)
  const [isDealDialogOpen, setIsDealDialogOpen]           = useState(false)
  const [isScheduleDialogOpen, setIsScheduleDialogOpen]   = useState(false)
  const [quoteOpen, setQuoteOpen]         = useState(true)
  const [contractOpen, setContractOpen]   = useState(true)
  const [inventoryOpen, setInventoryOpen] = useState(true)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [panelPrefsLoaded, setPanelPrefsLoaded] = useState(false)
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null)
  const [stageUpdatePendingId, setStageUpdatePendingId] = useState<string | null>(null)
  const [stageUpdateError, setStageUpdateError] = useState<string | null>(null)
  const [undoStageChange, setUndoStageChange] = useState<{
    deal: DealItem
    fromStage: string
    toStage: PipelineStage
    createdAt: number
    pending: boolean
  } | null>(null)
  const [isUndoingStageChange, setIsUndoingStageChange] = useState(false)

  const refreshPortal = useCallback(() => {
    window.location.reload()
  }, [])

  useEffect(() => {
    setLeftSidebarOpen(readStoredBoolean("partner_portal_left_sidebar_open", true))
    setSidebarOpen(readStoredBoolean("partner_portal_summary_panel_open", true))
    setPanelPrefsLoaded(true)
  }, [])

  useEffect(() => {
    if (!panelPrefsLoaded) return
    try {
      window.localStorage.setItem("partner_portal_left_sidebar_open", String(leftSidebarOpen))
    } catch {
      // Ignore private browsing/storage restrictions.
    }
  }, [leftSidebarOpen, panelPrefsLoaded])

  useEffect(() => {
    if (!panelPrefsLoaded) return
    try {
      window.localStorage.setItem("partner_portal_summary_panel_open", String(sidebarOpen))
    } catch {
      // Ignore private browsing/storage restrictions.
    }
  }, [panelPrefsLoaded, sidebarOpen])

  const resolvedLinkTargets = useMemo(
    () => ({ ...DEFAULT_LINK_TARGETS, ...linkTargets }),
    [linkTargets]
  )

  useEffect(() => {
    let alive = true
    portalFetch(overviewEndpoint)
      .then(async r => {
        const payload = await r.json() as PartnerOverviewResponse
        if (!r.ok) throw new Error(payload.error ?? "Failed to fetch overview")
        return normalizeOverviewPayload(payload)
      })
      .then(payload => { if (alive) { setOverview(payload); setLoading(false) } })
      .catch(() => { if (alive) { setOverview(EMPTY_OVERVIEW); setLoading(false) } })
    return () => { alive = false }
  }, [overviewEndpoint])

  /* pipeline: group deals by stage */
  const pipeline = useMemo(() => {
    const g: Record<string, DealItem[]> = {}
    for (const s of STAGE_PIPELINE) g[s] = []
    for (const d of overview.deals) {
      if (g[d.current_stage]) g[d.current_stage].push(d)
    }
    return g
  }, [overview.deals])

  /* customer stacks: attach deals to each customer */
  const customerStacks = useMemo(() =>
    overview.customers.map(item => ({
      ...item,
      deals: overview.deals.filter(d => d.customer_id === item.customer.id),
    })),
  [overview])

  /* today strip urgency chips */
  const urgencyChips = useMemo(() => {
    const chips: { id: string; label: string; href: string; cls: string }[] = []

    const contractDeals = overview.deals.filter(d => d.current_stage === "contract")
    if (contractDeals.length > 0) {
      chips.push({ id: "sign", label: `계약 서명 대기 ${contractDeals.length}건`, href: resolvedLinkTargets.documents, cls: "bg-[#084734]/30 text-[#ECFDF5] hover:bg-[#084734]/40 border border-[#084734]/20" })
    }

    const nearInstalls = overview.upcoming_installations.filter(i => daysUntil(i.scheduled_start_at) <= 7)
    if (nearInstalls.length > 0) {
      const d = daysUntil(nearInstalls[0].scheduled_start_at)
      chips.push({ id: "install", label: d === 0 ? "오늘 설치 예정" : `설치 D-${d}`, href: resolvedLinkTargets.calendar, cls: "bg-orange-500/25 text-orange-200 hover:bg-orange-500/35 border border-orange-500/20" })
    }

    if (overview.metrics.outstanding_amount > 0) {
      chips.push({ id: "pay", label: `미수금 ${fmt(overview.metrics.outstanding_amount)}`, href: resolvedLinkTargets.workspace, cls: "bg-red-500/25 text-red-200 hover:bg-red-500/35 border border-red-500/20" })
    }

    return chips
  }, [overview, resolvedLinkTargets])

  /* action queue: priority-ordered to-do list */
  const actionQueue = useMemo(() => {
    type AItem = { id: string; num: number; label: string; sub: string; href: string; numCls: string }
    const q: AItem[] = []
    let n = 1

    overview.deals
      .filter(d => d.outstanding_amount > 0 && (d.current_stage === "installation" || d.current_stage === "payment"))
      .slice(0, 2)
      .forEach(d => {
        q.push({ id: `ov-${d.id}`, num: n++, label: `미수금 ${fmt(d.outstanding_amount)} 확인`, sub: `${d.customer_name ?? ""} · ${d.title}`, href: resolvedLinkTargets.workspace, numCls: "bg-red-500 text-white" })
      })

    overview.upcoming_installations
      .filter(i => daysUntil(i.scheduled_start_at) <= 7)
      .slice(0, 2)
      .forEach(i => {
        const d = daysUntil(i.scheduled_start_at)
        q.push({ id: `inst-${i.id}`, num: n++, label: d === 0 ? "오늘 설치 확인" : `설치 D-${d} 준비`, sub: `${i.title} · ${i.location ?? "장소 미지정"}`, href: resolvedLinkTargets.calendar, numCls: "bg-orange-500 text-white" })
      })

    overview.deals
      .filter(d => d.current_stage === "contract")
      .slice(0, 2)
      .forEach(d => {
        q.push({ id: `ct-${d.id}`, num: n++, label: "계약 서명 검토", sub: `${d.customer_name ?? ""} · ${d.title}`, href: resolvedLinkTargets.documents, numCls: "bg-[#084734] text-white" })
      })

    overview.recent_calendar_events.slice(0, 2).forEach(e => {
      q.push({ id: `ce-${e.id}`, num: n++, label: e.title, sub: fmtShortDate(e.starts_at), href: resolvedLinkTargets.calendar, numCls: "bg-teal-500 text-white" })
    })

    return q.slice(0, 7)
  }, [overview, resolvedLinkTargets])

  /* KPI progress */
  const { contracted_amount, installed_amount, paid_amount, outstanding_amount } = overview.metrics
  const installPct = contracted_amount > 0 ? Math.round((installed_amount / contracted_amount) * 100) : 0
  const paidPct    = contracted_amount > 0 ? Math.round((paid_amount    / contracted_amount) * 100) : 0
  const canCreateInPortal = allowCreate ?? overview.mode === "v2"
  const canMoveDealStages = adminView && overview.deals.length > 0

  const applyDealStage = useCallback((dealId: string, stage: string) => {
    setOverview(prev => ({
      ...prev,
      deals: prev.deals.map(deal =>
        deal.id === dealId ? { ...deal, current_stage: stage } : deal
      ),
    }))
  }, [])

  const persistDealStage = useCallback(async (dealId: string, stage: string) => {
    const response = await portalFetch(`/api/portal/deals/${dealId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_stage: stage }),
    })
    const payload = await response.json().catch(() => null) as { error?: string } | null
    if (!response.ok) {
      throw new Error(payload?.error ?? "거래 상태 변경에 실패했습니다.")
    }
  }, [])

  const moveDealToStage = useCallback(async (deal: DealItem, nextStage: PipelineStage) => {
    const fromStage = deal.current_stage
    if (fromStage === nextStage) return

    setStageUpdateError(null)
    setStageUpdatePendingId(deal.id)
    applyDealStage(deal.id, nextStage)
    setUndoStageChange({
      deal,
      fromStage,
      toStage: nextStage,
      createdAt: Date.now(),
      pending: true,
    })

    try {
      await persistDealStage(deal.id, nextStage)
      setUndoStageChange(current =>
        current?.deal.id === deal.id && current.toStage === nextStage
          ? { ...current, pending: false }
          : current
      )
    } catch (error) {
      applyDealStage(deal.id, fromStage)
      setUndoStageChange(current => current?.deal.id === deal.id ? null : current)
      setStageUpdateError(error instanceof Error ? error.message : "거래 상태 변경에 실패했습니다.")
    } finally {
      setStageUpdatePendingId(current => current === deal.id ? null : current)
    }
  }, [applyDealStage, persistDealStage])

  const handleDealDragStart = useCallback((event: DragEvent<HTMLDivElement>, deal: DealItem) => {
    if (!canMoveDealStages) return
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", deal.id)
    setDraggingDealId(deal.id)
  }, [canMoveDealStages])

  const handleDealDragEnd = useCallback(() => {
    setDraggingDealId(null)
    setDragOverStage(null)
  }, [])

  const handleStageDragOver = useCallback((event: DragEvent<HTMLDivElement>, stage: PipelineStage) => {
    if (!draggingDealId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDragOverStage(stage)
  }, [draggingDealId])

  const handleStageDrop = useCallback((event: DragEvent<HTMLDivElement>, stage: PipelineStage) => {
    event.preventDefault()
    const dealId = event.dataTransfer.getData("text/plain") || draggingDealId
    const deal = overview.deals.find(item => item.id === dealId)
    setDraggingDealId(null)
    setDragOverStage(null)
    if (!deal || !isPipelineStage(stage)) return
    void moveDealToStage(deal, stage)
  }, [draggingDealId, moveDealToStage, overview.deals])

  const handleUndoStageChange = useCallback(async () => {
    if (!undoStageChange || undoStageChange.pending || isUndoingStageChange) return

    setIsUndoingStageChange(true)
    setStageUpdateError(null)
    setStageUpdatePendingId(undoStageChange.deal.id)
    applyDealStage(undoStageChange.deal.id, undoStageChange.fromStage)

    try {
      await persistDealStage(undoStageChange.deal.id, undoStageChange.fromStage)
      setUndoStageChange(null)
    } catch (error) {
      applyDealStage(undoStageChange.deal.id, undoStageChange.toStage)
      setStageUpdateError(error instanceof Error ? error.message : "작업취소에 실패했습니다.")
    } finally {
      setIsUndoingStageChange(false)
      setStageUpdatePendingId(current => current === undoStageChange.deal.id ? null : current)
    }
  }, [applyDealStage, isUndoingStageChange, persistDealStage, undoStageChange])

  useEffect(() => {
    if (!undoStageChange || undoStageChange.pending) return
    const timeout = window.setTimeout(() => {
      setUndoStageChange(current =>
        current?.createdAt === undoStageChange.createdAt ? null : current
      )
    }, 12000)

    return () => window.clearTimeout(timeout)
  }, [undoStageChange])

  const todayStr = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  })

  const rootClass = embedded
    ? "text-[#1a1a1a]"
    : `${adminView ? "min-h-[calc(100dvh-4rem)]" : "min-h-screen"} bg-[#f6f3ed] text-[#1a1a1a]`
  const bodyGridClass = embedded
    ? ""
    : `grid ${leftSidebarOpen ? "lg:grid-cols-[272px_minmax(0,1fr)]" : "lg:grid-cols-[48px_minmax(0,1fr)]"}`
  const actionBarBorderClass = embedded
    ? "rounded-2xl border border-[#e7e0d6] bg-white px-4 py-3 sm:px-6"
    : "border-b border-[#e7e0d6] bg-white px-6 py-3"
  const urgencyStripClass = embedded
    ? "mt-3 rounded-2xl bg-[#111110] px-4 py-2.5 sm:px-6"
    : "bg-[#111110] px-6 py-2.5"
  const contentPaddingClass = embedded ? "px-0 py-6" : "px-4 py-5 sm:px-6 sm:py-6"

  return (
    <div className={rootClass}>

      {/* ── Demo Banner ─────────────────────────────────────────── */}
      {overview.mode === "demo" && (
        <div className={
          embedded
            ? "mb-4 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-2.5 sm:px-6"
            : "border-b border-amber-300/60 bg-amber-50 px-6 py-2.5"
        }>
          <div className={embedded ? "flex flex-wrap items-center justify-between gap-3" : "mx-auto flex max-w-[1680px] items-center justify-between gap-4"}>
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">DEMO</span>
              지금 보이는 데이터는 <strong>샘플 데이터</strong>입니다. 실제 계정을 연결하면 실데이터로 전환됩니다.
            </div>
            <span className="text-xs text-amber-600/70">실계정 연결 필요</span>
          </div>
        </div>
      )}

      {/* ── Body: Sidebar + Main ─────────────────────────────────── */}
      <div className={bodyGridClass}>

        {/* ── Left Sidebar (admin embed에서는 숨김) ─────────────── */}
        {!embedded && (
          <LeftSidebar
            open={leftSidebarOpen}
            onOpenChange={setLeftSidebarOpen}
            upcoming_installations={overview.upcoming_installations}
            recent_calendar_events={overview.recent_calendar_events}
            recent_activity={overview.recent_activity}
            calendarHref={resolvedLinkTargets.calendar}
            adminView={adminView}
          />
        )}

        {/* ── Main Content ──────────────────────────────────────── */}
        <main className="min-w-0">

          {/* Action Bar */}
          <div className={actionBarBorderClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                {!embedded && (
                  <button
                    type="button"
                    onClick={() => setLeftSidebarOpen(open => !open)}
                    title={leftSidebarOpen ? "일정 패널 접기" : "일정 패널 펼치기"}
                    className="hidden h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-xs font-semibold text-[#1a1a1a]/55 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] lg:inline-flex"
                  >
                    {leftSidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    일정
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSidebarOpen(open => !open)}
                  title={sidebarOpen ? "간편 요약 접기" : "간편 요약 펼치기"}
                  className="hidden h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-xs font-semibold text-[#1a1a1a]/55 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] xl:inline-flex"
                >
                  {sidebarOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                  요약
                </button>
                {loading && <Loader2 className="h-4 w-4 animate-spin text-[#1a1a1a]/40" />}
                <p className="text-sm text-[#1a1a1a]/50">{todayStr}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {canCreateInPortal ? (
                  <>
                    <QuickActionButton label="새 고객" onClick={() => setIsCustomerDialogOpen(true)} />
                    <QuickActionButton label="신규 컨택" disabled={overview.customers.length === 0} onClick={() => setIsDealDialogOpen(true)} />
                    <QuickActionButton label="일정 추가" disabled={overview.deals.length === 0} onClick={() => setIsScheduleDialogOpen(true)} />
                  </>
                ) : (
                  <span className="rounded-full border border-[#e0e0dc] bg-[#f7f7f5] px-3 py-1.5 text-xs text-[#1a1a1a]/40">
                    신규 생성 비활성
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Urgency Strip */}
          {urgencyChips.length > 0 && (
            <div className={urgencyStripClass}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">지금 확인</span>
                {urgencyChips.map(chip => (
                  <a key={chip.id} href={chip.href}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${chip.cls}`}
                  >
                    {chip.label}
                    <ArrowRight className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Scrollable content */}
          <div
            className={`grid min-w-0 gap-6 ${contentPaddingClass} transition-[grid-template-columns] duration-300 ${
              sidebarOpen
                ? "xl:grid-cols-[minmax(0,1fr)_300px]"
                : "xl:grid-cols-[minmax(0,1fr)_36px]"
            }`}
          >

          {/* ── Left: 메인 콘텐츠 ──────────────────────────────── */}
          <div className="min-w-0 space-y-6">

            {/* ── 지금 할 일 (Action Queue) ─────────────────────── */}
            {actionQueue.length > 0 && (
              <section className="rounded-2xl border border-[#e7e0d6] bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  <h2 className="text-sm font-semibold text-[#111110]">지금 할 일</h2>
                  <span className="ml-1 rounded-full bg-[#111110] px-2 py-0.5 text-[10px] font-bold text-white">
                    {actionQueue.length}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {actionQueue.map(item => (
                    <a key={item.id} href={item.href}
                      className="group flex items-center gap-3 rounded-xl border border-[#ece4d8] bg-[#faf6ef] px-3 py-3 transition-colors hover:border-[#111110]/20 hover:bg-white"
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${item.numCls}`}>
                        {item.num}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-[#111110]">{item.label}</p>
                        <p className="mt-0.5 truncate text-xs text-[#1a1a1a]/45">{item.sub}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[#1a1a1a]/25 transition-transform group-hover:translate-x-0.5" />
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* ── KPI Row ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <KpiCard
                label="기관 수"
                value={`${overview.metrics.customer_count}개`}
                sub={`진행 거래 ${overview.metrics.active_deal_count}건`}
              />
              <KpiCard
                label="계약 총액"
                value={fmt(contracted_amount)}
                sub={`설치 완료 ${installPct}%`}
                progress={installPct}
                progressCls="bg-indigo-400"
              />
              <KpiCard
                label="실수납 누계"
                value={fmt(paid_amount)}
                sub={`계약 대비 ${paidPct}%`}
                progress={paidPct}
                progressCls="bg-emerald-400"
              />
              <KpiCard
                label="설치 중"
                value={`${overview.metrics.installation_deal_count}건`}
                sub="진행 중인 설치"
                accent="orange"
              />
              <KpiCard
                label="미수금"
                value={fmt(outstanding_amount)}
                sub={`미납 ${overview.metrics.unpaid_deal_count}건`}
                accent={outstanding_amount > 0 ? "red" : undefined}
              />
            </div>

            {/* ── Pipeline Board ────────────────────────────────── */}
            <section>
              <SectionHeader title="거래 파이프라인" sub={`${overview.deals.length}건`} />
              {stageUpdateError && (
                <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {stageUpdateError}
                </div>
              )}
              <div className="mt-3 min-w-0 overflow-x-auto pb-2">
                <div className="flex min-w-max gap-3">
                  {STAGE_PIPELINE.map(stage => {
                    const deals = pipeline[stage] ?? []
                    const cfg   = STAGE_CFG[stage]
                    const isDropTarget = dragOverStage === stage
                    return (
                      <div key={stage} className="w-[188px] flex-shrink-0">
                        <div className="mb-2 flex items-center justify-between px-0.5">
                          <span className={`text-xs font-semibold ${cfg.headerCls}`}>
                            {cfg.label}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${deals.length > 0 ? cfg.badgeCls : "bg-[#ece4d8] text-[#1a1a1a]/30"}`}>
                            {deals.length}
                          </span>
                        </div>
                        <div
                          onDragOver={event => handleStageDragOver(event, stage)}
                          onDragLeave={event => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                              setDragOverStage(current => current === stage ? null : current)
                            }
                          }}
                          onDrop={event => handleStageDrop(event, stage)}
                          className={`min-h-20 rounded-2xl p-1 transition-colors ${
                            isDropTarget ? "bg-[#084734]/10 ring-1 ring-[#084734]/20" : ""
                          }`}
                        >
                        <div className="space-y-2">
                          {deals.length === 0 ? (
                            <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-[#d9cfbf] bg-[#faf6ef]">
                              <div className={`h-1.5 w-1.5 rounded-full ${cfg.dotCls} opacity-30`} />
                            </div>
                          ) : (
                            deals.map(deal => {
                              const ps = dealPaymentBadge(deal)
                              return (
                                <div
                                  key={deal.id}
                                  draggable={canMoveDealStages}
                                  onDragStart={event => handleDealDragStart(event, deal)}
                                  onDragEnd={handleDealDragEnd}
                                  aria-grabbed={draggingDealId === deal.id}
                                  className={`group rounded-xl border border-[#e7e0d6] border-l-4 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${cfg.borderCls} ${
                                    canMoveDealStages ? "cursor-grab active:cursor-grabbing" : ""
                                  } ${
                                    draggingDealId === deal.id ? "opacity-45" : ""
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="min-w-0 text-xs font-semibold leading-snug text-[#111110]">
                                      {deal.title}
                                    </p>
                                    {stageUpdatePendingId === deal.id && (
                                      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-[#1a1a1a]/30" />
                                    )}
                                  </div>
                                  <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
                                    {deal.customer_name}
                                  </p>
                                  <div className="mt-2.5 flex items-end justify-between gap-1">
                                    <div className="flex flex-col gap-0.5">
                                      <p className="text-sm font-bold text-[#111110]">
                                        {fmt(deal.contracted_amount || deal.expected_amount)}
                                      </p>
                                      {deal.manager_name && (
                                        <p className="text-[10px] text-[#1a1a1a]/40">
                                          담당: {deal.manager_name}
                                        </p>
                                      )}
                                    </div>
                                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ps.cls}`}>
                                      {ps.label}
                                    </span>
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>

            {/* ── Customer Stacks ───────────────────────────────── */}
            <section>
              <SectionHeader title="기관별 거래" sub={`${overview.customers.length}개 기관`} />
              <div className="mt-3 space-y-2">
                {customerStacks.map(cs => {
                  const expanded       = expandedCustomers.has(cs.customer.id)
                  const hasOutstanding = (cs.summary?.outstanding_amount ?? 0) > 0

                  return (
                    <div key={cs.customer.id} className="overflow-hidden rounded-2xl border border-[#e7e0d6] bg-white">
                      <button
                        type="button"
                        onClick={() => setExpandedCustomers(prev => {
                          const next = new Set(prev)
                          if (next.has(cs.customer.id)) next.delete(cs.customer.id)
                          else next.add(cs.customer.id)
                          return next
                        })}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[#faf6ef]"
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate text-sm font-semibold text-[#111110]">
                              {cs.customer.name}
                            </span>
                            {hasOutstanding && (
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-[#1a1a1a]/45">
                            {cs.customer.region_label ?? "지역 미지정"}
                            {cs.customer.campus_name ? ` · ${cs.customer.campus_name}` : ""}
                            {" · "}진행 {cs.summary?.active_deals ?? 0}건
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
                          {hasOutstanding && (
                            <span className="text-xs font-semibold text-red-600">
                              미수 {fmt(cs.summary!.outstanding_amount)}
                            </span>
                          )}
                          {expanded
                            ? <ChevronDown className="h-4 w-4 text-[#1a1a1a]/30" />
                            : <ChevronRight className="h-4 w-4 text-[#1a1a1a]/30" />
                          }
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t border-[#ece4d8] px-5 pb-4 pt-3">
                          {cs.deals.length === 0 ? (
                            <p className="text-sm text-[#1a1a1a]/40">진행 중인 거래가 없습니다.</p>
                          ) : (
                            <div className="space-y-2">
                              {cs.deals.map(deal => {
                                const cfg = STAGE_CFG[deal.current_stage] ?? STAGE_CFG.contact
                                const ps  = dealPaymentBadge(deal)
                                return (
                                  <div
                                    key={deal.id}
                                    className={`flex flex-col gap-3 rounded-xl border border-l-4 border-[#e7e0d6] bg-[#faf6ef] px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${cfg.borderCls}`}
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-[#111110]">
                                        {deal.title}
                                      </p>
                                      <p className="mt-0.5 text-xs text-[#1a1a1a]/40">{deal.deal_code}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                                      {deal.manager_name && (
                                        <span className="text-xs text-[#1a1a1a]/50">
                                        담당: {deal.manager_name}
                                        </span>
                                      )}
                                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.badgeCls}`}>
                                        {cfg.label}
                                      </span>
                                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${ps.cls}`}>
                                        {ps.label}
                                      </span>
                                      <span className="shrink-0 text-sm font-semibold text-[#111110]">
                                        {fmt(deal.contracted_amount || deal.expected_amount)}
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* ── Recent Payments ───────────────────────────────── */}
            {overview.recent_payments.length > 0 && (
              <section>
                <SectionHeader title="최근 수납" />
                <div className="mt-3 space-y-2">
                  {overview.recent_payments.slice(0, 3).map(p => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl border border-[#ece4d8] bg-white px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-emerald-600">
                          {fmtFull(p.amount)}
                        </p>
                        <p className="mt-0.5 text-xs text-[#1a1a1a]/40">
                          {PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}
                          {" · "}
                          {fmtShortDate(p.paid_at)}
                        </p>
                      </div>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>{/* end left */}

          {/* ── Right Sidebar ─────────────────────────────────── */}
          <div className="hidden min-w-0 xl:block">

            {sidebarOpen ? (
              /* ── 펼쳐진 패널 ─────────────────────────────────── */
              <div className="sticky top-4 rounded-2xl border border-[rgba(0,0,0,0.07)] bg-[#F6F5F4] p-3 space-y-2.5"
                style={{ boxShadow: "rgba(0,0,0,0.03) 0px 4px 18px, rgba(0,0,0,0.02) 0px 2px 7px" }}
              >
                {/* 패널 헤더 */}
                <div className="flex items-center justify-between px-1 pt-0.5 pb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-[#A39E98]">간편 요약</span>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="rounded-lg p-1 text-[#A39E98] transition-colors hover:bg-black/5 hover:text-[#615D59]"
                    title="사이드바 접기"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* [1] 견적 대기 */}
                <div className="rounded-xl border border-[rgba(0,0,0,0.07)] bg-white overflow-hidden"
                  style={{ boxShadow: "rgba(0,0,0,0.02) 0px 2px 6px" }}
                >
                  <button
                    onClick={() => setQuoteOpen(o => !o)}
                    className="flex w-full items-center justify-between gap-2 px-3.5 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[#111110]">견적 대기</h2>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${pipeline["quote"].length > 0 ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-400"}`}>
                        {pipeline["quote"].length}건
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={resolvedLinkTargets.documents} onClick={e => e.stopPropagation()} className="text-xs text-[#1a1a1a]/40 hover:text-[#1a1a1a]">문서 →</a>
                      <ChevronDown className={`h-3.5 w-3.5 text-[#1a1a1a]/30 transition-transform duration-200 ${quoteOpen ? "" : "-rotate-90"}`} />
                    </div>
                  </button>
                  {quoteOpen && (
                    <div className="px-3.5 pb-3.5">
                      {pipeline["quote"].length === 0 ? (
                        <p className="rounded-xl bg-[#faf6ef] px-3 py-3 text-xs text-[#1a1a1a]/40">대기 중인 견적이 없습니다</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="rounded-xl bg-amber-50 px-3 py-2.5">
                            <p className="text-[11px] text-amber-700/60">합계 금액</p>
                            <p className="text-base font-bold text-amber-900">
                              {fmt(pipeline["quote"].reduce((s, d) => s + (d.contracted_amount || d.expected_amount), 0))}
                            </p>
                          </div>
                          {pipeline["quote"].map(deal => (
                            <div key={deal.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#ece4d8] bg-[#faf6ef] px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-[#111110]">{deal.title}</p>
                                <p className="mt-0.5 truncate text-xs text-[#1a1a1a]/45">{deal.customer_name}</p>
                              </div>
                              <span className="shrink-0 text-sm font-semibold text-[#111110]">
                                {fmt(deal.contracted_amount || deal.expected_amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* [2] 계약 대기 */}
                <div className="rounded-xl border border-[rgba(0,0,0,0.07)] bg-white overflow-hidden"
                  style={{ boxShadow: "rgba(0,0,0,0.02) 0px 2px 6px" }}
                >
                  <button
                    onClick={() => setContractOpen(o => !o)}
                    className="flex w-full items-center justify-between gap-2 px-3.5 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[#111110]">계약 대기</h2>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${pipeline["contract"].length > 0 ? "bg-[#ECFDF5] text-[#084734]" : "bg-stone-100 text-stone-400"}`}>
                        {pipeline["contract"].length}건
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={resolvedLinkTargets.documents} onClick={e => e.stopPropagation()} className="text-xs text-[#1a1a1a]/40 hover:text-[#1a1a1a]">계약서 →</a>
                      <ChevronDown className={`h-3.5 w-3.5 text-[#1a1a1a]/30 transition-transform duration-200 ${contractOpen ? "" : "-rotate-90"}`} />
                    </div>
                  </button>
                  {contractOpen && (
                    <div className="px-3.5 pb-3.5">
                      {pipeline["contract"].length === 0 ? (
                        <p className="rounded-xl bg-[#faf6ef] px-3 py-3 text-xs text-[#1a1a1a]/40">서명 대기 계약이 없습니다</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="rounded-xl bg-[#ECFDF5] px-3 py-2.5">
                            <p className="text-[11px] text-[#084734]/60">계약 총액</p>
                            <p className="text-base font-bold text-[#084734]">
                              {fmt(pipeline["contract"].reduce((s, d) => s + d.contracted_amount, 0))}
                            </p>
                          </div>
                          {pipeline["contract"].map(deal => (
                            <div key={deal.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#D1FAE5] bg-[#ECFDF5] px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-[#111110]">{deal.title}</p>
                                <p className="mt-0.5 truncate text-xs text-[#1a1a1a]/45">{deal.customer_name}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className="rounded-full bg-[#084734]/10 px-2 py-0.5 text-[10px] font-semibold text-[#084734]">서명 대기</span>
                                <span className="text-sm font-semibold text-[#111110]">{fmt(deal.contracted_amount)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* [3] 물량·재고 */}
                <div className="rounded-xl border border-[rgba(0,0,0,0.07)] bg-white overflow-hidden"
                  style={{ boxShadow: "rgba(0,0,0,0.02) 0px 2px 6px" }}
                >
                  <button
                    onClick={() => setInventoryOpen(o => !o)}
                    className="flex w-full items-center justify-between gap-2 px-3.5 py-3"
                  >
                    <h2 className="text-sm font-semibold text-[#111110]">물량 · 재고</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#1a1a1a]/40">출하 현황</span>
                      <ChevronDown className={`h-3.5 w-3.5 text-[#1a1a1a]/30 transition-transform duration-200 ${inventoryOpen ? "" : "-rotate-90"}`} />
                    </div>
                  </button>
                  {inventoryOpen && (
                    <div className="px-3.5 pb-3.5">
                      {overview.inventory_summary.length === 0 ? (
                        <p className="rounded-xl bg-[#faf6ef] px-3 py-3 text-xs text-[#1a1a1a]/40">등록된 출하 내역이 없습니다</p>
                      ) : (
                        <div className="space-y-3">
                          {overview.inventory_summary.map(item => {
                            const deliveredPct = item.total_qty > 0 ? Math.round((item.delivered_qty / item.total_qty) * 100) : 0
                            return (
                              <div key={item.sku}>
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium text-[#111110]">{item.product_name}</span>
                                    <span className="ml-1.5 text-[11px] text-[#1a1a1a]/35">{item.sku}</span>
                                  </div>
                                  <span className="shrink-0 text-sm font-bold text-[#111110]">
                                    {item.total_qty}<span className="text-xs font-normal text-[#1a1a1a]/40">대</span>
                                  </span>
                                </div>
                                <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-[#ece4d8]">
                                  <div className="h-full rounded-full bg-[#084734] transition-all" style={{ width: `${deliveredPct}%` }} />
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {item.pending_qty > 0 && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">대기 {item.pending_qty}</span>
                                  )}
                                  {item.shipped_qty > 0 && (
                                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700">출하 {item.shipped_qty}</span>
                                  )}
                                  {item.delivered_qty > 0 && (
                                    <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#084734]">납품 {item.delivered_qty}</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            ) : (
              /* ── 접힌 탭 ─────────────────────────────────────── */
              <button
                onClick={() => setSidebarOpen(true)}
                title="간편 요약 펼치기"
                className="sticky top-4 flex h-40 w-9 flex-col items-center justify-center gap-2 rounded-2xl border border-[rgba(0,0,0,0.07)] bg-[#F6F5F4] transition-colors hover:bg-[#ECFDF5]"
                style={{ boxShadow: "rgba(0,0,0,0.03) 0px 4px 18px, rgba(0,0,0,0.02) 0px 2px 7px" }}
              >
                <ChevronLeft className="h-3.5 w-3.5 text-[#A39E98]" />
                <span
                  className="text-[10px] font-semibold text-[#A39E98]"
                  style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}
                >
                  간편 요약
                </span>
              </button>
            )}

          </div>{/* end right sidebar */}

          </div>
        </main>
      </div>

      <MobileActionLauncher
        screen="home"
        customers={overview.customers.map(item => item.customer)}
        deals={overview.deals}
        canCreate={canCreateInPortal}
        onSaved={refreshPortal}
      />

      {undoStageChange && (
        <div className="fixed inset-x-4 bottom-20 z-50 rounded-2xl border border-[#d8d2c8] bg-[#111110] p-3 text-white shadow-2xl sm:bottom-6 sm:left-auto sm:right-6 sm:w-[420px]">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{undoStageChange.deal.title}</p>
              <p className="mt-0.5 text-xs text-white/55">
                {STAGE_CFG[undoStageChange.fromStage]?.label ?? undoStageChange.fromStage}
                {" → "}
                {STAGE_CFG[undoStageChange.toStage]?.label ?? undoStageChange.toStage}
              </p>
            </div>
            <button
              type="button"
              onClick={handleUndoStageChange}
              disabled={undoStageChange.pending || isUndoingStageChange}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-[#111110] transition-colors hover:bg-[#ECFDF5] disabled:cursor-wait disabled:opacity-60"
            >
              {undoStageChange.pending || isUndoingStageChange
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RotateCcw className="h-3.5 w-3.5" />
              }
              작업취소
            </button>
            <button
              type="button"
              onClick={() => setUndoStageChange(null)}
              className="h-8 shrink-0 rounded-lg px-2 text-xs font-semibold text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <CustomerDialog
        open={isCustomerDialogOpen}
        onOpenChange={setIsCustomerDialogOpen}
        onSaved={refreshPortal}
      />
      <DealQuickCreateDialog
        open={isDealDialogOpen}
        onOpenChange={setIsDealDialogOpen}
        customers={overview.customers.map(item => item.customer)}
        onSaved={refreshPortal}
      />
      <ScheduleDialog
        open={isScheduleDialogOpen}
        onOpenChange={setIsScheduleDialogOpen}
        deals={overview.deals}
        onSaved={refreshPortal}
      />
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────── */

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-[#111110]">{title}</h2>
      {sub && <span className="text-xs text-[#1a1a1a]/40">{sub}</span>}
    </div>
  )
}

function QuickActionButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={disabled ? "outline" : "default"}
      disabled={disabled}
      onClick={onClick}
      className={disabled ? "border-[#d9cfbf] text-[#1a1a1a]/35" : ""}
    >
      {label}
    </Button>
  )
}

function KpiCard({
  label, value, sub, accent, progress, progressCls,
}: {
  label: string
  value: string
  sub?: string
  accent?: "red" | "orange"
  progress?: number
  progressCls?: string
}) {
  const containerCls = accent === "red"
    ? "border-red-200 bg-red-50"
    : accent === "orange"
    ? "border-orange-200 bg-orange-50"
    : "border-[#e7e0d6] bg-white"

  const valueCls = accent === "red"
    ? "text-red-600"
    : accent === "orange"
    ? "text-orange-700"
    : "text-[#111110]"

  return (
    <div className={`rounded-2xl border px-4 py-4 ${containerCls}`}>
      <p className="text-xs text-[#1a1a1a]/45">{label}</p>
      <p className={`mt-1.5 text-lg font-bold tracking-tight ${valueCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#1a1a1a]/40">{sub}</p>}
      {progress !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#e7e0d6]">
          <div
            className={`h-full rounded-full transition-all ${progressCls ?? "bg-[#111110]"}`}
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

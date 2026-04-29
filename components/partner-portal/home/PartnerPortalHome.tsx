"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
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
  _dummy?: boolean
}

type InstallationEvent = {
  id: string
  title: string
  location: string | null
  scheduled_start_at: string
  scheduled_end_at: string
  _dummy?: boolean
}

type PaymentRecord = {
  id: string
  amount: number
  paid_at: string
  payment_method: string
  _dummy?: boolean
}

type CalendarEvent = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  source_type: string
  _dummy?: boolean
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
  _dummy?: boolean
}

type DealItem = {
  id: string
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
  _dummy?: boolean
}

type InventorySkuSummary = {
  sku: string
  product_name: string
  pending_qty: number
  shipped_qty: number
  delivered_qty: number
  total_qty: number
  _dummy?: boolean
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

/* ─── Constants ──────────────────────────────────────────────── */

const STAGE_PIPELINE = [
  "contact", "quote", "contract", "confirmed", "installation", "payment",
] as const

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

const DEFAULT_LINK_TARGETS: PartnerPortalLinkTargets = {
  calendar: "/partner/calendar",
  documents: "/partner/documents",
  workspace: "/partner/workspace",
}

/* ─── Demo Data ──────────────────────────────────────────────── */

const DEMO: PartnerOverviewPayload = {
  mode: "demo",
  metrics: {
    customer_count: 3,
    active_deal_count: 6,
    installation_deal_count: 2,
    unpaid_deal_count: 3,
    contracted_amount: 76500000,
    installed_amount: 41200000,
    paid_amount: 29800000,
    outstanding_amount: 46700000,
  },
  customers: [
    {
      customer: { id: "c1", name: "강남메가스터디학원", campus_name: "본관", region_label: "강남" },
      summary: { active_deals: 3, unpaid_deals: 2, outstanding_amount: 31100000, last_deal_updated_at: "2026-04-04T02:00:00Z" },
      _dummy: true,
    },
    {
      customer: { id: "c2", name: "리더스입시학원", campus_name: "3층", region_label: "분당" },
      summary: { active_deals: 2, unpaid_deals: 1, outstanding_amount: 15600000, last_deal_updated_at: "2026-04-03T12:00:00Z" },
      _dummy: true,
    },
    {
      customer: { id: "c3", name: "서초수학교습소", campus_name: null, region_label: "서초" },
      summary: { active_deals: 1, unpaid_deals: 0, outstanding_amount: 0, last_deal_updated_at: "2026-04-02T09:00:00Z" },
      _dummy: true,
    },
  ],
  deals: [
    { id: "d1", title: "본관 전자칠판 4대 설치", deal_code: "D-2026-001", current_stage: "installation", customer_name: "강남메가스터디학원", customer_campus_name: "본관", expected_amount: 29000000, contracted_amount: 29000000, paid_amount: 12000000, outstanding_amount: 17000000, manager_name: "김민준", _dummy: true },
    { id: "d2", title: "추가 교실 계약", deal_code: "D-2026-011", current_stage: "quote", customer_name: "강남메가스터디학원", customer_campus_name: "본관", expected_amount: 14000000, contracted_amount: 14000000, paid_amount: 0, outstanding_amount: 14000000, manager_name: "이서연", _dummy: true },
    { id: "d3", title: "3층 전체 교체", deal_code: "D-2026-004", current_stage: "payment", customer_name: "리더스입시학원", customer_campus_name: "3층", expected_amount: 24200000, contracted_amount: 24200000, paid_amount: 24200000, outstanding_amount: 0, manager_name: "박지훈", _dummy: true },
    { id: "d4", title: "별관 추가 계약", deal_code: "D-2026-015", current_stage: "contract", customer_name: "강남메가스터디학원", customer_campus_name: "별관", expected_amount: 8600000, contracted_amount: 8600000, paid_amount: 0, outstanding_amount: 8600000, manager_name: "김민준", _dummy: true },
    { id: "d5", title: "2교실 신설 견적", deal_code: "D-2026-018", current_stage: "contact", customer_name: "서초수학교습소", customer_campus_name: null, expected_amount: 12400000, contracted_amount: 0, paid_amount: 0, outstanding_amount: 0, manager_name: "이서연", _dummy: true },
    { id: "d6", title: "분당지점 추가 설치", deal_code: "D-2026-007", current_stage: "installation", customer_name: "리더스입시학원", customer_campus_name: "3층", expected_amount: 15600000, contracted_amount: 15600000, paid_amount: 0, outstanding_amount: 15600000, manager_name: "박지훈", _dummy: true },
  ],
  recent_activity: [
    { id: "a1", summary: "견적서 v3 링크 발송", action_type: "document", created_at: "2026-04-04T02:10:00Z", _dummy: true },
    { id: "a2", summary: "설치 일정 4/20-4/21 확정", action_type: "schedule", created_at: "2026-04-04T01:30:00Z", _dummy: true },
    { id: "a3", summary: "분할 수납 300만원 입금 확인", action_type: "payment", created_at: "2026-04-03T10:30:00Z", _dummy: true },
    { id: "a4", summary: "별관 추가 계약 초안 생성", action_type: "document", created_at: "2026-04-03T09:00:00Z", _dummy: true },
  ],
  upcoming_installations: [
    { id: "i1", title: "강남메가 본관 설치", location: "서울 강남구", scheduled_start_at: "2026-04-20T09:00:00+09:00", scheduled_end_at: "2026-04-21T17:00:00+09:00", _dummy: true },
    { id: "i2", title: "리더스 분당지점 설치", location: "경기 성남시", scheduled_start_at: "2026-04-25T09:00:00+09:00", scheduled_end_at: "2026-04-25T18:00:00+09:00", _dummy: true },
  ],
  recent_payments: [
    { id: "p1", amount: 3000000, paid_at: "2026-04-03T10:30:00Z", payment_method: "bank_transfer", _dummy: true },
    { id: "p2", amount: 9000000, paid_at: "2026-04-01T09:10:00Z", payment_method: "bank_transfer", _dummy: true },
  ],
  recent_calendar_events: [
    { id: "ce1", title: "견적 링크 만료 전 확인", starts_at: "2026-04-12T10:00:00+09:00", ends_at: "2026-04-12T11:00:00+09:00", source_type: "document_due", _dummy: true },
    { id: "ce2", title: "추가 계약 조정 미팅", starts_at: "2026-04-16T14:00:00+09:00", ends_at: "2026-04-16T15:00:00+09:00", source_type: "meeting", _dummy: true },
  ],
  inventory_summary: [
    { sku: "IFP-110", product_name: "IFP 110인치", pending_qty: 2, shipped_qty: 1, delivered_qty: 4, total_qty: 7, _dummy: true },
    { sku: "IFP-86",  product_name: "IFP 86인치",  pending_qty: 4, shipped_qty: 2, delivered_qty: 8, total_qty: 14, _dummy: true },
    { sku: "IFP-75",  product_name: "IFP 75인치",  pending_qty: 1, shipped_qty: 0, delivered_qty: 5, total_qty: 6, _dummy: true },
    { sku: "CAM-T1",  product_name: "카메라 T1",    pending_qty: 3, shipped_qty: 1, delivered_qty: 6, total_qty: 10, _dummy: true },
    { sku: "CAM-S1",  product_name: "카메라 S1",    pending_qty: 1, shipped_qty: 0, delivered_qty: 3, total_qty: 4, _dummy: true },
    { sku: "STAND",   product_name: "스탠드",        pending_qty: 2, shipped_qty: 2, delivered_qty: 7, total_qty: 11, _dummy: true },
  ],
}

const EMPTY_OVERVIEW: PartnerOverviewPayload = {
  mode: "v2",
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

// process.env.NODE_ENV is a compile-time constant in Next.js client bundles.
// This flag is `true` only during `npm run dev` (local) — always `false` in production builds.
const IS_LOCAL_DEV = process.env.NODE_ENV === "development"

function mergeWithDummy(
  real: PartnerOverviewPayload,
  dummy: PartnerOverviewPayload,
): PartnerOverviewPayload {
  return {
    mode: real.mode,
    metrics: {
      customer_count: real.metrics.customer_count + dummy.metrics.customer_count,
      active_deal_count: real.metrics.active_deal_count + dummy.metrics.active_deal_count,
      installation_deal_count: real.metrics.installation_deal_count + dummy.metrics.installation_deal_count,
      unpaid_deal_count: real.metrics.unpaid_deal_count + dummy.metrics.unpaid_deal_count,
      contracted_amount: real.metrics.contracted_amount + dummy.metrics.contracted_amount,
      installed_amount: real.metrics.installed_amount + dummy.metrics.installed_amount,
      paid_amount: real.metrics.paid_amount + dummy.metrics.paid_amount,
      outstanding_amount: real.metrics.outstanding_amount + dummy.metrics.outstanding_amount,
    },
    // 더미를 앞에 배치: slice/take가 있는 목록에서도 샘플이 보이도록 "위에 얹는" 효과
    customers: [...dummy.customers, ...real.customers],
    deals: [...dummy.deals, ...real.deals],
    recent_activity: [...dummy.recent_activity, ...real.recent_activity],
    upcoming_installations: [...dummy.upcoming_installations, ...real.upcoming_installations],
    recent_payments: [...dummy.recent_payments, ...real.recent_payments],
    recent_calendar_events: [...dummy.recent_calendar_events, ...real.recent_calendar_events],
    inventory_summary: [...dummy.inventory_summary, ...real.inventory_summary],
  }
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

/** 로컬 개발에서 실데이터 위에 얹은 샘플 아이템 앞에 붙는 "(더미)" 라벨 */
function DummyBadge() {
  return (
    <span className="mr-1.5 inline-flex items-center rounded-full border border-dashed border-stone-400 bg-white px-1.5 py-0 align-middle text-[9px] font-bold text-stone-500">
      더미
    </span>
  )
}

const DUMMY_CARD_CLS = "border-dashed border-stone-300 bg-stone-50/40"

/* ─── Normalize / Type-guard ─────────────────────────────────── */

function isPartnerReadMode(value: unknown): value is PartnerReadMode {
  return value === "v2" || value === "legacy" || value === "demo"
}

function normalizeOverviewPayload(payload: PartnerOverviewResponse): PartnerOverviewPayload {
  const metrics = payload.metrics
  return {
    mode: isPartnerReadMode(payload.mode) ? payload.mode : DEMO.mode,
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
  upcoming_installations,
  recent_calendar_events,
  recent_activity,
}: {
  upcoming_installations: InstallationEvent[]
  recent_calendar_events: CalendarEvent[]
  recent_activity: ActivityLog[]
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
    type Item = { id: string; title: string; date: string; type: "installation" | "calendar"; source_type?: string; location?: string | null; days: number; isDummy: boolean }
    const items: Item[] = [
      ...upcoming_installations.map(i => ({
        id: i.id,
        title: i.title,
        date: i.scheduled_start_at,
        type: "installation" as const,
        location: i.location,
        days: daysUntil(i.scheduled_start_at),
        isDummy: !!i._dummy,
      })),
      ...recent_calendar_events.map(e => ({
        id: e.id,
        title: e.title,
        date: e.starts_at,
        type: "calendar" as const,
        source_type: e.source_type,
        days: daysUntil(e.starts_at),
        isDummy: !!e._dummy,
      })),
    ]
    return items
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 6)
  }, [upcoming_installations, recent_calendar_events])

  return (
    <aside className="hidden lg:flex lg:flex-col border-r border-[#e7e0d6] bg-white h-[calc(100vh-56px)] sticky top-[56px] overflow-y-auto">
      <div className="p-4 space-y-6">
        {/* Mini Calendar */}
        <div>
          <MiniCalendar eventDots={calDots} />
        </div>

        <div className="h-px bg-[#e7e0d6]" />

        {/* Upcoming Schedule */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#111110]">급한 일정</h3>
            <a href="/partner/calendar" className="text-[10px] text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
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
                    } ${item.isDummy ? "border-dashed opacity-90" : ""}`}
                  >
                    <span className="mt-0.5 text-sm leading-none">{emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-xs font-medium ${isInstall ? "text-orange-900" : "text-[#111110]"}`}>
                        {item.isDummy && <DummyBadge />}
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
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${atCfg.cls} ${log._dummy ? "border border-dashed border-stone-400" : ""}`}>
                        {atCfg.emoji}
                      </div>
                      {!isLast && <div className="w-px flex-1 bg-[#e7e0d6]" style={{ minHeight: 10 }} />}
                    </div>
                    <div className="pb-3 pt-0.5">
                      <p className="text-xs font-medium text-[#111110] leading-snug">
                        {log._dummy && <DummyBadge />}
                        {log.summary}
                      </p>
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

export function PartnerPortalHome(props: PartnerPortalHomeProps = {}) {
  const overviewEndpoint = props.overviewEndpoint ?? "/api/portal/overview"
  const resolvedLinkTargets = useMemo(
    () => ({ ...DEFAULT_LINK_TARGETS, ...(props.linkTargets ?? {}) }),
    [props.linkTargets],
  )
  const [realOverview, setRealOverview] = useState<PartnerOverviewPayload>(EMPTY_OVERVIEW)
  const [loading, setLoading]   = useState(true)
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set(["c1"]))
  const [isCustomerDialogOpen, setIsCustomerDialogOpen]   = useState(false)
  const [isDealDialogOpen, setIsDealDialogOpen]           = useState(false)
  const [isScheduleDialogOpen, setIsScheduleDialogOpen]   = useState(false)
  const [quoteOpen, setQuoteOpen]         = useState(true)
  const [contractOpen, setContractOpen]   = useState(true)
  const [inventoryOpen, setInventoryOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen]     = useState(true)
  // Dummy overlay: only ever turns on during local dev. In production this state stays false.
  const [showDummy, setShowDummy] = useState(IS_LOCAL_DEV)

  const refreshPortal = useCallback(() => {
    window.location.reload()
  }, [])

  useEffect(() => {
    let alive = true
    portalFetch(overviewEndpoint)
      .then(async r => {
        const payload = await r.json() as PartnerOverviewResponse
        if (!r.ok) throw new Error(payload.error ?? "Failed to fetch overview")
        return normalizeOverviewPayload(payload)
      })
      .then(payload => { if (alive) { setRealOverview(payload); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [overviewEndpoint])

  const overview = useMemo(
    () => (IS_LOCAL_DEV && showDummy ? mergeWithDummy(realOverview, DEMO) : realOverview),
    [realOverview, showDummy],
  )

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
      deals: overview.deals.filter(d => d.customer_name === item.customer.name),
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
    type AItem = { id: string; num: number; label: string; sub: string; href: string; numCls: string; isDummy: boolean }
    const q: AItem[] = []
    let n = 1

    overview.deals
      .filter(d => d.outstanding_amount > 0 && (d.current_stage === "installation" || d.current_stage === "payment"))
      .slice(0, 2)
      .forEach(d => {
        q.push({ id: `ov-${d.id}`, num: n++, label: `미수금 ${fmt(d.outstanding_amount)} 확인`, sub: `${d.customer_name ?? ""} · ${d.title}`, href: resolvedLinkTargets.workspace, numCls: "bg-red-500 text-white", isDummy: !!d._dummy })
      })

    overview.upcoming_installations
      .filter(i => daysUntil(i.scheduled_start_at) <= 7)
      .slice(0, 2)
      .forEach(i => {
        const d = daysUntil(i.scheduled_start_at)
        q.push({ id: `inst-${i.id}`, num: n++, label: d === 0 ? "오늘 설치 확인" : `설치 D-${d} 준비`, sub: `${i.title} · ${i.location ?? "장소 미지정"}`, href: resolvedLinkTargets.calendar, numCls: "bg-orange-500 text-white", isDummy: !!i._dummy })
      })

    overview.deals
      .filter(d => d.current_stage === "contract")
      .slice(0, 2)
      .forEach(d => {
        q.push({ id: `ct-${d.id}`, num: n++, label: "계약 서명 검토", sub: `${d.customer_name ?? ""} · ${d.title}`, href: resolvedLinkTargets.documents, numCls: "bg-[#084734] text-white", isDummy: !!d._dummy })
      })

    overview.recent_calendar_events.slice(0, 2).forEach(e => {
      q.push({ id: `ce-${e.id}`, num: n++, label: e.title, sub: fmtShortDate(e.starts_at), href: resolvedLinkTargets.calendar, numCls: "bg-teal-500 text-white", isDummy: !!e._dummy })
    })

    return q.slice(0, 7)
  }, [overview, resolvedLinkTargets])

  /* KPI progress */
  const { contracted_amount, installed_amount, paid_amount, outstanding_amount } = overview.metrics
  const installPct = contracted_amount > 0 ? Math.round((installed_amount / contracted_amount) * 100) : 0
  const paidPct    = contracted_amount > 0 ? Math.round((paid_amount    / contracted_amount) * 100) : 0
  const canCreateInPortal = overview.mode === "v2" && props.allowCreate !== false

  const todayStr = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  })

  return (
    <div className="min-h-screen bg-[#f6f3ed] text-[#1a1a1a]">

      {/* ── Demo Banner ─────────────────────────────────────────── */}
      {overview.mode === "demo" && (
        <div className="border-b border-amber-300/60 bg-amber-50 px-6 py-2.5">
          <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">DEMO</span>
              지금 보이는 데이터는 <strong>샘플 데이터</strong>입니다. 실제 계정을 연결하면 실데이터로 전환됩니다.
            </div>
            <span className="text-xs text-amber-600/70">실계정 연결 필요</span>
          </div>
        </div>
      )}

      {/* ── Body: Sidebar + Main ─────────────────────────────────── */}
      <div className="grid lg:grid-cols-[272px_1fr]">

        {/* ── Left Sidebar ──────────────────────────────────────── */}
        <LeftSidebar
          upcoming_installations={overview.upcoming_installations}
          recent_calendar_events={overview.recent_calendar_events}
          recent_activity={overview.recent_activity}
        />

        {/* ── Main Content ──────────────────────────────────────── */}
        <main className="min-w-0">

          {/* Action Bar */}
          <div className="border-b border-[#e7e0d6] bg-white px-6 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {loading && <Loader2 className="h-4 w-4 animate-spin text-[#1a1a1a]/40" />}
                <p className="text-sm text-[#1a1a1a]/50">{todayStr}</p>
              </div>
              <div className="flex items-center gap-2">
                {IS_LOCAL_DEV && (
                  <button
                    type="button"
                    onClick={() => setShowDummy(v => !v)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      showDummy
                        ? "border-dashed border-stone-400 bg-stone-50 text-stone-600 hover:bg-stone-100"
                        : "border-[#e0e0dc] bg-white text-[#1a1a1a]/50 hover:bg-[#faf6ef]"
                    }`}
                    title="로컬 개발에서만 보이는 샘플 데이터 레이어"
                  >
                    {showDummy ? "더미 걷어내기" : "더미 보이기"}
                  </button>
                )}
                {canCreateInPortal ? (
                  <>
                    <QuickActionButton label="새 고객" onClick={() => setIsCustomerDialogOpen(true)} />
                    <QuickActionButton label="신규 컨택" disabled={overview.customers.length === 0} onClick={() => setIsDealDialogOpen(true)} />
                    <QuickActionButton label="일정 추가" disabled={overview.deals.length === 0} onClick={() => setIsScheduleDialogOpen(true)} />
                  </>
                ) : (
                  <span className="rounded-full border border-[#e0e0dc] bg-[#f7f7f5] px-3 py-1.5 text-xs text-[#1a1a1a]/40">
                    읽기 전용 모드
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Urgency Strip */}
          {urgencyChips.length > 0 && (
            <div className="bg-[#111110] px-6 py-2.5">
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
            className={`grid gap-6 px-6 py-6 [grid-template-columns:minmax(0,1fr)] transition-[grid-template-columns] duration-300 ease-out ${
              sidebarOpen
                ? "xl:[grid-template-columns:minmax(0,1fr)_300px]"
                : "xl:[grid-template-columns:minmax(0,1fr)_36px]"
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
                      className={`group flex items-center gap-3 rounded-xl border border-[#ece4d8] bg-[#faf6ef] px-3 py-3 transition-colors hover:border-[#111110]/20 hover:bg-white ${item.isDummy ? "border-dashed border-stone-300 bg-stone-50/50" : ""}`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${item.numCls}`}>
                        {item.num}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-[#111110]">
                          {item.isDummy && <DummyBadge />}
                          {item.label}
                        </p>
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
              <div className="mt-3 overflow-x-auto pb-2">
                <div className="flex gap-3" style={{ minWidth: "max-content" }}>
                  {STAGE_PIPELINE.map(stage => {
                    const deals = pipeline[stage] ?? []
                    const cfg   = STAGE_CFG[stage]
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
                                  className={`group rounded-xl border border-[#e7e0d6] border-l-4 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${cfg.borderCls} ${deal._dummy ? DUMMY_CARD_CLS : ""}`}
                                >
                                  <p className="text-xs font-semibold leading-snug text-[#111110]">
                                    {deal._dummy && <DummyBadge />}
                                    {deal.title}
                                  </p>
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
                    <div
                      key={cs.customer.id}
                      className={`overflow-hidden rounded-2xl border border-[#e7e0d6] bg-white ${cs._dummy ? DUMMY_CARD_CLS : ""}`}
                    >
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
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#111110]">
                              {cs._dummy && <DummyBadge />}
                              {cs.customer.name}
                            </span>
                            {hasOutstanding && (
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-[#1a1a1a]/45">
                            {cs.customer.region_label ?? "지역 미지정"}
                            {cs.customer.campus_name ? ` · ${cs.customer.campus_name}` : ""}
                            {" · "}진행 {cs.summary?.active_deals ?? 0}건
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
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
                                    className={`flex items-center justify-between gap-3 rounded-xl border border-l-4 border-[#e7e0d6] bg-[#faf6ef] px-4 py-3 ${cfg.borderCls} ${deal._dummy ? DUMMY_CARD_CLS : ""}`}
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-[#111110]">
                                        {deal._dummy && <DummyBadge />}
                                        {deal.title}
                                      </p>
                                      <p className="mt-0.5 text-xs text-[#1a1a1a]/40">{deal.deal_code}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      {deal.manager_name && (
                                        <span className="text-xs text-[#1a1a1a]/50">
                                          담당: {deal.manager_name}
                                        </span>
                                      )}
                                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.badgeCls}`}>
                                        {cfg.label}
                                      </span>
                                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ps.cls}`}>
                                        {ps.label}
                                      </span>
                                      <span className="text-sm font-semibold text-[#111110]">
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
                      className={`flex items-center justify-between rounded-xl border border-[#ece4d8] bg-white px-4 py-3 ${p._dummy ? DUMMY_CARD_CLS : ""}`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-emerald-600">
                          {p._dummy && <DummyBadge />}
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
          <div className="hidden xl:block overflow-hidden">

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
                      <a href="/partner/documents" onClick={e => e.stopPropagation()} className="text-xs text-[#1a1a1a]/40 hover:text-[#1a1a1a]">문서 →</a>
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
                            <div
                              key={deal.id}
                              className={`flex items-center justify-between gap-2 rounded-xl border border-[#ece4d8] bg-[#faf6ef] px-3 py-2.5 ${deal._dummy ? DUMMY_CARD_CLS : ""}`}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-[#111110]">
                                  {deal._dummy && <DummyBadge />}
                                  {deal.title}
                                </p>
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
                      <a href="/partner/documents" onClick={e => e.stopPropagation()} className="text-xs text-[#1a1a1a]/40 hover:text-[#1a1a1a]">계약서 →</a>
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
                            <div
                              key={deal.id}
                              className={`flex items-center justify-between gap-2 rounded-xl border border-[#D1FAE5] bg-[#ECFDF5] px-3 py-2.5 ${deal._dummy ? DUMMY_CARD_CLS : ""}`}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-[#111110]">
                                  {deal._dummy && <DummyBadge />}
                                  {deal.title}
                                </p>
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
                              <div
                                key={item.sku}
                                className={item._dummy ? "rounded-lg border border-dashed border-stone-300 bg-stone-50/40 p-2" : ""}
                              >
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium text-[#111110]">
                                      {item._dummy && <DummyBadge />}
                                      {item.product_name}
                                    </span>
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

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react"
import { CustomerDialog } from "@/components/partner-portal/crud/CustomerDialog"
import { DealQuickCreateDialog } from "@/components/partner-portal/crud/DealQuickCreateDialog"
import { ScheduleDialog } from "@/components/partner-portal/crud/ScheduleDialog"
import { MobileActionLauncher } from "@/components/partner-portal/mobile/MobileActionLauncher"
import { PortalNav } from "@/components/partner-portal/PortalNav"
import { Button } from "@/components/ui/button"

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
  title: string
  deal_code: string
  current_stage: string
  customer_name: string | null
  customer_campus_name: string | null
  expected_amount: number
  contracted_amount: number
  paid_amount: number
  outstanding_amount: number
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
}

type PartnerOverviewResponse = Partial<PartnerOverviewPayload> & {
  error?: string
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
  contact:      { label: "컨택",  dotCls: "bg-stone-400",   badgeCls: "bg-stone-100 text-stone-600",     headerCls: "text-stone-500",    borderCls: "border-l-stone-300"   },
  quote:        { label: "견적",  dotCls: "bg-blue-500",    badgeCls: "bg-blue-100 text-blue-700",       headerCls: "text-blue-600",     borderCls: "border-l-blue-400"    },
  contract:     { label: "계약",  dotCls: "bg-violet-500",  badgeCls: "bg-violet-100 text-violet-700",   headerCls: "text-violet-600",   borderCls: "border-l-violet-400"  },
  confirmed:    { label: "확정",  dotCls: "bg-indigo-500",  badgeCls: "bg-indigo-100 text-indigo-700",   headerCls: "text-indigo-600",   borderCls: "border-l-indigo-400"  },
  installation: { label: "설치",  dotCls: "bg-orange-500",  badgeCls: "bg-orange-100 text-orange-700",   headerCls: "text-orange-600",   borderCls: "border-l-orange-400"  },
  payment:      { label: "수납",  dotCls: "bg-emerald-500", badgeCls: "bg-emerald-100 text-emerald-700", headerCls: "text-emerald-600",  borderCls: "border-l-emerald-400" },
  closed:       { label: "완료",  dotCls: "bg-gray-400",    badgeCls: "bg-gray-100 text-gray-500",       headerCls: "text-gray-400",     borderCls: "border-l-gray-300"    },
  cancelled:    { label: "취소",  dotCls: "bg-red-400",     badgeCls: "bg-red-100 text-red-500",         headerCls: "text-red-400",      borderCls: "border-l-red-300"     },
}

const ACTIVITY_TYPE_CFG: Record<string, { cls: string; emoji: string }> = {
  document: { cls: "bg-blue-100 text-blue-600",    emoji: "📄" },
  schedule: { cls: "bg-orange-100 text-orange-600", emoji: "📅" },
  payment:  { cls: "bg-emerald-100 text-emerald-600", emoji: "💰" },
  default:  { cls: "bg-stone-100 text-stone-500",   emoji: "·"  },
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
    },
    {
      customer: { id: "c2", name: "리더스입시학원", campus_name: "3층", region_label: "분당" },
      summary: { active_deals: 2, unpaid_deals: 1, outstanding_amount: 15600000, last_deal_updated_at: "2026-04-03T12:00:00Z" },
    },
    {
      customer: { id: "c3", name: "서초수학교습소", campus_name: null, region_label: "서초" },
      summary: { active_deals: 1, unpaid_deals: 0, outstanding_amount: 0, last_deal_updated_at: "2026-04-02T09:00:00Z" },
    },
  ],
  deals: [
    { id: "d1", title: "본관 전자칠판 4대 설치", deal_code: "D-2026-001", current_stage: "installation", customer_name: "강남메가스터디학원", customer_campus_name: "본관", expected_amount: 29000000, contracted_amount: 29000000, paid_amount: 12000000, outstanding_amount: 17000000 },
    { id: "d2", title: "추가 교실 계약", deal_code: "D-2026-011", current_stage: "quote", customer_name: "강남메가스터디학원", customer_campus_name: "본관", expected_amount: 14000000, contracted_amount: 14000000, paid_amount: 0, outstanding_amount: 14000000 },
    { id: "d3", title: "3층 전체 교체", deal_code: "D-2026-004", current_stage: "payment", customer_name: "리더스입시학원", customer_campus_name: "3층", expected_amount: 24200000, contracted_amount: 24200000, paid_amount: 24200000, outstanding_amount: 0 },
    { id: "d4", title: "별관 추가 계약", deal_code: "D-2026-015", current_stage: "contract", customer_name: "강남메가스터디학원", customer_campus_name: "별관", expected_amount: 8600000, contracted_amount: 8600000, paid_amount: 0, outstanding_amount: 8600000 },
    { id: "d5", title: "2교실 신설 견적", deal_code: "D-2026-018", current_stage: "contact", customer_name: "서초수학교습소", customer_campus_name: null, expected_amount: 12400000, contracted_amount: 0, paid_amount: 0, outstanding_amount: 0 },
    { id: "d6", title: "분당지점 추가 설치", deal_code: "D-2026-007", current_stage: "installation", customer_name: "리더스입시학원", customer_campus_name: "3층", expected_amount: 15600000, contracted_amount: 15600000, paid_amount: 0, outstanding_amount: 15600000 },
  ],
  recent_activity: [
    { id: "a1", summary: "견적서 v3 링크 발송", action_type: "document", created_at: "2026-04-04T02:10:00Z" },
    { id: "a2", summary: "설치 일정 4/20-4/21 확정", action_type: "schedule", created_at: "2026-04-04T01:30:00Z" },
    { id: "a3", summary: "분할 수납 300만원 입금 확인", action_type: "payment", created_at: "2026-04-03T10:30:00Z" },
    { id: "a4", summary: "별관 추가 계약 초안 생성", action_type: "document", created_at: "2026-04-03T09:00:00Z" },
  ],
  upcoming_installations: [
    { id: "i1", title: "강남메가 본관 설치", location: "서울 강남구", scheduled_start_at: "2026-04-20T09:00:00+09:00", scheduled_end_at: "2026-04-21T17:00:00+09:00" },
    { id: "i2", title: "리더스 분당지점 설치", location: "경기 성남시", scheduled_start_at: "2026-04-25T09:00:00+09:00", scheduled_end_at: "2026-04-25T18:00:00+09:00" },
  ],
  recent_payments: [
    { id: "p1", amount: 3000000, paid_at: "2026-04-03T10:30:00Z", payment_method: "bank_transfer" },
    { id: "p2", amount: 9000000, paid_at: "2026-04-01T09:10:00Z", payment_method: "bank_transfer" },
  ],
  recent_calendar_events: [
    { id: "ce1", title: "견적 링크 만료 전 확인", starts_at: "2026-04-12T10:00:00+09:00", ends_at: "2026-04-12T11:00:00+09:00", source_type: "document_due" },
    { id: "ce2", title: "추가 계약 조정 미팅", starts_at: "2026-04-16T14:00:00+09:00", ends_at: "2026-04-16T15:00:00+09:00", source_type: "meeting" },
  ],
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

/* ─── Main Component ──────────────────────────────────────────── */

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
  }
}

export function PartnerPortalHome() {
  const [overview, setOverview] = useState<PartnerOverviewPayload>(DEMO)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set(["c1"]))
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false)
  const [isDealDialogOpen, setIsDealDialogOpen] = useState(false)
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false)
  const refreshPortal = useCallback(() => {
    window.location.reload()
  }, [])

  useEffect(() => {
    let alive = true
    fetch("/api/partner/overview", { cache: "no-store" })
      .then(async r => {
        const payload = await r.json() as PartnerOverviewResponse
        if (!r.ok) throw new Error(payload.error ?? "Failed to fetch overview")
        return normalizeOverviewPayload(payload)
      })
      .then(payload => { if (alive) { setOverview(payload); setLoading(false) } })
      .catch(() => { if (alive) { setOverview(DEMO); setLoading(false); setError("연결된 계정이 없어 데모 홈으로 표시 중입니다.") } })
    return () => { alive = false }
  }, [])

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
      chips.push({ id: "sign", label: `계약 서명 대기 ${contractDeals.length}건`, href: "/partner/documents", cls: "bg-violet-500/25 text-violet-200 hover:bg-violet-500/35 border border-violet-500/20" })
    }

    const nearInstalls = overview.upcoming_installations.filter(i => daysUntil(i.scheduled_start_at) <= 7)
    if (nearInstalls.length > 0) {
      const d = daysUntil(nearInstalls[0].scheduled_start_at)
      chips.push({ id: "install", label: d === 0 ? "오늘 설치 예정" : `설치 D-${d}`, href: "/partner/calendar", cls: "bg-orange-500/25 text-orange-200 hover:bg-orange-500/35 border border-orange-500/20" })
    }

    if (overview.metrics.outstanding_amount > 0) {
      chips.push({ id: "pay", label: `미수금 ${fmt(overview.metrics.outstanding_amount)}`, href: "/partner/workspace", cls: "bg-red-500/25 text-red-200 hover:bg-red-500/35 border border-red-500/20" })
    }

    return chips
  }, [overview])

  /* action queue: priority-ordered to-do list */
  const actionQueue = useMemo(() => {
    type AItem = { id: string; num: number; label: string; sub: string; href: string; numCls: string }
    const q: AItem[] = []
    let n = 1

    // P1 — 미수금 (설치/수납 단계 + outstanding > 0)
    overview.deals
      .filter(d => d.outstanding_amount > 0 && (d.current_stage === "installation" || d.current_stage === "payment"))
      .slice(0, 2)
      .forEach(d => {
        q.push({ id: `ov-${d.id}`, num: n++, label: `미수금 ${fmt(d.outstanding_amount)} 확인`, sub: `${d.customer_name ?? ""} · ${d.title}`, href: "/partner/workspace", numCls: "bg-red-500 text-white" })
      })

    // P2 — 설치 임박
    overview.upcoming_installations
      .filter(i => daysUntil(i.scheduled_start_at) <= 7)
      .slice(0, 2)
      .forEach(i => {
        const d = daysUntil(i.scheduled_start_at)
        q.push({ id: `inst-${i.id}`, num: n++, label: d === 0 ? "오늘 설치 확인" : `설치 D-${d} 준비`, sub: `${i.title} · ${i.location ?? "장소 미지정"}`, href: "/partner/calendar", numCls: "bg-orange-500 text-white" })
      })

    // P3 — 계약 서명 검토
    overview.deals
      .filter(d => d.current_stage === "contract")
      .slice(0, 2)
      .forEach(d => {
        q.push({ id: `ct-${d.id}`, num: n++, label: "계약 서명 검토", sub: `${d.customer_name ?? ""} · ${d.title}`, href: "/partner/documents", numCls: "bg-violet-500 text-white" })
      })

    // P4 — 캘린더 이벤트
    overview.recent_calendar_events.slice(0, 2).forEach(e => {
      q.push({ id: `ce-${e.id}`, num: n++, label: e.title, sub: fmtShortDate(e.starts_at), href: "/partner/calendar", numCls: "bg-blue-500 text-white" })
    })

    return q.slice(0, 7)
  }, [overview])

  /* KPI progress */
  const { contracted_amount, installed_amount, paid_amount, outstanding_amount } = overview.metrics
  const installPct = contracted_amount > 0 ? Math.round((installed_amount / contracted_amount) * 100) : 0
  const paidPct    = contracted_amount > 0 ? Math.round((paid_amount    / contracted_amount) * 100) : 0
  const canCreateInPortal = overview.mode === "v2"

  const todayStr = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  })

  return (
    <div className="min-h-screen bg-[#f6f3ed] text-[#1a1a1a]">

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-[#e7e0d6] bg-white/95 backdrop-blur-sm px-6 py-4">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-[#1a1a1a]/40" />}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1a1a1a]/30">Partner Portal</p>
              <p className="mt-0.5 text-sm text-[#1a1a1a]/50">{todayStr}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <PortalNav />
            <div className="hidden flex-wrap justify-end gap-2 md:flex">
              <QuickActionButton
                label="새 고객"
                disabled={!canCreateInPortal}
                onClick={() => setIsCustomerDialogOpen(true)}
              />
              <QuickActionButton
                label="신규 컨택"
                disabled={!canCreateInPortal || overview.customers.length === 0}
                onClick={() => setIsDealDialogOpen(true)}
              />
              <QuickActionButton
                label="일정 추가"
                disabled={!canCreateInPortal || overview.deals.length === 0}
                onClick={() => setIsScheduleDialogOpen(true)}
              />
            </div>
            {!canCreateInPortal && (
              <p className="text-xs text-[#1a1a1a]/40">
                생성 기능은 V2 계정 연결 상태에서만 사용할 수 있습니다.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Today Strip ──────────────────────────────────────── */}
      <div className={`px-6 py-3 ${urgencyChips.length > 0 ? "bg-[#111110]" : "bg-emerald-600"}`}>
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-2">
          {urgencyChips.length === 0 ? (
            <span className="flex items-center gap-2 text-sm font-medium text-white">
              <CheckCircle2 className="h-4 w-4" />
              오늘 처리할 긴급 사항이 없습니다
            </span>
          ) : (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                지금 확인
              </span>
              {urgencyChips.map(chip => (
                <a
                  key={chip.id}
                  href={chip.href}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${chip.cls}`}
                >
                  {chip.label}
                  <ArrowRight className="h-3 w-3" />
                </a>
              ))}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-700">
          <div className="mx-auto max-w-[1680px]">{error}</div>
        </div>
      )}

      <div className="mx-auto max-w-[1680px] space-y-6 px-6 py-6">

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

        {/* ── Main 2-col ────────────────────────────────────── */}
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">

          {/* ── Left ─────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Pipeline Board */}
            <section>
              <SectionHeader title="거래 파이프라인" sub={`${overview.deals.length}건`} />
              <div className="mt-3 overflow-x-auto pb-2">
                <div className="flex gap-3" style={{ minWidth: "max-content" }}>
                  {STAGE_PIPELINE.map(stage => {
                    const deals = pipeline[stage] ?? []
                    const cfg   = STAGE_CFG[stage]
                    return (
                      <div key={stage} className="w-[188px] flex-shrink-0">
                        {/* column header */}
                        <div className="mb-2 flex items-center justify-between px-0.5">
                          <span className={`text-xs font-semibold ${cfg.headerCls}`}>
                            {cfg.label}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${deals.length > 0 ? cfg.badgeCls : "bg-[#ece4d8] text-[#1a1a1a]/30"}`}>
                            {deals.length}
                          </span>
                        </div>
                        {/* cards */}
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
                                  className={`group rounded-xl border border-[#e7e0d6] border-l-4 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${cfg.borderCls}`}
                                >
                                  <p className="text-xs font-semibold leading-snug text-[#111110]">
                                    {deal.title}
                                  </p>
                                  <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
                                    {deal.customer_name}
                                  </p>
                                  <div className="mt-2.5 flex items-end justify-between gap-1">
                                    <p className="text-sm font-bold text-[#111110]">
                                      {fmt(deal.contracted_amount || deal.expected_amount)}
                                    </p>
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

            {/* Customer Stacks */}
            <section>
              <SectionHeader title="기관별 거래" sub={`${overview.customers.length}개 기관`} />
              <div className="mt-3 space-y-2">
                {customerStacks.map(cs => {
                  const expanded     = expandedCustomers.has(cs.customer.id)
                  const hasOutstanding = (cs.summary?.outstanding_amount ?? 0) > 0

                  return (
                    <div
                      key={cs.customer.id}
                      className="overflow-hidden rounded-2xl border border-[#e7e0d6] bg-white"
                    >
                      {/* row header */}
                      <button
                        type="button"
                        onClick={() => setExpandedCustomers(prev => {
                          const next = new Set(prev)
                          if (next.has(cs.customer.id)) {
                            next.delete(cs.customer.id)
                          } else {
                            next.add(cs.customer.id)
                          }
                          return next
                        })}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[#faf6ef]"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#111110]">
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

                      {/* expanded deals */}
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
                                    className={`flex items-center justify-between gap-3 rounded-xl border border-l-4 border-[#e7e0d6] bg-[#faf6ef] px-4 py-3 ${cfg.borderCls}`}
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-[#111110]">
                                        {deal.title}
                                      </p>
                                      <p className="mt-0.5 text-xs text-[#1a1a1a]/40">{deal.deal_code}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
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

            {/* Activity Timeline */}
            <section>
              <SectionHeader title="최근 활동" sub="업데이트 로그" />
              <div className="mt-3 space-y-0">
                {overview.recent_activity.map((log, i) => {
                  const isLast = i === overview.recent_activity.length - 1
                  const atCfg  = ACTIVITY_TYPE_CFG[log.action_type] ?? ACTIVITY_TYPE_CFG.default
                  return (
                    <div key={log.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${atCfg.cls}`}>
                          {atCfg.emoji}
                        </div>
                        {!isLast && <div className="w-px flex-1 bg-[#e7e0d6]" style={{ minHeight: 12 }} />}
                      </div>
                      <div className="pb-4 pt-0.5">
                        <p className="text-sm font-medium text-[#111110]">{log.summary}</p>
                        <p className="mt-0.5 text-xs text-[#1a1a1a]/40">{fmtRelative(log.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          {/* ── Right Sidebar ─────────────────────────────────── */}
          <div className="space-y-4">

            {/* Action Queue */}
            <div className="rounded-2xl border border-[#e7e0d6] bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <h2 className="text-sm font-semibold text-[#111110]">지금 할 일</h2>
                {actionQueue.length > 0 && (
                  <span className="ml-auto rounded-full bg-[#111110] px-2 py-0.5 text-[10px] font-bold text-white">
                    {actionQueue.length}
                  </span>
                )}
              </div>

              {actionQueue.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  할 일이 없습니다
                </div>
              ) : (
                <div className="space-y-2">
                  {actionQueue.map(item => (
                    <a
                      key={item.id}
                      href={item.href}
                      className="group flex items-center gap-3 rounded-xl border border-[#ece4d8] bg-[#faf6ef] px-3 py-3 transition-colors hover:border-[#111110]/20 hover:bg-white"
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${item.numCls}`}>
                        {item.num}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-[#111110]">
                          {item.label}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[#1a1a1a]/45">{item.sub}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[#1a1a1a]/25 transition-transform group-hover:translate-x-0.5" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming Schedule */}
            <div className="rounded-2xl border border-[#e7e0d6] bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#111110]">다가오는 일정</h2>
                <a href="/partner/calendar" className="text-xs text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                  캘린더 →
                </a>
              </div>
              <div className="space-y-2">
                {overview.upcoming_installations.slice(0, 2).map(install => {
                  const days = daysUntil(install.scheduled_start_at)
                  return (
                    <div
                      key={install.id}
                      className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-orange-900">{install.title}</p>
                          <p className="mt-0.5 text-xs text-orange-700/60">
                            {install.location ?? "장소 미지정"}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${days === 0 ? "bg-orange-500 text-white" : "bg-orange-100 text-orange-700"}`}>
                          {days === 0 ? "오늘" : `D-${days}`}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-orange-700/50">
                        {fmtShortDate(install.scheduled_start_at)}
                      </p>
                    </div>
                  )
                })}

                {overview.recent_calendar_events.slice(0, 2).map(event => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 rounded-xl border border-[#ece4d8] bg-[#faf6ef] px-3 py-3"
                  >
                    <span className="mt-0.5 text-base leading-none">
                      {CAL_SOURCE_EMOJI[event.source_type] ?? "📅"}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-[#111110]">{event.title}</p>
                      <p className="mt-0.5 text-xs text-[#1a1a1a]/45">{fmtShortDate(event.starts_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Payments */}
            {overview.recent_payments.length > 0 && (
              <div className="rounded-2xl border border-[#e7e0d6] bg-white p-5">
                <h2 className="mb-4 text-sm font-semibold text-[#111110]">최근 수납</h2>
                <div className="space-y-2">
                  {overview.recent_payments.slice(0, 3).map(p => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl border border-[#ece4d8] bg-[#faf6ef] px-3 py-2.5"
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
              </div>
            )}

            {/* Quick Nav */}
            <div className="rounded-2xl border border-[#e7e0d6] bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-[#111110]">바로 가기</h2>
              <div className="space-y-1.5">
                {[
                  { label: "거래 워크스페이스", href: "/partner/workspace", emoji: "📋" },
                  { label: "문서 (견적·계약)",  href: "/partner/documents",  emoji: "📄" },
                  { label: "설치 캘린더",        href: "/partner/calendar",   emoji: "📅" },
                ].map(link => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="group flex items-center justify-between rounded-xl border border-[#ece4d8] bg-[#faf6ef] px-4 py-3 text-sm text-[#1a1a1a]/60 transition-colors hover:bg-white hover:text-[#111110]"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="text-base">{link.emoji}</span>
                      {link.label}
                    </span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
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

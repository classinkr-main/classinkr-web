"use client"

import React, { startTransition, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Layers3,
  MapPinned,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MobileActionLauncher } from "@/components/partner-portal/mobile/MobileActionLauncher"
import type {
  CalendarEvent,
  CustomerListItem,
  DealDetailPayload,
  DealListItem,
} from "@/lib/partner-portal/types"
import type { PartnerReadMode } from "@/lib/partner-portal/repositories/partner-read"

// ─── Types ───────────────────────────────────────────────────────────────────

type WorkspaceOverview = {
  mode: PartnerReadMode
  metrics: { customer_count: number; active_deal_count: number; outstanding_amount: number }
  customers: CustomerListItem[]
  deals: DealListItem[]
  recent_calendar_events: CalendarEvent[]
}

// ─── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_OVERVIEW: WorkspaceOverview = {
  mode: "demo",
  metrics: { customer_count: 2, active_deal_count: 3, outstanding_amount: 17000000 },
  customers: [
    {
      customer: {
        id: "demo-customer-1",
        partner_account_id: "demo-account",
        name: "강남메가수학학원",
        contact_name: "이준호",
        email: null,
        phone: "02-1234-5678",
        address: null,
        business_number: null,
        campus_name: "본관",
        region_label: "강남",
        notes: null,
        created_by: null,
        created_at: "2026-02-20T00:00:00Z",
        updated_at: "2026-04-04T00:00:00Z",
      } as CustomerListItem["customer"],
      summary: {
        customer_id: "demo-customer-1",
        partner_account_id: "demo-account",
        customer_name: "강남메가수학학원",
        total_deals: 2,
        active_deals: 2,
        installation_deals: 1,
        unpaid_deals: 1,
        contracted_amount: 43000000,
        installed_amount: 18000000,
        paid_amount: 12000000,
        outstanding_amount: 31000000,
        last_deal_updated_at: "2026-04-04T00:00:00Z",
      },
    },
    {
      customer: {
        id: "demo-customer-2",
        partner_account_id: "demo-account",
        name: "리더스입시학원",
        contact_name: "최민서",
        email: null,
        phone: "031-123-4567",
        address: null,
        business_number: null,
        campus_name: "3층관",
        region_label: "분당",
        notes: null,
        created_by: null,
        created_at: "2026-02-10T00:00:00Z",
        updated_at: "2026-04-04T00:00:00Z",
      } as CustomerListItem["customer"],
      summary: {
        customer_id: "demo-customer-2",
        partner_account_id: "demo-account",
        customer_name: "리더스입시학원",
        total_deals: 1,
        active_deals: 1,
        installation_deals: 1,
        unpaid_deals: 0,
        contracted_amount: 24200000,
        installed_amount: 24200000,
        paid_amount: 24200000,
        outstanding_amount: 0,
        last_deal_updated_at: "2026-04-04T00:00:00Z",
      },
    },
  ],
  deals: [
    {
      id: "demo-deal-1",
      partner_account_id: "demo-account",
      customer_id: "demo-customer-1",
      deal_code: "D-2026-001",
      title: "본관 2~4층 전자칠판 설치",
      status: "active",
      current_stage: "installation",
      expected_amount: 29000000,
      contracted_amount: 29000000,
      installed_amount: 18000000,
      paid_amount: 12000000,
      outstanding_amount: 17000000,
      payment_status: "partial",
      starts_at: "2026-02-22T00:00:00Z",
      closed_at: null,
      notes: null,
      created_by: null,
      created_at: "2026-02-22T00:00:00Z",
      updated_at: "2026-04-03T00:00:00Z",
      customer_name: "강남메가수학학원",
      customer_contact_name: "이준호",
      customer_region_label: "강남",
      customer_campus_name: "본관",
    } as DealListItem,
    {
      id: "demo-deal-2",
      partner_account_id: "demo-account",
      customer_id: "demo-customer-1",
      deal_code: "D-2026-011",
      title: "별관 추가 계약",
      status: "active",
      current_stage: "quote",
      expected_amount: 14000000,
      contracted_amount: 14000000,
      installed_amount: 0,
      paid_amount: 0,
      outstanding_amount: 14000000,
      payment_status: "unpaid",
      starts_at: "2026-03-28T00:00:00Z",
      closed_at: null,
      notes: null,
      created_by: null,
      created_at: "2026-03-28T00:00:00Z",
      updated_at: "2026-04-02T00:00:00Z",
      customer_name: "강남메가수학학원",
      customer_contact_name: "이준호",
      customer_region_label: "강남",
      customer_campus_name: "본관",
    } as DealListItem,
    {
      id: "demo-deal-3",
      partner_account_id: "demo-account",
      customer_id: "demo-customer-2",
      deal_code: "D-2026-004",
      title: "3층 전체 전자칠판 교체",
      status: "active",
      current_stage: "payment",
      expected_amount: 24200000,
      contracted_amount: 24200000,
      installed_amount: 24200000,
      paid_amount: 24200000,
      outstanding_amount: 0,
      payment_status: "paid",
      starts_at: "2026-02-12T00:00:00Z",
      closed_at: null,
      notes: null,
      created_by: null,
      created_at: "2026-02-12T00:00:00Z",
      updated_at: "2026-04-04T00:00:00Z",
      customer_name: "리더스입시학원",
      customer_contact_name: "최민서",
      customer_region_label: "분당",
      customer_campus_name: "3층관",
    } as DealListItem,
  ],
  recent_calendar_events: [
    {
      id: "demo-calendar-1",
      partner_account_id: "demo-account",
      customer_id: "demo-customer-1",
      deal_id: "demo-deal-1",
      source_type: "installation",
      source_id: "demo-install-1",
      starts_at: "2026-04-20T09:00:00+09:00",
      ends_at: "2026-04-20T17:00:00+09:00",
      timezone: "Asia/Seoul",
      title: "강남메가수학학원 설치",
      description: "서울시 강남구 역삼로 123",
      status: "active",
      created_by: null,
      created_at: "2026-04-03T09:00:00Z",
      updated_at: "2026-04-03T09:00:00Z",
    },
  ],
}

const DEMO_DETAIL: DealDetailPayload = {
  deal: {
    id: "demo-deal-1",
    partner_account_id: "demo-account",
    customer_id: "demo-customer-1",
    deal_code: "D-2026-001",
    title: "본관 2~4층 전자칠판 설치",
    status: "active",
    current_stage: "installation",
    expected_amount: 29000000,
    contracted_amount: 29000000,
    installed_amount: 18000000,
    paid_amount: 12000000,
    outstanding_amount: 17000000,
    payment_status: "partial",
    starts_at: "2026-02-22T00:00:00Z",
    closed_at: null,
    notes: '전자칠판 86" 4대, 스탠드 4대, T1 카메라 2대',
    created_by: null,
    created_at: "2026-02-22T00:00:00Z",
    updated_at: "2026-04-03T00:00:00Z",
  },
  customer: DEMO_OVERVIEW.customers[0].customer as DealDetailPayload["customer"],
  line_items: [
    {
      id: "demo-li-1",
      deal_id: "demo-deal-1",
      sku: "CB-86",
      category: "board" as const,
      product_name: '전자칠판 86"',
      quantity: 4,
      unit_price: 5500000,
      amount: 22000000,
      sort_order: 1,
      notes: null,
      created_at: "2026-02-22T00:00:00Z",
      updated_at: "2026-02-22T00:00:00Z",
    },
    {
      id: "demo-li-2",
      deal_id: "demo-deal-1",
      sku: "STAND-86",
      category: "mount" as const,
      product_name: "이동식 스탠드",
      quantity: 4,
      unit_price: 550000,
      amount: 2200000,
      sort_order: 2,
      notes: null,
      created_at: "2026-02-22T00:00:00Z",
      updated_at: "2026-02-22T00:00:00Z",
    },
    {
      id: "demo-li-3",
      deal_id: "demo-deal-1",
      sku: "CAM-T1",
      category: "camera" as const,
      product_name: "T1 카메라",
      quantity: 2,
      unit_price: 1900000,
      amount: 3800000,
      sort_order: 3,
      notes: null,
      created_at: "2026-02-22T00:00:00Z",
      updated_at: "2026-02-22T00:00:00Z",
    },
  ],
  quote_documents: [],
  contract_documents: [],
  installations: [],
  payments: [],
  receipts: [],
  activity_logs: [],
  calendar_events: DEMO_OVERVIEW.recent_calendar_events,
}

// ─── Design System ────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, { color: string; dot: string; ring: string }> = {
  contact:      { color: "bg-[#f0f0ec] text-[#615D59]",    dot: "bg-[#A39E98]",   ring: "ring-[#e8e8e4]"   },
  quote:        { color: "bg-[#ECFDF5] text-[#084734]",    dot: "bg-[#084734]",   ring: "ring-[#D1FAE5]"   },
  contract:     { color: "bg-[#D1FAE5] text-[#065c41]",    dot: "bg-[#065c41]",   ring: "ring-[#D1FAE5]"   },
  confirmed:    { color: "bg-[#D1FAE5] text-[#065c41]",    dot: "bg-[#065c41]",   ring: "ring-[#D1FAE5]"   },
  installation: { color: "bg-amber-50 text-amber-700",      dot: "bg-amber-500",   ring: "ring-amber-200"   },
  payment:      { color: "bg-[#ECFDF5] text-[#084734]",    dot: "bg-[#084734]",   ring: "ring-[#D1FAE5]"   },
  closed:       { color: "bg-[#ECFDF5] text-[#084734]",    dot: "bg-[#084734]",   ring: "ring-[#D1FAE5]"   },
  cancelled:    { color: "bg-[#FEF3EE] text-[#B85C33]",    dot: "bg-[#F6D5C5]",   ring: "ring-[#F6D5C5]"   },
}

const STAGE_ORDER_PORTAL = ["contact", "quote", "contract", "confirmed", "installation", "payment"] as const

// ─── Utility Functions ────────────────────────────────────────────────────────

function formatMoney(value: number | null | undefined) {
  if (value == null) return "-"
  return `${value.toLocaleString("ko-KR")}원`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  return new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatBoardSkuLabel(value: string | null | undefined) {
  if (!value) return "-"
  if (value === "CB-86" || value === "board-86") return '86"'
  if (value === "CB-75" || value === "board-75") return '75"'
  return value
}

function stageLabel(stage: DealListItem["current_stage"]) {
  return {
    contact: "컨택",
    quote: "견적",
    contract: "계약",
    confirmed: "확정",
    installation: "설치",
    payment: "수납",
    closed: "종결",
    cancelled: "취소",
  }[stage]
}

function fmtM(n: number | null | undefined): string {
  if (n == null) return "-"
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`
  return n.toLocaleString()
}

function getDday(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return "D-day"
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const payload = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? "Failed to fetch")
  return payload
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function StageRoadmapBar({ stage }: { stage: string }) {
  if (stage === "cancelled") return (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-[#F6D5C5]" />
      <span className="text-xs text-[#B85C33]">취소됨</span>
    </div>
  )
  const activeIdx = STAGE_ORDER_PORTAL.indexOf(stage as typeof STAGE_ORDER_PORTAL[number])
  return (
    <div className="flex items-center gap-0">
      {STAGE_ORDER_PORTAL.map((s, i) => {
        const stg = STAGE_COLORS[s]
        const isPast   = i < activeIdx
        const isActive = i === activeIdx
        const isFuture = i > activeIdx
        return (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-1">
              <div className={[
                "rounded-full transition-colors duration-200",
                isActive ? `w-3.5 h-3.5 ${stg.dot} ring-2 ${stg.ring}` : "",
                isPast   ? `w-2.5 h-2.5 ${stg.dot}` : "",
                isFuture ? "w-2.5 h-2.5 bg-white border-2 border-[#d8d8d4]" : "",
              ].filter(Boolean).join(" ")} />
              <span className={`text-[9px] leading-none whitespace-nowrap ${isActive ? "font-semibold text-[#1a1a1a]" : isPast ? "text-[#1a1a1a]/40" : "text-[#1a1a1a]/25"}`}>
                {stageLabel(s)}
              </span>
            </div>
            {i < STAGE_ORDER_PORTAL.length - 1 && (
              <div className={`h-px flex-1 min-w-[10px] mb-3.5 transition-colors duration-200 ${i < activeIdx ? stg.dot : "bg-[#e0e0dc]"}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function FinancialSummary({
  contracted,
  paid,
  outstanding,
}: {
  contracted?: number | null
  paid?: number | null
  outstanding?: number | null
}) {
  if (!contracted) return null
  const hasOutstanding = (outstanding ?? 0) > 0
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-[#f7f7f5] rounded-xl px-3 py-2.5">
        <p className="text-[10px] text-[#1a1a1a]/40 uppercase tracking-wider mb-0.5">계약</p>
        <p className="text-sm font-bold text-[#1a1a1a]">{fmtM(contracted)}원</p>
      </div>
      <div className="bg-[#ECFDF5] rounded-xl px-3 py-2.5">
        <p className="text-[10px] text-[#084734]/70 uppercase tracking-wider mb-0.5">납입</p>
        <p className="text-sm font-bold text-[#084734]">{fmtM(paid)}원</p>
      </div>
      <div className={`rounded-xl px-3 py-2.5 ${hasOutstanding ? "bg-[#FEF3EE]" : "bg-[#ECFDF5]"}`}>
        <p className={`text-[10px] uppercase tracking-wider mb-0.5 ${hasOutstanding ? "text-[#B85C33]/70" : "text-[#084734]/70"}`}>미수금</p>
        <p className={`text-sm font-bold ${hasOutstanding ? "text-[#B85C33]" : "text-[#084734]"}`}>{fmtM(outstanding)}원</p>
      </div>
    </div>
  )
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e8e8e4] bg-[#f7f7f5] px-3 py-1">
      {icon}
      {label}
    </span>
  )
}

function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${danger ? "bg-[#FEF3EE]" : "bg-[#f7f7f5]"}`}>
      <p className={`text-[11px] ${danger ? "text-[#B85C33]" : "text-[#1a1a1a]/35"}`}>{label}</p>
      <p className={`mt-1 text-xs font-semibold ${danger ? "text-[#B85C33]" : "text-[#1a1a1a]"}`}>{value}</p>
    </div>
  )
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
      <div className="flex items-center gap-2 text-[#1a1a1a]/45">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-lg font-semibold text-[#1a1a1a]">{value}</p>
    </div>
  )
}

function SectionBox({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#1a1a1a]">
        {icon}
        {title}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  )
}

function ActionLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[#f7f7f5] px-3 py-2 text-sm text-[#1a1a1a]/65">
      <Sparkles className="h-4 w-4 text-[#1a1a1a]/30" />
      {text}
    </div>
  )
}

function DocRow({ label, meta, detail }: { label: string; meta: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#1a1a1a]">{label}</p>
          <p className="mt-1 text-xs text-[#1a1a1a]/50">{meta}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-[#1a1a1a]/25" />
      </div>
      <p className="mt-3 text-sm text-[#1a1a1a]/65">{detail}</p>
    </div>
  )
}

function EmptyText({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-[#e0e0dc] bg-white px-4 py-8 text-center text-sm text-[#1a1a1a]/45">
      {text}
    </p>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PartnerWorkspacePage() {
  const router = useRouter()
  const [overview, setOverview] = useState<WorkspaceOverview>(DEMO_OVERVIEW)
  const [detail, setDetail] = useState<DealDetailPayload>(DEMO_DETAIL)
  const [mode, setMode] = useState<PartnerReadMode>("demo")
  const [selectedCustomerId, setSelectedCustomerId] = useState(DEMO_OVERVIEW.customers[0].customer.id)
  const [selectedDealId, setSelectedDealId] = useState(DEMO_OVERVIEW.deals[0].id)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshPortal = useCallback(() => {
    window.location.reload()
  }, [])

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const payload = await readJson<WorkspaceOverview>("/api/partner/overview")
        if (!alive) return
        setMode(payload.mode ?? "demo")
        setOverview(payload)
        setSelectedCustomerId(payload.customers[0]?.customer.id ?? "")
        setSelectedDealId(payload.deals[0]?.id ?? "")
      } catch {
        if (!alive) return
        setMode("demo")
        setOverview(DEMO_OVERVIEW)
        setSelectedCustomerId(DEMO_OVERVIEW.customers[0].customer.id)
        setSelectedDealId(DEMO_OVERVIEW.deals[0].id)
        setDetail(DEMO_DETAIL)
        setError("연결된 계정이 없어 데모 셸로 전환했습니다.")
      } finally {
        if (alive) setLoading(false)
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true

    async function loadDetail() {
      if (!selectedDealId) return
      if (mode === "demo") {
        setDetail(DEMO_DETAIL)
        return
      }

      try {
        const payload = await readJson<{ deal: DealDetailPayload }>(`/api/partner/deals/${selectedDealId}`)
        if (!alive) return
        setDetail(payload.deal)
      } catch {
        if (!alive) return
        setDetail(DEMO_DETAIL)
      }
    }

    void loadDetail()
    return () => {
      alive = false
    }
  }, [mode, selectedDealId])

  const selectedCustomer = overview.customers.find((item) => item.customer.id === selectedCustomerId) ?? overview.customers[0]
  const selectedDeals = selectedCustomer
    ? overview.deals.filter((deal) => deal.customer_id === selectedCustomer.customer.id)
    : overview.deals
  const selectedDeal = selectedDeals.find((deal) => deal.id === selectedDealId) ?? selectedDeals[0]
  const canCreateInPortal = mode === "v2"

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f2] px-6 py-10">
        <div className="mx-auto max-w-5xl rounded-xl border border-[#e8e8e4] bg-white p-8">
          <div className="space-y-2">
            <div className="h-16 rounded-xl bg-[#f0f0ec] animate-pulse" />
            <div className="h-16 rounded-xl bg-[#f0f0ec] animate-pulse" />
            <div className="h-16 rounded-xl bg-[#f0f0ec] animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-[#1a1a1a]">
      <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
        {/* Header Card */}
        <Card className="border-[#e8e8e4] bg-white shadow-none">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-[#1a1a1a]/15 bg-[#1a1a1a] text-white">
                  {mode === "demo" ? "DEMO" : "LIVE"}
                </Badge>
                <Badge variant="outline" className="border-[#e8e8e4] bg-white text-[#1a1a1a]/50">
                  Partner Workspace
                </Badge>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl text-[#1a1a1a]">
                거래 중심 파트너 워크스페이스
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#1a1a1a]/50">
                기관 목록, 거래 상세, 문서, 설치, 수납, 활동을 하나의 셸에서 묶어 보는 진입점입니다.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#1a1a1a]/50">
                <Chip icon={<Users className="h-3.5 w-3.5" />} label={`기관 ${overview.metrics.customer_count}개`} />
                <Chip icon={<Layers3 className="h-3.5 w-3.5" />} label={`진행 거래 ${overview.metrics.active_deal_count}건`} />
                <Chip icon={<CircleDollarSign className="h-3.5 w-3.5" />} label={`미수금 ${formatMoney(overview.metrics.outstanding_amount)}`} />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-2.5 text-sm text-[#1a1a1a]/60">
                <ArrowRight className="h-4 w-4" />
                관리자와 같은 일정 원본으로 연결됩니다
              </div>
              <button
                type="button"
                onClick={() => router.refresh()}
                className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] hover:bg-[#f7f7f5] active:scale-[0.98] transition-transform duration-75"
              >
                새로고침
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {/* 3-Column Layout */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_320px]">

          {/* ── Left: Customer List ── */}
          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-[10px] uppercase tracking-wider text-[#1a1a1a]/40 font-semibold">기관 / 거래 목록</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.customers.map((item) => {
                const isSelected = item.customer.id === selectedCustomer?.customer.id
                const customerDeals = overview.deals.filter((deal) => deal.customer_id === item.customer.id)
                const hasOutstanding = (item.summary?.outstanding_amount ?? 0) > 0
                return (
                  <button
                    key={item.customer.id}
                    type="button"
                    onClick={() =>
                      startTransition(() => {
                        setSelectedCustomerId(item.customer.id)
                        setSelectedDealId(customerDeals[0]?.id ?? overview.deals[0]?.id ?? "")
                      })
                    }
                    className={`w-full rounded-xl border px-4 py-4 text-left transition-colors duration-150 ${
                      isSelected
                        ? "border-[#1a1a1a] bg-[#fafafa] ring-1 ring-[#1a1a1a]/10"
                        : "border-[#e8e8e4] bg-white hover:bg-[#fafaf8] hover:border-[#cccccc]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#1a1a1a]">{item.customer.name}</p>
                        <p className="mt-1 text-xs text-[#1a1a1a]/50">
                          {item.customer.region_label ?? "지역 미지정"}
                          {item.customer.campus_name ? ` · ${item.customer.campus_name}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasOutstanding && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#B85C33]" />
                        )}
                        <ArrowRight className="h-4 w-4 text-[#1a1a1a]/25" />
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <MiniStat label="거래" value={`${customerDeals.length}건`} />
                      <MiniStat label="미수금" value={formatMoney(item.summary?.outstanding_amount ?? 0)} danger={(item.summary?.outstanding_amount ?? 0) > 0} />
                    </div>
                    {/* Deal list under customer */}
                    {isSelected && customerDeals.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {customerDeals.map((deal) => {
                          const stg = STAGE_COLORS[deal.current_stage] ?? STAGE_COLORS.contact
                          const isActiveDeal = deal.id === selectedDealId
                          const showDday = (deal.current_stage === "installation" || deal.current_stage === "confirmed") && deal.starts_at
                          const dday = showDday ? getDday(deal.starts_at) : null
                          return (
                            <button
                              key={deal.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                startTransition(() => setSelectedDealId(deal.id))
                              }}
                              className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
                                isActiveDeal
                                  ? "border-[#1a1a1a] bg-white ring-2 ring-[#1a1a1a] ring-offset-1"
                                  : "border-[#ededea] bg-[#f7f7f5] hover:border-[#cccccc] hover:bg-white"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${stg.dot}`} />
                                  <span className="text-xs font-medium text-[#1a1a1a] truncate">{deal.title}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {dday && (
                                    <span className="text-[10px] text-amber-600 font-semibold">{dday}</span>
                                  )}
                                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 transition-colors duration-200 ${stg.color}`}>
                                    {stageLabel(deal.current_stage)}
                                  </span>
                                </div>
                              </div>
                              {deal.contracted_amount != null && (
                                <p className="mt-1 text-[11px] text-[#1a1a1a]/40 pl-4">{fmtM(deal.contracted_amount)}원</p>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </button>
                )
              })}
            </CardContent>
          </Card>

          {/* ── Center: Deal Workspace ── */}
          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-[10px] uppercase tracking-wider text-[#1a1a1a]/40 font-semibold">거래 워크스페이스</CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDeal ? (
                <EmptyText text="선택된 거래가 없습니다." />
              ) : (
                <Tabs defaultValue="overview" className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <TabsList className="h-auto rounded-full bg-[#f0f0ec] p-1 gap-0.5">
                      <TabsTrigger value="overview" className="rounded-full text-xs px-3 py-1.5">개요</TabsTrigger>
                      <TabsTrigger value="documents" className="rounded-full text-xs px-3 py-1.5">문서</TabsTrigger>
                      <TabsTrigger value="install" className="rounded-full text-xs px-3 py-1.5">설치</TabsTrigger>
                      <TabsTrigger value="payments" className="rounded-full text-xs px-3 py-1.5">수납</TabsTrigger>
                      <TabsTrigger value="activity" className="rounded-full text-xs px-3 py-1.5">활동</TabsTrigger>
                    </TabsList>
                    <span className={`text-[10px] rounded-full px-2.5 py-1 font-medium transition-colors duration-200 ${STAGE_COLORS[selectedDeal.current_stage]?.color ?? "bg-slate-100 text-slate-600"}`}>
                      {stageLabel(selectedDeal.current_stage)}
                    </span>
                  </div>

                  <TabsContent value="overview" className="mt-0 space-y-4 transition-opacity duration-150">
                    {/* Stage Roadmap */}
                    <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-5 py-4">
                      <StageRoadmapBar stage={selectedDeal.current_stage} />
                    </div>

                    {/* Deal Header */}
                    <div className="rounded-xl border border-[#e8e8e4] bg-white p-5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1a1a1a]/40">
                        {selectedDeal.customer_name ?? selectedCustomer?.customer.name ?? "-"} · {selectedDeal.deal_code}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#1a1a1a]">{selectedDeal.title}</h3>
                      <div className="mt-4">
                        <FinancialSummary
                          contracted={selectedDeal.contracted_amount}
                          paid={selectedDeal.paid_amount}
                          outstanding={selectedDeal.outstanding_amount}
                        />
                      </div>
                    </div>

                    {/* 판매 품목 요약 */}
                    {detail.line_items.length > 0 && (
                      <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#1a1a1a]/30 mb-3">판매 품목</p>
                        <div className="space-y-2">
                          {detail.line_items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="shrink-0 rounded-md bg-[#f0f0ec] px-1.5 py-0.5 text-[10px] font-mono text-[#1a1a1a]/50">{formatBoardSkuLabel(item.sku)}</span>
                                <span className="truncate text-[#1a1a1a]">{item.product_name}</span>
                                <span className="shrink-0 text-xs text-[#1a1a1a]/40">×{item.quantity}</span>
                              </div>
                              <span className="shrink-0 text-sm text-[#1a1a1a]/60">{item.amount.toLocaleString("ko-KR")}원</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-[#f0f0ec] pt-3 text-sm font-semibold">
                          <span className="text-[#1a1a1a]/50">합계</span>
                          <span className="text-[#1a1a1a]">
                            {detail.line_items.reduce((sum, i) => sum + i.amount, 0).toLocaleString("ko-KR")}원
                          </span>
                        </div>
                      </div>
                    )}

                    <SectionBox icon={<FileText className="h-4 w-4" />} title="다음 액션">
                      <ActionLine text={`현재 단계: ${stageLabel(selectedDeal.current_stage)}`} />
                      <ActionLine text="문서 버전 링크 확인" />
                      <ActionLine text="설치 일정 충돌 확인" />
                      <ActionLine text="미수금 / 수납 상태 확인" />
                    </SectionBox>
                  </TabsContent>

                  <TabsContent value="documents" className="mt-0 space-y-4 transition-opacity duration-150">
                    <SectionBox icon={<FileText className="h-4 w-4" />} title="문서">
                      {detail.quote_documents.length === 0 ? (
                        <p className="text-sm text-[#1a1a1a]/45">견적 문서가 없습니다.</p>
                      ) : (
                        detail.quote_documents.map((doc) => (
                          <DocRow
                            key={doc.id}
                            label={doc.quote_number}
                            meta={`견적서 · ${doc.versions.length}개 버전`}
                            detail={
                              doc.versions[0]
                                ? `최신 v${doc.versions[0].version_number} · ${formatMoney(doc.versions[0].total_amount)}`
                                : "버전 없음"
                            }
                          />
                        ))
                      )}
                      {detail.contract_documents.length === 0 ? (
                        <p className="text-sm text-[#1a1a1a]/45">계약 문서가 없습니다.</p>
                      ) : (
                        detail.contract_documents.map((doc) => (
                          <DocRow
                            key={doc.id}
                            label={doc.contract_number}
                            meta={`계약서 · ${doc.versions.length}개 버전`}
                            detail={
                              doc.versions[0]
                                ? `최신 v${doc.versions[0].version_number} · ${formatMoney(doc.versions[0].total_amount)}`
                                : "버전 없음"
                            }
                          />
                        ))
                      )}
                    </SectionBox>
                  </TabsContent>

                  <TabsContent value="install" className="mt-0 space-y-4 transition-opacity duration-150">
                    <SectionBox icon={<CalendarDays className="h-4 w-4" />} title="설치 일정">
                      {detail.installations.length === 0 ? (
                        <p className="text-sm text-[#1a1a1a]/45">설치 일정이 없습니다.</p>
                      ) : (
                        detail.installations.map((event) => (
                          <div key={event.id} className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                            <p className="text-sm font-semibold text-[#1a1a1a]">{event.location ?? "설치 위치 미지정"}</p>
                            <p className="mt-1 text-xs text-[#1a1a1a]/50">
                              {formatDate(event.scheduled_start_at)} - {formatDate(event.scheduled_end_at)}
                            </p>
                          </div>
                        ))
                      )}
                    </SectionBox>
                  </TabsContent>

                  <TabsContent value="payments" className="mt-0 space-y-4 transition-opacity duration-150">
                    <div className="grid gap-3 md:grid-cols-3">
                      <InfoCard icon={<CircleDollarSign className="h-4 w-4" />} label="실수납" value={formatMoney(selectedDeal.paid_amount)} />
                      <InfoCard icon={<ReceiptText className="h-4 w-4" />} label="영수증" value={`${detail.receipts.length}건`} />
                      <InfoCard icon={<Layers3 className="h-4 w-4" />} label="미수금" value={formatMoney(selectedDeal.outstanding_amount)} />
                    </div>
                    {detail.payments.length === 0 ? (
                      <p className="text-sm text-[#1a1a1a]/45">수납 내역이 없습니다.</p>
                    ) : (
                      <div className="space-y-3">
                        {detail.payments.map((payment) => (
                          <div key={payment.id} className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                            <p className="text-sm font-semibold text-[#1a1a1a]">{formatMoney(payment.amount)}</p>
                            <p className="mt-1 text-xs text-[#1a1a1a]/50">
                              {payment.payment_method} · {formatDate(payment.paid_at)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="activity" className="mt-0 space-y-4 transition-opacity duration-150">
                    <SectionBox icon={<Activity className="h-4 w-4" />} title="활동 로그">
                      {detail.activity_logs.length === 0 ? (
                        <p className="text-sm text-[#1a1a1a]/45">활동 로그가 없습니다.</p>
                      ) : (
                        detail.activity_logs.map((log) => (
                          <div key={log.id} className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                            <p className="text-sm font-semibold text-[#1a1a1a]">{log.summary}</p>
                            <p className="mt-1 text-xs text-[#1a1a1a]/50">
                              {log.action_type} · {formatDate(log.created_at)}
                            </p>
                          </div>
                        ))
                      )}
                    </SectionBox>

                    <SectionBox icon={<MapPinned className="h-4 w-4" />} title="캘린더">
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#e0e0dc] bg-white px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-[#1a1a1a]">전체 캘린더에서 일정 흐름 보기</p>
                          <p className="mt-1 text-xs text-[#1a1a1a]/45">
                            설치, 미팅, 문서 기한을 하나의 일정 화면에서 확인합니다.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => router.push("/partner/calendar")}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-3 py-2 text-sm font-medium text-[#1a1a1a] hover:bg-white"
                        >
                          전체 보기
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                      {detail.calendar_events.length === 0 ? (
                        <p className="text-sm text-[#1a1a1a]/45">캘린더 이벤트가 없습니다.</p>
                      ) : (
                        detail.calendar_events.map((event) => (
                          <div key={event.id} className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                            <p className="text-sm font-semibold text-[#1a1a1a]">{event.title}</p>
                            <p className="mt-1 text-xs text-[#1a1a1a]/50">
                              {formatDate(event.starts_at)} - {formatDate(event.ends_at)}
                            </p>
                          </div>
                        ))
                      )}
                    </SectionBox>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>

          {/* ── Right: Context Panel ── */}
          <Card className="border-[#e8e8e4] bg-white shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-[10px] uppercase tracking-wider text-[#1a1a1a]/40 font-semibold">거래 컨텍스트</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* 현재 선택 */}
              <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1a1a1a]/40">현재 선택</p>
                <p className="mt-2 text-sm font-semibold text-[#1a1a1a]">{selectedCustomer.customer.name}</p>
                {selectedCustomer.customer.region_label && (
                  <p className="mt-0.5 text-xs text-[#1a1a1a]/45">
                    {selectedCustomer.customer.region_label}
                    {selectedCustomer.customer.campus_name ? ` · ${selectedCustomer.customer.campus_name}` : ""}
                    {selectedCustomer.customer.contact_name ? ` · ${selectedCustomer.customer.contact_name}` : ""}
                  </p>
                )}
                {selectedDeal && (
                  <div className="mt-2 rounded-lg border border-[#e0e0dc] bg-white px-3 py-2">
                    <p className="text-xs font-medium text-[#1a1a1a]">{selectedDeal.title}</p>
                    <p className="mt-0.5 text-[10px] text-[#1a1a1a]/40">{selectedDeal.deal_code}</p>
                  </div>
                )}
              </div>

              {/* 단계 로드맵 */}
              {selectedDeal && (
                <div className="rounded-xl border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1a1a1a]/40 mb-3">단계 로드맵</p>
                  <StageRoadmapBar stage={selectedDeal.current_stage} />
                </div>
              )}

              {/* 제품 구성 요약 */}
              {detail.line_items.length > 0 && (() => {
                const CAT_KO: Record<string, string> = { board: "전자칠판", camera: "카메라", mount: "거치대/스탠드", install_fee: "설치비" }
                const byCategory = detail.line_items.reduce<Record<string, { qty: number; amount: number }>>((acc, item) => {
                  const cat = CAT_KO[item.category] ?? item.category ?? "기타"
                  if (!acc[cat]) acc[cat] = { qty: 0, amount: 0 }
                  acc[cat].qty += item.quantity
                  acc[cat].amount += item.amount
                  return acc
                }, {})
                return (
                  <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1a1a1a]/40 mb-3">제품 구성</p>
                    <div className="space-y-2">
                      {Object.entries(byCategory).map(([cat, stat]) => (
                        <div key={cat} className="flex items-center justify-between text-xs">
                          <span className="text-[#1a1a1a]/60">{cat}</span>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-semibold text-[#1a1a1a]">{stat.qty}대</span>
                            <span className="text-[#1a1a1a]/40">{fmtM(stat.amount)}원</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-[#f0f0ec] flex justify-between text-[10px] text-[#1a1a1a]/40">
                      <span>총 {detail.line_items.reduce((s, i) => s + i.quantity, 0)}대</span>
                      <span>{fmtM(detail.line_items.reduce((s, i) => s + i.amount, 0))}원</span>
                    </div>
                  </div>
                )
              })()}

              {/* 다음 액션 추천 */}
              {selectedDeal && (
                <div className="rounded-xl border border-[#e8e8e4] bg-white p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1a1a1a]/40 mb-3">다음 액션</p>
                  <div className="space-y-2">
                    {selectedDeal.current_stage === "contact" && (
                      <>
                        <ActionLine text="견적서 초안 작성" />
                        <ActionLine text="고객 연락처 확인" />
                      </>
                    )}
                    {selectedDeal.current_stage === "quote" && (
                      <>
                        <ActionLine text="견적서 버전 발송 확인" />
                        <ActionLine text="계약 협의 일정 잡기" />
                      </>
                    )}
                    {selectedDeal.current_stage === "contract" && (
                      <>
                        <ActionLine text="계약서 서명 완료 확인" />
                        <ActionLine text="설치 수량 최종 확정" />
                      </>
                    )}
                    {selectedDeal.current_stage === "confirmed" && (
                      <>
                        <ActionLine text="설치 일정 협의 및 등록" />
                        <ActionLine text="장비 준비 체크" />
                      </>
                    )}
                    {selectedDeal.current_stage === "installation" && (
                      <>
                        <ActionLine text="설치 진행 현황 확인" />
                        <ActionLine text="수납 청구서 발행 준비" />
                      </>
                    )}
                    {selectedDeal.current_stage === "payment" && (
                      <>
                        <ActionLine text="미수금 입금 확인" />
                        <ActionLine text="영수증 발행" />
                      </>
                    )}
                    {(selectedDeal.current_stage === "closed" || selectedDeal.current_stage === "cancelled") && (
                      <ActionLine text="거래 완료 상태입니다." />
                    )}
                    {(selectedDeal.outstanding_amount ?? 0) > 0 && selectedDeal.current_stage !== "contact" && (
                      <div className="flex items-center gap-2 rounded-xl bg-[#FEF3EE] px-3 py-2 text-sm text-[#B85C33]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#B85C33]" />
                        미수금 {fmtM(selectedDeal.outstanding_amount)}원 미해결
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 연결 상태 */}
              <div className="rounded-xl border border-dashed border-[#e0e0dc] p-3 text-xs text-[#1a1a1a]/45">
                {mode === "demo"
                  ? "데모 셸입니다. 로그인하면 실데이터가 연결됩니다."
                  : "실데이터 연결됨."}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <MobileActionLauncher
        screen="workspace"
        customers={overview.customers.map((item) => item.customer)}
        deals={overview.deals}
        canCreate={canCreateInPortal}
        defaultCustomerId={selectedCustomer?.customer.id}
        defaultDealId={selectedDeal?.id}
        onSaved={refreshPortal}
      />
    </div>
  )
}

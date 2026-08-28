"use client"

// CRM 홈(현황) 섹션들이 공유하는 타입·포맷터·소형 아톰.
// app/admin/crm/page.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { type ReactNode } from "react"
import {
  Activity, BarChart3, Building2, FileText, Handshake, MapPin, PhoneCall, ReceiptText,
} from "lucide-react"
import { formatCNY, formatKRWAbbrev, CRM_CURRENCY_BADGE, type CrmCurrency } from "@/lib/crm/money-format"

export type CrmOverviewStatus = "ok" | "warning" | "blocked"
export type AdminCrmCustomerLogKind = "call" | "visit" | "quote" | "order" | "payment" | "activity"
export type BranchKpiMetricKey = "LD" | "ACC" | "OPP" | "SOL" | "VST"

export interface LeadActionKpis {
  total: number
  byStatus: Record<"new" | "contacted" | "converted" | "closed", number>
  unrespondedCount: number
  unresponded24hCount: number
  unresponded48hCount: number
  todayFollowUpCount: number
  overdueFollowUpCount: number
  unconfirmedCount: number
}

// /api/admin/crm/compass-pipeline 응답 — M7 "마케팅 파이프라인(Compass)" 밴드.
export interface CompassPipelineKpis {
  down: boolean
  todayDemoCount: number
  upcomingActionCount: number
  bdOpenCount: number
  generatedAt: string
}

export interface BranchKpiMemberRow {
  member: string
  team: string | null
  kpi: Record<BranchKpiMetricKey, { goal: number; actual: number }>
}

export interface BranchKpiResponse {
  members: BranchKpiMemberRow[]
}

export interface AdminCrmCustomerLogItem {
  id: string
  kind: AdminCrmCustomerLogKind
  title: string
  summary: string | null
  status: string | null
  amount: number | null
  occurredAt: string | null
  customerId: string | null
  customerName: string | null
  partnerAccountId: string | null
  partnerAccountName: string | null
  dealId: string | null
  dealTitle: string | null
  href: string
}

export interface AdminCrmOverview {
  generatedAt: string
  overallStatus: CrmOverviewStatus
  business: {
    ok: boolean
    warning: string | null
    error: string | null
    revenue: {
      deliveryTotalAmount: number
      contractedAmount: number
      paidAmount: number
      outstandingAmount: number
      expectedPipelineAmount: number
      acceptedQuoteAmount: number
    }
    kpis: {
      partnerAccountCount: number
      customerCount: number
      activeDealCount: number
      paymentRiskCount: number
      quoteDocumentCount: number
      recentActivityCount: number
    }
    customerLogs: {
      latestActivityAt: string | null
      recent: AdminCrmCustomerLogItem[]
    }
    snapshot: {
      source: "db_snapshot" | "live_query"
      refreshedAt: string | null
      stale: boolean
      maxAgeSeconds: number
    }
    upcomingThisWeek: {
      count: number
      items: Array<{
        id: string
        kind: "install" | "visit"
        title: string
        customerName: string | null
        startsAt: string
        href: string
      }>
    }
    frequentCustomers: Array<{
      customerId: string
      customerName: string
      contactCount: number
      latestSummary: string | null
      latestAt: string | null
      href: string
    }>
  }
  schema: {
    ok: number
    blocked: number
    firstBlocked: string | null
    firstAction: string | null
  }
  xiaoshouyi: {
    configured: boolean
    authMode: "access_token" | "service_oauth" | "missing"
    missingEnvGroups: string[]
    objectCount: number
    pageSize: number
    maxPages: number
  }
  sourceLinks: {
    ok: boolean
    total: number
    confirmed: number
    candidate: number
    rejected: number
    stale: number
    error: string | null
  }
  externalSnapshots: {
    ok: boolean
    recordCount: number
    staleCount: number
    latestSyncedAt: string | null
    latestRunStatus: string | null
    latestRunObject: string | null
    error: string | null
  }
  writeQueue: {
    ok: boolean
    active: number
    draft: number
    approved: number
    sent: number
    failed: number
    succeeded: number
    cancelled: number
    error: string | null
  }
  neoCrm: {
    ok: boolean
    error: string | null
    latestSyncedAt: string | null
    kpis: {
      accountCount: number
      activeAccountCountMonth: number
      salesAmountMonth: number
      salesCountMonth: number
      opportunityAmount: number
      opportunityCountMonth: number
      collectionAmountMonth: number
      collectionCountMonth: number
      collectionAmount30d: number
      collectionCount30d: number
    }
    recentOrders: Array<{
      key: string
      objectApiKey: string
      customerName: string
      ownerName: string | null
      status: string | null
      amount: number | null
      occurredAt: string | null
    }>
  }
}

export function formatOverviewDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("ko-KR")
}

// 일정 칩(월/일) — 우측 aside "설치·방문 일정" 표기용.
export function monthDayParts(value: string | null | undefined): { month: string; day: string } {
  if (!value) return { month: "", day: "-" }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { month: "", day: "-" }
  return { month: `${date.getMonth() + 1}월`, day: String(date.getDate()) }
}

// 오더(Opportunity)는 달러($)로 기재된다 — 매출·수금(CNY)과 통화가 다름.
export function formatUSD(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

// 고객 로그 금액은 종류별 통화가 다르다 — 오더=USD($), 수납=CNY(¥), 그 외(견적 등)=자체 집계 ₩.
export function formatLogAmount(kind: AdminCrmCustomerLogKind, value: number | null | undefined) {
  if (kind === "order") return formatUSD(value)
  if (kind === "payment") return formatCNY(value)
  return formatKRWAbbrev(value)
}

export function formatPercent(value: number | null | undefined) {
  if (value == null) return "-"
  return `${Math.round(value * 100)}%`
}

export function formatKpiActual(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 })
}

export function getCustomerLogKindLabel(kind: AdminCrmCustomerLogKind) {
  if (kind === "call") return "Call"
  if (kind === "visit") return "Visit"
  if (kind === "quote") return "Quote"
  if (kind === "order") return "Order"
  if (kind === "payment") return "Payment"
  return "Log"
}

export function getCustomerLogTone(kind: AdminCrmCustomerLogKind) {
  if (kind === "payment") return "border-[#D6E8DE] bg-[#ECFDF5] text-[#084734]"
  if (kind === "order") return "border-[#D6E8DE] bg-[#ECFDF5] text-[#084734]"
  if (kind === "quote") return "border-[#F3E6B8] bg-[#FFF9EB] text-[#8D6C1F]"
  if (kind === "visit") return "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55"
  if (kind === "call") return "border-[#e8e8e4] bg-[#fafaf8] text-[#111110]"
  return "border-[#e8e8e4] bg-white text-[#1a1a1a]/50"
}

export function CustomerLogIcon({ kind }: { kind: AdminCrmCustomerLogKind }) {
  if (kind === "call") return <PhoneCall className="h-3.5 w-3.5" />
  if (kind === "visit") return <MapPin className="h-3.5 w-3.5" />
  if (kind === "quote") return <FileText className="h-3.5 w-3.5" />
  if (kind === "order") return <Handshake className="h-3.5 w-3.5" />
  if (kind === "payment") return <ReceiptText className="h-3.5 w-3.5" />
  return <Activity className="h-3.5 w-3.5" />
}

// 콜드 로드 '...' 금지 — 값 자리 크기의 저대비 펄스 스켈레톤(레이아웃 일치, CRM-5).
export function ValueSkeleton({ className = "h-6 w-20" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-block animate-pulse rounded-md bg-[#f0f0ec] align-middle ${className}`} />
  )
}

// 통화 칩 — 서로 다른 통화(₩/$/¥)를 인접 배치할 때 기호·출처를 분리해 합산 오독을 막는다.
export function CurrencyChip({ currency, tone = "light" }: { currency: CrmCurrency; tone?: "light" | "dark" }) {
  const meta = CRM_CURRENCY_BADGE[currency]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${
        tone === "dark" ? "bg-white/15 text-white/80" : "bg-[#fafaf8] text-[#1a1a1a]/45"
      }`}
    >
      <span>{meta.symbol}</span>
      <span className="font-semibold">{meta.label}</span>
    </span>
  )
}

export function aggregateBranchKpi(data: BranchKpiResponse | null, metric: BranchKpiMetricKey) {
  const rows = data?.members ?? []
  return rows.reduce(
    (total, row) => {
      const value = row.kpi?.[metric]
      total.actual += Number(value?.actual ?? 0)
      total.goal += Number(value?.goal ?? 0)
      return total
    },
    { actual: 0, goal: 0 }
  )
}

export const BRANCH_KPI_DEFS: Array<{
  key: BranchKpiMetricKey
  label: string
  hintLabel: string
  icon: ReactNode
}> = [
  { key: "LD", label: "리드", hintLabel: "잠재고객", icon: <PhoneCall className="h-4 w-4" /> },
  { key: "ACC", label: "고객", hintLabel: "고객", icon: <Building2 className="h-4 w-4" /> },
  { key: "OPP", label: "확정 임박", hintLabel: "상기", icon: <BarChart3 className="h-4 w-4" /> },
  { key: "SOL", label: "솔루션", hintLabel: "솔루션", icon: <Activity className="h-4 w-4" /> },
  { key: "VST", label: "방문", hintLabel: "방문", icon: <MapPin className="h-4 w-4" /> },
]

export function sumBranchKpi(rows: BranchKpiMemberRow[], metric: BranchKpiMetricKey) {
  return rows.reduce(
    (total, row) => {
      const value = row.kpi?.[metric]
      total.actual += Number(value?.actual ?? 0)
      total.goal += Number(value?.goal ?? 0)
      return total
    },
    { actual: 0, goal: 0 }
  )
}

"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import Link from "next/link"
import {
  RefreshCw, Building2, Calendar, PhoneCall,
  ExternalLink, AlertCircle, Activity, BarChart3,
  CircleDollarSign, FileText, Handshake,
  MapPin, ReceiptText, Target, TrendingUp,
} from "lucide-react"
import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import { Button } from "@/components/ui/button"
import NeoCrmTeamPanel from "@/components/admin/crm/NeoCrmTeamPanel"
import CrmCoverageStrip from "@/components/admin/crm/CrmCoverageStrip"
import CrmPriorityQueuePanel from "@/components/admin/crm/CrmPriorityQueuePanel"
import CrmWeekAheadPanel from "@/components/admin/crm/CrmWeekAheadPanel"
import { Toast } from "@/components/admin/crm/leads/shared"

// 현황 = 한국팀 아침 지휘대. 액션 밴드(딥링크) + Neo CRM 팀 패널 + 돈 흐름 요약만.
// 리드 관리 보드 전체는 /admin/crm/customers/leads (LeadsBoardClient)로 이동했다.

const CRM_ACTION_KPIS_URL = "/api/admin/crm/action-kpis"
const CRM_OVERVIEW_URL = "/api/admin/crm/overview"
const CRM_BRANCH_KPI_MONTH = getKstMonthKey(new Date())
const CRM_BRANCH_KPI_URL = `/api/admin/branch/kpi?team=ALL&period=M&month=${CRM_BRANCH_KPI_MONTH}`
const CRM_HOME_TTL_MS = 120_000
const CRM_HOME_STALE_WHILE_REVALIDATE_MS = 10 * 60_000

type CrmOverviewStatus = "ok" | "warning" | "blocked"
type AdminCrmCustomerLogKind = "call" | "visit" | "quote" | "order" | "payment" | "activity"
type BranchKpiMetricKey = "LD" | "ACC" | "OPP" | "SOL" | "VST"

interface LeadActionKpis {
  total: number
  byStatus: Record<"new" | "contacted" | "converted" | "closed", number>
  unrespondedCount: number
  unresponded24hCount: number
  unresponded48hCount: number
  todayFollowUpCount: number
  overdueFollowUpCount: number
}

interface BranchKpiMemberRow {
  member: string
  team: string | null
  kpi: Record<BranchKpiMetricKey, { goal: number; actual: number }>
}

interface BranchKpiResponse {
  members: BranchKpiMemberRow[]
}

interface AdminCrmCustomerLogItem {
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

interface AdminCrmOverview {
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

function getKstMonthKey(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`
}

function formatOverviewDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("ko-KR")
}

function formatCurrency(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  if (Math.abs(amount) >= 100_000_000) {
    return `${(amount / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`
  }
  if (Math.abs(amount) >= 10_000) {
    return `${Math.round(amount / 10_000).toLocaleString("ko-KR")}만`
  }
  return amount.toLocaleString("ko-KR")
}

// 오더(Opportunity)는 달러($)로 기재된다 — 매출·수금(CNY)과 통화가 다름.
function formatUSD(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "-"
  return `${Math.round(value * 100)}%`
}

function formatKpiActual(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 })
}

function getCustomerLogKindLabel(kind: AdminCrmCustomerLogKind) {
  if (kind === "call") return "Call"
  if (kind === "visit") return "Visit"
  if (kind === "quote") return "Quote"
  if (kind === "order") return "Order"
  if (kind === "payment") return "Payment"
  return "Log"
}

function getCustomerLogTone(kind: AdminCrmCustomerLogKind) {
  if (kind === "payment") return "border-emerald-100 bg-emerald-50 text-emerald-700"
  if (kind === "order") return "border-[#D6E8DE] bg-[#ECFDF5] text-[#084734]"
  if (kind === "quote") return "border-[#F3E6B8] bg-[#FFF9EB] text-[#8D6C1F]"
  if (kind === "visit") return "border-sky-100 bg-sky-50 text-sky-700"
  if (kind === "call") return "border-[#e8e8e4] bg-[#fafaf8] text-[#111110]"
  return "border-[#e8e8e4] bg-white text-[#1a1a1a]/50"
}

function CustomerLogIcon({ kind }: { kind: AdminCrmCustomerLogKind }) {
  if (kind === "call") return <PhoneCall className="h-3.5 w-3.5" />
  if (kind === "visit") return <MapPin className="h-3.5 w-3.5" />
  if (kind === "quote") return <FileText className="h-3.5 w-3.5" />
  if (kind === "order") return <Handshake className="h-3.5 w-3.5" />
  if (kind === "payment") return <ReceiptText className="h-3.5 w-3.5" />
  return <Activity className="h-3.5 w-3.5" />
}

function CrmMetricTile({
  icon,
  label,
  value,
  hint,
  tone = "text-[#111110]",
}: {
  icon: ReactNode
  label: string
  value: string
  hint: string
  tone?: string
}) {
  return (
    <div className="border-t border-[#f0f0ec] pt-4">
      <div className="flex items-center gap-2 text-[#1a1a1a]/35">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-bold tracking-[-0.035em] ${tone}`}>{value}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/42">{hint}</p>
    </div>
  )
}

function CrmMeasurementTile({
  icon,
  label,
  value,
  hint,
  tone = "text-[#111110]",
}: {
  icon: ReactNode
  label: string
  value: string
  hint: string
  tone?: string
}) {
  return (
    <div className="rounded-xl bg-[#fafaf8] px-3 py-3">
      <div className="flex items-center gap-1.5 text-[#1a1a1a]/40">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em]">{label}</p>
      </div>
      <p className={`mt-2 text-[22px] font-bold leading-none tracking-[-0.03em] ${tone}`}>{value}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-[#1a1a1a]/42">{hint}</p>
    </div>
  )
}

function aggregateBranchKpi(data: BranchKpiResponse | null, metric: BranchKpiMetricKey) {
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

const BRANCH_KPI_DEFS: Array<{
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

function CrmNeoKpis({
  overview,
  branchKpis,
  loading,
  branchError,
  compact = false,
}: {
  overview: AdminCrmOverview | null
  branchKpis: BranchKpiResponse | null
  loading: boolean
  branchError: string | null
  compact?: boolean
}) {
  const loadingValue = loading && !overview ? "..." : null
  const neoCrm = overview?.neoCrm ?? null
  const neoKpis = neoCrm?.kpis

  const content = (
    <>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Sync KPI</p>
          <h2 className="mt-1 text-[17px] font-bold text-[#111110]">지사관리식 KPI</h2>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
            {CRM_BRANCH_KPI_MONTH} · 외부 CRM 동기화 완료량 기준 · 기준/완료/달성률
          </p>
        </div>
        <span className="inline-flex h-8 items-center rounded-full bg-[#ECFDF5] px-3 text-[12px] font-semibold text-[#084734]">
          Sync {formatOverviewDate(neoCrm?.latestSyncedAt)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CrmMeasurementTile
          icon={<CircleDollarSign className="h-4 w-4" />}
          label="동기화 매출"
          value={loadingValue ?? formatCurrency(neoKpis?.salesAmountMonth)}
          hint={`완료 ${formatNumber(neoKpis?.salesCountMonth)}건 · 본사 CRM 원천`}
          tone="text-[#084734]"
        />
        <CrmMeasurementTile
          icon={<BarChart3 className="h-4 w-4" />}
          label="확정 임박"
          value={loadingValue ?? formatUSD(neoKpis?.opportunityAmount)}
          hint={`상기 완료량 ${formatNumber(neoKpis?.opportunityCountMonth)}건 · USD 원천`}
          tone="text-[#084734]"
        />
        <CrmMeasurementTile
          icon={<Building2 className="h-4 w-4" />}
          label="동기화 고객"
          value={loadingValue ?? formatNumber(neoKpis?.activeAccountCountMonth)}
          hint={`고객 완료량 · 전체 ${formatNumber(neoKpis?.accountCount)}개`}
          tone="text-[#111110]"
        />
        <CrmMeasurementTile
          icon={<ReceiptText className="h-4 w-4" />}
          label="동기화 수금"
          value={loadingValue ?? formatCurrency(neoKpis?.collectionAmountMonth)}
          hint={`수금 완료량 ${formatNumber(neoKpis?.collectionCountMonth)}건 · 30일 ${formatCurrency(
            neoKpis?.collectionAmount30d
          )}`}
          tone="text-[#111110]"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {BRANCH_KPI_DEFS.map((item) => {
          const totals = aggregateBranchKpi(branchKpis, item.key)
          const rate = totals.goal > 0 ? totals.actual / totals.goal : null
          return (
            <CrmMeasurementTile
              key={item.key}
              icon={item.icon}
              label={item.label}
              value={branchError ? "-" : loading && !branchKpis ? "..." : formatKpiActual(totals.actual)}
              hint={
                branchError ??
                `${item.hintLabel} 완료량 · KPI 기준 ${formatKpiActual(totals.goal)} · 달성률 ${formatPercent(rate)}`
              }
              tone={rate == null || rate >= 0.7 ? "text-[#084734]" : "text-[#B85C33]"}
            />
          )
        })}
      </div>
    </>
  )

  if (compact) {
    return <div className="mt-4 border-t border-[#f0f0ec] pt-4">{content}</div>
  }

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      {content}
    </section>
  )
}

function CrmOperationsDashboard({
  overview,
  loading,
  error,
}: {
  overview: AdminCrmOverview | null
  loading: boolean
  error: string | null
}) {
  const revenue = overview?.business.revenue
  const kpis = overview?.business.kpis
  const neoCrm = overview?.neoCrm ?? null
  const neoKpis = neoCrm?.kpis
  const logs = overview?.business.customerLogs.recent ?? []
  const businessWarning = error ?? overview?.business.error ?? overview?.business.warning ?? null
  const neoSyncWarning = neoCrm?.error ?? overview?.externalSnapshots.error ?? null
  const loadingValue = loading && !overview ? "..." : null

  return (
    <>
      <div className="mb-4">
        <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Customer Revenue Scope</p>
              <h2 className="mt-1 text-[18px] font-bold text-[#111110]">고객 돈흐름 우선순위</h2>
            </div>
            <span className="inline-flex h-9 items-center rounded-lg bg-[#fafaf8] px-3 text-[12px] font-semibold text-[#1a1a1a]/50">
              Sync {formatOverviewDate(neoCrm?.latestSyncedAt ?? overview?.externalSnapshots.latestSyncedAt)}
            </span>
            <Link
              href="/admin/crm/deals"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            >
              매출 상세
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_1fr]">
            <div className="border-t border-[#084734]/18 pt-4">
              <div className="flex items-center gap-2 text-[#084734]/70">
                <CircleDollarSign className="h-5 w-5" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">인식 매출</p>
              </div>
              <p className="mt-2 text-4xl font-bold tracking-[-0.045em] text-[#084734] sm:text-[42px]">
                {loadingValue ?? formatCurrency(revenue?.deliveryTotalAmount)}
              </p>
              {/* 오더는 거의 확정 매출 — Delivery와 같은 급의 서브 히어로 (USD 네이티브) */}
              <div className="mt-4 border-t border-[#084734]/10 pt-3">
                <div className="flex items-center gap-2 text-[#084734]/70">
                  <BarChart3 className="h-4 w-4" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">오더 · 확정 임박 (USD)</p>
                </div>
                <p className="mt-1.5 flex flex-wrap items-end gap-x-2 gap-y-1">
                  <span className="text-3xl font-bold tracking-[-0.04em] text-[#111110]">
                    {loadingValue ?? formatUSD(neoKpis?.opportunityAmount)}
                  </span>
                  <span className="text-[12px] text-[#1a1a1a]/45">
                    이번 달 {loadingValue ?? formatNumber(neoKpis?.opportunityCountMonth)}건
                  </span>
                </p>
              </div>
              <div className="mt-3 grid gap-2 text-[12px] text-[#1a1a1a]/45 sm:grid-cols-2">
                <span>견적 {loadingValue ?? formatCurrency(revenue?.acceptedQuoteAmount)}</span>
                <span>동기화 매출 {loadingValue ?? formatCurrency(neoKpis?.salesAmountMonth)}</span>
                <span>확정 임박 {loadingValue ?? formatUSD(neoKpis?.opportunityAmount)}</span>
                <span>계약 {loadingValue ?? formatCurrency(revenue?.contractedAmount)}</span>
                <span>인식 매출 {loadingValue ?? formatCurrency(revenue?.deliveryTotalAmount)}</span>
                <span>동기화 수금 {loadingValue ?? formatCurrency(neoKpis?.collectionAmountMonth)}</span>
                <span className={(revenue?.outstandingAmount ?? 0) > 0 ? "font-semibold text-[#B85C33]" : ""}>
                  미수 {loadingValue ?? formatCurrency(revenue?.outstandingAmount)}
                </span>
                <span>수납 {loadingValue ?? formatCurrency(revenue?.paidAmount)}</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <CrmMetricTile
                icon={<FileText className="h-4 w-4" />}
                label="견적"
                value={loadingValue ?? formatCurrency(revenue?.acceptedQuoteAmount)}
                hint={`견적서 ${loadingValue ?? formatNumber(kpis?.quoteDocumentCount)}건`}
              />
              <CrmMetricTile
                icon={<BarChart3 className="h-4 w-4" />}
                label="오더 (확정 임박)"
                value={loadingValue ?? formatUSD(neoKpis?.opportunityAmount)}
                hint={`외부 CRM ${loadingValue ?? formatNumber(neoKpis?.opportunityCountMonth)}건 · USD`}
                tone="text-[#084734]"
              />
              <CrmMetricTile
                icon={<TrendingUp className="h-4 w-4" />}
                label="동기화 매출"
                value={loadingValue ?? formatCurrency(neoKpis?.salesAmountMonth)}
                hint={`본사 CRM ${loadingValue ?? formatNumber(neoKpis?.salesCountMonth)}건 · actual`}
                tone="text-[#084734]"
              />
              <CrmMetricTile
                icon={<ReceiptText className="h-4 w-4" />}
                label="동기화 수금"
                value={loadingValue ?? formatCurrency(neoKpis?.collectionAmountMonth)}
                hint={`외부 CRM ${loadingValue ?? formatNumber(neoKpis?.collectionCountMonth)}건 · current month`}
              />
              <CrmMetricTile
                icon={<Building2 className="h-4 w-4" />}
                label="동기화 고객"
                value={loadingValue ?? formatNumber(neoKpis?.accountCount)}
                hint={`이번 달 활성 ${loadingValue ?? formatNumber(neoKpis?.activeAccountCountMonth)} · 외부 CRM 원천`}
              />
              <CrmMetricTile
                icon={<Handshake className="h-4 w-4" />}
                label="계약"
                value={loadingValue ?? formatCurrency(revenue?.contractedAmount)}
                hint={`활성 거래 ${loadingValue ?? formatNumber(kpis?.activeDealCount)}건`}
              />
              <CrmMetricTile
                icon={<Building2 className="h-4 w-4" />}
                label="고객"
                value={loadingValue ?? formatNumber(kpis?.customerCount)}
                hint={`파트너 고객 ${formatNumber(kpis?.partnerAccountCount)}개`}
              />
            </div>
          </div>

          {businessWarning ? (
            <p className="mt-4 rounded-xl bg-[#FEF3EE] px-3 py-2 text-[12px] leading-relaxed text-[#B85C33]">
              {businessWarning}
            </p>
          ) : null}
          {neoSyncWarning ? (
            <p className="mt-3 rounded-xl bg-[#FEF3EE] px-3 py-2 text-[12px] leading-relaxed text-[#B85C33]">
              외부 CRM sync check: {neoSyncWarning}
            </p>
          ) : null}
        </section>
      </div>

      <div className="mb-4 grid gap-3 xl:grid-cols-[0.75fr_1.25fr]">
        {/* 미응답/오버듀 카운트는 상단 액션 밴드로 통합 — 여기엔 수납 리스크 신호만 보존 */}
        <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Payment Risk</p>
              <h2 className="mt-1 text-[17px] font-bold text-[#111110]">수납 리스크</h2>
            </div>
            <Link
              href="/admin/crm/deals"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            >
              Deals에서 처리
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <CrmMetricTile
              icon={<ReceiptText className="h-4 w-4" />}
              label="Payment Risk"
              value={loadingValue ?? formatNumber(kpis?.paymentRiskCount)}
              hint="미수 또는 부분 수납 거래"
              tone={(kpis?.paymentRiskCount ?? 0) > 0 ? "text-[#B85C33]" : "text-[#111110]"}
            />
            <CrmMetricTile
              icon={<CircleDollarSign className="h-4 w-4" />}
              label="Outstanding"
              value={loadingValue ?? formatCurrency(revenue?.outstandingAmount)}
              hint="미수 금액 합계"
              tone={(revenue?.outstandingAmount ?? 0) > 0 ? "text-[#B85C33]" : "text-[#111110]"}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Customer Timeline</p>
              <h2 className="mt-1 text-[17px] font-bold text-[#111110]">최근 고객별 로그</h2>
            </div>
            <Link
              href="/admin/crm/customers/accounts"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            >
              고객사 보기
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          {logs.length === 0 ? (
            <p className="rounded-xl bg-[#fafaf8] px-3 py-8 text-center text-[13px] text-[#1a1a1a]/30">
              {loading && !overview ? "불러오는 중..." : "최근 고객 로그가 없습니다."}
            </p>
          ) : (
            <div className="divide-y divide-[#f0f0ec]">
              {logs.slice(0, 8).map((log) => (
                <Link
                  key={log.id}
                  href={log.href}
                  className="grid gap-3 py-3 transition-colors hover:bg-[#fafaf8] sm:grid-cols-[112px_minmax(0,1fr)_140px]"
                >
                  <div className="flex items-start gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getCustomerLogTone(log.kind)}`}>
                      <CustomerLogIcon kind={log.kind} />
                      {getCustomerLogKindLabel(log.kind)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#111110]">{log.customerName ?? log.partnerAccountName ?? "고객 미지정"}</p>
                    <p className="mt-0.5 truncate text-[12px] text-[#1a1a1a]/45">{log.title}</p>
                    {log.summary ? <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/30">{log.summary}</p> : null}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-[12px] font-semibold text-[#111110]">{log.amount == null ? log.status ?? "-" : formatCurrency(log.amount)}</p>
                    <p className="mt-0.5 text-[11px] text-[#1a1a1a]/35">{formatOverviewDate(log.occurredAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

// ─── 메인 페이지 ───────────────────────────────────────────────
export default function CrmPage() {
  const [leadKpis, setLeadKpis] = useState<LeadActionKpis | null>(null)
  const [leadKpisLoading, setLeadKpisLoading] = useState(true)
  const [, setLeadKpisError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [crmOverview, setCrmOverview] = useState<AdminCrmOverview | null>(null)
  const [crmOverviewLoading, setCrmOverviewLoading] = useState(true)
  const [crmOverviewError, setCrmOverviewError] = useState<string | null>(null)
  const [branchKpis, setBranchKpis] = useState<BranchKpiResponse | null>(null)
  const [branchKpisLoading, setBranchKpisLoading] = useState(true)
  const [branchKpisError, setBranchKpisError] = useState<string | null>(null)
  const [neoCrmRefreshKey, setNeoCrmRefreshKey] = useState(0)

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const fetchLeadKpis = useCallback(async (options?: { force?: boolean }) => {
    const requestUrl = options?.force ? `${CRM_ACTION_KPIS_URL}?force=1` : CRM_ACTION_KPIS_URL
    const hasCached = Boolean(
      getCachedAdminJson<{ leads: LeadActionKpis }>(CRM_ACTION_KPIS_URL, {
        cacheKey: CRM_ACTION_KPIS_URL,
      })
    )
    setLeadKpisLoading(options?.force || !hasCached)
    setLeadKpisError(null)
    try {
      const data = await adminFetchJsonCached<{ leads: LeadActionKpis }>(requestUrl, undefined, {
        cacheKey: CRM_ACTION_KPIS_URL,
        ttlMs: CRM_HOME_TTL_MS,
        force: options?.force,
        staleWhileRevalidateMs: CRM_HOME_STALE_WHILE_REVALIDATE_MS,
      })
      setLeadKpis(data.leads)
    } catch (err) {
      const message = err instanceof Error ? err.message : "CRM 리드 KPI를 불러오지 못했습니다."
      setLeadKpisError(message)
      showToast(message, "error")
    } finally {
      setLeadKpisLoading(false)
    }
  }, [showToast])

  const fetchCrmOverview = useCallback(async (options?: { force?: boolean }) => {
    const requestUrl = options?.force ? `${CRM_OVERVIEW_URL}?force=1` : CRM_OVERVIEW_URL
    const hasCached = Boolean(
      getCachedAdminJson<AdminCrmOverview>(CRM_OVERVIEW_URL, {
        cacheKey: CRM_OVERVIEW_URL,
      })
    )
    setCrmOverviewLoading(options?.force || !hasCached)
    setCrmOverviewError(null)
    try {
      const data = await adminFetchJsonCached<AdminCrmOverview>(requestUrl, undefined, {
        cacheKey: CRM_OVERVIEW_URL,
        ttlMs: CRM_HOME_TTL_MS,
        force: options?.force,
        staleWhileRevalidateMs: CRM_HOME_STALE_WHILE_REVALIDATE_MS,
      })
      setCrmOverview(data)
    } catch (err) {
      setCrmOverviewError(err instanceof Error ? err.message : "CRM 통합 상태를 불러오지 못했습니다.")
    } finally {
      setCrmOverviewLoading(false)
    }
  }, [])

  const fetchBranchKpis = useCallback(async (options?: { force?: boolean }) => {
    const hasCached = Boolean(
      getCachedAdminJson<BranchKpiResponse>(CRM_BRANCH_KPI_URL, {
        cacheKey: CRM_BRANCH_KPI_URL,
      })
    )
    setBranchKpisLoading(options?.force || !hasCached)
    setBranchKpisError(null)
    try {
      const data = await adminFetchJsonCached<BranchKpiResponse>(CRM_BRANCH_KPI_URL, undefined, {
        cacheKey: CRM_BRANCH_KPI_URL,
        ttlMs: CRM_HOME_TTL_MS,
        force: options?.force,
        staleWhileRevalidateMs: CRM_HOME_STALE_WHILE_REVALIDATE_MS,
      })
      setBranchKpis(data)
    } catch (err) {
      setBranchKpisError(err instanceof Error ? err.message : "지사관리 KPI를 불러오지 못했습니다.")
    } finally {
      setBranchKpisLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchLeadKpis()
    void fetchCrmOverview()
    void fetchBranchKpis()
  }, [fetchLeadKpis, fetchCrmOverview, fetchBranchKpis])

  const pageRefreshing = leadKpisLoading || crmOverviewLoading || branchKpisLoading

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin · CRM</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">CRM 홈</h1>
          <p className="mt-1 text-[13px] text-[#1a1a1a]/42">
            ClassIn 고객 DB 기준 · 시트와 외부 CRM은 동기화 참고자료
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4 xl:flex xl:justify-end">
          <Link
            href="/admin/crm/customers/leads"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            리드
          </Link>
          <Link
            href="/admin/crm/deals"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            <CircleDollarSign className="h-3.5 w-3.5" />
            견적·매출
          </Link>
          <Link
            href="/admin/crm/customers/unified"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            <Building2 className="h-3.5 w-3.5" />
            고객·후속
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void fetchLeadKpis({ force: true })
              void fetchCrmOverview({ force: true })
              void fetchBranchKpis({ force: true })
              setNeoCrmRefreshKey((current) => current + 1)
            }}
            disabled={pageRefreshing}
            className="w-full gap-1.5 sm:w-auto"
          >
            <RefreshCw className={`w-4 h-4 ${pageRefreshing ? "animate-spin" : ""}`} />새로고침
          </Button>
        </div>
      </div>

      <CrmCoverageStrip />
      <CrmPriorityQueuePanel refreshKey={neoCrmRefreshKey} />
      <CrmWeekAheadPanel />

      <NeoCrmTeamPanel
        refreshKey={neoCrmRefreshKey}
        topKpiSlot={
          <CrmNeoKpis
            overview={crmOverview}
            branchKpis={branchKpis}
            loading={pageRefreshing}
            branchError={branchKpisError}
            compact
          />
        }
      />

      {/* 지금 처리 — 오늘 우선순위 액션 밴드 (리드 보드 딥링크) */}
      <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Action Queue</p>
            <h2 className="mt-1 text-[18px] font-bold text-[#111110]">지금 처리</h2>
          </div>
          <span className="rounded-full bg-[#f0f0ec] px-3 py-1 text-[12px] font-medium text-[#1a1a1a]/55">
            오늘 우선순위
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link
            href="/admin/crm/customers/leads?filter=unresponded"
            className="group rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3 text-left transition-colors hover:border-[#c8c8c4] hover:bg-white"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#1a1a1a]/45 group-hover:text-[#111110]">
                <PhoneCall className="h-4 w-4" />
              </span>
              <span className="text-[12px] font-medium text-[#1a1a1a]/55">미응답 리드</span>
            </div>
            <p className={`mt-2 text-[26px] font-bold leading-none ${(leadKpis?.unrespondedCount ?? 0) > 0 ? "text-[#B85C33]" : "text-[#111110]"}`}>
              {leadKpisLoading && !leadKpis ? "..." : formatNumber(leadKpis?.unrespondedCount)}
            </p>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">
              48h 이상 {leadKpisLoading && !leadKpis ? "..." : formatNumber(leadKpis?.unresponded48hCount)}건
            </p>
          </Link>

          <Link
            href="/admin/crm/customers/leads?focus=risk"
            className="group rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3 text-left transition-colors hover:border-[#c8c8c4] hover:bg-white"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#1a1a1a]/45 group-hover:text-[#111110]">
                <AlertCircle className="h-4 w-4" />
              </span>
              <span className="text-[12px] font-medium text-[#1a1a1a]/55">오버듀 팔로업</span>
            </div>
            <p className={`mt-2 text-[26px] font-bold leading-none ${(leadKpis?.overdueFollowUpCount ?? 0) > 0 ? "text-[#B85C33]" : "text-[#111110]"}`}>
              {leadKpisLoading && !leadKpis ? "..." : formatNumber(leadKpis?.overdueFollowUpCount)}
            </p>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">
              오늘 예정 {leadKpisLoading && !leadKpis ? "..." : formatNumber(leadKpis?.todayFollowUpCount)}건
            </p>
          </Link>

          <Link
            href="/admin/calendar"
            className="group rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3 text-left transition-colors hover:border-[#c8c8c4] hover:bg-white"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#1a1a1a]/45 group-hover:text-[#111110]">
                <Calendar className="h-4 w-4" />
              </span>
              <span className="text-[12px] font-medium text-[#1a1a1a]/55">이번 주 설치·방문</span>
            </div>
            <p className="mt-2 text-[26px] font-bold leading-none text-[#084734]">
              {crmOverview?.business.upcomingThisWeek.count ?? 0}
            </p>
            <p className="mt-1.5 truncate text-[11px] text-[#1a1a1a]/40">
              {crmOverview?.business.upcomingThisWeek.items[0]?.customerName
                ? `다음 · ${crmOverview.business.upcomingThisWeek.items[0]?.customerName}`
                : "예정 일정"}
            </p>
          </Link>

          <Link
            href="/admin/crm/customers/leads?filter=converted"
            className="group rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3 text-left transition-colors hover:border-[#c8c8c4] hover:bg-white"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#1a1a1a]/45 group-hover:text-[#111110]">
                <Target className="h-4 w-4" />
              </span>
              <span className="text-[12px] font-medium text-[#1a1a1a]/55">전환 고객</span>
            </div>
            <p className="mt-2 text-[26px] font-bold leading-none text-[#084734]">
              {leadKpisLoading && !leadKpis ? "..." : formatNumber(leadKpis?.byStatus.converted)}
            </p>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">누적 어카운트 전환</p>
          </Link>
        </div>

        {(crmOverview?.business.frequentCustomers.length ?? 0) > 0 ? (
          <div className="mt-3 flex flex-col gap-2 rounded-xl bg-[#fafaf8] px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="shrink-0 text-[11px] font-semibold text-[#1a1a1a]/40">자주 접촉 고객 · 14일</span>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {crmOverview?.business.frequentCustomers.map((customer) => (
                <Link
                  key={customer.customerId}
                  href={customer.href}
                  title={customer.latestSummary ?? undefined}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[12px] text-[#111110] transition-colors hover:border-[#c8c8c4]"
                >
                  <span className="max-w-[140px] truncate font-medium">{customer.customerName}</span>
                  <span className="rounded-full bg-[#f0f0ec] px-1.5 text-[11px] font-semibold tabular-nums text-[#1a1a1a]/55">
                    {customer.contactCount}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <CrmOperationsDashboard
        overview={crmOverview}
        loading={crmOverviewLoading}
        error={crmOverviewError}
      />

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

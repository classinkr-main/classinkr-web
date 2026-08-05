"use client"

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import {
  RefreshCw, Building2, Calendar, PhoneCall,
  ExternalLink, AlertCircle, Activity, BarChart3,
  CircleDollarSign, FileText, Handshake, ChevronDown,
  MapPin, NotebookPen, ReceiptText, Search, Target, TrendingUp, UserPlus,
} from "lucide-react"
import { adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import { Button } from "@/components/ui/button"
import { StatTile } from "@/components/admin/viz"
import CrmCoverageStrip from "@/components/admin/crm/CrmCoverageStrip"
import CrmPriorityQueuePanel from "@/components/admin/crm/CrmPriorityQueuePanel"
import CrmWeekAheadPanel from "@/components/admin/crm/CrmWeekAheadPanel"
import CrmCustomerPicker from "@/components/admin/crm/CrmCustomerPicker"
import Customer360DrawerSkeleton from "@/components/admin/crm/Customer360DrawerSkeleton"
import CrmActionRail from "@/components/admin/crm/rail/CrmActionRail"
import { getRecentCustomers, type RecentCustomer } from "@/lib/crm/recent-customers"
import { Toast } from "@/components/admin/crm/leads/shared"
import { formatCNY, formatKRWAbbrev, CRM_CURRENCY_BADGE, type CrmCurrency } from "@/lib/crm/money-format"

// 현황 = 한국팀 아침 지휘대. 액션 밴드(딥링크) + Neo CRM 팀 패널 + 돈 흐름 요약만.
// 리드 관리 보드 전체는 /admin/crm/customers/leads (LeadsBoardClient)로 이동했다.

// Recharts 번들을 현황 초기 로드에서 분리 — 차트는 지연 로드.
const CrmHomeCharts = dynamic(() => import("@/components/admin/crm/CrmHomeCharts"), {
  ssr: false,
  // 참조 섹션이 베이지(#fafaf8)로 가라앉아(W2-6) 스켈레톤은 한 단 진한 뉴트럴로 유지.
  loading: () => <div className="h-40 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})
const CrmPerformanceCharts = dynamic(() => import("@/components/admin/crm/CrmPerformanceCharts"), {
  ssr: false,
  loading: () => <div className="h-44 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})
// 360 드로어·리드 등록 모달 코드 스플리팅(41af51a4 패턴) — 현황 첫 로드에서 청크를 제외하고
// 고객 클릭/리드 등록 클릭 시점에만 내려받는다. 열림 상태에서만 렌더하므로 로딩 폴백이
// 닫힌 화면에 노출될 일은 없다. 폴백은 unified와 동일한 드로어 골격 스켈레톤을 공유한다.
const Customer360Drawer = dynamic(() => import("@/components/admin/crm/Customer360Drawer"), {
  loading: () => <Customer360DrawerSkeleton />,
})
const LeadRegisterModal = dynamic(() => import("@/components/admin/crm/LeadRegisterModal"), {
  loading: () => <div className="fixed inset-0 z-50 bg-black/20" aria-hidden />,
})
// 팀 성과 패널(보고성 블록, 기본 접힘) 코드 스플리팅(감사 #6) — teamReportOpen일 때만
// 렌더되는 기존 게이트는 그대로 두고, 청크도 접힘을 펼치는 시점에만 내려받는다.
// 폴백은 펼친 섹션 안에서만 잠깐 보이는 골격 스켈레톤(닫힌 첫 화면 노출 없음).
const NeoCrmTeamPanel = dynamic(() => import("@/components/admin/crm/NeoCrmTeamPanel"), {
  // 실제 패널은 다중 섹션(수백 px) — 폴백이 낮으면 교체 순간 하단 콘텐츠가 크게 밀린다(코덱스 리뷰 P2).
  loading: () => <div className="h-96 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})

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
  unconfirmedCount: number
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

// 일정 칩(월/일) — 우측 aside "설치·방문 일정" 표기용.
function monthDayParts(value: string | null | undefined): { month: string; day: string } {
  if (!value) return { month: "", day: "-" }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { month: "", day: "-" }
  return { month: `${date.getMonth() + 1}월`, day: String(date.getDate()) }
}

// 오더(Opportunity)는 달러($)로 기재된다 — 매출·수금(CNY)과 통화가 다름.
function formatUSD(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

// 고객 로그 금액은 종류별 통화가 다르다 — 오더=USD($), 수납=CNY(¥), 그 외(견적 등)=자체 집계 ₩.
function formatLogAmount(kind: AdminCrmCustomerLogKind, value: number | null | undefined) {
  if (kind === "order") return formatUSD(value)
  if (kind === "payment") return formatCNY(value)
  return formatKRWAbbrev(value)
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
  if (kind === "payment") return "border-[#D6E8DE] bg-[#ECFDF5] text-[#084734]"
  if (kind === "order") return "border-[#D6E8DE] bg-[#ECFDF5] text-[#084734]"
  if (kind === "quote") return "border-[#F3E6B8] bg-[#FFF9EB] text-[#8D6C1F]"
  if (kind === "visit") return "border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55"
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

// 콜드 로드 '...' 금지 — 값 자리 크기의 저대비 펄스 스켈레톤(레이아웃 일치, CRM-5).
function ValueSkeleton({ className = "h-6 w-20" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-block animate-pulse rounded-md bg-[#f0f0ec] align-middle ${className}`} />
  )
}

// KPI 타일 로컬 재구현 금지(W2-2b) — 마크업은 viz StatTile(bare 변형)에 위임하는 어댑터.
// tone은 값 색만 바꾸는 기존 계약을 유지한다(값·라벨·캡션 불변).
function CrmMetricTile({
  icon,
  label,
  value,
  hint,
  tone = "text-[#111110]",
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  hint: string
  tone?: string
}) {
  return (
    <StatTile
      icon={icon}
      iconLayout="inline"
      variant="bare"
      compact
      label={label}
      value={tone === "text-[#111110]" ? value : <span className={tone}>{value}</span>}
      hint={hint}
    />
  )
}

// KPI 타일 로컬 재구현 금지(W2-2b) — 마크업은 viz StatTile(soft 변형)에 위임하는 어댑터.
function CrmMeasurementTile({
  icon,
  label,
  value,
  hint,
  tone = "text-[#111110]",
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  hint: string
  tone?: string
}) {
  return (
    <StatTile
      icon={icon}
      iconLayout="inline"
      variant="soft"
      compact
      label={label}
      value={tone === "text-[#111110]" ? value : <span className={tone}>{value}</span>}
      hint={hint}
    />
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

function sumBranchKpi(rows: BranchKpiMemberRow[], metric: BranchKpiMetricKey) {
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

// 총/팀별/개인별 공용 매트릭스 — 행(팀 또는 개인)별로 5개 지표 actual·기준·달성률을 표로.
function BranchKpiMatrix({
  rows,
  emptyLabel,
}: {
  rows: Array<{ key: string; label: string; sub?: string; members: BranchKpiMemberRow[] }>
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-[#fafaf8] px-3 py-4 text-center text-[12px] text-[#1a1a1a]/35">{emptyLabel}</p>
    )
  }
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/35">
            <th className="px-2 pb-2 font-semibold">이름</th>
            {BRANCH_KPI_DEFS.map((d) => (
              <th key={d.key} className="px-2 pb-2 text-right font-semibold">
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-[#f0f0ec]">
              <td className="px-2 py-2 align-top">
                <p className="text-[13px] font-semibold text-[#111110]">{row.label}</p>
                {row.sub ? <p className="text-[11px] text-[#1a1a1a]/40">{row.sub}</p> : null}
              </td>
              {BRANCH_KPI_DEFS.map((d) => {
                const totals = sumBranchKpi(row.members, d.key)
                const rate = totals.goal > 0 ? totals.actual / totals.goal : null
                return (
                  <td key={d.key} className="px-2 py-2 text-right align-top tabular-nums">
                    <p
                      className={`text-[13px] font-bold ${
                        rate == null || rate >= 0.7 ? "text-[#111110]" : "text-[#B85C33]"
                      }`}
                    >
                      {formatKpiActual(totals.actual)}
                    </p>
                    <p className="text-[10px] text-[#1a1a1a]/35">
                      /{formatKpiActual(totals.goal)} · {formatPercent(rate)}
                    </p>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 하단 성과 KPI 보드 — 총·팀별·개인별을 한곳에 정리한다.
function CrmTeamKpiBoard({
  overview,
  branchKpis,
  loading,
  branchError,
}: {
  overview: AdminCrmOverview | null
  branchKpis: BranchKpiResponse | null
  loading: boolean
  branchError: string | null
}) {
  // 콜드 로드 — '...' 텍스트 대신 타일 값 크기 스켈레톤(CRM-5).
  const loadingValue = loading && !overview ? <ValueSkeleton className="h-5 w-16" /> : null
  const neoCrm = overview?.neoCrm ?? null
  const neoKpis = neoCrm?.kpis
  const members = useMemo(() => branchKpis?.members ?? [], [branchKpis])

  const teamRows = useMemo(() => {
    const map = new Map<string, BranchKpiMemberRow[]>()
    for (const member of members) {
      const key = member.team?.trim() || "미지정"
      const list = map.get(key)
      if (list) list.push(member)
      else map.set(key, [member])
    }
    return Array.from(map.entries()).map(([team, rows]) => ({
      key: team,
      label: team,
      sub: `${rows.length}명`,
      members: rows,
    }))
  }, [members])

  const memberRows = useMemo(
    () =>
      members.map((member, index) => ({
        key: `${member.member}-${index}`,
        label: member.member,
        sub: member.team ?? undefined,
        members: [member],
      })),
    [members]
  )

  const sectionLabel = "text-[11px] font-bold uppercase tracking-[0.1em] text-[#1a1a1a]/40"
  const branchEmpty = branchError ?? "이번 달 KPI 레코드가 없습니다."

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Performance KPI</p>
          <h2 className="mt-1 text-[17px] font-bold text-[#111110]">KPI · 총 · 팀별 · 개인별</h2>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
            {CRM_BRANCH_KPI_MONTH} · 외부 CRM 동기화 완료량 기준 · 기준/완료/달성률
          </p>
        </div>
        <span className="inline-flex h-8 items-center rounded-full bg-[#ECFDF5] px-3 text-[12px] font-semibold text-[#084734]">
          Sync {formatOverviewDate(neoCrm?.latestSyncedAt)}
        </span>
      </div>

      <div>
        <p className={sectionLabel}>총 · 한국팀 전체</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CrmMeasurementTile
            icon={<CircleDollarSign className="h-4 w-4" />}
            label="동기화 매출"
            value={loadingValue ?? formatCNY(neoKpis?.salesAmountMonth)}
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
            value={loadingValue ?? formatCNY(neoKpis?.collectionAmountMonth)}
            hint={`수금 완료량 ${formatNumber(neoKpis?.collectionCountMonth)}건 · 30일 ${formatCNY(
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
                value={branchError ? "-" : loading && !branchKpis ? <ValueSkeleton className="h-5 w-12" /> : formatKpiActual(totals.actual)}
                hint={
                  branchError ??
                  `${item.hintLabel} · 기준 ${formatKpiActual(totals.goal)} · 달성률 ${formatPercent(rate)}`
                }
                tone={rate == null || rate >= 0.7 ? "text-[#084734]" : "text-[#B85C33]"}
              />
            )
          })}
        </div>
      </div>

      <div className="mt-5 border-t border-[#f0f0ec] pt-4">
        <p className={sectionLabel}>팀별</p>
        <div className="mt-2">
          <BranchKpiMatrix rows={teamRows} emptyLabel={branchEmpty} />
        </div>
      </div>

      <div className="mt-5 border-t border-[#f0f0ec] pt-4">
        <p className={sectionLabel}>개인별</p>
        <div className="mt-2">
          <BranchKpiMatrix rows={memberRows} emptyLabel={branchEmpty} />
        </div>
      </div>
    </section>
  )
}

// 통화 칩 — 서로 다른 통화(₩/$/¥)를 인접 배치할 때 기호·출처를 분리해 합산 오독을 막는다.
function CurrencyChip({ currency, tone = "light" }: { currency: CrmCurrency; tone?: "light" | "dark" }) {
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

// 코크핏 KPI 히어로 — 흩어진 핵심 지표를 상단 한 밴드로 합성(B 코크핏 이식). snapshot 필드만 재배치(추가 fetch 0).
// 통화 3종이 인접하므로 카드마다 통화 칩을 강제: 인식매출·미수=₩(자체집계), 오더=$(USD), 동기화=¥(CNY).
// 아침 지휘대 재배치(H3) — 우선순위 큐가 첫 화면 주인공이 되도록 컴팩트 밴드로 축소(값·캡션 불변).
function CrmCockpitHero({ overview, loading }: { overview: AdminCrmOverview | null; loading: boolean }) {
  const revenue = overview?.business.revenue
  const kpis = overview?.business.kpis
  const neoKpis = overview?.neoCrm?.kpis
  // 콜드 로드 — '...' 텍스트 대신 값 자리 크기의 스켈레톤(CRM-5).
  const pending = loading && !overview
  const riskCount = kpis?.paymentRiskCount ?? 0
  const hasRisk = riskCount > 0 || (revenue?.outstandingAmount ?? 0) > 0

  return (
    <div className="mb-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1. 이번 달 인식 매출 — 다크 히어로 (자체집계 ₩) */}
      <div className="rounded-2xl bg-[#084734] p-3.5 text-white shadow-[0_8px_22px_rgba(8,71,52,0.18)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 opacity-80">
            <CircleDollarSign className="h-3.5 w-3.5" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">이번 달 인식 매출</span>
          </div>
          <CurrencyChip currency="KRW" tone="dark" />
        </div>
        <p className="mt-1.5 text-[22px] font-bold leading-none tracking-[-0.03em]">
          {pending ? <ValueSkeleton className="h-6 w-28 bg-white/15" /> : formatKRWAbbrev(revenue?.deliveryTotalAmount)}
        </p>
        <p className="mt-1 text-[11px] opacity-75">
          견적 {pending ? <ValueSkeleton className="h-3 w-10 bg-white/15" /> : formatKRWAbbrev(revenue?.acceptedQuoteAmount)} · 계약{" "}
          {pending ? <ValueSkeleton className="h-3 w-10 bg-white/15" /> : formatKRWAbbrev(revenue?.contractedAmount)}
        </p>
        {/* 산정 기준 캡션(CRM-6) — 여기 '확정'은 V2 딜리버리 인식, 시트 '확정 표시'(¥)와 다른 기준 */}
        <p className="mt-1 text-[10px] leading-relaxed text-white/55">
          V2 딜리버리(출고) 인식 합계 · 시트 &lsquo;확정 표시&rsquo;(¥)와 다른 기준
        </p>
      </div>

      {/* 2. 오더 · 확정 임박 (USD) */}
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[#1a1a1a]/40">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">오더 · 확정 임박</span>
          </div>
          <CurrencyChip currency="USD" />
        </div>
        <p className="mt-1.5 text-[22px] font-bold leading-none tracking-[-0.03em] text-[#111110]">
          {pending ? <ValueSkeleton className="h-6 w-24" /> : formatUSD(neoKpis?.opportunityAmount)}
        </p>
        <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
          이번 달 {pending ? <ValueSkeleton className="h-3 w-6" /> : formatNumber(neoKpis?.opportunityCountMonth)}건
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-[#1a1a1a]/35">
          Neo CRM 오더(Opportunity) 합계 · 시트 &lsquo;확정 임박&rsquo;(¥)과 다른 기준
        </p>
      </div>

      {/* 3. 동기화 매출 · 수금 (CNY) */}
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[#1a1a1a]/40">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">동기화 매출 · 수금</span>
          </div>
          <CurrencyChip currency="CNY" />
        </div>
        <p className="mt-1.5 text-[22px] font-bold leading-none tracking-[-0.03em] text-[#084734]">
          {pending ? <ValueSkeleton className="h-6 w-24" /> : formatCNY(neoKpis?.salesAmountMonth)}
        </p>
        <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
          수금 {pending ? <ValueSkeleton className="h-3 w-10" /> : formatCNY(neoKpis?.collectionAmountMonth)}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-[#1a1a1a]/35">
          Neo CRM 동기화 완료분 합계 · 이번 달 기준
        </p>
      </div>

      {/* 4. 미수 · 이탈 위험 (자체집계 ₩ + 건수) */}
      <Link
        href="/admin/crm/deals"
        className={`group rounded-2xl border p-3.5 transition-colors ${
          hasRisk ? "border-[#F6D5C5] bg-[#FEF3EE] hover:bg-[#FCE9E0]" : "border-[#e8e8e4] bg-white hover:bg-[#fafaf8]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1.5 ${hasRisk ? "text-[#B85C33]" : "text-[#1a1a1a]/40"}`}>
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">미수 · 이탈 위험</span>
          </div>
          <CurrencyChip currency="KRW" />
        </div>
        <p className={`mt-1.5 text-[22px] font-bold leading-none tracking-[-0.03em] ${hasRisk ? "text-[#B85C33]" : "text-[#111110]"}`}>
          {pending ? (
            <ValueSkeleton className="h-6 w-12" />
          ) : (
            <>
              {formatNumber(riskCount)}
              <span className="ml-1 text-[14px] font-bold">곳</span>
            </>
          )}
        </p>
        <p className="mt-1 text-[11px] text-[#1a1a1a]/45">
          미수 합계 {pending ? <ValueSkeleton className="h-3 w-10" /> : formatKRWAbbrev(revenue?.outstandingAmount)} · Deals에서 처리
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-[#1a1a1a]/35">V2 계약·수납 대비 미수 거래 수 · 자체 집계 ₩</p>
      </Link>
    </div>
  )
}

// 고객 건강도 도넛 — 활성 고객(neo_account)의 안전/주의/위험 실분포(computeCustomerHealth SSOT).
// 데이터 없으면(또는 환경상 미적용) 렌더 안 함(가짜 분포 금지).
interface CrmHealthDist {
  total: number
  safe: number
  watch: number
  risk: number
}

function CrmHealthDonut() {
  const [dist, setDist] = useState<CrmHealthDist | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<{ distribution: CrmHealthDist }>("/api/admin/crm/health-distribution", undefined, {
      cacheKey: "/api/admin/crm/health-distribution",
      ttlMs: 120_000,
      staleWhileRevalidateMs: 300_000,
    })
      .then((res) => {
        if (alive) {
          setDist(res.distribution)
          setLoading(false)
        }
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  if (loading) return <div className="h-24 animate-pulse rounded-2xl bg-[#fafaf8]" />
  if (!dist || dist.total === 0) return null

  const pct = (value: number) => Math.round((value / dist.total) * 100)
  const safePct = pct(dist.safe)
  const watchPct = pct(dist.watch)
  const gradient = `conic-gradient(#084734 0 ${safePct}%, #E0A33A ${safePct}% ${safePct + watchPct}%, #B85C33 ${safePct + watchPct}% 100%)`
  const legend = [
    { label: "안전", value: dist.safe, color: "#084734" },
    { label: "주의", value: dist.watch, color: "#E0A33A" },
    { label: "위험", value: dist.risk, color: "#B85C33" },
  ]

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#1a1a1a]/40">고객 건강도</p>
        <p className="text-[10px] text-[#1a1a1a]/35">활성 고객 {formatNumber(dist.total)} · 규칙 기반 분포</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: gradient }}>
          <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white">
            <span className="text-[18px] font-bold leading-none text-[#111110]">{safePct}%</span>
            <span className="text-[9px] font-semibold text-[#1a1a1a]/45">안전</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="flex-1 text-[12px] font-medium text-[#111110]">{item.label}</span>
              <span
                className="text-[12px] font-bold tabular-nums"
                style={{ color: item.label === "위험" && item.value > 0 ? "#B85C33" : "#111110" }}
              >
                {pct(item.value)}%
              </span>
            </div>
          ))}
        </div>
      </div>
      {dist.risk > 0 ? (
        <Link
          href="/admin/crm/customers/unified?view=needs_care"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] py-2 text-[12px] font-semibold text-[#B85C33] transition-colors hover:bg-[#FCE9E0]"
        >
          위험 고객 {formatNumber(dist.risk)}곳 보기
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </section>
  )
}

// 활동 목표 달성률 게이지 — branch KPI(LD/ACC/OPP/SOL/VST) actual/goal 합산. 매출 아닌 "활동" 목표임을 명시.
function ActivityGoalGauge({ branchKpis }: { branchKpis: BranchKpiResponse | null }) {
  const totals = BRANCH_KPI_DEFS.reduce(
    (acc, def) => {
      const t = aggregateBranchKpi(branchKpis, def.key)
      acc.actual += t.actual
      acc.goal += t.goal
      return acc
    },
    { actual: 0, goal: 0 }
  )
  if (totals.goal <= 0) return null
  const ratio = totals.actual / totals.goal
  const pct = Math.round(ratio * 100)
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const dash = circumference * Math.min(1, Math.max(0, ratio))
  const tone = ratio >= 0.7 ? "#084734" : "#B85C33"
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-12 w-12 shrink-0">
        <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90">
          <circle cx="20" cy="20" r={radius} fill="none" stroke="#f0f0ec" strokeWidth="5" />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#111110]">
          {pct}%
        </span>
      </div>
      <div className="leading-tight">
        <p className="text-[11px] font-semibold text-[#111110]">활동 목표 달성률</p>
        <p className="text-[10px] text-[#1a1a1a]/40">리드·고객·방문 등 5지표 합산 · 매출 아님</p>
      </div>
    </div>
  )
}

// 활동 목표 달성 랭킹 — branch KPI(5지표) actual/goal 합산 달성률로 개인 정렬. 더미 아님(실 KPI 레코드).
function CrmRankingBoard({ branchKpis }: { branchKpis: BranchKpiResponse | null }) {
  const ranked = useMemo(() => {
    const members = branchKpis?.members ?? []
    return members
      .map((member) => {
        const totals = BRANCH_KPI_DEFS.reduce(
          (acc, def) => {
            const value = member.kpi?.[def.key]
            acc.actual += Number(value?.actual ?? 0)
            acc.goal += Number(value?.goal ?? 0)
            return acc
          },
          { actual: 0, goal: 0 }
        )
        const ratio = totals.goal > 0 ? totals.actual / totals.goal : 0
        return { member: member.member, team: member.team, ratio }
      })
      .filter((row) => row.ratio > 0)
      .sort((a, b) => b.ratio - a.ratio)
  }, [branchKpis])

  if (ranked.length === 0) return null
  const max = ranked[0].ratio || 1

  return (
    <section className="mt-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#1a1a1a]/40">Performance Ranking</p>
        <h3 className="mt-0.5 text-[15px] font-bold text-[#111110]">활동 목표 달성 랭킹</h3>
        <p className="text-[11px] text-[#1a1a1a]/35">5지표(리드·고객·확정·솔루션·방문) 합산 달성률 · 규칙 기반</p>
      </div>
      <div className="divide-y divide-[#f0f0ec]">
        {ranked.slice(0, 10).map((row, index) => (
          <div key={`${row.member}-${index}`} className="flex items-center gap-3 py-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold ${
                index === 0
                  ? "bg-[#084734] text-white"
                  : index <= 2
                    ? "bg-[#ECFDF5] text-[#084734]"
                    : "bg-[#fafaf8] text-[#1a1a1a]/50"
              }`}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[#111110]">
                {row.member}
                {row.team ? <span className="ml-1.5 text-[11px] font-medium text-[#1a1a1a]/40">{row.team}</span> : null}
              </p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, Math.round((row.ratio / max) * 100))}%`,
                    backgroundColor: row.ratio >= 0.7 ? "#084734" : "#B85C33",
                  }}
                />
              </div>
            </div>
            <span
              className={`shrink-0 text-[13px] font-bold tabular-nums ${row.ratio >= 0.7 ? "text-[#111110]" : "text-[#B85C33]"}`}
            >
              {Math.round(row.ratio * 100)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function CrmOperationsDashboard({
  overview,
  loading,
  error,
  part = "all",
}: {
  overview: AdminCrmOverview | null
  loading: boolean
  error: string | null
  part?: "all" | "revenue" | "risk"
}) {
  const showRevenue = part !== "risk"
  const showRisk = part !== "revenue"
  const revenue = overview?.business.revenue
  const kpis = overview?.business.kpis
  const neoCrm = overview?.neoCrm ?? null
  const neoKpis = neoCrm?.kpis
  const logs = overview?.business.customerLogs.recent ?? []
  const businessWarning = error ?? overview?.business.error ?? overview?.business.warning ?? null
  const neoSyncWarning = neoCrm?.error ?? overview?.externalSnapshots.error ?? null
  // 콜드 로드 — '...' 텍스트 대신 자리 크기별 스켈레톤(CRM-5). loadingText는 문자열 보간(hint) 전용.
  const pending = loading && !overview
  const loadingValue = pending ? <ValueSkeleton /> : null
  const loadingInline = pending ? <ValueSkeleton className="h-3 w-12" /> : null
  const loadingText = pending ? "—" : null

  return (
    <>
      {showRevenue ? (
      <div className="mb-4">
        {/* 참조 표면(분석·분해) — 행동 표면과의 톤차 위계(W2-6): 베이지로 한 단 가라앉힌다 */}
        <section className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Customer Revenue Scope</p>
              <h2 className="mt-1 text-[18px] font-bold text-[#111110]">고객 돈흐름 우선순위</h2>
            </div>
            <span className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/50">
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
                {pending ? <ValueSkeleton className="h-9 w-36" /> : formatKRWAbbrev(revenue?.deliveryTotalAmount)}
              </p>
              {/* 오더는 거의 확정 매출 — Delivery와 같은 급의 서브 히어로 (USD 네이티브) */}
              <div className="mt-4 border-t border-[#084734]/10 pt-3">
                <div className="flex items-center gap-2 text-[#084734]/70">
                  <BarChart3 className="h-4 w-4" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">오더 · 확정 임박 (USD)</p>
                </div>
                <p className="mt-1.5 flex flex-wrap items-end gap-x-2 gap-y-1">
                  <span className="text-3xl font-bold tracking-[-0.04em] text-[#111110]">
                    {pending ? <ValueSkeleton className="h-8 w-28" /> : formatUSD(neoKpis?.opportunityAmount)}
                  </span>
                  <span className="text-[12px] text-[#1a1a1a]/45">
                    이번 달 {loadingInline ?? formatNumber(neoKpis?.opportunityCountMonth)}건
                  </span>
                </p>
              </div>
              <div className="mt-3 grid gap-2 text-[12px] text-[#1a1a1a]/45 sm:grid-cols-2">
                <span>견적 {loadingInline ?? formatKRWAbbrev(revenue?.acceptedQuoteAmount)}</span>
                <span>동기화 매출 {loadingInline ?? formatCNY(neoKpis?.salesAmountMonth)}</span>
                <span>확정 임박 {loadingInline ?? formatUSD(neoKpis?.opportunityAmount)}</span>
                <span>계약 {loadingInline ?? formatKRWAbbrev(revenue?.contractedAmount)}</span>
                <span>인식 매출 {loadingInline ?? formatKRWAbbrev(revenue?.deliveryTotalAmount)}</span>
                <span>동기화 수금 {loadingInline ?? formatCNY(neoKpis?.collectionAmountMonth)}</span>
                <span className={(revenue?.outstandingAmount ?? 0) > 0 ? "font-semibold text-[#B85C33]" : ""}>
                  미수 {loadingInline ?? formatKRWAbbrev(revenue?.outstandingAmount)}
                </span>
                <span>수납 {loadingInline ?? formatKRWAbbrev(revenue?.paidAmount)}</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <CrmMetricTile
                icon={<FileText className="h-4 w-4" />}
                label="견적"
                value={loadingValue ?? formatKRWAbbrev(revenue?.acceptedQuoteAmount)}
                hint={`견적서 ${loadingText ?? formatNumber(kpis?.quoteDocumentCount)}건`}
              />
              <CrmMetricTile
                icon={<BarChart3 className="h-4 w-4" />}
                label="오더 (확정 임박)"
                value={loadingValue ?? formatUSD(neoKpis?.opportunityAmount)}
                hint={`외부 CRM ${loadingText ?? formatNumber(neoKpis?.opportunityCountMonth)}건 · USD`}
                tone="text-[#084734]"
              />
              <CrmMetricTile
                icon={<TrendingUp className="h-4 w-4" />}
                label="동기화 매출"
                value={loadingValue ?? formatCNY(neoKpis?.salesAmountMonth)}
                hint={`본사 CRM ${loadingText ?? formatNumber(neoKpis?.salesCountMonth)}건 · actual`}
                tone="text-[#084734]"
              />
              <CrmMetricTile
                icon={<ReceiptText className="h-4 w-4" />}
                label="동기화 수금"
                value={loadingValue ?? formatCNY(neoKpis?.collectionAmountMonth)}
                hint={`외부 CRM ${loadingText ?? formatNumber(neoKpis?.collectionCountMonth)}건 · current month`}
              />
              <CrmMetricTile
                icon={<Building2 className="h-4 w-4" />}
                label="동기화 고객"
                value={loadingValue ?? formatNumber(neoKpis?.accountCount)}
                hint={`이번 달 활성 ${loadingText ?? formatNumber(neoKpis?.activeAccountCountMonth)} · 외부 CRM 원천`}
              />
              <CrmMetricTile
                icon={<Handshake className="h-4 w-4" />}
                label="계약"
                value={loadingValue ?? formatKRWAbbrev(revenue?.contractedAmount)}
                hint={`활성 거래 ${loadingText ?? formatNumber(kpis?.activeDealCount)}건`}
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
      ) : null}

      {showRisk ? (
      <div className="mb-4 space-y-3">
        {/* 수납 리스크 — 슬림 한 줄 */}
        <section className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <div className="flex items-center gap-1.5">
                <ReceiptText className="h-4 w-4 text-[#1a1a1a]/30" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/30">수납 리스크</span>
              </div>
              <span className="text-[12px] text-[#1a1a1a]/45">
                미수 거래{" "}
                <b className={`text-[15px] font-bold ${(kpis?.paymentRiskCount ?? 0) > 0 ? "text-[#B85C33]" : "text-[#111110]"}`}>
                  {loadingInline ?? formatNumber(kpis?.paymentRiskCount)}
                </b>
              </span>
              <span className="text-[12px] text-[#1a1a1a]/45">
                미수 합계{" "}
                <b className={`text-[15px] font-bold ${(revenue?.outstandingAmount ?? 0) > 0 ? "text-[#B85C33]" : "text-[#111110]"}`}>
                  {loadingInline ?? formatKRWAbbrev(revenue?.outstandingAmount)}
                </b>
              </span>
            </div>
            <Link
              href="/admin/crm/deals"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
            >
              Deals에서 처리
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* 최근 고객별 로그 — 간소화(6건, 요약줄 제거) */}
        <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-bold text-[#111110]">최근 고객별 로그</h2>
            <Link
              href="/admin/crm/customers/accounts"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
            >
              고객사 보기
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {logs.length === 0 ? (
            pending ? (
              // 콜드 로드 — 로그 행 레이아웃과 일치하는 스켈레톤(CRM-5)
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-xl bg-[#fafaf8]" />
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-[#fafaf8] px-3 py-6 text-center text-[13px] text-[#1a1a1a]/30">
                최근 고객 로그가 없습니다.
              </p>
            )
          ) : (
            <div className="divide-y divide-[#f0f0ec]">
              {logs.slice(0, 6).map((log) => (
                <Link
                  key={log.id}
                  href={log.href}
                  className="flex items-center gap-2.5 py-2 transition-colors hover:bg-[#fafaf8]"
                >
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getCustomerLogTone(
                      log.kind
                    )}`}
                  >
                    <CustomerLogIcon kind={log.kind} />
                    {getCustomerLogKindLabel(log.kind)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-[#111110]">
                      {log.customerName ?? log.partnerAccountName ?? "고객 미지정"}
                    </p>
                    <p className="truncate text-[11px] text-[#1a1a1a]/45">{log.title}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12px] font-semibold text-[#111110]">
                      {log.amount == null ? log.status ?? "-" : formatLogAmount(log.kind, log.amount)}
                    </p>
                    <p className="text-[11px] text-[#1a1a1a]/35">{formatOverviewDate(log.occurredAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
      ) : null}
    </>
  )
}

// ─── 리포트 · 분석 (참조 블록 단일화) ──────────────────────────
// 매출 상세 / 성과 분석 / 리드 분석 / 팀 KPI / 수납·로그가 각각 최상위 섹션으로 쌓여
// 아침 화면 아래쪽이 다섯 덩어리였다. 전부 "보고서를 볼 때 여는" 참조 표면이라 한 아코디언
// 안의 탭으로 접는다. 기본 접힘 + 선택한 탭만 렌더 — Recharts 청크(성과·리드)가 첫 페인트에서
// 아예 빠지고, 작업대(우선순위 큐)가 화면의 주인공으로 남는다.
type CrmReportTab = "revenue" | "performance" | "leads" | "team" | "ops"

const CRM_REPORT_TABS: Array<{ key: CrmReportTab; label: string; hint: string }> = [
  { key: "revenue", label: "매출 상세", hint: "견적 · 계약 · 수금 분해 · 통화별" },
  { key: "performance", label: "성과 분석", hint: "CRM 매출(¥, REV 동기화) 기준 · 최근 6개월" },
  { key: "leads", label: "리드 분석", hint: "리드 KPI 기반 시각화" },
  { key: "team", label: "팀 KPI", hint: "총 · 팀별 · 개인별 · NEO 팀 현황" },
  { key: "ops", label: "수납 · 로그", hint: "미수 리스크 · 최근 고객별 로그" },
]

function CrmHomeReportSection({
  open,
  onToggle,
  tab,
  onTabChange,
  overview,
  loading,
  error,
  branchKpis,
  branchError,
  leadKpis,
  refreshing,
  neoCrmRefreshKey,
}: {
  open: boolean
  onToggle: () => void
  tab: CrmReportTab
  onTabChange: (tab: CrmReportTab) => void
  overview: AdminCrmOverview | null
  loading: boolean
  error: string | null
  branchKpis: BranchKpiResponse | null
  branchError: string | null
  leadKpis: LeadActionKpis | null
  refreshing: boolean
  neoCrmRefreshKey: number
}) {
  const activeTab = CRM_REPORT_TABS.find((item) => item.key === tab) ?? CRM_REPORT_TABS[0]

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        // 참조(보고) 표면 — 행동 표면과의 톤차 위계(W2-6): 베이지로 가라앉힌다
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3 transition-colors hover:bg-white"
      >
        <span className="flex min-w-0 items-center gap-2">
          <BarChart3 className="h-4 w-4 shrink-0 text-[#1a1a1a]/40" />
          <span className="shrink-0 text-[14px] font-bold text-[#111110]">리포트 · 분석</span>
          <span className="hidden truncate text-[11px] text-[#1a1a1a]/35 sm:inline">
            {CRM_REPORT_TABS.map((item) => item.label).join(" · ")}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#1a1a1a]/35 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>

      {open ? (
        <div className="mt-3">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {CRM_REPORT_TABS.map((item) => {
              const active = item.key === tab
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onTabChange(item.key)}
                  aria-pressed={active}
                  className={`inline-flex h-[30px] items-center rounded-full px-3 text-[12px] font-medium transition-colors ${
                    active
                      ? "bg-[#111110] text-white"
                      : "border border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4]"
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
            <span className="ml-auto hidden text-[11px] text-[#1a1a1a]/35 sm:inline">{activeTab.hint}</span>
          </div>

          {tab === "revenue" ? (
            <CrmOperationsDashboard part="revenue" overview={overview} loading={loading} error={error} />
          ) : null}

          {tab === "performance" ? (
            <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-bold text-[#111110]">성과 분석 · 팀/개인</h2>
                  <p className="text-[11px] text-[#1a1a1a]/35">CRM 매출(¥, REV 동기화) 기준 · 최근 6개월</p>
                </div>
                <ActivityGoalGauge branchKpis={branchKpis} />
              </div>
              <CrmPerformanceCharts />
            </section>
          ) : null}

          {tab === "leads" ? (
            <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold text-[#111110]">리드 분석</h2>
                <Link
                  href="/admin/crm/customers/leads"
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
                >
                  리드 보드
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              {leadKpis && leadKpis.total > 0 ? (
                <CrmHomeCharts leadKpis={leadKpis} />
              ) : (
                <p className="rounded-xl bg-white px-3 py-8 text-center text-[13px] text-[#1a1a1a]/30">
                  집계할 리드가 아직 없습니다.
                </p>
              )}
            </section>
          ) : null}

          {tab === "team" ? (
            <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
              <NeoCrmTeamPanel refreshKey={neoCrmRefreshKey} />
              <CrmTeamKpiBoard
                overview={overview}
                branchKpis={branchKpis}
                loading={refreshing}
                branchError={branchError}
              />
              <CrmRankingBoard branchKpis={branchKpis} />
            </section>
          ) : null}

          {tab === "ops" ? (
            <CrmOperationsDashboard part="risk" overview={overview} loading={loading} error={error} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ─── 메인 페이지 ───────────────────────────────────────────────
export default function CrmPage() {
  const router = useRouter()
  const [leadKpis, setLeadKpis] = useState<LeadActionKpis | null>(null)
  const [leadKpisLoading, setLeadKpisLoading] = useState(true)
  const [, setLeadKpisError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [drawerTarget, setDrawerTarget] = useState<{ key: string; name: string } | null>(null)
  const [recentCustomers, setRecentCustomers] = useState<RecentCustomer[]>([])
  const [leadModalOpen, setLeadModalOpen] = useState(false)
  // 리포트(매출 상세·성과·리드·팀 KPI·수납/로그)는 전부 참조 표면 — 기본 접힘으로
  // 첫 화면을 작업대에 집중시키고, 열었을 때도 탭 하나만 렌더한다.
  const [reportOpen, setReportOpen] = useState(false)
  const [reportTab, setReportTab] = useState<CrmReportTab>("revenue")

  // 고객 바로 가기 — 최근 본 고객(로컬). 드로어 열고 닫을 때마다 갱신.
  useEffect(() => {
    setRecentCustomers(getRecentCustomers())
  }, [drawerTarget])
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

  const refreshAll = useCallback(() => {
    void fetchLeadKpis({ force: true })
    void fetchCrmOverview({ force: true })
    void fetchBranchKpis({ force: true })
    setNeoCrmRefreshKey((current) => current + 1)
  }, [fetchLeadKpis, fetchCrmOverview, fetchBranchKpis])

  // 빠른 실행 ② 기록 추가 — 우측 액션 레일(빠른 생성 폼)로 스크롤·포커스.
  // 레일이 없으면(예외 상황) 기록 표면 딥링크로 폴백한다.
  const focusQuickRecord = useCallback(() => {
    const rail = document.querySelector<HTMLElement>('aside[aria-label="CRM 액션 레일"]')
    if (!rail) {
      router.push("/admin/crm/activity")
      return
    }
    rail.scrollIntoView({ behavior: "smooth", block: "start" })
    const field = rail.querySelector<HTMLElement>("input:not([type='file']), textarea")
    field?.focus({ preventScroll: true })
  }, [router])

  // 빠른 실행 ③ 검색 — 사이드바 '빠른 이동·검색'과 동일 이벤트로 CrmCommandPalette를 연다.
  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new Event("admin:open-command-palette"))
  }, [])

  return (
    <div>
      {/* 헤더 — 타이틀만. 액션은 아래 sticky 빠른 실행 바로 이동(H2) */}
      <div className="mb-4">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin · CRM</p>
        <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">CRM 홈</h1>
        <p className="mt-1 text-[13px] text-[#1a1a1a]/42">
          ClassIn 고객 DB 기준 · 시트와 외부 CRM은 동기화 참고자료
        </p>
      </div>

      {/* 빠른 실행 바 — 액션만: ①리드 등록 ②기록 추가 ③검색 ⌘K ④새로고침.
          화면 이동 링크는 하단 '바로 가기' 한 줄로 모았다(sticky 바에 두 종류가 섞여 있었다).
          lg+에서 sticky(admin main이 스크롤 컨테이너라 body overflow-x 함정 무관).
          <lg는 body 스크롤 + overflow-x:hidden으로 sticky가 깨지는 저장소 함정이 있어 일반 플로우 폴백. */}
      <div className="-mx-4 mb-4 px-4 py-2 sm:-mx-6 sm:px-6 lg:sticky lg:top-0 lg:z-40 lg:-mx-8 lg:border-b lg:border-[#e8e8e4] lg:bg-[#FAFAF8]/92 lg:px-8 lg:backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLeadModalOpen(true)}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <UserPlus className="h-3.5 w-3.5" />
            리드 등록
          </button>
          <button
            type="button"
            onClick={focusQuickRecord}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            <NotebookPen className="h-3.5 w-3.5" />
            기록 추가
          </button>
          <button
            type="button"
            onClick={openCommandPalette}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            <Search className="h-3.5 w-3.5" />
            검색
            <kbd className="rounded border border-[#e8e8e4] bg-[#fafaf8] px-1 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/45">
              ⌘K
            </kbd>
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={pageRefreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${pageRefreshing ? "animate-spin" : ""}`} />새로고침
          </Button>
        </div>
      </div>

      {/* 코크핏 KPI 히어로 — 컴팩트 밴드(H3): 우선순위 큐 위에 핵심 숫자만 한 줄 */}
      <CrmCockpitHero overview={crmOverview} loading={crmOverviewLoading} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
      {/* 우선순위 작업대 — 아침 지휘대의 첫 화면 주인공(H3). 3소스 룰베이스 큐 */}
      <CrmPriorityQueuePanel refreshKey={neoCrmRefreshKey} />

      {/* 고객 찾기 — 검색 + 최근 본 + 자주 접촉을 한 표면에. 고객으로 가는 입구를 한 곳으로 모은다
          (자주 접촉 칩은 리드·일정 요약 안에 끼어 있던 것을 여기로 옮겼다). */}
      <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">고객 찾기</p>
        <CrmCustomerPicker
          label={searchQuery}
          linkedId=""
          onFreeText={setSearchQuery}
          onClear={() => setSearchQuery("")}
          onPick={(pick) => {
            setDrawerTarget({
              key: `${pick.targetType === "neo_account" ? "neo" : "lead"}:${pick.targetId}`,
              name: pick.targetLabel,
            })
            setSearchQuery("")
          }}
        />
        <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-[#1a1a1a]/35">
          학원명·이름·전화로 검색해 바로 고객 카드를 엽니다.
          <span className="inline-flex items-center gap-1">
            어디서든
            <kbd className="rounded border border-[#e8e8e4] bg-[#fafaf8] px-1 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/45">
              ⌘K
            </kbd>
            로 빠른 이동·검색
          </span>
        </p>
        {recentCustomers.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#f0f0ec] pt-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#1a1a1a]/30">최근 본 고객</span>
            {recentCustomers.slice(0, 6).map((rc) => (
              <button
                key={rc.key}
                type="button"
                onClick={() => setDrawerTarget({ key: rc.key, name: rc.name })}
                className="inline-flex items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#111110] transition-colors hover:border-[#c8c8c4] hover:bg-[#fafaf8]"
              >
                <span className="max-w-[120px] truncate">{rc.name}</span>
                <span className="text-[10px] text-[#1a1a1a]/35">{rc.sourceLabel}</span>
              </button>
            ))}
          </div>
        ) : null}

        {(crmOverview?.business.frequentCustomers.length ?? 0) > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#f0f0ec] pt-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#1a1a1a]/30">자주 접촉 · 14일</span>
            {crmOverview?.business.frequentCustomers.map((customer) => (
              <Link
                key={customer.customerId}
                href={customer.href}
                title={customer.latestSummary ?? undefined}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#111110] transition-colors hover:border-[#c8c8c4] hover:bg-[#fafaf8]"
              >
                <span className="max-w-[120px] truncate">{customer.customerName}</span>
                <span className="rounded-full bg-[#f0f0ec] px-1.5 text-[10px] font-semibold tabular-nums text-[#1a1a1a]/55">
                  {customer.contactCount}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {/* 리드 요약 — 집계 딥링크(작업대와 별개, 한눈 카운트).
          '이번 주 설치·방문' 타일은 아래 설치·방문 일정 카드와 같은 데이터라 카드 쪽으로 합쳤다. */}
      <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Quick Stats</p>
            <h2 className="mt-1 text-[18px] font-bold text-[#111110]">리드 요약</h2>
          </div>
          <span className="rounded-full bg-[#f0f0ec] px-3 py-1 text-[12px] font-medium text-[#1a1a1a]/55">
            딥링크
          </span>
        </div>

        {/* KPI 로컬 재구현 금지(W2-2b) — viz StatTile(soft) 위임. 값·라벨·캡션·딥링크·스켈레톤 불변,
            breach 색은 신호 예산제대로 값에만(정상=중립, 컨테이너 상시 채색 제거). */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon={<UserPlus className="h-4 w-4" />}
            iconLayout="inline"
            variant="soft"
            compact
            href="/admin/crm/customers/leads?filter=unconfirmed"
            label="미확인 유입"
            value={
              leadKpisLoading && !leadKpis ? (
                <ValueSkeleton className="h-6 w-12" />
              ) : (
                <span className={(leadKpis?.unconfirmedCount ?? 0) > 0 ? "text-[#8D6C1F]" : undefined}>
                  {formatNumber(leadKpis?.unconfirmedCount)}
                </span>
              )
            }
            hint="공개 폼(문의·데모·뉴스레터) · 확인 전"
          />

          <StatTile
            icon={<PhoneCall className="h-4 w-4" />}
            iconLayout="inline"
            variant="soft"
            compact
            href="/admin/crm/customers/leads?filter=unresponded"
            label="미응답 리드"
            value={
              leadKpisLoading && !leadKpis ? (
                <ValueSkeleton className="h-6 w-12" />
              ) : (
                <span className={(leadKpis?.unrespondedCount ?? 0) > 0 ? "text-[#B85C33]" : undefined}>
                  {formatNumber(leadKpis?.unrespondedCount)}
                </span>
              )
            }
            hint={
              <>
                48h 이상 {leadKpisLoading && !leadKpis ? <ValueSkeleton className="h-3 w-6" /> : formatNumber(leadKpis?.unresponded48hCount)}건
              </>
            }
          />

          <StatTile
            icon={<AlertCircle className="h-4 w-4" />}
            iconLayout="inline"
            variant="soft"
            compact
            href="/admin/crm/customers/leads?focus=risk"
            label="오버듀 팔로업"
            value={
              leadKpisLoading && !leadKpis ? (
                <ValueSkeleton className="h-6 w-12" />
              ) : (
                <span className={(leadKpis?.overdueFollowUpCount ?? 0) > 0 ? "text-[#B85C33]" : undefined}>
                  {formatNumber(leadKpis?.overdueFollowUpCount)}
                </span>
              )
            }
            hint={
              <>
                오늘 예정 {leadKpisLoading && !leadKpis ? <ValueSkeleton className="h-3 w-6" /> : formatNumber(leadKpis?.todayFollowUpCount)}건
              </>
            }
          />

          <StatTile
            icon={<Target className="h-4 w-4" />}
            iconLayout="inline"
            variant="soft"
            compact
            href="/admin/crm/customers/leads?filter=converted"
            label="전환 고객"
            value={
              leadKpisLoading && !leadKpis ? (
                <ValueSkeleton className="h-6 w-12" />
              ) : (
                <span className="text-[#084734]">{formatNumber(leadKpis?.byStatus.converted)}</span>
              )
            }
            hint="누적 어카운트 전환"
          />
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

      {/* 주간 조망 밴드 — 우측 aside에서 본문으로 이동(H4: 우측 열은 액션 레일 전용) · 기능 보존 */}
      <div className="mb-4 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* 이번 주 할 일 — 주간 일정·버킷 조망 */}
        <CrmWeekAheadPanel compact />

        {/* 설치·방문 일정 — upcomingThisWeek(install|visit) 상위 3건 */}
        <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[#1a1a1a]/45">
              <Calendar className="h-3.5 w-3.5" />
              <p className="text-[11px] font-bold uppercase tracking-[0.08em]">설치·방문 일정</p>
              {/* 0 플래시 금지(CRM-5) — overview 도착 전엔 스켈레톤 */}
              {crmOverviewLoading && !crmOverview ? (
                <ValueSkeleton className="h-4 w-8" />
              ) : (
                <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#084734]">
                  이번 주 {crmOverview?.business.upcomingThisWeek.count ?? 0}
                </span>
              )}
            </div>
            <Link
              href="/admin/calendar"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1a1a1a]/40 transition-colors hover:text-[#111110]"
            >
              캘린더
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {(crmOverview?.business.upcomingThisWeek.items.length ?? 0) === 0 ? (
            crmOverviewLoading && !crmOverview ? (
              // 콜드 로드 — 일정 칩 레이아웃과 일치하는 스켈레톤(CRM-5)
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-xl bg-[#fafaf8]" />
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-[#fafaf8] px-3 py-4 text-center text-[12px] text-[#1a1a1a]/35">
                예정된 설치·방문이 없습니다.
              </p>
            )
          ) : (
            <ul className="space-y-2">
              {crmOverview?.business.upcomingThisWeek.items.slice(0, 3).map((item) => {
                const parts = monthDayParts(item.startsAt)
                return (
                  <li key={item.id}>
                    <Link href={item.href} className="flex items-center gap-2.5 transition-colors hover:opacity-80">
                      <span className="flex h-9 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-[#ECFDF5] text-[#084734]">
                        <span className="text-[9px] font-semibold leading-none">{parts.month}</span>
                        <span className="text-[13px] font-bold leading-tight">{parts.day}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-[#111110]">{item.title}</p>
                        <p className="truncate text-[11px] text-[#1a1a1a]/45">
                          {item.kind === "install" ? "설치" : "방문"}
                          {item.customerName ? ` · ${item.customerName}` : ""}
                        </p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* 고객 건강도 — 활성 고객 안전/주의/위험 실분포(없으면 자동 숨김) */}
        <CrmHealthDonut />
      </div>

          <CrmCoverageStrip />
        </div>

        {/* 우측 액션 레일(H4) — 기록 빠른 생성 · 최근 기록. 데이터 자체 fetch,
            xl+에서 sticky + 독립 스크롤(레일 내부에서 처리). 저장 성공 시 최근 고객 로그 갱신.
            '오늘 할 일'은 hideTasks로 끈다 — 본문 주간 조망의 CrmWeekAheadPanel이 같은 crm_tasks를
            지연·오늘·이번 주·미룬 버킷 + 완료/미루기까지 상위집합으로 이미 다룬다. */}
        <CrmActionRail hideTasks onActivitySaved={() => void fetchCrmOverview({ force: true })} />
      </div>

      {/* 리포트 · 분석 — 흩어져 있던 참조 블록 5개를 한 아코디언 안의 탭으로 단일화 */}
      <CrmHomeReportSection
        open={reportOpen}
        onToggle={() => setReportOpen((value) => !value)}
        tab={reportTab}
        onTabChange={setReportTab}
        overview={crmOverview}
        loading={crmOverviewLoading}
        error={crmOverviewError}
        branchKpis={branchKpis}
        branchError={branchKpisError}
        leadKpis={leadKpis}
        refreshing={pageRefreshing}
        neoCrmRefreshKey={neoCrmRefreshKey}
      />

      {/* 바로 가기 — 상단 sticky 바의 보조 링크와 하단 '심화 보기'로 갈려 있던 딥링크를 한 줄로 모았다.
          (주요 화면 이동은 사이드바 CRM 확장이 담당 — 여기는 보조 경로) */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-[#1a1a1a]/35">바로 가기</span>
        {[
          { href: "/admin/crm/customers/leads", label: "리드" },
          { href: "/admin/crm/deals", label: "견적·매출" },
          { href: "/admin/crm/customers/unified", label: "고객·후속" },
          { href: "/admin/crm/matching", label: "데이터 매칭 인박스" },
          { href: "/admin/crm/deals/rev-sheet", label: "매출시트" },
          { href: "/admin/crm/insights", label: "인사이트 분석" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex h-7 items-center rounded-lg border border-[#e8e8e4] bg-white px-2.5 font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* 열림 상태에서만 렌더 — 닫힘=null 렌더였던 기존과 동일 화면이면서, dynamic 청크를
          열 때만 내려받고 닫힌 첫 로드에 로딩 폴백이 새어 나오지 않는다. */}
      {drawerTarget ? (
        <Customer360Drawer
          customerKey={drawerTarget.key}
          name={drawerTarget.name}
          onClose={() => setDrawerTarget(null)}
        />
      ) : null}

      {leadModalOpen ? (
        <LeadRegisterModal
          open
          onClose={() => setLeadModalOpen(false)}
          onDone={() => void fetchLeadKpis({ force: true })}
        />
      ) : null}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

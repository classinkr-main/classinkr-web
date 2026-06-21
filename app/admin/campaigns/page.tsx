"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  Activity,
  AlertCircle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  Mail,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Wallet,
  X,
  Trash2,
} from "lucide-react"
import AdminTabs from "@/components/admin/AdminTabs"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { useUrlState } from "@/lib/use-url-state"
import type { LeadRecord } from "@/lib/db"
import type { PublicEvent, EventStatus } from "@/lib/types/public-events"
import {
  AD_CHANNEL_COLOR,
  AD_CHANNEL_LABEL,
  computeEconomics,
  DEFAULT_EVENT_METRICS,
  type AdChannel,
  type AdSpendEntry,
  type EventFunnel,
  type EventMetrics,
} from "@/lib/types/event-metrics"

// ─── helpers ──────────────────────────────────────────────────────────────────

const AdminMarketingPage = dynamic(() => import("../marketing/page"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-8 text-center text-sm text-[#1a1a1a]/45">
      이메일 캠페인 도구를 불러오는 중...
    </div>
  ),
})

function ChartSkeleton({ className = "h-[260px]" }: { className?: string }) {
  return <div className={`${className} rounded-xl bg-[#f0f0ec]`} />
}

const EventFunnelCompareChart = dynamic(
  () => import("@/components/admin/campaigns/CampaignCharts").then((m) => m.EventFunnelCompareChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

const ChannelSpendPieChart = dynamic(
  () => import("@/components/admin/campaigns/CampaignCharts").then((m) => m.ChannelSpendPieChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[180px]" /> }
)

const KRW = new Intl.NumberFormat("ko-KR")
const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})
const won = (n: number | null | undefined) => (n == null ? "—" : KRW_CURRENCY.format(Math.round(n)))
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`)
const compact = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 })

function previewText(value: string | null | undefined, maxLength = 160) {
  const text = value?.replace(/\s+/g, " ").trim()
  if (!text) return null
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function money(value: number | null | undefined, currency = "USD") {
  if (value == null) return "—"
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  }
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

function statusTone(status: EventStatus): string {
  switch (status) {
    case "진행 중":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "예정":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "마감":
      return "bg-[#f0f0ec] text-[#1a1a1a]/40 border-[#e8e8e4]"
  }
}

function formatRange(startsAt: string, endsAt: string | null) {
  const s = new Date(startsAt)
  const sLabel = `${s.getMonth() + 1}/${s.getDate()}`
  if (!endsAt) return sLabel
  const e = new Date(endsAt)
  const eLabel = `${e.getMonth() + 1}/${e.getDate()}`
  return `${sLabel} ~ ${eLabel}`
}

// ─── attribution: 행사 ↔ 리드 ──────────────────────────────────────────────────
//   1) source/notes 필드에 event:<id> 또는 event:<slug> 토큰이 있으면 우선 매칭
//   2) 그 외에는 행사 기간 내 발생한 리드를 보조 집계로 사용
type EventLeadStats = { attributed: number; during: number }
type LeadLookupRow = { haystack: string; timestampMs: number }

function countEventLeadStats(leads: LeadLookupRow[], event: PublicEvent): EventLeadStats {
  const tokenId = `event:${event.id}`.toLowerCase()
  const tokenSlug = event.slug ? `event:${event.slug}`.toLowerCase() : null
  const startMs = new Date(event.startsAt).getTime()
  const endMs = event.endsAt ? new Date(event.endsAt).getTime() : Date.now()
  let attributed = 0
  let during = 0

  for (const lead of leads) {
    if (lead.haystack.includes(tokenId) || (tokenSlug && lead.haystack.includes(tokenSlug))) {
      attributed += 1
    }
    if (lead.timestampMs >= startMs && lead.timestampMs <= endMs) {
      during += 1
    }
  }

  return { attributed, during }
}

function buildFunnel(
  event: PublicEvent,
  metrics: EventMetrics,
  attributedCount: number,
  duringCount: number
): EventFunnel {
  // 명시적 매칭이 있으면 그것을, 없으면 기간 내 리드를 fallback
  const leads = attributedCount > 0 ? attributedCount : duringCount
  return {
    impressions: metrics.impressionsCount ?? 0,
    leads,
    applications: metrics.applicationsCount ?? 0,
    qualifiedLeads: metrics.qualifiedLeadsCount ?? 0,
    attendees: metrics.attendeesCount ?? 0,
    deals: metrics.dealsCount ?? 0,
  }
}

// ─── sub-tabs ─────────────────────────────────────────────────────────────────

type CampaignTab = "summary" | "events" | "meta" | "email"

const CAMPAIGN_TABS: Array<{ id: CampaignTab; label: string; sub: string }> = [
  { id: "summary", label: "요약", sub: "성과 · 전환 · 채널 분포" },
  { id: "events", label: "행사", sub: "행사별 퍼널 · 딜 전환" },
  { id: "meta", label: "Meta 광고", sub: "캠페인 현황 · 성과 · 상태 관리" },
  { id: "email", label: "이메일", sub: "구독자 · 이메일 발송 · 이력" },
]

type MetaDatePreset = "last_7d" | "last_30d" | "last_90d" | "this_month"

interface MetaCampaignRow {
  id: string
  name: string
  status: string
  effectiveStatus?: string
  objective?: string
  updatedTime?: string
  insights: {
    spend: number
    impressions: number
    reach: number
    clicks: number
    ctr: number | null
    cpc: number | null
    cpm: number | null
    leads: number
  }
}

interface MetaCampaignDashboard {
  account: {
    id: string
    name?: string
    accountStatus?: number
    currency?: string
    timezone?: string
    businessName?: string
  }
  datePreset: string
  campaigns: MetaCampaignRow[]
  summary: {
    campaignCount: number
    activeCount: number
    pausedCount: number
    spend: number
    impressions: number
    reach: number
    clicks: number
    leads: number
    ctr: number | null
    cpc: number | null
    cpm: number | null
  }
}

// ─── period filter ────────────────────────────────────────────────────────────

type Period = "active" | "30d" | "90d" | "all"

function eventInPeriod(event: PublicEvent, period: Period): boolean {
  if (period === "all") return true
  if (period === "active") return event.status === "진행 중" || event.status === "예정"
  const days = period === "30d" ? 30 : 90
  const cutoff = Date.now() - days * 24 * 3600 * 1000
  const end = event.endsAt ? new Date(event.endsAt).getTime() : new Date(event.startsAt).getTime()
  return end >= cutoff
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone?: "neutral" | "success" | "warn"
}) {
  const accent =
    tone === "success"
      ? "bg-[#ECFDF5] text-[#084734]"
      : tone === "warn"
        ? "bg-[#FEF3EE] text-[#B85C33]"
        : "bg-[#f0f0ec] text-[#1a1a1a]/55"
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <span className={`inline-flex rounded-xl p-2 ${accent}`}>{icon}</span>
      <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">{label}</p>
      <p className="mt-1.5 text-[22px] font-bold leading-none tracking-[-0.02em] text-[#111110]">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">{hint}</p>}
    </div>
  )
}

const META_DATE_OPTIONS: Array<{ value: MetaDatePreset; label: string }> = [
  { value: "last_7d", label: "7일" },
  { value: "last_30d", label: "30일" },
  { value: "last_90d", label: "90일" },
  { value: "this_month", label: "이번 달" },
]

function formatMetaDate(value?: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`
}

function MetaStatusPill({ status }: { status?: string }) {
  const normalized = status ?? "UNKNOWN"
  const tone =
    normalized === "ACTIVE"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "PAUSED"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-[#e8e8e4] bg-[#f0f0ec] text-[#1a1a1a]/45"

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}>
      {normalized}
    </span>
  )
}

function MetaCampaignPanel({
  dashboard,
  loading,
  error,
  datePreset,
  updatingId,
  onDatePresetChange,
  onRefresh,
  onToggleStatus,
}: {
  dashboard: MetaCampaignDashboard | null
  loading: boolean
  error: string | null
  datePreset: MetaDatePreset
  updatingId: string | null
  onDatePresetChange: (value: MetaDatePreset) => void
  onRefresh: () => void
  onToggleStatus: (campaign: MetaCampaignRow) => void
}) {
  const currency = dashboard?.account.currency ?? "USD"
  const campaigns = dashboard?.campaigns ?? []
  const summary = dashboard?.summary

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-xl bg-[#ECFDF5] p-2 text-[#084734]">
                <Activity className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[15px] font-bold text-[#111110]">
                  {dashboard?.account.name ?? "Meta 광고 계정"}
                </h2>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
                  {dashboard?.account.businessName ?? "Business"} · {dashboard?.account.id ?? "연결 확인 중"} · {dashboard?.account.timezone ?? "timezone"}
                </p>
              </div>
              {dashboard && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  연결됨
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="Meta 성과 기간">
              {META_DATE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onDatePresetChange(option.value)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                    datePreset === option.value ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              동기화
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Wallet className="w-3.5 h-3.5" />} label="Meta 광고비" value={loading && !dashboard ? "..." : money(summary?.spend, currency)} hint={`${datePreset} 기준`} />
        <KpiCard icon={<Target className="w-3.5 h-3.5" />} label="노출 / 전체 클릭" value={loading && !dashboard ? "..." : `${compact.format(summary?.impressions ?? 0)} / ${compact.format(summary?.clicks ?? 0)}`} hint={`CTR ${summary?.ctr != null ? summary.ctr.toFixed(2) + "%" : "—"}`} />
        <KpiCard icon={<Users className="w-3.5 h-3.5" />} label="리드" value={loading && !dashboard ? "..." : KRW.format(summary?.leads ?? 0)} hint={`CPC ${summary?.cpc != null ? money(summary.cpc, currency) : "—"}`} tone="success" />
        <KpiCard icon={<Activity className="w-3.5 h-3.5" />} label="캠페인 상태" value={loading && !dashboard ? "..." : `${summary?.activeCount ?? 0} 활성`} hint={`일시중지 ${summary?.pausedCount ?? 0} · 전체 ${summary?.campaignCount ?? 0}`} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-[14px] font-semibold text-[#111110]">Meta 캠페인</h2>
            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">상태 전환은 ACTIVE/PAUSED만 허용합니다.</p>
          </div>
          <a
            href="https://adsmanager.facebook.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
          >
            광고 관리자
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {loading && !dashboard ? (
          <p className="py-12 text-center text-[12px] text-[#1a1a1a]/30">Meta 캠페인을 불러오는 중입니다.</p>
        ) : campaigns.length === 0 ? (
          <p className="py-12 text-center text-[12px] text-[#1a1a1a]/30">표시할 Meta 캠페인이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#f0f0ec] text-left text-[12px]">
              <thead className="bg-[#fafaf8] text-[#1a1a1a]/45">
                <tr>
                  <th className="px-4 py-3 font-semibold">캠페인</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 text-right font-semibold">광고비</th>
                  <th className="px-4 py-3 text-right font-semibold">노출</th>
                  <th className="px-4 py-3 text-right font-semibold">전체 클릭</th>
                  <th className="px-4 py-3 text-right font-semibold">리드</th>
                  <th className="px-4 py-3 text-right font-semibold">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0ec]">
                {campaigns.map((campaign) => {
                  const isActive = campaign.status === "ACTIVE"
                  const nextStatus = isActive ? "PAUSED" : "ACTIVE"
                  return (
                    <tr key={campaign.id} className="align-middle">
                      <td className="max-w-[320px] px-4 py-3">
                        <p className="truncate font-semibold text-[#111110]">{campaign.name}</p>
                        <p className="mt-0.5 text-[10.5px] text-[#1a1a1a]/35">
                          {campaign.objective ?? "목표 없음"} · 업데이트 {formatMetaDate(campaign.updatedTime)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <MetaStatusPill status={campaign.effectiveStatus ?? campaign.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{money(campaign.insights.spend, currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{KRW.format(campaign.insights.impressions)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{KRW.format(campaign.insights.clicks)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{KRW.format(campaign.insights.leads)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onToggleStatus(campaign)}
                          disabled={updatingId === campaign.id || (campaign.status !== "ACTIVE" && campaign.status !== "PAUSED")}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {updatingId === campaign.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : nextStatus === "ACTIVE" ? (
                            <Play className="h-3.5 w-3.5" />
                          ) : (
                            <Pause className="h-3.5 w-3.5" />
                          )}
                          {nextStatus === "ACTIVE" ? "재개" : "중지"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function MetaLiveSummary({
  dashboard,
  loading,
  error,
  datePreset,
  onOpenMeta,
  onRefresh,
}: {
  dashboard: MetaCampaignDashboard | null
  loading: boolean
  error: string | null
  datePreset: MetaDatePreset
  onOpenMeta: () => void
  onRefresh: () => void
}) {
  const currency = dashboard?.account.currency ?? "USD"
  const summary = dashboard?.summary

  return (
    <div className="mb-5 rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex shrink-0 rounded-xl bg-[#ECFDF5] p-2 text-[#084734]">
            <Activity className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold text-[#111110]">Meta 라이브 현황</h2>
              {dashboard && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  연결됨
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#1a1a1a]/45">
              {dashboard
                ? `${dashboard.account.name ?? "Meta 광고 계정"} · ${dashboard.account.id} · ${datePreset} 기준`
                : "Meta Marketing API에서 캠페인 성과를 불러옵니다."}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            동기화
          </button>
          <button
            type="button"
            onClick={onOpenMeta}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#063d2a]"
          >
            Meta 광고 관리
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : loading && !dashboard ? (
        <p className="mt-4 rounded-xl border border-dashed border-[#e8e8e4] py-8 text-center text-[12px] text-[#1a1a1a]/30">
          Meta 캠페인 현황을 불러오는 중입니다.
        </p>
      ) : dashboard ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#1a1a1a]/35">광고비</p>
            <p className="mt-1 text-[20px] font-bold leading-none tracking-[-0.02em] text-[#111110]">
              {money(summary?.spend, currency)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#1a1a1a]/35">노출 / 전체 클릭</p>
            <p className="mt-1 text-[20px] font-bold leading-none tracking-[-0.02em] text-[#111110]">
              {compact.format(summary?.impressions ?? 0)} / {compact.format(summary?.clicks ?? 0)}
            </p>
            <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
              CTR {summary?.ctr != null ? `${summary.ctr.toFixed(2)}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#1a1a1a]/35">리드</p>
            <p className="mt-1 text-[20px] font-bold leading-none tracking-[-0.02em] text-[#084734]">
              {KRW.format(summary?.leads ?? 0)}
            </p>
            <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
              CPC {summary?.cpc != null ? money(summary.cpc, currency) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#1a1a1a]/35">상태</p>
            <p className="mt-1 text-[20px] font-bold leading-none tracking-[-0.02em] text-[#111110]">
              {summary?.activeCount ?? 0} 활성
            </p>
            <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
              일시중지 {summary?.pausedCount ?? 0} · 전체 {summary?.campaignCount ?? 0}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FunnelStage({
  label,
  value,
  prevValue,
  tone = "neutral",
}: {
  label: string
  value: number
  prevValue?: number | null
  tone?: "neutral" | "primary"
}) {
  const rate =
    prevValue != null && prevValue > 0 && value > 0 ? Math.round((value / prevValue) * 100) : null
  const bar =
    prevValue != null && prevValue > 0
      ? Math.max(8, Math.min(100, Math.round((value / prevValue) * 100)))
      : value > 0
        ? 100
        : 8
  const accent = tone === "primary" ? "bg-[#084734]" : "bg-[#111110]"
  return (
    <div className="rounded-xl border border-[#e8e8e4] bg-white px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium text-[#1a1a1a]/50">{label}</p>
        {rate != null && (
          <span className="text-[10px] font-medium text-[#1a1a1a]/35">{rate}%</span>
        )}
      </div>
      <p className="mt-1 text-[18px] font-bold leading-none tracking-[-0.02em] text-[#111110]">
        {KRW.format(value)}
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
        <div className={`h-full ${accent}`} style={{ width: `${bar}%` }} />
      </div>
    </div>
  )
}

function ConversionFocusCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string
  value: string
  hint: string
  tone?: "neutral" | "success" | "warn"
}) {
  const valueTone =
    tone === "success" ? "text-[#084734]" : tone === "warn" ? "text-[#B85C33]" : "text-[#111110]"

  return (
    <div className="rounded-xl border border-[#e8e8e4] bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">
        {label}
      </p>
      <p className={`mt-1 text-[20px] font-bold leading-none tracking-[-0.02em] ${valueTone}`}>
        {value}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-[#1a1a1a]/45">{hint}</p>
    </div>
  )
}

// ─── timeline (calendar bar) ──────────────────────────────────────────────────

function cssPercent(value: number) {
  return `${value.toFixed(3)}%`
}

let browserTimelineNow: Date | null = null

function subscribeTimelineNow() {
  return () => {}
}

function getBrowserTimelineNow() {
  if (typeof window === "undefined") return null
  browserTimelineNow ??= new Date()
  return browserTimelineNow
}

function getServerTimelineNow() {
  return null
}

function TimelineRow({ events }: { events: PublicEvent[] }) {
  const timelineNow = useSyncExternalStore(
    subscribeTimelineNow,
    getBrowserTimelineNow,
    getServerTimelineNow
  )

  function renderTimelineBody() {
    if (!timelineNow) {
      return (
        <div className="relative px-4 pb-5 pt-4 sm:px-6" aria-hidden="true">
          <div className="relative h-6 border-b border-dashed border-[#e8e8e4]" />
          <div className="mt-3 space-y-2">
            <div className="h-7 w-3/5 rounded-md bg-[#f0f0ec]" />
            <div className="h-7 w-2/5 rounded-md bg-[#f0f0ec]" />
          </div>
        </div>
      )
    }

    // 표시 범위: 현재 월 ±2개월 (5개월)
    const start = new Date(timelineNow.getFullYear(), timelineNow.getMonth() - 2, 1)
    const end = new Date(timelineNow.getFullYear(), timelineNow.getMonth() + 3, 0)
    const totalMs = end.getTime() - start.getTime()
    const months: { label: string; left: number }[] = []
    for (let m = -2; m <= 2; m++) {
      const d = new Date(timelineNow.getFullYear(), timelineNow.getMonth() + m, 1)
      months.push({
        label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`,
        left: ((d.getTime() - start.getTime()) / totalMs) * 100,
      })
    }
    const todayLeft = Math.max(0, Math.min(100, ((timelineNow.getTime() - start.getTime()) / totalMs) * 100))

    const sorted = [...events].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )

    return (
      <div className="relative px-4 pb-5 pt-4 sm:px-6">
        {/* month grid */}
        <div className="relative h-6 border-b border-dashed border-[#e8e8e4]">
          {months.map((m) => (
            <div
              key={m.label}
              className="absolute top-0 -translate-x-1/2 text-[10px] font-medium text-[#1a1a1a]/40"
              style={{ left: cssPercent(m.left) }}
            >
              {m.label}
            </div>
          ))}
          {/* today marker */}
          <div
            className="absolute top-0 h-full w-px bg-[#B85C33]"
            style={{ left: cssPercent(todayLeft) }}
          />
        </div>

        {sorted.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-[#1a1a1a]/30">표시할 행사가 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {sorted.map((event) => {
              const s = new Date(event.startsAt).getTime()
              const e = event.endsAt ? new Date(event.endsAt).getTime() : s + 24 * 3600 * 1000
              const left = Math.max(0, ((s - start.getTime()) / totalMs) * 100)
              const right = Math.min(100, ((e - start.getTime()) / totalMs) * 100)
              const width = Math.max(4, right - left)
              const color =
                event.status === "진행 중"
                  ? "bg-[#084734]"
                  : event.status === "예정"
                    ? "bg-[#1a73e8]"
                    : "bg-[#84827a]"
              return (
                <div key={event.id} className="relative h-7">
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 rounded-md ${color} px-2 py-1 text-[11px] font-medium text-white truncate shadow-sm`}
                    style={{ left: cssPercent(left), width: cssPercent(width), minWidth: "60px" }}
                    title={`${event.title} · ${formatRange(event.startsAt, event.endsAt)}`}
                  >
                    {event.title}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">캘린더 타임라인</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">현재 월 ±2개월의 행사 진척 현황입니다.</p>
        </div>
        <Link
          href="/admin/calendar"
          className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          전체 캘린더
        </Link>
      </div>

      {renderTimelineBody()}
    </div>
  )
}

// ─── event card ───────────────────────────────────────────────────────────────

function EventFunnelCard({
  event,
  metrics,
  attributedLeadCount,
  duringLeadCount,
  onEdit,
}: {
  event: PublicEvent
  metrics: EventMetrics
  attributedLeadCount: number
  duringLeadCount: number
  onEdit: () => void
}) {
  const funnel = buildFunnel(event, metrics, attributedLeadCount, duringLeadCount)
  const economics = computeEconomics(funnel, metrics)

  const targetProgress =
    metrics.targetLeads != null && metrics.targetLeads > 0
      ? Math.min(100, Math.round((funnel.leads / metrics.targetLeads) * 100))
      : null
  const detailPreview = previewText(event.description) ?? previewText(event.contentMarkdown)
  const publicHref = event.slug ? `/events/${event.slug}` : null
  const dealCustomersPreview = previewText(metrics.dealCustomers, 120)
  const retrospectivePreview = previewText(metrics.retrospective, 180)
  const shareMemoPreview = previewText(metrics.shareMemo, 180)
  const leadSourceLabel =
    attributedLeadCount > 0
      ? `명시 매칭 ${KRW.format(attributedLeadCount)}건`
      : duringLeadCount > 0
        ? `기간 fallback ${KRW.format(duringLeadCount)}건`
        : "집계 리드 없음"

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      {/* header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(event.status)}`}
            >
              {event.status}
            </span>
            <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55">
              {event.category}
            </span>
            {event.tag && (
              <span className="rounded-full bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-medium text-[#B85C33]">
                {event.tag}
              </span>
            )}
          </div>
          <h3 className="truncate text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
            {event.title}
          </h3>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
            {formatRange(event.startsAt, event.endsAt)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
        <button
          onClick={onEdit}
          className="shrink-0 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 transition-colors hover:text-[#111110]"
        >
          성과 입력
        </button>
      </div>

      <div className="mb-3 border-y border-[#f0f0ec] py-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/35">
              행사 정보
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/60">
              {detailPreview ?? "설명 또는 상세 본문이 아직 입력되지 않았습니다."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#1a1a1a]/45">
              <span>CTA: {event.ctaLabel}</span>
              {event.ctaHref && <span className="max-w-[220px] truncate">링크: {event.ctaHref}</span>}
              {publicHref && (
                <Link
                  href={publicHref}
                  className="inline-flex items-center gap-1 font-medium text-[#084734] hover:underline"
                >
                  상세 페이지
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
          <dl className="grid gap-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">공개 상태</dt>
              <dd className="font-semibold text-[#111110]">
                {event.publicationStatus === "published" ? "공개" : "초안"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">리드 집계</dt>
              <dd className="font-semibold text-[#111110]">{leadSourceLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">성사 고객</dt>
              <dd className="font-semibold text-[#111110]">
                {metrics.closedCustomerCount != null ? `${KRW.format(metrics.closedCustomerCount)}곳` : "미입력"}
              </dd>
            </div>
            {dealCustomersPreview && (
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-[#1a1a1a]/40">고객</dt>
                <dd className="min-w-0 text-right font-semibold text-[#111110]">{dealCustomersPreview}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">성과 업데이트</dt>
              <dd className="font-semibold text-[#111110]">
                {metrics.updatedAt ? formatMetaDate(metrics.updatedAt) : "미입력"}
              </dd>
            </div>
          </dl>
        </div>
        {(metrics.notes || retrospectivePreview || shareMemoPreview) && (
          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            {metrics.notes && (
              <p className="rounded-lg bg-[#fafaf8] px-3 py-2 text-[11px] leading-relaxed text-[#1a1a1a]/55">
                <span className="font-semibold text-[#111110]">내부 메모</span>
                <span className="ml-2">{metrics.notes}</span>
              </p>
            )}
            {retrospectivePreview && (
              <p className="rounded-lg bg-[#fafaf8] px-3 py-2 text-[11px] leading-relaxed text-[#1a1a1a]/55">
                <span className="font-semibold text-[#111110]">회고</span>
                <span className="ml-2">{retrospectivePreview}</span>
              </p>
            )}
            {shareMemoPreview && (
              <p className="rounded-lg bg-[#ECFDF5] px-3 py-2 text-[11px] leading-relaxed text-[#084734]">
                <span className="font-semibold">공유 포인트</span>
                <span className="ml-2">{shareMemoPreview}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* economics row */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">광고비</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{won(economics.adSpendTotal)}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">매출</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{won(economics.revenue)}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">CPL</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{economics.cpl != null ? won(economics.cpl) : "—"}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">ROI</p>
          <p
            className={`mt-0.5 text-[14px] font-bold ${
              economics.roi == null
                ? "text-[#1a1a1a]/30"
                : economics.roi >= 0
                  ? "text-[#084734]"
                  : "text-[#B85C33]"
            }`}
          >
            {pct(economics.roi)}
          </p>
        </div>
      </div>

      {/* target progress */}
      {targetProgress != null && (
        <div className="mb-3 rounded-xl bg-[#ECFDF5] px-3 py-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-[#084734]">리드 목표 달성</span>
            <span className="text-[#084734]">
              {KRW.format(funnel.leads)} / {KRW.format(metrics.targetLeads ?? 0)} · {targetProgress}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
            <div className="h-full bg-[#084734]" style={{ width: `${targetProgress}%` }} />
          </div>
        </div>
      )}

      {/* 퍼널 */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        <FunnelStage label="노출" value={funnel.impressions} />
        <FunnelStage label="리드" value={funnel.leads} prevValue={funnel.impressions || null} tone="primary" />
        <FunnelStage label="신청" value={funnel.applications} prevValue={funnel.leads || null} />
        <FunnelStage label="유효 리드" value={funnel.qualifiedLeads} prevValue={funnel.applications || null} />
        <FunnelStage label="참석" value={funnel.attendees} prevValue={funnel.applications || null} />
        <FunnelStage label="딜" value={funnel.deals} prevValue={funnel.qualifiedLeads || null} tone="primary" />
      </div>

      {/* sub metrics */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">유효 전환</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.leadConversionRate)}</span>
        </div>
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">참석률</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.attendanceRate)}</span>
        </div>
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">딜 전환</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.dealConversionRate)}</span>
        </div>
      </div>

      {/* attribution hint */}
      {attributedLeadCount === 0 && duringLeadCount > 0 && (
        <p className="mt-3 text-[11px] text-[#1a1a1a]/40">
          ⓘ 행사 기간 내 리드 {duringLeadCount}건을 fallback 집계로 사용 중. 정확한 집계를 위해 리드의 source/notes에{" "}
          <code className="rounded bg-[#f0f0ec] px-1 font-mono text-[10px] text-[#111110]">
            event:{event.slug ?? event.id}
          </code>{" "}
          토큰을 추가하세요.
        </p>
      )}
    </div>
  )
}

// ─── metrics edit drawer ──────────────────────────────────────────────────────

function MetricsEditor({
  event,
  metrics,
  onClose,
  onSaved,
}: {
  event: PublicEvent
  metrics: EventMetrics
  onClose: () => void
  onSaved: (m: EventMetrics) => void
}) {
  const [form, setForm] = useState({
    targetLeads: metrics.targetLeads,
    targetRevenue: metrics.targetRevenue,
    impressionsCount: metrics.impressionsCount,
    applicationsCount: metrics.applicationsCount,
    qualifiedLeadsCount: metrics.qualifiedLeadsCount,
    attendeesCount: metrics.attendeesCount,
    dealsCount: metrics.dealsCount,
    dealsRevenue: metrics.dealsRevenue,
    closedCustomerCount: metrics.closedCustomerCount,
    dealCustomers: metrics.dealCustomers ?? "",
    notes: metrics.notes ?? "",
    retrospective: metrics.retrospective ?? "",
    shareMemo: metrics.shareMemo ?? "",
  })
  const [adSpend, setAdSpend] = useState<AdSpendEntry[]>(metrics.adSpendEntries ?? [])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const updateNum = (key: keyof typeof form, v: string) => {
    if (v === "") return update(key, null as never)
    const n = Number(v)
    if (Number.isFinite(n)) update(key, n as never)
  }

  async function handleSave() {
    setSaving(true)
    setErr(null)
    try {
      const saved = await adminFetchJson<EventMetrics>(
        `/api/admin/event-metrics/${event.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...form,
            dealCustomers: form.dealCustomers.trim() || null,
            notes: form.notes.trim() || null,
            retrospective: form.retrospective.trim() || null,
            shareMemo: form.shareMemo.trim() || null,
            adSpendEntries: adSpend,
          }),
        }
      )
      onSaved(saved)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  function addAdEntry() {
    setAdSpend((arr) => [...arr, { channel: "google", amount: 0, note: "" }])
  }
  function updateAdEntry(idx: number, patch: Partial<AdSpendEntry>) {
    setAdSpend((arr) => arr.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function removeAdEntry(idx: number) {
    setAdSpend((arr) => arr.filter((_, i) => i !== idx))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/35">
              성과 입력
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-[#111110]">{event.title}</h2>
            <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">{formatRange(event.startsAt, event.endsAt)}</p>
          </div>
          <button onClick={onClose} className="text-[#1a1a1a]/40 hover:text-[#111110]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[calc(100dvh-9rem)] space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {err}
            </div>
          )}

          {/* 목표 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              목표
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumInput label="목표 리드 수" value={form.targetLeads} onChange={(v) => updateNum("targetLeads", v)} />
              <NumInput label="목표 매출 (원)" value={form.targetRevenue} onChange={(v) => updateNum("targetRevenue", v)} />
            </div>
          </section>

          {/* 퍼널 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              퍼널 단계
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumInput label="노출 수" value={form.impressionsCount} onChange={(v) => updateNum("impressionsCount", v)} />
              <NumInput label="신청자 수" value={form.applicationsCount} onChange={(v) => updateNum("applicationsCount", v)} />
              <NumInput label="유효 리드 수" value={form.qualifiedLeadsCount} onChange={(v) => updateNum("qualifiedLeadsCount", v)} />
              <NumInput label="참석자 수" value={form.attendeesCount} onChange={(v) => updateNum("attendeesCount", v)} />
              <NumInput label="딜 수" value={form.dealsCount} onChange={(v) => updateNum("dealsCount", v)} />
              <NumInput label="딜 매출 (원)" value={form.dealsRevenue} onChange={(v) => updateNum("dealsRevenue", v)} />
            </div>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">
              ※ 리드 수는 리드 DB에서 자동 집계됩니다 (수동 입력 불필요).
            </p>
          </section>

          {/* 딜 성과 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              딜 성과
            </h3>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <NumInput
                label="실제 성사 고객 수"
                value={form.closedCustomerCount}
                onChange={(v) => updateNum("closedCustomerCount", v)}
                min={0}
                step={1}
              />
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">성사 고객 / 기관</label>
                <textarea
                  value={form.dealCustomers}
                  onChange={(e) => update("dealCustomers", e.target.value)}
                  rows={3}
                  placeholder="예: ○○학원, △△캠퍼스 / 담당자 / 후속 액션"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* 광고비 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
                광고비 (채널별)
              </h3>
              <button
                onClick={addAdEntry}
                className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
              >
                <Plus className="w-3 h-3" />
                채널 추가
              </button>
            </div>
            {adSpend.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-[#1a1a1a]/30">
                채널을 추가하여 광고비를 입력하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {adSpend.map((entry, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[110px_1fr_auto] items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-2 py-1.5 sm:grid-cols-[140px_1fr_1fr_auto]"
                  >
                    <select
                      value={entry.channel}
                      onChange={(e) => updateAdEntry(idx, { channel: e.target.value as AdChannel })}
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    >
                      {(Object.keys(AD_CHANNEL_LABEL) as AdChannel[]).map((c) => (
                        <option key={c} value={c}>
                          {AD_CHANNEL_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="금액 (원)"
                      value={entry.amount === 0 ? "" : entry.amount}
                      onChange={(e) =>
                        updateAdEntry(idx, { amount: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    />
                    <input
                      type="text"
                      placeholder="메모 (선택)"
                      value={entry.note ?? ""}
                      onChange={(e) => updateAdEntry(idx, { note: e.target.value })}
                      className="hidden rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px] sm:block"
                    />
                    <button
                      onClick={() => removeAdEntry(idx)}
                      className="rounded-md p-1.5 text-[#1a1a1a]/40 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 메모 / 회고 */}
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
              메모 / 회고
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">내부 메모 / 다음 액션</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={3}
                  placeholder="운영 중 이슈, 후속 연락, 다음 액션"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">회고</label>
                <textarea
                  value={form.retrospective}
                  onChange={(e) => update("retrospective", e.target.value)}
                  rows={3}
                  placeholder="잘된 점, 아쉬운 점, 다음 행사에 반영할 점"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">공유 포인트</label>
                <textarea
                  value={form.shareMemo}
                  onChange={(e) => update("shareMemo", e.target.value)}
                  rows={3}
                  placeholder="팀에 공유할 핵심 포인트. 예: 부산권 원장님들은 하이브리드 수업보다 신규반 모집 사례에 반응"
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e8e8e4] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-[#1a1a1a]/55 hover:text-[#111110]">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#111110] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#084734] disabled:opacity-40"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  )
}

function NumInput({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string
  value: number | null
  onChange: (v: string) => void
  min?: number
  step?: number
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-[#1a1a1a]/50">{label}</label>
      <input
        type="number"
        value={value == null ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        step={step}
        className="w-full rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] focus:border-[#111110]/30 focus:outline-none"
      />
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function AdminCampaignsPage() {
  const [tabParam, setTabParam] = useUrlState("tab", "summary")
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [metricsMap, setMetricsMap] = useState<Record<string, EventMetrics>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>("all")
  const [editing, setEditing] = useState<PublicEvent | null>(null)
  const [metaDashboard, setMetaDashboard] = useState<MetaCampaignDashboard | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaDatePreset, setMetaDatePreset] = useState<MetaDatePreset>("last_30d")
  const [metaUpdatingId, setMetaUpdatingId] = useState<string | null>(null)
  const activeTab: CampaignTab = CAMPAIGN_TABS.some((tab) => tab.id === tabParam)
    ? (tabParam as CampaignTab)
    : "summary"

  const load = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    setLoading(true)
    setError(null)
    try {
      const [ev, leadData, metricData] = await Promise.all([
        adminFetchJsonCached<PublicEvent[]>("/api/admin/events", undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
        adminFetchJsonCached<{ leads: LeadRecord[] }>("/api/admin/leads", undefined, {
          ttlMs: 45_000,
          force,
          staleIfError: !force,
        }),
        adminFetchJsonCached<{ metrics: Record<string, EventMetrics> }>("/api/admin/event-metrics", undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
      ])
      setEvents(ev)
      setLeads(leadData.leads)
      setMetricsMap(metricData.metrics)
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로딩 실패")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadMeta = useCallback(async () => {
    setMetaLoading(true)
    setMetaError(null)
    try {
      const data = await adminFetchJson<MetaCampaignDashboard & { ok: boolean }>(
        `/api/admin/meta/campaigns?datePreset=${metaDatePreset}&limit=50`
      )
      setMetaDashboard(data)
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : "Meta 캠페인 로딩 실패")
    } finally {
      setMetaLoading(false)
    }
  }, [metaDatePreset])

  useEffect(() => {
    if (activeTab === "summary" || activeTab === "meta") {
      loadMeta()
    }
  }, [activeTab, loadMeta])

  const toggleMetaCampaignStatus = useCallback(
    async (campaign: MetaCampaignRow) => {
      const nextStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE"
      const actionLabel = nextStatus === "ACTIVE" ? "재개" : "중지"
      const confirmed = window.confirm(
        `${campaign.name} 캠페인을 ${actionLabel}할까요?\n\n이 작업은 Meta 광고 관리자에 바로 반영됩니다.`
      )
      if (!confirmed) return

      setMetaUpdatingId(campaign.id)
      setMetaError(null)
      try {
        await adminFetchJson(`/api/admin/meta/campaigns/${campaign.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        })
        await loadMeta()
      } catch (e) {
        setMetaError(e instanceof Error ? e.message : "Meta 캠페인 상태 변경 실패")
      } finally {
        setMetaUpdatingId(null)
      }
    },
    [loadMeta]
  )

  const filtered = useMemo(
    () => events.filter((ev) => eventInPeriod(ev, period)),
    [events, period]
  )

  const leadLookupRows = useMemo<LeadLookupRow[]>(
    () =>
      leads.map((lead) => ({
        haystack: `${lead.source ?? ""} ${lead.notes ?? ""}`.toLowerCase(),
        timestampMs: new Date(lead.timestamp).getTime(),
      })),
    [leads]
  )

  const eventLeadStats = useMemo(() => {
    const stats = new Map<string, EventLeadStats>()
    for (const event of filtered) {
      stats.set(event.id, countEventLeadStats(leadLookupRows, event))
    }
    return stats
  }, [filtered, leadLookupRows])

  // 집계 (전체 KPI)
  const aggregate = useMemo(() => {
    let totalSpend = 0
    let totalRevenue = 0
    let totalLeads = 0
    let totalDeals = 0
    let totalAttendees = 0
    const channelTotals: Record<AdChannel, number> = {
      google: 0,
      meta: 0,
      naver: 0,
      kakao: 0,
      youtube: 0,
      offline: 0,
      other: 0,
    }
    for (const ev of filtered) {
      const metrics = metricsMap[ev.id] ?? {
        ...DEFAULT_EVENT_METRICS,
        eventId: ev.id,
        updatedAt: "",
      }
      const leadStats = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
      const attributed = leadStats.attributed
      const during = leadStats.during
      const funnel = buildFunnel(ev, metrics, attributed, during)
      const econ = computeEconomics(funnel, metrics)
      totalSpend += econ.adSpendTotal
      totalRevenue += econ.revenue
      totalLeads += funnel.leads
      totalDeals += funnel.deals
      totalAttendees += funnel.attendees
      for (const e of metrics.adSpendEntries) channelTotals[e.channel] += e.amount
    }
    const avgCpl = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : null
    const overallRoi = totalSpend > 0 ? Math.round(((totalRevenue - totalSpend) / totalSpend) * 100) : null
    const dealConversionRate = totalLeads > 0 ? Math.round((totalDeals / totalLeads) * 100) : null
    const attendanceToDealRate =
      totalAttendees > 0 ? Math.round((totalDeals / totalAttendees) * 100) : null
    return {
      totalSpend,
      totalRevenue,
      totalLeads,
      totalDeals,
      totalAttendees,
      avgCpl,
      overallRoi,
      dealConversionRate,
      attendanceToDealRate,
      channelTotals,
    }
  }, [eventLeadStats, filtered, metricsMap])

  const channelChartData = useMemo(
    () =>
      (Object.entries(aggregate.channelTotals) as [AdChannel, number][])
        .filter(([, v]) => v > 0)
        .map(([channel, value]) => ({
          channel,
          name: AD_CHANNEL_LABEL[channel],
          value,
          color: AD_CHANNEL_COLOR[channel],
        })),
    [aggregate.channelTotals]
  )

  const compareChartData = useMemo(
    () =>
      filtered
        .map((ev) => {
          const metrics = metricsMap[ev.id] ?? {
            ...DEFAULT_EVENT_METRICS,
            eventId: ev.id,
            updatedAt: "",
          }
          const leadStats = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
          const attributed = leadStats.attributed
          const during = leadStats.during
          const funnel = buildFunnel(ev, metrics, attributed, during)
          return {
            name: ev.title.length > 14 ? ev.title.slice(0, 13) + "…" : ev.title,
            리드: funnel.leads,
            신청: funnel.applications,
            참석: funnel.attendees,
            딜: funnel.deals,
          }
        })
        .slice(0, 10),
    [eventLeadStats, filtered, metricsMap]
  )

  const showFilterRow = activeTab === "summary" || activeTab === "events"
  const refreshLoading =
    activeTab === "meta" ? metaLoading : activeTab === "summary" ? loading || metaLoading : loading
  const refreshCurrent = useCallback(() => {
    if (activeTab === "meta") {
      void loadMeta()
      return
    }
    if (activeTab === "summary") {
      void Promise.all([load({ force: true }), loadMeta()])
      return
    }
    void load({ force: true })
  }, [activeTab, load, loadMeta])

  return (
    <div className="pb-24">
      {/* TopBar — branch admin과 동일한 패턴 */}
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pb-5 pt-6 sm:px-6 lg:px-9 lg:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#615D59]">
              <span>ADMIN</span>
              <span className="opacity-50">›</span>
              <span>그로스</span>
              <span className="opacity-50">›</span>
              <span>캠페인</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">
              캠페인
            </h1>
            <p className="mt-2 max-w-[720px] text-[13px] leading-relaxed text-[#615D59]">
              행사·광고·이메일을 성과 단위로 운영합니다. 리드 확보부터 참석, 딜 전환, 매출 회수까지 한 화면에서 추적합니다.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={refreshCurrent}
              disabled={refreshLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshLoading ? "animate-spin" : ""}`} />
              동기화
            </button>
            <Link
              href="/admin/events"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#063d2a]"
            >
              <Plus className="w-3.5 h-3.5" />
              행사 관리
            </Link>
          </div>
        </div>

        {showFilterRow && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="기간 필터">
              {(["active", "30d", "90d", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                    period === p ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                  }`}
                >
                  {p === "active" ? "진행중·예정" : p === "30d" ? "30일" : p === "90d" ? "90일" : "전체"}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Sub-tabs — branch admin 스타일 */}
      <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#EBE8E2] px-2 sm:px-4 lg:px-9">
        <AdminTabs
          className="-mb-px py-2"
          label="캠페인 보기"
          variant="subtle"
          items={CAMPAIGN_TABS.map((tab) => ({
            value: tab.id,
            label: tab.label,
            description: tab.sub,
            icon:
              tab.id === "meta" ? (
                <Activity className="h-3.5 w-3.5" />
              ) : tab.id === "email" ? (
                <Mail className="h-3.5 w-3.5" />
              ) : undefined,
          }))}
          value={activeTab}
          onValueChange={setTabParam}
        />
      </div>

      {/* Tab content */}
      {activeTab === "email" ? (
        <div className="bg-[#FAFAF8]">
          <AdminMarketingPage />
        </div>
      ) : activeTab === "meta" ? (
        <div className="px-4 pt-6 sm:px-6 lg:px-9">
          <MetaCampaignPanel
            dashboard={metaDashboard}
            loading={metaLoading}
            error={metaError}
            datePreset={metaDatePreset}
            updatingId={metaUpdatingId}
            onDatePresetChange={setMetaDatePreset}
            onRefresh={loadMeta}
            onToggleStatus={toggleMetaCampaignStatus}
          />
        </div>
      ) : (
        <div className="px-4 pt-6 sm:px-6 lg:px-9">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              {error}
            </div>
          )}

      {activeTab === "summary" && (
        <>
      <MetaLiveSummary
        dashboard={metaDashboard}
        loading={metaLoading}
        error={metaError}
        datePreset={metaDatePreset}
        onOpenMeta={() => setTabParam("meta")}
        onRefresh={loadMeta}
      />

      {/* KPI strip */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={<CalendarIcon className="w-3.5 h-3.5" />}
          label="대상 행사"
          value={loading ? "..." : KRW.format(filtered.length)}
          hint={`전체 ${events.length}건 중`}
        />
        <KpiCard
          icon={<Wallet className="w-3.5 h-3.5" />}
          label="총 광고비"
          value={loading ? "..." : won(aggregate.totalSpend)}
        />
        <KpiCard
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="총 매출"
          value={loading ? "..." : won(aggregate.totalRevenue)}
          tone="success"
        />
        <KpiCard
          icon={<Target className="w-3.5 h-3.5" />}
          label="평균 CPL"
          value={loading ? "..." : aggregate.avgCpl != null ? won(aggregate.avgCpl) : "—"}
          hint={`총 리드 ${KRW.format(aggregate.totalLeads)}`}
        />
        <KpiCard
          icon={<Users className="w-3.5 h-3.5" />}
          label="총 참석자"
          value={loading ? "..." : KRW.format(aggregate.totalAttendees)}
          hint={`딜 ${KRW.format(aggregate.totalDeals)}건`}
        />
        <KpiCard
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="누적 ROI"
          value={loading ? "..." : aggregate.overallRoi != null ? pct(aggregate.overallRoi) : "—"}
          tone={aggregate.overallRoi != null && aggregate.overallRoi >= 0 ? "success" : "warn"}
        />
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-3">
        <ConversionFocusCard
          label="전환 초점"
          value={loading ? "..." : aggregate.dealConversionRate != null ? pct(aggregate.dealConversionRate) : "—"}
          hint={`리드 ${KRW.format(aggregate.totalLeads)}건 중 딜 ${KRW.format(aggregate.totalDeals)}건`}
          tone={aggregate.dealConversionRate != null && aggregate.dealConversionRate > 0 ? "success" : "neutral"}
        />
        <ConversionFocusCard
          label="참석 후 딜"
          value={loading ? "..." : aggregate.attendanceToDealRate != null ? pct(aggregate.attendanceToDealRate) : "—"}
          hint={`참석자 ${KRW.format(aggregate.totalAttendees)}명 기준 후속 영업 전환`}
          tone={aggregate.attendanceToDealRate != null && aggregate.attendanceToDealRate > 0 ? "success" : "neutral"}
        />
        <ConversionFocusCard
          label="운영 판단"
          value={loading ? "..." : aggregate.overallRoi != null ? (aggregate.overallRoi >= 0 ? "확대 검토" : "비용 점검") : "집계 대기"}
          hint="ROI와 CPL을 함께 보고 예산 증액, 문구 수정, 후속 연락을 결정합니다."
          tone={aggregate.overallRoi == null ? "neutral" : aggregate.overallRoi >= 0 ? "success" : "warn"}
        />
      </div>

      {/* timeline */}
      <div className="mb-5">
        <TimelineRow events={filtered} />
      </div>

      {/* charts */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5 lg:col-span-2">
          <h2 className="mb-3 text-[14px] font-semibold text-[#111110]">행사별 퍼널 비교</h2>
          {compareChartData.length === 0 ? (
            <p className="py-12 text-center text-[12px] text-[#1a1a1a]/30">표시할 데이터가 없습니다.</p>
          ) : (
            <div className="h-[260px] w-full">
              <EventFunnelCompareChart data={compareChartData} />
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-[14px] font-semibold text-[#111110]">광고비 채널 분포</h2>
          {channelChartData.length === 0 ? (
            <p className="py-12 text-center text-[12px] text-[#1a1a1a]/30">광고비가 입력되지 않았습니다.</p>
          ) : (
            <>
              <div className="h-[180px] w-full">
                <ChannelSpendPieChart data={channelChartData} />
              </div>
              <div className="mt-2 space-y-1">
                {channelChartData.map((entry) => (
                  <div key={entry.channel} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-[#1a1a1a]/55">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: entry.color }} />
                      {entry.name}
                    </span>
                    <span className="font-semibold text-[#111110]">{won(entry.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
        </>
      )}

      {activeTab === "events" && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#111110]">행사별 퍼널 상세</h2>
            <button
              onClick={() => {
                setPeriod((p) => (p === "all" ? "active" : "all"))
              }}
              className="flex items-center gap-1 text-[12px] font-medium text-[#1a1a1a]/45 hover:text-[#111110]"
            >
              {period === "all" ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {period === "all" ? "축소" : "전체 기간 보기"}
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-16 text-center text-[13px] text-[#1a1a1a]/30">
              불러오는 중...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-12 text-center">
              <p className="text-[14px] font-medium text-[#111110]">표시할 행사가 없습니다</p>
              <p className="mx-auto mt-1 max-w-md text-[12px] text-[#1a1a1a]/40">
                기간 필터를 바꾸거나 행사 관리에서 새 행사를 등록하세요.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((event) => {
                const metrics = metricsMap[event.id] ?? {
                  ...DEFAULT_EVENT_METRICS,
                  eventId: event.id,
                  updatedAt: "",
                }
                const leadStats = eventLeadStats.get(event.id) ?? { attributed: 0, during: 0 }
                return (
                  <EventFunnelCard
                    key={event.id}
                    event={event}
                    metrics={metrics}
                    attributedLeadCount={leadStats.attributed}
                    duringLeadCount={leadStats.during}
                    onEdit={() => setEditing(event)}
                  />
                )
              })}
            </div>
          )}
        </>
      )}
        </div>
      )}

      {editing && (
        <MetricsEditor
          event={editing}
          metrics={
            metricsMap[editing.id] ?? {
              ...DEFAULT_EVENT_METRICS,
              eventId: editing.id,
              updatedAt: "",
            }
          }
          onClose={() => setEditing(null)}
          onSaved={(saved) => setMetricsMap((m) => ({ ...m, [saved.eventId]: saved }))}
        />
      )}
    </div>
  )
}

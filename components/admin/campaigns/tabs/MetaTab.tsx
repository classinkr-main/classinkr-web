"use client"

import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import dynamic from "next/dynamic"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  Users,
  Wallet,
} from "lucide-react"
import { ChartSkeleton, EmptyState } from "@/components/admin/viz"
import { CampaignExportButton } from "@/components/admin/campaigns/CampaignExportButton"
import type { ExportColumn } from "@/components/admin/campaigns/CampaignExportButton"
import { ChannelBudgetTable } from "@/components/admin/campaigns/ChannelBudgetTable"
import { EventMetricsQuickTable } from "@/components/admin/campaigns/EventMetricsQuickTable"
import AdLeadsPanel from "@/components/admin/campaigns/leads/AdLeadsPanel"
import type { ChannelEfficiencyRow } from "@/components/admin/campaigns/ChannelEfficiencyChart"
import type { MetaPerfRow } from "@/components/admin/campaigns/MetaPerformanceCharts"
import { KRW, compact, formatMetaDate, money } from "@/components/admin/campaigns/event-format"
import { PeriodToggle, type PeriodOption } from "@/components/admin/PeriodToggle"
import { adminFetchJson } from "@/lib/admin-client"
import { metaObjectiveLabel } from "@/lib/marketing/campaign-labels"
import type { AdCreativePerf } from "@/lib/marketing/creative-input"
import type { LeadRecord } from "@/lib/repositories/leads"
import { DEFAULT_EVENT_METRICS, type AdChannel, type EventMetrics } from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"
import { KpiCard } from "./KpiCard"
import type {
  CampaignAggregate,
  MetaCampaignDashboard,
  MetaCampaignRow,
  MetaDatePreset,
  PerEventEconRow,
} from "./types"

// 성과 편집기는 연필을 누르기 전까지 탭 청크에 실리지 않게 지연 로드한다.
const MetricsEditor = dynamic(() => import("./MetricsEditor"), { ssr: false })

const MetaPerformanceCharts = dynamic(
  () => import("@/components/admin/campaigns/MetaPerformanceCharts").then((m) => m.MetaPerformanceCharts),
  { ssr: false, loading: () => <ChartSkeleton className="h-[260px]" /> }
)

const META_DATE_OPTIONS: Array<{ value: MetaDatePreset; label: string }> = [
  { value: "last_7d", label: "7일" },
  { value: "last_30d", label: "30일" },
  { value: "last_90d", label: "90일" },
  { value: "this_month", label: "이번 달" },
]

function MetaStatusPill({ status }: { status?: string }) {
  const normalized = status ?? "UNKNOWN"
  const tone =
    normalized === "ACTIVE"
      ? "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]"
      : normalized === "PAUSED"
        ? "border-[#ECD29C] bg-[#FBF1E0] text-[#A8741A]"
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
                <h2 className="text-[14px] font-bold text-[#111110]">
                  {dashboard?.account.name ?? "Meta 광고 계정"}
                </h2>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
                  {dashboard?.account.businessName ?? "Business"} · {dashboard?.account.id ?? "연결 확인 중"} · {dashboard?.account.timezone ?? "timezone"}
                </p>
              </div>
              {dashboard && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-bold text-[#084734]">
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
                  aria-pressed={datePreset === option.value}
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
        <div className="flex items-start gap-2 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[13px] text-[#B43E3E]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Wallet className="w-3.5 h-3.5" />} label="Meta 광고비" value={loading && !dashboard ? "..." : money(summary?.spend, currency)} hint={`${datePreset} 기준`} />
        <KpiCard icon={<Target className="w-3.5 h-3.5" />} label="노출 / 전체 클릭" value={loading && !dashboard ? "..." : `${compact.format(summary?.impressions ?? 0)} / ${compact.format(summary?.clicks ?? 0)}`} hint={`CTR ${summary?.ctr != null ? summary.ctr.toFixed(2) + "%" : "—"}`} />
        <KpiCard icon={<Users className="w-3.5 h-3.5" />} label="리드" value={loading && !dashboard ? "..." : KRW.format(summary?.leads ?? 0)} hint={`CPL ${summary && summary.leads > 0 ? money(summary.spend / summary.leads, currency) : "—"}`} tone="success" />
        <KpiCard icon={<Activity className="w-3.5 h-3.5" />} label="캠페인 상태" value={loading && !dashboard ? "..." : `${summary?.activeCount ?? 0} 활성`} hint={`일시중지 ${summary?.pausedCount ?? 0} · 전체 ${summary?.campaignCount ?? 0}`} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
          <h2 className="text-[14px] font-semibold text-[#111110]">Meta 캠페인</h2>
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
          <p className="py-12 text-center text-[12px] text-[#A39E98]">Meta 캠페인을 불러오는 중입니다.</p>
        ) : campaigns.length === 0 ? (
          <p className="py-12 text-center text-[12px] text-[#A39E98]">표시할 Meta 캠페인이 없습니다.</p>
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
                  <th className="px-4 py-3 text-right font-semibold">CPL</th>
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
                          {metaObjectiveLabel(campaign.objective) ?? "목표 없음"} · 업데이트 {formatMetaDate(campaign.updatedTime)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <MetaStatusPill status={campaign.effectiveStatus ?? campaign.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{money(campaign.insights.spend, currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{KRW.format(campaign.insights.impressions)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{KRW.format(campaign.insights.clicks)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#111110]">{KRW.format(campaign.insights.leads)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {campaign.insights.leads > 0 ? (
                          <span className="font-semibold text-[#084734]">
                            {money(campaign.insights.spend / campaign.insights.leads, currency)}
                          </span>
                        ) : (
                          <span className="text-[#A39E98]">—</span>
                        )}
                      </td>
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

// ─── AI 소재 제안 ─────────────────────────────────────────────────────────
// 정직 규칙: Meta Graph 는 캠페인 레벨 insights 만 수집한다 — 소재(ad)별 광고비·CPL 은 어디에도
// 없다. 이 섹션이 보여주는 건 leads UTM 기준 "리드·전환 건수" 랭킹과 그걸 근거로 한 AI 제안뿐이다.
// 각주로 매번 명시한다(components/admin/campaigns/tabs/MetaTab.tsx 소유 — 서버는
// app/api/admin/marketing/creative-suggest, 집계는 lib/marketing/creative-input).

type CreativeSuggestPeriod = "30d" | "90d"

const CREATIVE_SUGGEST_PERIOD_OPTIONS: readonly PeriodOption<CreativeSuggestPeriod>[] = [
  { id: "30d", label: "30일" },
  { id: "90d", label: "90일" },
]

interface CreativeSuggestionCard {
  headline: string
  body: string
  rationale: string
}

interface CreativeSuggestResponse {
  ranked: { top: AdCreativePerf[]; bottom: AdCreativePerf[] }
  patterns: string[]
  suggestions: CreativeSuggestionCard[]
  model: string
  note: string
}

function creativeRowLabel(row: AdCreativePerf): string {
  return row.ad || row.adset || row.campaign || "미확인 소재"
}

function AdCreativeRankRow({ row }: { row: AdCreativePerf }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
      <span
        className="min-w-0 truncate text-[#111110]"
        title={[row.campaign, row.adset, row.ad].filter(Boolean).join(" · ")}
      >
        {creativeRowLabel(row)}
      </span>
      <span className="flex shrink-0 items-center gap-3 tabular-nums text-[11px] text-[#1a1a1a]/45">
        <span className={row.converted > 0 ? "font-semibold text-[#084734]" : ""}>전환 {row.converted}</span>
        <span className="min-w-[2rem] text-right text-[12px] font-bold text-[#111110]">{row.leads}</span>
      </span>
    </div>
  )
}

// AdLeadsPanel 아래 독립 섹션 — 자체 기간·실행 상태를 들고 있어 부모(page.tsx)의 props 확장이 필요 없다.
function AiCreativeSuggestSection() {
  const [period, setPeriod] = useState<CreativeSuggestPeriod>("90d")
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [result, setResult] = useState<CreativeSuggestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 중복 클릭 방지 — setState는 비동기라 상태만으로는 연타 중 두 번째 요청을 못 막는다(AdLeadsPanel의
  // convertingRef와 같은 패턴).
  const runningRef = useRef(false)

  const run = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    setStatus("loading")
    setError(null)
    try {
      const data = await adminFetchJson<CreativeSuggestResponse>("/api/admin/marketing/creative-suggest", {
        method: "POST",
        body: JSON.stringify({ period }),
      })
      setResult(data)
      setStatus("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 소재 제안을 생성하지 못했습니다.")
      setStatus("error")
    } finally {
      runningRef.current = false
    }
  }, [period])

  const busy = status === "loading"

  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">AI 소재 제안</h2>
          <p className="mt-0.5 text-[12px] text-[#1a1a1a]/50">
            리드에 남은 광고명(UTM)을 기준으로 잘 되는 소재의 패턴을 뽑고 다음 소재를 제안합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodToggle
            options={CREATIVE_SUGGEST_PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            ariaLabel="소재 제안 기간"
          />
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {status === "done" ? "다시 생성" : "제안 생성"}
          </button>
        </div>
      </div>

      <p className="mb-3 text-[11px] leading-relaxed text-[#1a1a1a]/40">
        * 소재별 광고비·CPL은 수집하지 않습니다 — 리드·전환 건수 기준 랭킹입니다.
      </p>

      {status === "error" && error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[12.5px] text-[#B43E3E]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void run()}
              className="mt-1 font-semibold underline underline-offset-2"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {status === "idle" && (
        <EmptyState
          title="아직 생성한 제안이 없습니다"
          description="기간을 고르고 실행하면 리드가 몰린 소재의 패턴과 다음에 시도할 소재 제안을 받습니다."
          action={
            <button
              type="button"
              onClick={() => void run()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#111110] px-3.5 py-2 text-[12px] font-bold text-white transition hover:bg-[#2a2a28]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              제안 생성
            </button>
          }
        />
      )}

      {busy && !result && <ChartSkeleton className="h-[160px]" />}

      {result && (
        <div className="space-y-4">
          {result.patterns.length > 0 && (
            // 그린 아웃라인 카드 — 채움 없이 보더로만 강조(BriefingCard와 같은 원칙, 파스텔 채움 지양).
            <div className="rounded-2xl border border-[#BDEFD8] bg-white p-4 sm:p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#084734]">
                잘 되는 소재의 패턴
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {result.patterns.map((pattern, index) => (
                  <li key={index} className="flex gap-2 text-[12.5px] leading-relaxed text-[#1a1a1a]/70">
                    <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#A39E98]" />
                    <span className="min-w-0">{pattern}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.suggestions.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {result.suggestions.map((suggestion, index) => (
                <div key={index} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
                  <div className="flex items-center gap-1.5 text-[#615D59]">
                    <Lightbulb className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">제안 {index + 1}</span>
                  </div>
                  <p className="mt-2 text-[13.5px] font-bold leading-snug text-[#111110]">{suggestion.headline}</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-[#1a1a1a]/60">{suggestion.body}</p>
                  <p className="mt-2.5 border-t border-[#f0f0ec] pt-2 text-[11px] leading-relaxed text-[#1a1a1a]/40">
                    근거: {suggestion.rationale}
                  </p>
                </div>
              ))}
            </div>
          )}

          {result.ranked.top.length > 0 && (
            <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3.5 sm:px-5">
              <p className="text-[11px] font-semibold text-[#1a1a1a]/45">근거가 된 상위 소재(리드 기준)</p>
              <div className="mt-1 divide-y divide-[#f0f0ec]">
                {result.ranked.top.slice(0, 5).map((row, index) => (
                  <AdCreativeRankRow key={`${row.campaign ?? ""}-${row.adset ?? ""}-${row.ad ?? ""}-${index}`} row={row} />
                ))}
              </div>
            </div>
          )}

          <p className="text-[10.5px] text-[#1a1a1a]/35">
            모델 {result.model} · {result.note}
          </p>
        </div>
      )}
    </div>
  )
}

// "광고" 탭 패널 — Meta 라이브 캠페인 관리 + 광고 리드 모아보기·전환 + 채널 예산·집행 + 성과 입력.
// channelEfficiencyData/aggregate/perEventEcon은 코어(행사·리드·지표) 파생값이라 페이지에서 내려받는다
// (요약 탭과 공유 — 여기서 재계산하면 두 탭 수치가 어긋날 수 있다).
export default function MetaTab({
  dashboard,
  loading,
  coreLoading,
  error,
  datePreset,
  updatingId,
  onDatePresetChange,
  onRefresh,
  onToggleStatus,
  channelEfficiencyData,
  channelBudgets,
  onBudgetChange,
  budgetError,
  aggregate,
  adLeads,
  adLeadsLoading,
  adLeadsError,
  onRefreshAdLeads,
  onAdLeadsUpdate,
  perEventEcon,
  metricsMap,
  editing,
  setEditing,
  onMetricsSaved,
}: {
  dashboard: MetaCampaignDashboard | null
  loading: boolean
  /** 코어(행사·리드·지표) 로딩 — 채널 예산 표는 코어 파생값 소비라 Meta보다 늦게 도착할 수 있다.
   *  콜드 ?tab=meta 딥링크에서 0원으로 확정 표시됐다 뒤늦게 바뀌는 것을 막는 게이트. */
  coreLoading: boolean
  error: string | null
  datePreset: MetaDatePreset
  updatingId: string | null
  onDatePresetChange: (value: MetaDatePreset) => void
  onRefresh: () => void
  onToggleStatus: (campaign: MetaCampaignRow) => void
  channelEfficiencyData: ChannelEfficiencyRow[]
  channelBudgets: Record<AdChannel, number>
  onBudgetChange: (channel: AdChannel, amount: number) => void
  /** 예산 저장 실패 — 표 바로 위에 표시한다(Meta 대시보드 에러 슬롯과 분리). */
  budgetError: string | null
  aggregate: CampaignAggregate
  /** 마케팅 스코프 리드 전량 — 광고 리드 섹션이 렌즈·기간으로 직접 좁힌다(코어 리드와 별도 조회). */
  adLeads: LeadRecord[]
  adLeadsLoading: boolean
  adLeadsError: string | null
  onRefreshAdLeads: () => void
  onAdLeadsUpdate: (updater: (prev: LeadRecord[]) => LeadRecord[]) => void
  perEventEcon: PerEventEconRow[]
  metricsMap: Record<string, EventMetrics>
  editing: PublicEvent | null
  setEditing: Dispatch<SetStateAction<PublicEvent | null>>
  onMetricsSaved: (metrics: EventMetrics) => void
}) {
  // Meta 차트용 행
  const metaPerfRows = useMemo<MetaPerfRow[]>(() => {
    const campaigns = dashboard?.campaigns ?? []
    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      spend: c.insights.spend,
      leads: c.insights.leads,
      clicks: c.insights.clicks,
      impressions: c.insights.impressions,
      ctr: c.insights.ctr,
      cpc: c.insights.cpc,
      cpl: c.insights.leads > 0 ? c.insights.spend / c.insights.leads : null,
      status: c.effectiveStatus ?? c.status,
    }))
  }, [dashboard])

  // CSV 내보내기 — Meta
  const metaExport = useMemo(() => {
    const columns: ExportColumn[] = [
      { key: "name", label: "캠페인" },
      { key: "status", label: "상태" },
      { key: "spend", label: "광고비" },
      { key: "impressions", label: "노출" },
      { key: "clicks", label: "클릭" },
      { key: "leads", label: "리드" },
      { key: "ctr", label: "CTR(%)" },
      { key: "cpc", label: "CPC" },
      { key: "cpl", label: "CPL" },
    ]
    const campaigns = dashboard?.campaigns ?? []
    const rows: Array<Record<string, string | number | null>> = campaigns.map((c) => ({
      name: c.name,
      status: c.effectiveStatus ?? c.status,
      spend: c.insights.spend,
      impressions: c.insights.impressions,
      clicks: c.insights.clicks,
      leads: c.insights.leads,
      ctr: c.insights.ctr,
      cpc: c.insights.cpc,
      cpl: c.insights.leads > 0 ? Math.round(c.insights.spend / c.insights.leads) : null,
    }))
    return { columns, rows }
  }, [dashboard])

  return (
    <div className="px-4 pt-6 sm:px-6 lg:px-9">
      <div className="mb-4 flex items-center justify-end">
        <CampaignExportButton
          columns={metaExport.columns}
          rows={metaExport.rows}
          filename="meta-campaigns"
          label="Meta CSV"
          disabled={loading}
        />
      </div>
      <MetaCampaignPanel
        dashboard={dashboard}
        loading={loading}
        error={error}
        datePreset={datePreset}
        updatingId={updatingId}
        onDatePresetChange={onDatePresetChange}
        onRefresh={onRefresh}
        onToggleStatus={onToggleStatus}
      />
      {metaPerfRows.length > 0 && (
        <div className="mt-5">
          <MetaPerformanceCharts rows={metaPerfRows} currency={dashboard?.account.currency ?? "USD"} />
        </div>
      )}

      {/* 광고 리드 — 캠페인 성과 바로 아래에 붙여 "이 광고비가 만든 사람들"을 같은 화면에서 본다. */}
      <div className="mt-8">
        <AdLeadsPanel
          leads={adLeads}
          loading={adLeadsLoading}
          error={adLeadsError}
          onRefresh={onRefreshAdLeads}
          onLeadsUpdate={onAdLeadsUpdate}
          metaSpend={dashboard?.summary.spend ?? null}
          metaCurrency={dashboard?.account.currency ?? "USD"}
          metaDatePreset={datePreset}
        />
      </div>

      {/* AI 소재 제안 — 광고 리드 바로 아래. 소재별 광고비·CPL은 미수집이라 리드·전환 랭킹 기준. */}
      <AiCreativeSuggestSection />

      <div className="mt-8">
        <div className="mb-3">
          <h2 className="text-[14px] font-semibold text-[#111110]">채널 예산·집행</h2>
          <p className="mt-0.5 text-[12px] text-[#1a1a1a]/50">
            채널별 배정 예산을 입력하고 집행·전환(추정)·CPL과 대조합니다. 채널 귀속이 불가한 ROI는 종합만 표기합니다.
          </p>
        </div>
        {budgetError && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[12.5px] text-[#B43E3E]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{budgetError}</span>
          </div>
        )}
        {coreLoading ? (
          <ChartSkeleton className="h-[220px]" />
        ) : (
          <ChannelBudgetTable
            rows={channelEfficiencyData}
            budgets={channelBudgets}
            onBudgetChange={onBudgetChange}
            totalSpend={aggregate.totalSpend}
            totalRevenue={aggregate.totalRevenue}
            overallRoi={aggregate.overallRoi}
            metaLiveSpend={dashboard?.summary.spend ?? null}
            metaCurrency={dashboard?.account.currency ?? "USD"}
          />
        )}
      </div>

      {/* 성과 입력 — 위 표들의 "—"가 어느 행사의 미입력에서 나오는지 여기서 바로 채운다. */}
      <div id="event-metrics-input" className="mt-8 scroll-mt-24">
        <div className="mb-3">
          <h2 className="text-[14px] font-semibold text-[#111110]">성과 입력</h2>
          <p className="mt-0.5 text-[12px] text-[#1a1a1a]/50">
            행사별 광고비·매출·목표를 한 표에서 확인하고 매출·목표는 그 자리에서 고칩니다. 채널별 광고비 배분은 상세 편집에서 다룹니다.
          </p>
        </div>
        {coreLoading ? (
          <ChartSkeleton className="h-[220px]" />
        ) : (
          <EventMetricsQuickTable
            rows={perEventEcon}
            onSaved={onMetricsSaved}
            onOpenFullEditor={setEditing}
          />
        )}
      </div>

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
          onSaved={onMetricsSaved}
        />
      )}
    </div>
  )
}

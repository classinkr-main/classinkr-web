"use client"

import { useMemo, useState } from "react"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  Target,
  Users,
  Wallet,
} from "lucide-react"
import { KRW, compact, formatMetaDate, money } from "@/components/admin/campaigns/event-format"
import { KpiCard } from "@/components/admin/campaigns/tabs/KpiCard"
import type { MetaCampaignDashboard, MetaCampaignRow, MetaDatePreset } from "@/components/admin/campaigns/tabs/types"
import { metaObjectiveLabel } from "@/lib/marketing/campaign-labels"
import { splitMetaCampaignsByRun } from "@/lib/marketing/meta-campaign-view"

// Meta 라이브 캠페인 패널 — 계정 헤더 + 기간 프리셋 + KPI 4 + 캠페인 표(재개/중지).
// 구 광고 탭(MetaTab)에서 2026-09-14 데이터 층으로 옮겼다(로직 무변경). 쓰기 액션(재개/중지)이
// 있어 데이터 층에 두고, 차트(MetaPerformanceCharts)는 상세 층에서 같은 dashboard 를 읽는다.

export const META_DATE_OPTIONS: Array<{ value: MetaDatePreset; label: string }> = [
  { value: "last_7d", label: "7일" },
  { value: "last_30d", label: "30일" },
  { value: "last_90d", label: "90일" },
  { value: "this_month", label: "이번 달" },
]

/** 고정 참조 빈 배열 — 매 렌더 새 배열이면 캠페인 분할 메모가 매번 무효화된다. */
const EMPTY_CAMPAIGNS: MetaCampaignRow[] = []

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

export function MetaDatePresetToggle({
  value,
  onChange,
}: {
  value: MetaDatePreset
  onChange: (value: MetaDatePreset) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="Meta 성과 기간">
      {META_DATE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
            value === option.value ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default function MetaCampaignPanel({
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
  // `?? []` 를 렌더마다 새로 만들면 아래 useMemo 가 매번 깨진다 — 빈 배열을 고정 참조로 둔다.
  const campaigns = dashboard?.campaigns ?? EMPTY_CAMPAIGNS
  const summary = dashboard?.summary

  // 표 기본값은 "지금 돌고 있는 광고"만 — 계정에 쌓인 과거 캠페인이 화면을 덮지 않게.
  // 멈춘 것들은 접어 두되, 그 안에도 이 기간 광고비가 들어 있을 수 있어서 접힘 머리말에
  // 금액·리드를 표기한다(위 KPI 총액과 표의 합이 말없이 어긋나면 안 된다).
  const [showStopped, setShowStopped] = useState(false)
  const { running, stopped, stoppedTotals, allStopped } = useMemo(
    () => splitMetaCampaignsByRun(campaigns),
    [campaigns]
  )
  const visibleCampaigns = allStopped || showStopped ? [...running, ...stopped] : running

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
            <MetaDatePresetToggle value={datePreset} onChange={onDatePresetChange} />
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
                {visibleCampaigns.map((campaign) => {
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

            {/* 멈춘 캠페인 접기/펴기 — 전부 멈춘 계정에서는 접을 게 없으니 띄우지 않는다. */}
            {!allStopped && stopped.length > 0 && (
              <div className="border-t border-[#f0f0ec] bg-[#fdfdfc] px-4 py-2.5 sm:px-5">
                <button
                  type="button"
                  onClick={() => setShowStopped((prev) => !prev)}
                  aria-expanded={showStopped}
                  className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11.5px] font-semibold text-[#615D59] transition hover:text-[#111110]"
                >
                  {showStopped ? (
                    <ChevronUp aria-hidden className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown aria-hidden className="h-3.5 w-3.5" />
                  )}
                  중지된 캠페인 {stoppedTotals.count}개 {showStopped ? "접기" : "펼치기"}
                </button>
                {/* 접혀 있어도 숨긴 광고비는 밝힌다 — 위 KPI 총액과 표가 어긋나 보이지 않게. */}
                {stoppedTotals.withSpend > 0 && (
                  <p className="mt-1 pl-1.5 text-[11px] text-[#84827a]">
                    이 중 {stoppedTotals.withSpend}개는 조회 기간에 광고비가 있습니다 —{" "}
                    <span className="font-semibold text-[#615D59]">
                      {money(stoppedTotals.spend, currency)}
                    </span>
                    {stoppedTotals.leads > 0 && <> · 리드 {KRW.format(stoppedTotals.leads)}</>}
                  </p>
                )}
              </div>
            )}
            {allStopped && (
              <div className="border-t border-[#f0f0ec] bg-[#fdfdfc] px-4 py-2.5 text-[11px] text-[#84827a] sm:px-5">
                지금 집행 중인 캠페인이 없어 전체를 펴 두었습니다.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

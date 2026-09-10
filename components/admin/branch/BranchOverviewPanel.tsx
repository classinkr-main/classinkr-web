"use client"

import type { BranchJsonState } from "./client-api"
import IntegrityStrip from "./IntegrityStrip"
import type { DealModalDeal } from "./sections/DealModal"
import BranchHeroGauges from "./sections/BranchHeroGauges"
import BranchUpcomingDeals, { type UpcomingDealClick } from "./sections/BranchUpcomingDeals"
import CampaignsSection from "./sections/CampaignsSection"
import CoreKpiGrid from "./sections/CoreKpiGrid"
import DealMixSection from "./sections/DealMixSection"
import HardwareSection from "./sections/HardwareSection"
import RevenueFlowSection from "./sections/RevenueFlowSection"
import type { BranchKpiResponse, BranchSummaryResponse, Period, Team } from "./types"

interface BranchOverviewPanelProps {
  summary: BranchJsonState<BranchSummaryResponse>
  kpi: BranchJsonState<BranchKpiResponse>
  team: Team
  period: Period
  selectedMonth: string
  periodLabel: string
  refreshKey: number
  canRunAdminOperations: boolean
  onUpcomingDealClick: (deal: DealModalDeal) => void
}

function OverviewState({
  kind,
  title,
  detail,
}: {
  kind: "loading" | "empty" | "error"
  title: string
  detail: string
}) {
  const tone = kind === "error"
    ? "border-[#F2B8B8] bg-[#FCE9E9] text-[#8F2C2C]"
    : "border-[rgba(0,0,0,0.08)] bg-white text-[#615D59]"

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "loading" ? "polite" : undefined}
      className={`rounded-xl border p-5 ${tone}`}
    >
      <p className="text-[13px] font-bold text-[#111110]">{title}</p>
      <p className="mt-1 text-[12px] leading-relaxed">{detail}</p>
      {kind === "loading" ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-[92px] animate-pulse rounded-xl bg-[#f0f0ec]" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function StaleNotice({ summary, kpi }: {
  summary: BranchJsonState<BranchSummaryResponse>
  kpi: BranchJsonState<BranchKpiResponse>
}) {
  if (!summary.stale && !kpi.stale) return null

  const savedAt = Math.min(
    ...[summary.staleSince, kpi.staleSince].filter((value): value is number => value != null),
  )
  const savedLabel = Number.isFinite(savedAt)
    ? new Date(savedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
    : null

  return (
    <div role="status" className="rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-4 py-3 text-[12px] text-[#7A520F]">
      실시간 갱신에 실패해 이전 데이터를 표시합니다{savedLabel ? ` · 저장 ${savedLabel}` : ""}.
    </div>
  )
}

export default function BranchOverviewPanel({
  summary,
  kpi,
  team,
  period,
  selectedMonth,
  periodLabel,
  refreshKey,
  canRunAdminOperations,
  onUpcomingDealClick,
}: BranchOverviewPanelProps) {
  if (summary.loading && !summary.data) {
    return (
      <OverviewState
        kind="loading"
        title="KR 실적 데이터를 불러오는 중"
        detail="매출 요약이 도착하면 KPI와 차트를 함께 표시합니다."
      />
    )
  }

  if (summary.error && !summary.data) {
    return (
      <OverviewState
        kind="error"
        title="KR 실적 데이터를 불러오지 못했습니다"
        detail={summary.error}
      />
    )
  }

  if (!summary.data) {
    return (
      <OverviewState
        kind="empty"
        title="표시할 KR 실적 데이터가 없습니다"
        detail="선택한 팀과 기간의 원천 데이터가 준비됐는지 확인해 주세요."
      />
    )
  }

  const openUpcomingDeal = (deal: UpcomingDealClick) => {
    onUpcomingDealClick({
      id: deal.id,
      customer: deal.customer,
      date: deal.date,
      amount: deal.amount,
    })
  }

  return (
    <div className="space-y-6">
      <StaleNotice summary={summary} kpi={kpi} />
      <IntegrityStrip refreshKey={refreshKey} canRunAdminOperations={canRunAdminOperations} />
      <CoreKpiGrid data={summary.data} loading={false} error={null} />
      <BranchHeroGauges
        summary={summary.data}
        kpi={kpi.data}
        loading={kpi.loading}
        periodLabel={periodLabel}
        error={kpi.error}
      />
      <DealMixSection summary={summary.data} loading={false} error={null} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <RevenueFlowSection
          summary={summary.data}
          loading={false}
          team={team}
          period={period}
          selectedMonth={selectedMonth}
          refreshKey={refreshKey}
        />
        <BranchUpcomingDeals
          data={summary.data.monthly_series ?? null}
          loading={false}
          error={null}
          onDealClick={openUpcomingDeal}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <CampaignsSection rows={summary.data.campaigns_recent ?? null} loading={false} error={null} />
        <HardwareSection refreshKey={refreshKey} />
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import type { CompassKrTeamResult } from "@/lib/compass/kr-team-contract"
import type { BranchJsonState } from "./client-api"
import IntegrityStrip from "./IntegrityStrip"
import type { DealModalDeal } from "./sections/DealModal"
import BranchHeroGauges from "./sections/BranchHeroGauges"
import BranchUpcomingDeals, { type UpcomingDealClick } from "./sections/BranchUpcomingDeals"
import CampaignsSection from "./sections/CampaignsSection"
import ChannelSettlementSection from "./sections/ChannelSettlementSection"
import CompassTeamSection from "./sections/CompassTeamSection"
import DealMixSection from "./sections/DealMixSection"
import HardwareSection from "./sections/HardwareSection"
import { RevenueGoalChartCard, RevenuePacingCard, RevenueWeekCard, useRevenueFlow } from "./sections/RevenueFlowSection"
import MoneyValue from "./MoneyValue"
import type { BranchKpiResponse, BranchSummaryResponse, Period, Team } from "./types"

interface BranchOverviewPanelProps {
  manager?: string
  summary: BranchJsonState<BranchSummaryResponse>
  kpi: BranchJsonState<BranchKpiResponse>
  compass: BranchJsonState<CompassKrTeamResult>
  onMonthChange: (month: string) => void
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

// 개요 콕핏 맨 위 결론 한 문장 — 확정 매출·달성률·남은 목표만 쓴다(장부·DSH와 같은 수치, 새 지표 없음).
function OverviewConclusion({ summary, periodLabel }: { summary: BranchSummaryResponse; periodLabel: string }) {
  const { confirmed, goal, pacing_pct: pacing } = summary.revenue
  return (
    <p className="text-[19px] font-bold leading-snug tracking-[-0.02em] text-[#111110] md:text-[21px]">
      {periodLabel} 확정 <span style={{ color: CONFIDENCE_TOKENS.confirmed.color }}><MoneyValue value={confirmed} /></span>
      {goal > 0 ? (
        <>
          , 목표의 <span className="tabular-nums text-[#084734]">{pacing.toFixed(1)}%</span>입니다.{" "}
          {confirmed >= goal ? <>목표를 <MoneyValue value={confirmed - goal} /> 넘었습니다.</> : <>남은 목표는 <MoneyValue value={goal - confirmed} />입니다.</>}
        </>
      ) : <>입니다. 승인 목표가 없어 달성률을 계산하지 않습니다.</>}
    </p>
  )
}

function RailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[rgba(0,0,0,0.08)] pt-3 first:border-t-0 first:pt-0">
      <p className="text-[11.5px] font-medium text-[#615D59]">{label}</p>
      <div className="mt-1 text-[13px] text-[#111110]">{children}</div>
    </div>
  )
}

function CompanyNote({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3">
      <p className="text-[11.5px] font-medium text-[#615D59]">{title}</p>
      <p className="mt-0.5 text-[16px] font-bold text-[#111110]">{value}</p>
      <p className="text-[11.5px] text-[#615D59]">{sub}</p>
    </div>
  )
}

export default function BranchOverviewPanel({
  manager,
  summary,
  kpi,
  compass,
  onMonthChange,
  team,
  period,
  selectedMonth,
  periodLabel,
  refreshKey,
  canRunAdminOperations,
  onUpcomingDealClick,
}: BranchOverviewPanelProps) {
  // 캠페인·HW 상세는 전사 공용 참고라 기본으로 접는다(KR Team 차트·게이지는 접지 않는다 — SKILL 보존 원칙).
  const [showOperations, setShowOperations] = useState(false)
  const flow = useRevenueFlow({ manager, summary: summary.data, team, period, selectedMonth, refreshKey })
  const evaluation = <CompassTeamSection resource={compass} month={selectedMonth} onMonthChange={onMonthChange} team={team} />
  const settlement = <div className="space-y-2"><p className="text-[12px] text-[#615D59]">채널 정산 · 전사 공용 참고</p><ChannelSettlementSection period={period} selectedMonth={selectedMonth} refreshKey={refreshKey} /></div>
  if (summary.loading && !summary.data) {
    return (
      <div className="space-y-5">
        <OverviewState
          kind="loading"
          title="KR 실적 데이터를 불러오는 중"
          detail="매출 요약이 도착하면 KPI와 차트를 함께 표시합니다."
        />
        {evaluation}
        {settlement}
      </div>
    )
  }

  if (summary.error && !summary.data) {
    return (
      <div className="space-y-5">
        <OverviewState
          kind="error"
          title="KR 실적 데이터를 불러오지 못했습니다"
          detail={summary.error}
        />
        {evaluation}
        {settlement}
      </div>
    )
  }

  if (!summary.data) {
    return (
      <div className="space-y-5">
        <OverviewState
          kind="empty"
          title="표시할 KR 실적 데이터가 없습니다"
          detail="선택한 팀과 기간의 원천 데이터가 준비됐는지 확인해 주세요."
        />
        {evaluation}
        {settlement}
      </div>
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

  const data = summary.data
  const bottleneckPct = data.bottleneck.pct
  return (
    <div className="space-y-4">
      <StaleNotice summary={summary} kpi={kpi} />
      {/* 2026-11-24 시안 '개요 B · 콕핏' — 첫 화면에서 결론 → 게이지·월별 → 주차·페이싱·할 일 순. */}
      <section aria-label="결론" className="space-y-3">
        <OverviewConclusion summary={data} periodLabel={periodLabel} />
        <IntegrityStrip refreshKey={refreshKey} canRunAdminOperations={canRunAdminOperations} />
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <BranchHeroGauges
          summary={summary.data}
          kpi={kpi.data}
          loading={kpi.loading}
          periodLabel={periodLabel}
          error={kpi.error}
          layout="cockpit"
        />
        <RevenueGoalChartCard flow={flow} summary={data} manager={manager} selectedMonth={selectedMonth} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]">
        <RevenueWeekCard flow={flow} selectedMonth={selectedMonth} />
        <RevenuePacingCard summary={data} loading={false} />
        <aside aria-label="지금 볼 것" className="flex min-w-0 flex-col gap-3 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 lg:col-span-2 xl:col-span-1">
          <h2 className="text-[13px] font-bold text-[#111110]">지금 볼 것</h2>
          <RailItem label="시트 영업 KPI 병목 · BD">
            {data.bottleneck.metric ? (
              <span>
                <b>{data.bottleneck.metric.toUpperCase()}</b>{" "}
                <b className={`tabular-nums ${bottleneckPct < 30 ? "text-[#B43E3E]" : ""}`}>{bottleneckPct.toFixed(0)}%</b>
                {data.bottleneck.worst_member ? <span className="text-[#615D59]"> · {data.bottleneck.worst_member}</span> : null}
              </span>
            ) : <span className="text-[#615D59]">판정할 병목이 없습니다.</span>}
          </RailItem>
          <RailItem label="가까운 딜">
            <b>{data.closing.count}건</b> <span className="text-[#615D59]">· 목표 합 <MoneyValue value={data.closing.total_target} /></span>
          </RailItem>
          <BranchUpcomingDeals
            data={data.monthly_series ?? null}
            loading={false}
            error={null}
            onDealClick={openUpcomingDeal}
            limit={4}
          />
        </aside>
      </div>
      <DealMixSection summary={data} loading={false} error={null} />

      <div className="flex items-center gap-3 pt-4">
        <h2 className="text-[12px] font-bold tracking-[0.04em] text-[#615D59]">전사 참고</h2>
        <span className="h-px flex-1 bg-[rgba(0,0,0,0.08)]" aria-hidden="true" />
        <span className="text-[11.5px] text-[#615D59]">KR Team 매출과 합산하지 않음</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CompanyNote title="전사 공용 행사 (30일)" value={`${data.events_30d.count}건`} sub={`지역 ${data.events_30d.regions}개`} />
        <CompanyNote title="전사 공용 캠페인 성과" value={`${data.campaigns_30d.count}건`} sub={`평균 오픈율 ${data.campaigns_30d.avg_open_pct.toFixed(0)}%`} />
      </div>
      {evaluation}
      {settlement}
      <button type="button" aria-expanded={showOperations} aria-controls="branch-operations-detail" onClick={() => setShowOperations((open) => !open)} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-5 py-3 text-[13px] font-semibold text-[#31302E] focus-visible:outline-2 focus-visible:outline-[#084734]">
        캠페인 · 하드웨어 상세 · 전사 공용<span aria-hidden="true">{showOperations ? "−" : "+"}</span>
      </button>
      {showOperations ? <div id="branch-operations-detail" className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <CampaignsSection rows={data.campaigns_recent ?? null} loading={false} error={null} />
        <HardwareSection refreshKey={refreshKey} />
      </div> : null}
    </div>
  )
}

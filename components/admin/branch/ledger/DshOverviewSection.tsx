"use client"

import { CalendarDays, TrendingUp } from "lucide-react"
import {
  DshMonthlyNumbersTable,
  LoadingPanel,
  MemberBarChart,
  PacingChart,
  RevWeekForecastChart,
  formatMoney,
  formatMonthLabel,
  formatPercent,
  type MonthlyPlanRow,
  type RevWeekPoint,
} from "./shared"
import type {
  BranchKpiMemberRow,
  BranchKpiResponse,
  BranchPipelineResponse,
  BranchSummaryResponse,
} from "../types"
import type { BranchJsonState } from "./types"

interface DshOverviewSectionProps {
  summary: BranchJsonState<BranchSummaryResponse>
  revenue: BranchSummaryResponse["revenue"] | undefined
  periodLabel: string
  selectedMonth: string
  dshPeakWeek: RevWeekPoint | undefined
  pipeline: BranchJsonState<BranchPipelineResponse>
  dshWeekProjection: RevWeekPoint[]
  revMonthGoal: number | null
  monthlySeriesRows: MonthlyPlanRow[]
  kpi: BranchJsonState<BranchKpiResponse>
  members: BranchKpiMemberRow[]
}

export function DshOverviewSection({
  summary,
  revenue,
  periodLabel,
  selectedMonth,
  dshPeakWeek,
  pipeline,
  dshWeekProjection,
  revMonthGoal,
  monthlySeriesRows,
  kpi,
  members,
}: DshOverviewSectionProps) {
  return (
    <>
                <div className="grid gap-5 xl:grid-cols-2">
                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-bold text-[#111110]">DSH 누적 흐름</p>
                        <p className="mt-0.5 text-[11px] text-[#615D59]">
                          목표 <span className="font-bold text-[#111110]">{formatMoney(revenue?.goal)}</span>
                          {" · "}실적 <span className="font-bold text-[#084734]">{formatMoney(revenue?.confirmed)}</span>
                          {" · "}달성률 <span className="font-bold text-[#111110]">{formatPercent(revenue?.pacing_pct)}</span>
                        </p>
                      </div>
                      <span className="rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#084734]">
                        {periodLabel}
                      </span>
                    </div>
                    {summary.loading && !summary.data ? <LoadingPanel label="DSH 데이터를 불러오는 중" /> : <PacingChart summary={summary.data} />}
                  </section>

                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                          <CalendarDays className="h-4 w-4 text-[#084734]" />
                          {formatMonthLabel(selectedMonth)} 주차별 확정·고확도·예정
                        </p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[#615D59]">
                          REV w1-w5 입력 기준 · 검색/필터와 무관한 전체 행 집계
                        </p>
                      </div>
                      <span className="rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#084734]">
                        피크 {dshPeakWeek?.week ?? "-"} · {formatMoney(dshPeakWeek?.total)}
                      </span>
                    </div>
                    {pipeline.loading && !pipeline.data ? (
                      <LoadingPanel label="REV 주차 데이터를 불러오는 중" />
                    ) : (
                      <RevWeekForecastChart data={dshWeekProjection} monthGoal={revMonthGoal} />
                    )}
                  </section>
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 text-[13px] font-bold text-[#111110]">
                          <TrendingUp className="h-4 w-4 text-[#A8741A]" />
                          월별 목표·실적 수치
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#615D59]">누적 시리즈를 월별 수치로 분해 · 선택 월 강조</p>
                      </div>
                      <span className="text-[11px] font-bold text-[#615D59]">{monthlySeriesRows.length}개월</span>
                    </div>
                    {summary.loading && !summary.data ? (
                      <LoadingPanel label="월별 수치를 불러오는 중" />
                    ) : (
                      <DshMonthlyNumbersTable rows={monthlySeriesRows} selectedMonth={selectedMonth} />
                    )}
                  </section>

                  <section className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-bold text-[#111110]">담당자 목표/실적</p>
                        <p className="mt-0.5 text-[11px] text-[#615D59]">KPI 행과 REV 매출을 함께 보는 요약</p>
                      </div>
                      <span className="text-[11px] font-bold text-[#615D59]">{members.length}명</span>
                    </div>
                    {kpi.loading && !kpi.data ? <LoadingPanel label="KPI 데이터를 불러오는 중" /> : <MemberBarChart rows={members} />}
                  </section>
                </div>
    </>
  )
}

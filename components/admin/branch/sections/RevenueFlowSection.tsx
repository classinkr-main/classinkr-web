"use client"
// KR Team 개요 — 매출 누적 흐름 (2026-07-16 역할 재배분: 장부 DSH 렌즈의 시각화 흡수).
// 좌: 누적 페이싱(PacingChart), 우: 선택월 주차별 확도(RevWeekForecastChart).
// 수치 검수·편집은 매출 장부가 정본이라 헤더에 크로스 링크만 둔다.
import Link from "next/link"
import { useMemo } from "react"
import { CalendarDays } from "lucide-react"
import { useBranchJson } from "../client-api"
import {
  buildRevWeekProjection,
  ChartLegend,
  formatMoney,
  formatMonthLabel,
  LoadingPanel,
  PacingChart,
  RevWeekForecastChart,
  type LedgerRevenueRow,
} from "../ledger/shared"
import type { BranchPipelineResponse, BranchSummaryResponse, Period, Team } from "../types"

interface RevenueFlowSectionProps {
  summary: BranchSummaryResponse | null
  loading: boolean
  team: Team
  period: Period
  selectedMonth: string
  refreshKey: number
}

export default function RevenueFlowSection({
  summary,
  loading,
  team,
  period,
  selectedMonth,
  refreshKey,
}: RevenueFlowSectionProps) {
  // 개요 탭엔 pipeline fetch가 없어 주차 프로젝션용 REV 행을 여기서 직접 가져온다.
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  const pipeline = useBranchJson<BranchPipelineResponse>(
    `/api/admin/branch/pipeline?team=${team}&period=${period}${monthQuery}`,
    refreshKey,
  )

  // buildRevWeekProjection은 장부 파생 행(LedgerRevenueRow)을 받는다 — 시트 미러 행이므로 origin=sheet.
  const ledgerRows = useMemo<LedgerRevenueRow[]>(
    () => (pipeline.data?.rows ?? []).map((row) => ({ ...row, ledgerOrigin: "sheet" as const })),
    [pipeline.data],
  )
  const weekProjection = useMemo(
    () => buildRevWeekProjection(ledgerRows, selectedMonth),
    [ledgerRows, selectedMonth],
  )
  const peakWeek = useMemo(
    () => weekProjection.slice().sort((a, b) => b.total - a.total)[0],
    [weekProjection],
  )

  // 선택월 목표 = DSH 누적 시리즈의 월별 증분(장부 monthlySeriesRows와 동일 산식).
  const monthGoal = useMemo(() => {
    const series = summary?.monthly_series
    if (!series) return null
    const index = (series.months ?? []).indexOf(selectedMonth)
    if (index < 0) return null
    const goals = series.goal_cum ?? []
    const goal = (goals[index] ?? 0) - (index > 0 ? goals[index - 1] ?? 0 : 0)
    return goal > 0 ? goal : null
  }, [summary, selectedMonth])

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      {/* 목표·실적·달성률 텍스트는 제거(항목 2) — 아래 PacingChart가 이미 목표선을 그리고,
          유일한 '목표 대비' 수치 표면은 개요 상단의 BranchHeroGauges다. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">매출 누적 흐름</h2>
        </div>
        <Link
          href="/admin/branch/ledger"
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-[rgba(0,0,0,0.15)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#084734] transition hover:bg-[#ECFDF5]"
        >
          수치 검수 →
        </Link>
      </div>

      <div className="grid gap-5 p-4 xl:grid-cols-2">
        <div>
          <p className="mb-2 text-[12px] font-bold text-[#111110]">누적 페이싱</p>
          {loading && !summary ? (
            <LoadingPanel label="누적 흐름을 불러오는 중" />
          ) : (
            <>
              <PacingChart summary={summary} />
              <ChartLegend
                items={[
                  { label: "실적", color: "#084734" },
                  { label: "예상 포함", color: "#A8741A" },
                  { label: "목표", color: "#A39E98", dashed: true },
                ]}
              />
            </>
          )}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#111110]">
              <CalendarDays className="h-3.5 w-3.5 text-[#084734]" aria-hidden="true" />
              {formatMonthLabel(selectedMonth)} 주차별 확정·고확도·예정
            </p>
            {peakWeek && peakWeek.total > 0 && (
              <span className="rounded-full border border-[#BDEFD8] bg-[#ECFDF5] px-2.5 py-0.5 text-[10.5px] font-bold text-[#084734]">
                피크 {peakWeek.week} · {formatMoney(peakWeek.total)}
              </span>
            )}
          </div>
          {pipeline.loading && !pipeline.data ? (
            <LoadingPanel label="REV 주차 데이터를 불러오는 중" />
          ) : (
            <RevWeekForecastChart data={weekProjection} monthGoal={monthGoal} />
          )}
        </div>
      </div>
    </section>
  )
}

"use client"
// KR Team 개요 — 매출 흐름 카드 3장(2026-11-24 시안 '개요 B · 콕핏' 채택으로 한 카드에서 셋으로 나눔).
// 월별 목표·채움(MonthlyGoalBowlChart) · 선택월 주차별 확도(RevWeekForecastChart) · 누적 페이싱(PacingChart)은
// 그대로 보존하고, 배치만 콕핏 판에 맞게 따로 놓는다. 주차 프로젝션용 REV 행은 useRevenueFlow가 한 번만 읽는다.
// 수치 검수·편집은 매출 장부가 정본이라 크로스 링크만 둔다.
import Link from "next/link"
import { useMemo } from "react"
import { CalendarDays } from "lucide-react"
import { getBusinessDateParts } from "@/lib/business-time"
import { useBranchJson, type BranchJsonState } from "../client-api"
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
import { MonthlyGoalBowlChart } from "../MonthlyGoalBowlChart"

const CARD = "min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white"

export interface RevenueFlow {
  pipeline: BranchJsonState<BranchPipelineResponse>
  ledgerRows: LedgerRevenueRow[]
  weekProjection: ReturnType<typeof buildRevWeekProjection>
  peakWeek: ReturnType<typeof buildRevWeekProjection>[number] | undefined
  monthGoal: number | null
  monthlyGoals: { month: string; goal: number }[]
  todayMonth: string
  /** KST 영업일 'YYYY-MM-DD' — 차트가 빨간 예정 칸의 확정 전환을 그날로 판정한다. */
  today: string
}

export function useRevenueFlow({ manager, summary, team, period, selectedMonth, refreshKey }: {
  manager?: string
  summary: BranchSummaryResponse | null
  team: Team
  period: Period
  selectedMonth: string
  refreshKey: number
}): RevenueFlow {
  // 개요 탭엔 pipeline fetch가 없어 주차 프로젝션용 REV 행을 여기서 직접 가져온다.
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  const pipeline = useBranchJson<BranchPipelineResponse>(
    `/api/admin/branch/pipeline?team=${team}&period=${period}${monthQuery}${manager ? `&manager=${encodeURIComponent(manager)}` : ""}`,
    refreshKey,
  )

  // buildRevWeekProjection은 장부 파생 행(LedgerRevenueRow)을 받는다 — 시트 미러 행이므로 origin=sheet.
  const ledgerRows = useMemo<LedgerRevenueRow[]>(
    () => (pipeline.data?.rows ?? []).map((row) => ({ ...row, ledgerOrigin: "sheet" as const })),
    [pipeline.data],
  )
  const weekProjection = useMemo(() => buildRevWeekProjection(ledgerRows, selectedMonth), [ledgerRows, selectedMonth])
  const peakWeek = useMemo(() => weekProjection.slice().sort((a, b) => b.total - a.total)[0], [weekProjection])

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
  const monthlyGoals = useMemo(() => {
    const series = summary?.monthly_series
    return (series?.months ?? []).map((month, index) => ({
      month,
      goal: (series?.goal_cum[index] ?? 0) - (index > 0 ? series?.goal_cum[index - 1] ?? 0 : 0),
    }))
  }, [summary])
  // 지금 → 달은 KST 영업일로(UTC 로 자르면 매달 1일 0~9시 KST 에 지난달로 읽힌다 — F-10).
  const today = useMemo(() => getBusinessDateParts().date, [])
  const todayMonth = today.slice(0, 7)

  return { pipeline, ledgerRows, weekProjection, peakWeek, monthGoal, monthlyGoals, todayMonth, today }
}

/** 월별 목표·채움 차트(3b) — 승인 DSH 월 목표 대비 확정·고확도·예정. */
export function RevenueGoalChartCard({ flow, summary, manager, selectedMonth }: {
  flow: RevenueFlow
  summary: BranchSummaryResponse | null
  manager?: string
  selectedMonth: string
}) {
  const { pipeline } = flow
  return (
    <section className={`${CARD} p-4 sm:p-5`} aria-label="월별 목표 달성">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">월별 목표 달성</h2>
        <Link
          href="/admin/branch/ledger"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-[12px] font-semibold text-[#084734] hover:underline md:min-h-0 md:min-w-0"
        >
          수치 검수 →
        </Link>
      </div>
      {pipeline.data && summary ? (
        <>
          {pipeline.stale && <p role="status" className="mb-2 text-xs text-[#7A520F]">갱신 실패 — 저장된 REV 데이터 표시 중</p>}
          <MonthlyGoalBowlChart rows={flow.ledgerRows} plans={flow.monthlyGoals} selectedMonth={selectedMonth}
            todayMonth={flow.todayMonth} today={flow.today} density="compact" goalNote={manager ? "승인 개인 DSH 목표 · 동일 담당자의 REV 원천 기준" : "승인 DSH 목표 · 현재 팀의 REV 원천 기준. 장부 적용분은 매출 장부에서 별도 검수합니다."} />
        </>
      ) : pipeline.error ? (
        <p role="alert" className="py-5 text-xs text-[#B43E3E]">월별 매출 조회 실패 · 0건이 아닙니다.</p>
      ) : <LoadingPanel label="월별 목표·매출을 불러오는 중" />}
    </section>
  )
}

/** 선택월 주차별 확정·고확도·예정 막대. */
export function RevenueWeekCard({ flow, selectedMonth, bare = false }: { flow: RevenueFlow; selectedMonth: string; bare?: boolean }) {
  const { pipeline, peakWeek } = flow
  return (
    <section className={bare ? "min-w-0" : `${CARD} p-4`} aria-label="주차별 확도">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-[#111110]">
          <CalendarDays className="h-3.5 w-3.5 text-[#084734]" aria-hidden="true" />
          {formatMonthLabel(selectedMonth)} 주차별 확정·고확도·예정
        </h2>
        {peakWeek && peakWeek.total > 0 && (
          <span className="text-[11.5px] font-semibold text-[#615D59]">피크 {peakWeek.week} · {formatMoney(peakWeek.total)}</span>
        )}
      </div>
      {pipeline.loading && !pipeline.data ? (
        <LoadingPanel label="REV 주차 데이터를 불러오는 중" />
      ) : pipeline.error && !pipeline.data ? (
        <div role="alert" className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] p-4 text-[11px] font-semibold text-[#8F2C2C]">
          REV 주차 데이터를 불러오지 못했습니다 · {pipeline.error}
        </div>
      ) : !pipeline.data ? (
        <div role="status" className="rounded-lg bg-[#F6F5F4] p-4 text-[11px] text-[#615D59]">
          표시할 REV 주차 데이터가 없습니다.
        </div>
      ) : (
        <>
          {pipeline.stale ? (
            <div role="status" className="mb-2 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[10.5px] text-[#7A520F]">
              갱신 실패 — 저장된 데이터 표시 중
            </div>
          ) : null}
          <RevWeekForecastChart data={flow.weekProjection} monthGoal={flow.monthGoal} />
        </>
      )}
    </section>
  )
}

/** 누적 페이싱 — 실적 · 예상 포함 · 목표. */
export function RevenuePacingCard({ summary, loading, bare = false }: { summary: BranchSummaryResponse | null; loading: boolean; bare?: boolean }) {
  return (
    <section className={bare ? "min-w-0" : `${CARD} p-4`} aria-label="누적 페이싱">
      <h2 className="mb-2 text-[13px] font-bold text-[#111110]">누적 페이싱</h2>
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
    </section>
  )
}

/**
 * 개요 A 시안의 '매출 누적 흐름' — 월별 목표 차트 + 누적 페이싱 + 주차별 확도를 한 카드 안에 붙인다.
 * 세 차트는 기존 구현 그대로(카드 겉틀만 벗김). 데이터는 useRevenueFlow가 한 번만 읽은 값을 공유한다.
 */
export function RevenueFlowCard({ flow, summary, manager, selectedMonth }: {
  flow: RevenueFlow
  summary: BranchSummaryResponse | null
  manager?: string
  selectedMonth: string
}) {
  const { pipeline } = flow
  return (
    <section className={`${CARD} flex flex-col gap-5 p-4 sm:p-5`} aria-label="매출 누적 흐름">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">매출 누적 흐름</h2>
        <Link
          href="/admin/branch/ledger"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-[12px] font-semibold text-[#084734] hover:underline md:min-h-0 md:min-w-0"
        >
          수치 검수 →
        </Link>
      </div>
      {pipeline.data && summary ? (
        <>
          {pipeline.stale && <p role="status" className="-mb-2 text-xs text-[#7A520F]">갱신 실패 — 저장된 REV 데이터 표시 중</p>}
          <MonthlyGoalBowlChart rows={flow.ledgerRows} plans={flow.monthlyGoals} selectedMonth={selectedMonth}
            todayMonth={flow.todayMonth} today={flow.today} density="compact" goalNote={manager ? "승인 개인 DSH 목표 · 동일 담당자의 REV 원천 기준" : "승인 DSH 목표 · 현재 팀의 REV 원천 기준. 장부 적용분은 매출 장부에서 별도 검수합니다."} />
        </>
      ) : pipeline.error ? (
        <p role="alert" className="py-5 text-xs text-[#B43E3E]">월별 매출 조회 실패 · 0건이 아닙니다.</p>
      ) : <LoadingPanel label="월별 목표·매출을 불러오는 중" />}
      <div className="grid gap-6 border-t border-[rgba(0,0,0,0.08)] pt-5 lg:grid-cols-2">
        <RevenuePacingCard summary={summary} loading={false} bare />
        <RevenueWeekCard flow={flow} selectedMonth={selectedMonth} bare />
      </div>
    </section>
  )
}

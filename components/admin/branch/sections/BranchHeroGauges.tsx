"use client"
import { useMemo } from "react"
import Link from "next/link"
import type { BranchKpiResponse, BranchSummaryResponse } from "../types"
import { comparisonDomain } from "@/lib/branch/compass-overview"
import { TEAM_COLORS, type TeamKey } from "@/lib/branch/team-colors"
import { cnyExact } from "@/lib/branch/money-format"
import { branchTeamLabel, isCurrentBranchTeam, isLegacyBranchTeam } from "@/lib/branch/current-organization"
import MoneyValue from "../MoneyValue"
import ComparisonBar from "./ComparisonBar"

export default function BranchHeroGauges({ summary, kpi, loading, periodLabel, error }: {
  summary: BranchSummaryResponse | null; kpi: BranchKpiResponse | null; loading: boolean; periodLabel: string; error?: string | null
}) {
  const teams = useMemo(() => {
    if (!kpi?.teams) return []
    return kpi.teams.filter((t) => isLegacyBranchTeam(summary?.team) ? t.team === summary?.team : isCurrentBranchTeam(t.team))
  }, [kpi, summary?.team])

  if (error && !summary) return (
    <div role="alert" className="rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] p-4 text-[13px] font-semibold text-[#8F2C2C]">{error}</div>
  )
  if (loading && !summary) return <div className="h-56 animate-pulse rounded-xl bg-[#F6F5F4]" />
  if (!summary) return (
    <div role="status" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 text-[13px] text-[#615D59]">표시할 매출 목표 데이터가 없습니다.</div>
  )

  const { confirmed: actual, goal, pacing_pct: pacing } = summary.revenue
  const domain = comparisonDomain([actual, goal])
  const teamDomain = comparisonDomain(teams.flatMap((item) => [item.status, item.goal]))
  const scope = branchTeamLabel(summary.team)
  const legacy = isLegacyBranchTeam(summary.team)

  return <section aria-label="매출 현황 요약" className="grid gap-6 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-5 md:p-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-bold text-[#111110]">확정 매출</h2>
        <span className="text-[12px] text-[#615D59]">{scope} · {periodLabel} · CNY</span>
      </div>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <strong className="text-[34px] font-bold leading-tight tracking-[-0.03em] text-[#111110] md:text-[40px]"><MoneyValue value={actual} /></strong>
        <span className="text-[24px] font-semibold tabular-nums text-[#084734]">{goal > 0 ? pacing.toFixed(1) + "%" : "목표 기준 없음"}</span>
      </div>
      <p className="mt-2 text-[13px] text-[#615D59]">목표 <MoneyValue value={goal} />{goal > 0 ? <span> · {actual >= goal ? "목표 초과 " : "목표까지 "}<MoneyValue value={Math.abs(goal - actual)} /></span> : null}</p>
      <div className="mt-5"><ComparisonBar value={actual} target={goal > 0 ? goal : null} domain={domain} label={"확정 매출 " + cnyExact(actual) + " CNY, 목표 " + cnyExact(goal) + " CNY"} /></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#615D59]">
        <p>확정액: REV 장부 · 목표: DSH · 점선: 목표</p>
        <Link href="/admin/branch/ledger?lens=rev" className="inline-flex min-h-11 items-center text-[#084734] underline underline-offset-2">장부에서 열기 ↗</Link>
      </div>
    </div>
    <div className="min-w-0 border-t border-[rgba(0,0,0,0.08)] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-[#111110]">{legacy ? "이전 조직 매출 이력" : "현재 팀별 매출"}</h3>
        <span className="text-[12px] text-[#615D59]">DSH · 실적 / 목표</span>
      </div>
      {loading && !kpi ? <p role="status" className="mt-4 text-[13px] text-[#615D59]">팀 KPI를 불러오는 중입니다.</p>
        : error && !kpi ? <p role="alert" className="mt-4 text-[13px] text-[#8F2C2C]">팀 KPI를 불러오지 못했습니다 · {error}</p>
        : !kpi || teams.length === 0 ? <p role="status" className="mt-4 text-[13px] text-[#615D59]">표시할 팀 KPI 데이터가 없습니다.</p>
        : <div className="mt-4 space-y-4">
          {teams.map((item) => <div key={item.team}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <strong style={{ color: TEAM_COLORS[item.team as TeamKey].color }}>{branchTeamLabel(item.team)}</strong>
              <span className="tabular-nums text-[#31302E]"><MoneyValue value={item.status} /><span className="text-[12px] text-[#615D59]"> / <MoneyValue value={item.goal} /></span></span>
            </div>
            <ComparisonBar value={item.status} target={item.goal > 0 ? item.goal : null} domain={teamDomain} label={item.team + " DSH 실적 " + cnyExact(item.status) + " CNY, 목표 " + cnyExact(item.goal) + " CNY"} />
          </div>)}
        </div>}
    </div>
  </section>
}

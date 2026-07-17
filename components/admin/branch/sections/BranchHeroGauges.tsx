"use client"
import { useMemo } from "react"
import type { BranchKpiResponse, BranchSummaryResponse } from "../types"
import { GaugeRing } from "../../viz/GaugeRing"
import { ProgressRoadmap } from "../../viz/ProgressRoadmap"
import { cny } from "@/lib/branch/money-format"
import MoneyValue from "../MoneyValue"

const TEAM_LABEL: Record<string, { name: string; full: string }> = {
  BD: { name: "BD", full: "Business Development" },
  MKT: { name: "MKT", full: "Marketing" },
  CSM: { name: "CSM", full: "Customer Success" },
}

export default function BranchHeroGauges({
  summary, kpi, periodLabel,
}: {
  summary: BranchSummaryResponse | null
  kpi: BranchKpiResponse | null
  periodLabel: string
}) {
  const teams = useMemo(() => {
    if (!kpi?.teams) return []
    return kpi.teams.filter((t) => TEAM_LABEL[t.team])
  }, [kpi])

  if (!summary) return <div className="h-56 animate-pulse rounded-xl bg-[#f0f0ec]" />

  const actual = summary.revenue.confirmed
  const goal = summary.revenue.goal
  const pacing = summary.revenue.pacing_pct

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div
        className={`grid items-center gap-6 ${teams.length > 0 ? "grid-cols-1 lg:grid-cols-[1.6fr_1fr_1fr_1fr]" : "grid-cols-1"}`}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#615D59]">
            {periodLabel} · KR 지사 전체팀 통합
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-2.5">
            <span className="whitespace-nowrap text-[40px] font-bold leading-none tracking-[-0.03em] text-[#111110]">
              <MoneyValue value={actual} />
            </span>
            <span className="whitespace-nowrap text-[13px] text-[#615D59]">/ <MoneyValue value={goal} prefix="" /></span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-semibold text-[#084734]">
              ↗ {pacing.toFixed(0)}% 달성
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,0,0,0.05)] px-2.5 py-1 text-[11px] font-semibold text-[#111110]">
              {periodLabel} 기준
            </span>
          </div>
        </div>
        {teams.map((t) => {
          const meta = TEAM_LABEL[t.team]
          if (!meta) return null
          return (
            <div key={t.team} className="flex flex-col items-center gap-2 border-l border-[rgba(0,0,0,0.08)] pl-5">
              <div className="w-full self-start">
                <p className="text-[12px] font-bold tracking-[0.02em] text-[#111110]">{meta.name}</p>
                <p className="mt-0.5 text-[10.5px] text-[#615D59]">{meta.full}</p>
              </div>
              <GaugeRing value={t.status} goal={t.goal} />
              <p className="whitespace-nowrap text-center text-[11px] text-[#615D59]">
                <span className="text-[13px] font-bold text-[#111110]"><MoneyValue value={t.status} /></span>
                <span> / <MoneyValue value={t.goal} prefix="" /></span>
              </p>
            </div>
          )
        })}
      </div>
      <div className="mt-5 border-t border-[rgba(0,0,0,0.08)] pt-5">
        <ProgressRoadmap variant="hero" label="매출 로드맵" actual={actual} goal={goal} formatValue={cny} />
      </div>
    </section>
  )
}

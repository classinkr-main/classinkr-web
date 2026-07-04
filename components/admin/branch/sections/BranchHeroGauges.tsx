"use client"
import { useMemo, useState } from "react"
import type { BranchKpiResponse, BranchSummaryResponse } from "../types"
import { cny } from "@/lib/branch/money-format"

const COLORS = {
  green: "#084734",
  greenHover: "#065c41",
  greenSurface: "#ECFDF5",
  amber: "#A8741A",
  olive: "#7B8B36",
  red: "#B43E3E",
  blue: "#1E5DA8",
  border: "rgba(0,0,0,0.08)",
}

const OVERSHOOT_COLOR = "#F59E0B" // amber-500 — distinct emphasis for >100%

function GaugeRing({ value, goal, size = 108, stroke = 9 }: { value: number; goal: number; size?: number; stroke?: number }) {
  const pct = goal ? Math.min(120, (value / goal) * 100) : 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const safePct = Math.min(100, pct)
  const overshoot = Math.max(0, pct - 100) // 0..20
  const offset = c - (safePct / 100) * c
  const overshootOffset = c - (overshoot / 100) * c
  const stop = pct >= 100 ? COLORS.green : pct >= 70 ? COLORS.green : pct >= 40 ? COLORS.olive : COLORS.amber
  const angle = (pct / 100) * 2 * Math.PI // uncapped — wraps past 2π for >100%
  const dotSize = stroke + 6
  const dotX = size / 2 + r * Math.sin(angle)
  const dotY = size / 2 - r * Math.cos(angle)
  const isOver = overshoot > 0
  const dotBorder = isOver ? OVERSHOOT_COLOR : stop
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.055)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stop} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)" }} />
        {isOver && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={OVERSHOOT_COLOR} strokeWidth={stroke}
            strokeDasharray={c} strokeDashoffset={overshootOffset} strokeLinecap="round"
            className="gauge-overshoot-arc"
            style={{ transition: "stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)" }} />
        )}
      </svg>
      <div className={`pointer-events-none absolute rounded-full bg-white ${isOver ? "gauge-overshoot-dot" : ""}`}
        style={{
          left: dotX, top: dotY,
          width: dotSize, height: dotSize,
          transform: "translate(-50%, -50%)",
          border: `2.5px solid ${dotBorder}`,
          transition: "left .8s cubic-bezier(.4,0,.2,1), top .8s cubic-bezier(.4,0,.2,1), border-color .4s ease",
        }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold leading-none tracking-[-0.02em]"
          style={{ color: isOver ? OVERSHOOT_COLOR : "#111110" }}>
          {Math.round(pct)}<span className="ml-px text-[11px] text-[#615D59]">%</span>
        </span>
      </div>
    </div>
  )
}

function RoadmapGauge({ actual, goal }: { actual: number; goal: number }) {
  const [hover, setHover] = useState<{ x: number; pct: number } | null>(null)
  const pct = goal ? Math.min(120, (actual / goal) * 100) : 0
  const safe = Math.min(100, pct)
  const milestones = [
    { pct: 25, label: "Q-Start" },
    { pct: 50, label: "Mid" },
    { pct: 75, label: "Push" },
    { pct: 100, label: "Goal" },
  ]
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = Math.max(0, Math.min(1, x / rect.width))
    setHover({ x, pct: ratio * 100 })
  }
  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#615D59]">매출 로드맵</p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
            <span className="whitespace-nowrap text-[28px] font-bold leading-none tracking-[-0.03em] text-[#111110]">
              ¥{cny(actual)}
            </span>
            <span className="whitespace-nowrap text-[12px] text-[#615D59]">/ 목표 ¥{cny(goal)}</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-semibold text-[#084734]">
          ↗ {Math.round(pct)}%
        </span>
      </div>
      <div className="relative pb-7">
        <div className="group relative h-[14px] overflow-visible rounded-[7px] bg-[rgba(0,0,0,0.045)]"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}>
          <div className="absolute inset-y-0 left-0 rounded-[7px] transition-[width] duration-700"
            style={{
              width: `${safe}%`,
              background: `linear-gradient(90deg, ${COLORS.amber} 0%, #C99044 18%, ${COLORS.olive} 38%, #5C9C4F 58%, ${COLORS.green} 80%, ${COLORS.greenHover} 100%)`,
            }} />
          <div className="absolute -top-[3px] h-5 w-5 -translate-x-1/2 rounded-full border-[2.5px] border-[#084734] bg-white"
            style={{ left: `${safe}%`, transition: "left .8s cubic-bezier(.4,0,.2,1)" }} />
          {hover && (
            <>
              <div className="pointer-events-none absolute -top-1 bottom-[-2px] w-px bg-[#084734]/35"
                style={{ left: hover.x }} />
              <div className="pointer-events-none absolute -top-9 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#111110] px-2 py-1 text-[10.5px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
                style={{ left: hover.x }}>
                {hover.pct.toFixed(1)}% · ¥{cny((hover.pct / 100) * goal)}
              </div>
            </>
          )}
        </div>
        <div className="relative mt-2 h-5">
          {milestones.map((m) => {
            const reached = pct >= m.pct
            return (
              <div key={m.pct} className="absolute flex flex-col items-center gap-1"
                style={{ left: `${m.pct}%`, transform: "translateX(-50%)" }}>
                <span className="block rounded-full transition-all"
                  style={{
                    width: reached ? 8 : 6, height: reached ? 8 : 6,
                    background: reached ? COLORS.green : "rgba(0,0,0,0.14)",
                  }} />
                <span className={`text-[10px] font-semibold ${reached ? "text-[#084734]" : "text-[#615D59]"}`}>{m.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

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
              ¥{cny(actual)}
            </span>
            <span className="whitespace-nowrap text-[13px] text-[#615D59]">/ {cny(goal)}</span>
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
                <span className="text-[13px] font-bold text-[#111110]">¥{cny(t.status)}</span>
                <span> / {cny(t.goal)}</span>
              </p>
            </div>
          )
        })}
      </div>
      <div className="mt-5 border-t border-[rgba(0,0,0,0.08)] pt-5">
        <RoadmapGauge actual={actual} goal={goal} />
      </div>
    </section>
  )
}

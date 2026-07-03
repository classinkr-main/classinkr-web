"use client"

import { useState } from "react"

// 목표 대비 진행률 바 — 3가지 모드.
// - "hero"  : 마일스톤 있는 큰 로드맵 바 + 호버 툴팁 (구 BranchHeroGauges.RoadmapGauge)
// - "meter" : 마일스톤 없는 카드형 미니 게이지 (구 campaigns/GoalProgressPanel.Meter)
// - "mini"  : 마일스톤 없는 한 줄 인라인 바 (구 campaigns/GoalProgressPanel.MiniBar)

const ROADMAP_COLORS = {
  green: "#084734",
  greenHover: "#065c41",
  olive: "#7B8B36",
  amber: "#A8741A",
}

export interface RoadmapMilestone {
  pct: number
  label: string
}

const DEFAULT_MILESTONES: RoadmapMilestone[] = [
  { pct: 25, label: "Q-Start" },
  { pct: 50, label: "Mid" },
  { pct: 75, label: "Push" },
  { pct: 100, label: "Goal" },
]

function defaultFormat(n: number) {
  if (!Number.isFinite(n)) return "-"
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`
  return n.toLocaleString()
}

/** meter/mini 모드 색상: green >=100, terracotta <50, neutral 그 외. */
function achievementColor(pct: number | null): string {
  if (pct == null) return "#84827a"
  if (pct >= 100) return ROADMAP_COLORS.green
  if (pct < 50) return "#B85C33"
  return "#1a1a1a"
}

function pctLabel(pct: number | null): string {
  if (pct == null) return "—"
  return `${Math.round(pct)}%`
}

export interface ProgressRoadmapProps {
  actual: number
  goal: number
  label: string
  variant?: "hero" | "meter" | "mini"
  /** hero 전용. 미지정 시 4단계 기본 마일스톤. 빈 배열([])을 주면 마일스톤 없는 모드. */
  milestones?: RoadmapMilestone[]
  /** hero 전용. 기본 true — 바 위 호버 시 위치별 %·값 툴팁. */
  showHoverTooltip?: boolean
  /** 값 표기 포맷. 기본은 ¥억/만 축약(cny). meter 모드에서 KRW 통화 표기가 필요하면 오버라이드. */
  formatValue?: (n: number) => string
  /** 값 접두 기호. 기본 "¥". formatValue를 통화 포맷으로 넘기면 prefix=""로 비운다. */
  prefix?: string
}

export function ProgressRoadmap({
  actual,
  goal,
  label,
  variant = "hero",
  milestones = DEFAULT_MILESTONES,
  showHoverTooltip = true,
  formatValue = defaultFormat,
  prefix = "¥",
}: ProgressRoadmapProps) {
  if (variant === "meter") {
    return (
      <MeterBody actual={actual} goal={goal} label={label} formatValue={formatValue} prefix={prefix} />
    )
  }
  if (variant === "mini") {
    return <MiniBarBody actual={actual} goal={goal} label={label} />
  }
  return (
    <HeroBody
      actual={actual}
      goal={goal}
      label={label}
      milestones={milestones}
      showHoverTooltip={showHoverTooltip}
      formatValue={formatValue}
      prefix={prefix}
    />
  )
}

// ── hero (구 RoadmapGauge) ──────────────────────────────────────────────
function HeroBody({
  actual,
  goal,
  label,
  milestones,
  showHoverTooltip,
  formatValue,
  prefix,
}: {
  actual: number
  goal: number
  label: string
  milestones: RoadmapMilestone[]
  showHoverTooltip: boolean
  formatValue: (n: number) => string
  prefix: string
}) {
  const [hover, setHover] = useState<{ x: number; pct: number } | null>(null)
  const pct = goal ? Math.min(120, (actual / goal) * 100) : 0
  const safe = Math.min(100, pct)
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#615D59]">{label}</p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
            <span className="whitespace-nowrap text-[28px] font-bold leading-none tracking-[-0.03em] text-[#111110]">
              {prefix}
              {formatValue(actual)}
            </span>
            <span className="whitespace-nowrap text-[12px] text-[#615D59]">
              / 목표 {prefix}
              {formatValue(goal)}
            </span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-semibold text-[#084734]">
          ↗ {Math.round(pct)}%
        </span>
      </div>
      <div className="relative pb-7">
        <div
          className="group relative h-[14px] overflow-visible rounded-[7px] bg-[rgba(0,0,0,0.045)]"
          onMouseMove={showHoverTooltip ? handleMove : undefined}
          onMouseLeave={showHoverTooltip ? () => setHover(null) : undefined}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-[7px] transition-[width] duration-700"
            style={{
              width: `${safe}%`,
              background: `linear-gradient(90deg, ${ROADMAP_COLORS.amber} 0%, #C99044 18%, ${ROADMAP_COLORS.olive} 38%, #5C9C4F 58%, ${ROADMAP_COLORS.green} 80%, ${ROADMAP_COLORS.greenHover} 100%)`,
            }}
          />
          <div
            className="absolute -top-[3px] h-5 w-5 -translate-x-1/2 rounded-full border-[2.5px] border-[#084734] bg-white"
            style={{ left: `${safe}%`, transition: "left .8s cubic-bezier(.4,0,.2,1)" }}
          />
          {showHoverTooltip && hover && (
            <>
              <div
                className="pointer-events-none absolute -top-1 bottom-[-2px] w-px bg-[#084734]/35"
                style={{ left: hover.x }}
              />
              <div
                className="pointer-events-none absolute -top-9 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#111110] px-2 py-1 text-[10.5px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
                style={{ left: hover.x }}
              >
                {hover.pct.toFixed(1)}% · {prefix}
                {formatValue((hover.pct / 100) * goal)}
              </div>
            </>
          )}
        </div>
        {milestones.length > 0 && (
          <div className="relative mt-2 h-5">
            {milestones.map((m) => {
              const reached = pct >= m.pct
              return (
                <div
                  key={m.pct}
                  className="absolute flex flex-col items-center gap-1"
                  style={{ left: `${m.pct}%`, transform: "translateX(-50%)" }}
                >
                  <span
                    className="block rounded-full transition-all"
                    style={{
                      width: reached ? 8 : 6,
                      height: reached ? 8 : 6,
                      background: reached ? ROADMAP_COLORS.green : "rgba(0,0,0,0.14)",
                    }}
                  />
                  <span className={`text-[10px] font-semibold ${reached ? "text-[#084734]" : "text-[#615D59]"}`}>
                    {m.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── meter (구 GoalProgressPanel.Meter, 마일스톤 없음) ───────────────────
function MeterBody({
  actual,
  goal,
  label,
  formatValue,
  prefix,
}: {
  actual: number
  goal: number
  label: string
  formatValue: (n: number) => string
  prefix: string
}) {
  const pct = goal > 0 ? (actual / goal) * 100 : null
  const color = achievementColor(pct)
  const fillWidth = pct == null ? 0 : Math.min(pct, 100)

  return (
    <div className="rounded-xl bg-[#fafaf8] p-4">
      <div className="flex items-start justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#1a1a1a]/35">{label}</p>
        <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
          {pctLabel(pct)}
        </span>
      </div>
      <p className="mt-1 text-[22px] font-bold tracking-[-0.02em] tabular-nums text-[#111110]">
        {prefix}
        {formatValue(actual)}
      </p>
      <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40 tabular-nums">
        목표 {goal > 0 ? `${prefix}${formatValue(goal)}` : "—"}
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
        <div className="h-full rounded-full transition-all" style={{ width: `${fillWidth}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// ── mini (구 GoalProgressPanel.MiniBar, 마일스톤 없음) ──────────────────
function MiniBarBody({ actual, goal, label }: { actual: number; goal: number; label: string }) {
  const pct = goal > 0 ? (actual / goal) * 100 : null
  const color = achievementColor(pct)
  const fillWidth = pct == null ? 0 : Math.min(pct, 100)

  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-[10px] uppercase tracking-[0.12em] text-[#1a1a1a]/35">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0f0ec]">
        <div className="h-full rounded-full" style={{ width: `${fillWidth}%`, backgroundColor: color }} />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums" style={{ color }}>
        {pctLabel(pct)}
      </span>
    </div>
  )
}

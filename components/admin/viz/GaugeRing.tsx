"use client"

// SVG 링 게이지 — 목표 대비 달성률을 원형으로 표시. 100% 초과분은 앰버로 별도 강조(overshoot arc).
// 구 branch/sections/BranchHeroGauges.tsx의 GaugeRing을 그대로 추출(시각 동일).
// overshoot glow 애니메이션은 app/globals.css의 .gauge-overshoot-arc / .gauge-overshoot-dot 전역 클래스에 의존한다.

const RING_COLORS = {
  green: "#084734",
  olive: "#7B8B36",
  amber: "#A8741A",
}

// amber-500 — 100% 초과분에 대한 별도 강조색(그린과 구분되는 신호색, 파랑 아님).
const OVERSHOOT_COLOR = "#F59E0B"

export function GaugeRing({
  value,
  goal,
  size = 108,
  stroke = 9,
}: {
  value: number
  goal: number
  size?: number
  stroke?: number
}) {
  const pct = goal > 0 ? (value / goal) * 100 : 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const safePct = Math.max(0, Math.min(100, pct))
  const overshoot = Math.min(20, Math.max(0, pct - 100)) // 그림만 0..20; 실제 달성률은 보존
  const offset = c - (safePct / 100) * c
  const overshootOffset = c - (overshoot / 100) * c
  const stop = pct >= 100 ? RING_COLORS.green : pct >= 70 ? RING_COLORS.green : pct >= 40 ? RING_COLORS.olive : RING_COLORS.amber
  const angle = ((safePct + overshoot) / 100) * 2 * Math.PI
  const dotSize = stroke + 6
  const dotX = size / 2 + r * Math.sin(angle)
  const dotY = size / 2 - r * Math.cos(angle)
  const isOver = overshoot > 0
  const dotBorder = isOver ? OVERSHOOT_COLOR : stop
  const gradId = `gauge-grad-${Math.round(value)}-${Math.round(goal)}-${size}`

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isOver ? OVERSHOOT_COLOR : stop === RING_COLORS.green ? "#065C41" : stop} />
            <stop offset="100%" stopColor={isOver ? "#D97706" : stop} />
          </linearGradient>
          <filter id={`gauge-shadow-${size}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor={isOver ? "rgba(245,158,11,0.3)" : "rgba(8,71,52,0.22)"} />
          </filter>
        </defs>
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F0EFEA" strokeWidth={stroke} />
        {/* Progress Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          filter={`url(#gauge-shadow-${size})`}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)" }}
        />
        {isOver && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={OVERSHOOT_COLOR}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={overshootOffset}
            strokeLinecap="round"
            className="gauge-overshoot-arc"
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)" }}
          />
        )}
      </svg>
      {/* Indicator Dot */}
      <div
        className={`pointer-events-none absolute rounded-full bg-white ${isOver ? "gauge-overshoot-dot" : ""}`}
        style={{
          left: dotX,
          top: dotY,
          width: dotSize,
          height: dotSize,
          transform: "translate(-50%, -50%)",
          border: `2.5px solid ${dotBorder}`,
          boxShadow: isOver
            ? "0 2px 8px rgba(245,158,11,0.4), 0 0 0 1px rgba(255,255,255,0.9)"
            : "0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.9)",
          transition: "left 1s cubic-bezier(.16,1,.3,1), top 1s cubic-bezier(.16,1,.3,1), border-color .4s ease, box-shadow .4s ease",
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums"
          style={{ color: isOver ? OVERSHOOT_COLOR : "#111110" }}
        >
          {Math.round(pct)}
          <span className="ml-0.5 text-[11px] font-semibold text-[#615D59]">%</span>
        </span>
      </div>
    </div>
  )
}

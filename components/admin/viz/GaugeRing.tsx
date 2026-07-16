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
  const pct = goal ? Math.min(120, (value / goal) * 100) : 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const safePct = Math.min(100, pct)
  const overshoot = Math.max(0, pct - 100) // 0..20
  const offset = c - (safePct / 100) * c
  const overshootOffset = c - (overshoot / 100) * c
  const stop = pct >= 100 ? RING_COLORS.green : pct >= 70 ? RING_COLORS.green : pct >= 40 ? RING_COLORS.olive : RING_COLORS.amber
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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stop}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)" }}
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
            style={{ transition: "stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)" }}
          />
        )}
      </svg>
      <div
        className={`pointer-events-none absolute rounded-full bg-white ${isOver ? "gauge-overshoot-dot" : ""}`}
        style={{
          left: dotX,
          top: dotY,
          width: dotSize,
          height: dotSize,
          transform: "translate(-50%, -50%)",
          border: `2.5px solid ${dotBorder}`,
          transition: "left .8s cubic-bezier(.4,0,.2,1), top .8s cubic-bezier(.4,0,.2,1), border-color .4s ease",
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-[22px] font-bold leading-none tracking-[-0.02em]"
          style={{ color: isOver ? OVERSHOOT_COLOR : "#111110" }}
        >
          {Math.round(pct)}
          <span className="ml-px text-[11px] text-[#615D59]">%</span>
        </span>
      </div>
    </div>
  )
}

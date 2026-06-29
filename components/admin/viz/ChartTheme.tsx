"use client"

import { CHART, GRADIENT } from "./theme"

// Recharts 전용 공용 테마 JSX. theme.ts(Recharts-free)와 분리한다.

export function ChartTooltip({
  active,
  payload,
  label,
  suffix = "건",
}: {
  active?: boolean
  payload?: Array<{ value?: number }>
  label?: string
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-[#111110] px-3 py-2 text-[12px] text-white shadow-xl">
      {label != null && label !== "" && <p className="mb-0.5 text-white/50">{label}</p>}
      <p className="font-bold">
        {payload[0]?.value ?? 0}
        {suffix}
      </p>
    </div>
  )
}

// 그린 그라데이션 <defs> — 에어리어 차트에서 fill="url(#viz-green-area)"로 참조.
export function GreenAreaDefs() {
  return (
    <defs>
      <linearGradient id={GRADIENT.greenArea} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={CHART.brand} stopOpacity={0.18} />
        <stop offset="100%" stopColor={CHART.brand} stopOpacity={0} />
      </linearGradient>
      <linearGradient id={GRADIENT.greenAreaSoft} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={CHART.brandSoft} stopOpacity={0.35} />
        <stop offset="100%" stopColor={CHART.brandSoft} stopOpacity={0} />
      </linearGradient>
    </defs>
  )
}

// contentStyle 방식(Meta/branch/campaigns 차트)용 공용 툴팁 스타일.
export const chartTooltipContentStyle = {
  border: "1px solid #e8e8e4",
  borderRadius: 12,
  boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
} as const

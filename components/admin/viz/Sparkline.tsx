"use client"

import { Area, AreaChart, ResponsiveContainer } from "recharts"
import { TONE, type Tone } from "./theme"

// KPI 카드용 미니 추이. 축·그리드·툴팁 없음, 애니메이션 없음.
// Recharts를 끌고 오므로 소비처는 next/dynamic(ssr:false)로 로드한다.

export interface SparklineProps {
  data: number[]
  tone?: Tone
  height?: number
  mode?: "area" | "line"
}

export function Sparkline({ data, tone = "brand", height = 30, mode = "area" }: SparklineProps) {
  if (!data || data.length === 0) return null
  const stroke = TONE[tone].fg
  const chartData = data.map((value, i) => ({ i, value }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={1.5}
          fill={stroke}
          fillOpacity={mode === "area" ? 0.12 : 0}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

"use client"

import { Area, AreaChart, ResponsiveContainer } from "recharts"
import { TONE, type Tone } from "./theme"

// KPI 카드용 미니 추이. 축·그리드·툴팁 없음, 애니메이션 없음.
// Recharts를 끌고 오므로 소비처는 next/dynamic(ssr:false)로 로드한다 — 새 소비처는
// 직접 dynamic()을 작성하는 대신 "./LazySparkline"(기본 export)을 쓰면 이 규약을
// 잊을 수 없다(클라이언트 캐시·번들 규약 점검 2026-09-10, 정적 import 사고 재발 방지).

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

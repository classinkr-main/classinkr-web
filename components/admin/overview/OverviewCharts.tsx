"use client"

import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { ChartTooltip, GreenAreaDefs } from "../viz/ChartTheme"
import { CHART, GRADIENT, SOURCE_PALETTE, axisTick, cursorLine, gridProps } from "../viz/theme"

// Recharts(약 300KB)를 overview 초기 번들에서 분리하기 위한 차트 전용 모듈.
// page.tsx에서 next/dynamic(ssr:false)로 지연 로드한다.

export interface TrendPoint {
  label: string
  count: number
}

export function LeadTrendChart({ data, range }: { data: TrendPoint[]; range: 7 | 30 }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <GreenAreaDefs />
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={cursorLine} />
        <Area
          type="monotone"
          dataKey="count"
          stroke={CHART.brand}
          strokeWidth={2}
          fill={`url(#${GRADIENT.greenArea})`}
          dot={range === 7 ? { fill: CHART.brand, strokeWidth: 0, r: 3 } : false}
          activeDot={{ r: 5, fill: CHART.brand, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function SourcePie({
  data,
  colors = SOURCE_PALETTE,
}: {
  data: { name: string; value: number }[]
  colors?: string[]
}) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  )
}

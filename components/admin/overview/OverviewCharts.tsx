"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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

/**
 * syncId 를 주면 같은 값을 가진 다른 차트(방문 추이)와 크로스헤어·툴팁이 같은 날짜로 움직인다 —
 * 두 스케일을 한 판에 얹는 이중축 대신 위아래 2단으로 나눠 그리기 위한 것(마케팅 재구성 G5와 같은 방식).
 */
export function LeadTrendChart({
  data,
  range,
  height = 180,
  syncId,
}: {
  data: TrendPoint[]
  range: 7 | 30
  height?: number
  syncId?: string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} syncId={syncId} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
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

/** 홈 방문자 일별 막대 — 문의 추이(위 2단의 아래)와 x축·크로스헤어를 공유한다. 맥락 축이라 웜 그레이로 물린다. */
export function VisitorTrendChart({ data, height = 120, syncId }: { data: TrendPoint[]; height?: number; syncId?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} syncId={syncId} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip suffix="명" />} cursor={{ fill: CHART.grid }} />
        <Bar dataKey="count" name="홈 방문" fill={CHART.barMuted} radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
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

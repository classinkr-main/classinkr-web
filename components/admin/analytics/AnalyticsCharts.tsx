"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CHART, gridProps, axisTick, cursorLine } from "../viz/theme"
import { ChartTooltip, chartTooltipContentStyle } from "../viz/ChartTheme"

export function LeadTrendChart({
  data,
  range,
}: {
  data: Array<{ label: string; count: number }>
  range: 7 | 14 | 30
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="label"
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          interval={range === 7 ? 0 : range === 14 ? 1 : 4}
        />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={cursorLine} />
        <Line type="monotone" dataKey="count" stroke={CHART.neutral} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: CHART.neutral }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function DistributionPieChart({
  data,
  colors,
}: {
  data: Array<{ name: string; value: number }>
  colors: string[]
}) {
  return (
    <ResponsiveContainer width={180} height={180}>
      <PieChart>
        <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3}>
          {data.map((_, index) => (
            <Cell key={index} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip suffix="건" />} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function SourceLeadBarChart({
  data,
}: {
  data: Array<{ label: string; leadCount: number }>
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="leadCount" fill={CHART.neutral} radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CategoryBarChart({ data }: { data: Array<{ name: string; count: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="count" fill={CHART.neutral} radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function EventCompareChart({
  data,
}: {
  data: Array<{ name: string; 리드: number; 신청: number; 참석: number; 딜: number }>
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="name" fontSize={11} stroke={CHART.warmGray} />
        <YAxis fontSize={11} stroke={CHART.warmGray} />
        <Tooltip contentStyle={chartTooltipContentStyle} />
        <Bar dataKey="리드" fill={CHART.warmGray} radius={[4, 4, 0, 0]} />
        <Bar dataKey="신청" fill={CHART.caution} radius={[4, 4, 0, 0]} />
        <Bar dataKey="참석" fill={CHART.brand} radius={[4, 4, 0, 0]} />
        <Bar dataKey="딜" fill={CHART.danger} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function EventEconomicsChart({
  data,
}: {
  data: Array<{ name: string; "광고비(천원)": number; "매출(천원)": number; ROI: number }>
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="name" fontSize={11} stroke={CHART.warmGray} />
        <YAxis yAxisId="left" fontSize={11} stroke={CHART.warmGray} />
        <YAxis yAxisId="right" orientation="right" fontSize={11} stroke={CHART.warmGray} />
        <Tooltip contentStyle={chartTooltipContentStyle} />
        <Bar yAxisId="left" dataKey="광고비(천원)" fill={CHART.danger} radius={[4, 4, 0, 0]} />
        <Bar yAxisId="left" dataKey="매출(천원)" fill={CHART.brand} radius={[4, 4, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="ROI" stroke={CHART.neutral} strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function DailyEventCountsChart({
  data,
}: {
  data: Array<{ date: string; count: number }>
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" tick={axisTick} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis tick={axisTick} allowDecimals={false} />
        <Tooltip contentStyle={chartTooltipContentStyle} />
        <Bar dataKey="count" fill={CHART.brand} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

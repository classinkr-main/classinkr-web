"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CHART, gridProps } from "../viz/theme"

const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})

function won(value: number | null | undefined) {
  return value == null ? "-" : KRW_CURRENCY.format(Math.round(value))
}

const DARK_TOOLTIP_STYLE = {
  backgroundColor: CHART.tooltipBg,
  border: "none",
  borderRadius: 12,
  color: "white",
  fontSize: 12,
} as const

export function EventFunnelCompareChart({
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
        <Tooltip contentStyle={DARK_TOOLTIP_STYLE} />
        <Bar dataKey="리드" fill={CHART.warmGray} radius={[4, 4, 0, 0]} />
        <Bar dataKey="신청" fill={CHART.caution} radius={[4, 4, 0, 0]} />
        <Bar dataKey="참석" fill={CHART.brand} radius={[4, 4, 0, 0]} />
        <Bar dataKey="딜" fill={CHART.danger} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function EventRoiChart({
  data,
}: {
  data: Array<{ name: string; roi: number }>
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid stroke={CHART.grid} horizontal={false} />
        <XAxis
          type="number"
          domain={["auto", "auto"]}
          unit="%"
          fontSize={11}
          stroke={CHART.warmGray}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={88}
          fontSize={11}
          stroke={CHART.warmGray}
          tickLine={false}
        />
        <Tooltip
          formatter={(value: number | string | undefined) => {
            const n = typeof value === "number" ? value : Number(value ?? 0)
            return [`${n}%`, "ROI"] as [string, string]
          }}
          contentStyle={DARK_TOOLTIP_STYLE}
        />
        <ReferenceLine x={0} stroke="#c8c8c4" strokeDasharray="4 4" />
        <Bar dataKey="roi" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.roi >= 0 ? CHART.brand : CHART.danger} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ChannelSpendPieChart({
  data,
}: {
  data: Array<{ channel: string; name: string; value: number; color: string }>
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
          {data.map((entry) => (
            <Cell key={entry.channel} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number | string | Array<number | string> | undefined) => {
            if (Array.isArray(value)) return value.join(", ")
            return won(typeof value === "number" ? value : Number(value))
          }}
          contentStyle={DARK_TOOLTIP_STYLE}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

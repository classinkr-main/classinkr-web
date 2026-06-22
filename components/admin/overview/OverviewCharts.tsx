"use client"

import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

// Recharts(약 300KB)를 overview 초기 번들에서 분리하기 위한 차트 전용 모듈.
// page.tsx에서 next/dynamic(ssr:false)로 지연 로드한다.

export interface TrendPoint {
  label: string
  count: number
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#111110] text-white text-[12px] px-3 py-2 rounded-xl shadow-xl">
      <p className="text-white/50 mb-0.5">{label}</p>
      <p className="font-bold">{payload[0].value}건</p>
    </div>
  )
}

export function LeadTrendChart({ data, range }: { data: TrendPoint[]; range: 7 | 30 }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#1a1a1a", opacity: 0.4 }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis tick={{ fontSize: 11, fill: "#1a1a1a", opacity: 0.4 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e8e8e4", strokeWidth: 1 }} />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#111110"
          strokeWidth={2}
          dot={range === 7 ? { fill: "#111110", strokeWidth: 0, r: 3 } : false}
          activeDot={{ r: 5, fill: "#111110", strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function SourcePie({
  data,
  colors,
}: {
  data: { name: string; value: number }[]
  colors: string[]
}) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => [`${v ?? 0}건`, ""]}
          contentStyle={{ border: "none", borderRadius: 12, background: "#111110", color: "#fff", fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

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

type TooltipPayload = Array<{ value?: number }>

function ChartTooltip({
  active,
  payload,
  label,
  suffix = "건",
}: {
  active?: boolean
  payload?: TooltipPayload
  label?: string
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-[#111110] px-3 py-2 text-[12px] text-white shadow-xl">
      <p className="mb-0.5 text-white/50">{label}</p>
      <p className="font-bold">
        {payload[0]?.value ?? 0}
        {suffix}
      </p>
    </div>
  )
}

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
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#1a1a1a60" }}
          tickLine={false}
          axisLine={false}
          interval={range === 7 ? 0 : range === 14 ? 1 : 4}
        />
        <YAxis tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e8e8e4", strokeWidth: 1 }} />
        <Line type="monotone" dataKey="count" stroke="#111110" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#111110" }} />
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
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="leadCount" fill="#111110" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CategoryBarChart({ data }: { data: Array<{ name: string; count: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ec" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#1a1a1a60" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="count" fill="#111110" radius={[5, 5, 0, 0]} />
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
        <CartesianGrid stroke="#f0f0ec" vertical={false} />
        <XAxis dataKey="name" fontSize={11} stroke="#84827a" />
        <YAxis fontSize={11} stroke="#84827a" />
        <Tooltip
          contentStyle={{
            border: "1px solid #e8e8e4",
            borderRadius: 12,
            boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
          }}
        />
        <Bar dataKey="리드" fill="#84827a" radius={[4, 4, 0, 0]} />
        <Bar dataKey="신청" fill="#D97706" radius={[4, 4, 0, 0]} />
        <Bar dataKey="참석" fill="#084734" radius={[4, 4, 0, 0]} />
        <Bar dataKey="딜" fill="#B85C33" radius={[4, 4, 0, 0]} />
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
        <CartesianGrid stroke="#f0f0ec" vertical={false} />
        <XAxis dataKey="name" fontSize={11} stroke="#84827a" />
        <YAxis yAxisId="left" fontSize={11} stroke="#84827a" />
        <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="#84827a" />
        <Tooltip
          contentStyle={{
            border: "1px solid #e8e8e4",
            borderRadius: 12,
            boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
          }}
        />
        <Bar yAxisId="left" dataKey="광고비(천원)" fill="#B85C33" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="left" dataKey="매출(천원)" fill="#084734" radius={[4, 4, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="ROI" stroke="#111110" strokeWidth={2} dot={{ r: 3 }} />
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
        <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e4" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#1a1a1a99" }} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis tick={{ fontSize: 11, fill: "#1a1a1a99" }} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" fill="#084734" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

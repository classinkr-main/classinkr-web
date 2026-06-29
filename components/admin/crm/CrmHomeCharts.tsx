"use client"

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { ChartTooltip } from "../viz/ChartTheme"
import { CHART, SOURCE_PALETTE, axisTick, cursorLine } from "../viz/theme"

// 현황 분석·시각화 — 리드 KPI(byStatus) 기반. Recharts를 별도 모듈로 분리해 next/dynamic 지연 로드.
interface LeadKpisLike {
  total: number
  byStatus: Record<"new" | "contacted" | "converted" | "closed", number>
}

const STATUS_ORDER = [
  { key: "new", label: "신규" },
  { key: "contacted", label: "접촉" },
  { key: "converted", label: "전환" },
  { key: "closed", label: "종료" },
] as const

export default function CrmHomeCharts({ leadKpis }: { leadKpis: LeadKpisLike | null }) {
  if (!leadKpis || leadKpis.total === 0) return null

  const statusData = STATUS_ORDER.map((status) => ({
    name: status.label,
    value: leadKpis.byStatus?.[status.key] ?? 0,
  }))
  const funnelData = [
    { name: "신규 유입", value: leadKpis.total },
    { name: "응대", value: Math.max(0, leadKpis.total - (leadKpis.byStatus?.new ?? 0)) },
    { name: "전환", value: leadKpis.byStatus?.converted ?? 0 },
  ]

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <p className="mb-1 text-[12px] font-semibold text-[#1a1a1a]/45">리드 상태 분포</p>
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie data={statusData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} dataKey="value" strokeWidth={0}>
              {statusData.map((entry, index) => (
                <Cell key={entry.name} fill={SOURCE_PALETTE[index % SOURCE_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
          {statusData.map((entry, index) => (
            <span key={entry.name} className="inline-flex items-center gap-1 text-[11px] text-[#1a1a1a]/55">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: SOURCE_PALETTE[index % SOURCE_PALETTE.length] }}
              />
              {entry.name} {entry.value.toLocaleString("ko-KR")}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[12px] font-semibold text-[#1a1a1a]/45">전환 퍼널</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={funnelData} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={58} tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={cursorLine} />
            <Bar dataKey="value" fill={CHART.brand} radius={[0, 4, 4, 0]} barSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { adminFetchJsonCached } from "@/lib/admin-client"
import { ChartTooltip, GreenAreaDefs } from "../viz/ChartTheme"
import { CHART, GRADIENT, axisTick, cursorLine } from "../viz/theme"

// 현황 성과 분석 — CRM 매출 데이터(팀/개인/월)를 KR팀탭 수준 차트로. Recharts 별도 모듈(지연 로드).
interface PerfGroup {
  name: string
  team: string | null
  total: number
  monthly: number[]
}
interface Performance {
  months: string[]
  monthly: { month: string; revenue: number }[]
  total: number
  byTeam: PerfGroup[]
  byMember: PerfGroup[]
  dealCount: number
}

function fmtMan(value: number): string {
  if (!value) return "0"
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만`
  return value.toLocaleString("ko-KR")
}
function monthLabel(key: string): string {
  const month = key.split("-")[1]
  return month ? `${Number(month)}월` : key
}

function PerfBars({ title, rows }: { title: string; rows: { name: string; total: number }[] }) {
  if (rows.length === 0) return null
  return (
    <div>
      <p className="mb-1 text-[12px] font-semibold text-[#1a1a1a]/45">{title}</p>
      <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 30)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 0, left: 8 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={64} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={cursorLine} />
          <Bar dataKey="total" fill={CHART.brand} radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function CrmPerformanceCharts() {
  const [data, setData] = useState<Performance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<Performance>("/api/admin/crm/performance?months=6", undefined, {
      cacheKey: "/api/admin/crm/performance",
      ttlMs: 120_000,
      staleWhileRevalidateMs: 300_000,
    })
      .then((next) => {
        if (alive) {
          setData(next)
          setLoading(false)
        }
      })
      .catch(() => {
        if (alive) {
          setError(true)
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [])

  if (loading) return <div className="h-44 animate-pulse rounded-xl bg-[#fafaf8]" />
  if (error)
    return (
      <div className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
        성과 데이터를 불러오지 못했습니다.
      </div>
    )
  if (!data || data.total === 0)
    return <p className="text-[12px] text-[#1a1a1a]/40">표시할 매출 데이터가 없습니다.</p>

  const trend = data.monthly.map((point) => ({ label: monthLabel(point.month), revenue: point.revenue }))
  const teams = data.byTeam.slice(0, 6).map((group) => ({ name: group.name, total: group.total }))
  const members = data.byMember.slice(0, 6).map((group) => ({ name: group.name, total: group.total }))

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold text-[#1a1a1a]/45">매출 추이 (최근 6개월)</p>
          <p className="text-[13px] font-bold text-[#084734]">₩{fmtMan(data.total)}</p>
        </div>
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <GreenAreaDefs />
            <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(value) => fmtMan(Number(value))} width={44} />
            <Tooltip content={<ChartTooltip />} cursor={cursorLine} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={CHART.brand}
              strokeWidth={2}
              fill={`url(#${GRADIENT.greenArea})`}
              activeDot={{ r: 5, fill: CHART.brand, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <PerfBars title="팀별 매출" rows={teams} />
        <PerfBars title="개인별 매출 (상위 6)" rows={members} />
      </div>
    </div>
  )
}

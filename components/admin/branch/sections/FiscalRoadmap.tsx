"use client"
import { useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts"
import type { BranchMonthlySeries } from "../types"

const moneyMFormatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 })

function formatMoneyM(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(amount)) return "-"
  return `¥${moneyMFormatter.format(amount / 1_000_000)}M`
}

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function inferConfirmedThroughIndex(months: string[]) {
  const current = currentMonthKey()
  const currentIndex = months.indexOf(current)
  if (currentIndex >= 0) return currentIndex
  let lastPastIndex = -1
  for (let i = 0; i < months.length; i += 1) {
    if (months[i] <= current) lastPastIndex = i
  }
  return Math.max(0, lastPastIndex)
}

export default function FiscalRoadmap({ data, loading, error }: { data: BranchMonthlySeries | null; loading: boolean; error: string | null }) {
  const chart = useMemo(() => {
    if (!data) return []
    const trendSeries = data.revenue_trend_cum ?? data.revenue_cum
    const inferredIndex = inferConfirmedThroughIndex(data.months)
    const rawSplitIndex = Math.min(data.confirmed_through_index ?? inferredIndex, inferredIndex)
    const splitIndex = Math.min(Math.max(rawSplitIndex, 0), data.months.length - 1)
    return data.months.map((m, i) => {
      const trend = trendSeries[i] ?? data.revenue_cum[i]
      return {
        month: m.slice(5),
        goal: data.goal_cum[i],
        revenue: i <= splitIndex ? data.revenue_cum[i] : null,
        trend: i >= splitIndex ? trend : null,
      }
    })
  }, [data])

  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{error}</div>
  if (loading || !data) return <div className="h-72 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">FY 로드맵</h2>
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis width={72} tick={{ fontSize: 11 }} tickFormatter={formatMoneyM} />
            <Tooltip formatter={(value) => formatMoneyM(value)} />
            <Line type="monotone" dataKey="goal" name="FY 목표" stroke="#888" strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="revenue" name="확정 매출" stroke="#B43E3E" strokeWidth={2.5} dot={{ r: 3, fill: "#B43E3E" }} />
            <Line type="monotone" dataKey="trend" name="가능성 추세" stroke="#1E5DA8" strokeWidth={2.5} strokeDasharray="6 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[#1a1a1a]/50">
          <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 bg-[#B43E3E]" /><span className="font-semibold text-[#B43E3E]">확정 매출</span> (¥M)</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 border-t border-dashed border-[#1E5DA8]" /><span className="font-semibold text-[#1E5DA8]">가능성 추세</span> (¥M)</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 border-t border-dashed border-[#888]" />FY 목표 (¥M)</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {data.events.slice(0, 8).map((e, i) => (
            <span key={`event-${i}-${e.date}`} className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
              ◆ {e.date.slice(5)} {e.title}
            </span>
          ))}
          {data.deals.slice(0, 8).map((d, i) => (
            <span key={`deal-${i}-${d.date}`} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">
              ● {d.date.slice(5)} {d.customer}
            </span>
          ))}
          {data.campaigns.slice(0, 6).map((c, i) => (
            <span key={`camp-${i}-${c.date}`} className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">
              ▲ {c.date.slice(5)} {c.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

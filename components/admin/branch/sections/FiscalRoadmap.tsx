"use client"
import { useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts"
import type { BranchMonthlySeries } from "../types"

export default function FiscalRoadmap({ data, loading, error }: { data: BranchMonthlySeries | null; loading: boolean; error: string | null }) {
  const chart = useMemo(
    () => data?.months.map((m, i) => ({ month: m.slice(5), goal: data.goal_cum[i], revenue: data.revenue_cum[i] })) ?? [],
    [data],
  )
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
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="goal" stroke="#888" strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="revenue" stroke="#0d8a4d" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
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

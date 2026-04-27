"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"

interface SummaryResponse {
  revenue: { confirmed: number; goal: number; pacing_pct: number }
  bottleneck: { metric: string|null; pct: number; worst_member: string|null }
  closing: { count: number; total_target: number }
  events_30d: { count: number; regions: number }
  campaigns_30d: { count: number; avg_open_pct: number }
}

function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }

async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

export default function CoreKpiGrid({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setError(null)
    adminFetch(`/api/admin/branch/summary?team=${team}&period=${period}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d) })
      .catch((e) => setError(String(e)))
  }, [team, period, refreshKey])
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{error}</div>
  if (!data) return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {Array.from({length:5}).map((_,i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-[#f0f0ec]"/>)}
    </div>
  )
  const cards = [
    { label: "매출", value: `₩${fmt(data.revenue.confirmed)}`, sub: `목표 ₩${fmt(data.revenue.goal)} · ${data.revenue.pacing_pct.toFixed(0)}%` },
    { label: "활동 KPI 병목", value: data.bottleneck.metric ?? "-", sub: `${data.bottleneck.pct.toFixed(0)}% · ${data.bottleneck.worst_member ?? "-"}` },
    { label: "가까운 딜", value: `${data.closing.count}건`, sub: `목표 합 ₩${fmt(data.closing.total_target)}` },
    { label: "행사 (30일)", value: `${data.events_30d.count}건`, sub: `지역 ${data.events_30d.regions}개` },
    { label: "캠페인 성과", value: `${data.campaigns_30d.count}건`, sub: `평균 오픈율 ${data.campaigns_30d.avg_open_pct.toFixed(0)}%` },
  ]
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">핵심 지표</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/35">{c.label}</p>
            <p className="mt-2 text-[20px] font-bold tracking-[-0.02em] text-[#111110]">{c.value}</p>
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/45">{c.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

"use client"
import { useEffect, useState } from "react"
import type { Team, Period } from "../BranchDashboardClient"

interface Row { region: string; target: number; revenue: number; progress: number; status: "good"|"warning"|"critical"; velocity: number }
const COLOR = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
} as const
function fmt(n: number) { return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n) }
async function adminFetch(url: string) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

export default function RegionHeatmap({ team, period, refreshKey }: { team: Team; period: Period; refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setError(null)
    adminFetch(`/api/admin/branch/heatmap?team=${team}&period=${period}`)
      .then((r) => r.json())
      .then((d) => d.error ? setError(d.error) : setRows(d.rows))
      .catch((e) => setError(String(e)))
  }, [team, period, refreshKey])
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{error}</div>
  if (!rows) return <div className="h-48 animate-pulse rounded-2xl bg-[#f0f0ec]" />
  if (rows.length === 0) return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">지역 히트맵</h2>
      <div className="rounded-2xl border border-[#e8e8e4] bg-white p-6 text-[12px] text-[#1a1a1a]/40">표시할 지역 데이터가 없습니다.</div>
    </section>
  )
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-[13px] font-semibold text-[#111110]/70">지역 히트맵</h2>
        <p className="text-[11px] text-[#1a1a1a]/40">REV 기준 (SEG 미사용)</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {rows.map((r) => (
          <div key={r.region} className={`rounded-2xl border p-4 ${COLOR[r.status]}`}>
            <p className="text-[12px] font-medium">{r.region}</p>
            <p className="mt-1 text-[20px] font-bold">{r.progress.toFixed(0)}%</p>
            <p className="mt-1 text-[11px] opacity-70">매출 ₩{fmt(r.revenue)} / 목표 ₩{fmt(r.target)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
